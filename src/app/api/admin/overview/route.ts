import { NextRequest, NextResponse } from 'next/server';
import { getMuseScoreQueueStats } from '@/lib/mscore-queue';
import {
  PaymentRow,
  ProfileRow,
  SingleUnlockRow,
  SubscriptionRow,
  UsageLogRow,
  isSupabaseConfigured,
  supabaseAdminFetch,
} from '@/lib/supabase/admin';
import { getServerSessionUser, isAdminEmail } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PIX_EXPIRE_MS = 35 * 60 * 1000;
const CARD_EXPIRE_MS = 24 * 60 * 60 * 1000;

function toSpDateKey(input: string | number | Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(input));
  } catch {
    return new Date(input).toISOString().slice(0, 10);
  }
}

function formatDayLabel(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  return `${parts[2]}/${parts[1]}`;
}

export async function GET(req: NextRequest) {
  const user = await getServerSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const daysParam = (req.nextUrl.searchParams.get('days') || '30').trim();
  const period =
    daysParam === '7' || daysParam === '30' || daysParam === '90' || daysParam === 'all'
      ? daysParam
      : '30';

  const queue = await getMuseScoreQueueStats();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      period,
      expiredConstraintPending: false,
      metrics: {
        revenueToday: 0,
        revenueMonth: 0,
        revenueTotal: 0,
        singleRevenue: 0,
        monthlyRevenue: 0,
        singleCount: 0,
        monthlyCount: 0,
        totalAccounts: 0,
        activeSubscribers: 0,
        activeSingleUnlocks24h: 0,
        pdfsToday: 0,
        pdfsMonth: 0,
        previewsToday: 0,
        uniquePreviewScoresToday: 0,
        fullRendersToday: 0,
      },
      txCounts: {
        approved: 0,
        pending: 0,
        expired: 0,
        rejected: 0,
        pixApproved: 0,
        cardApproved: 0,
      },
      dailySeries: [],
      recentTransactions: [],
      allPeriodTransactions: [],
      recentUsage: [],
      allPeriodUsage: [],
      queue,
    });
  }

  const now = new Date();
  const nowMs = now.getTime();
  const todayKey = toSpDateKey(nowMs);
  const monthPrefix = todayKey.slice(0, 7);
  const periodDaysNum =
    period === '7' ? 7 : period === '30' ? 30 : period === '90' ? 90 : null;
  const periodCutoffMs = periodDaysNum ? nowMs - periodDaysNum * 24 * 60 * 60 * 1000 : 0;

  try {
    const [paymentsRes, profilesRes, subsRes, unlocksRes, usageRes] = await Promise.all([
      supabaseAdminFetch(
        '/rest/v1/payments?select=id,user_id,mp_payment_id,kind,amount_brl,status,paid_at,created_at&order=created_at.desc&limit=2000'
      ),
      supabaseAdminFetch(
        '/rest/v1/profiles?select=id,email,full_name,created_at,deleted_at&limit=2000'
      ),
      supabaseAdminFetch(
        '/rest/v1/subscriptions?select=id,user_id,plan_type,status,current_period_end&status=eq.active'
      ),
      supabaseAdminFetch(
        '/rest/v1/single_unlocks?select=id,user_id,file_name,amount_brl,status,expires_at,created_at&status=eq.approved'
      ),
      supabaseAdminFetch(
        '/rest/v1/usage_logs?select=id,user_id,action,file_hash,is_dev_mode,created_at&is_dev_mode=eq.false&order=created_at.desc&limit=2000'
      ),
    ]);

    const payments = paymentsRes.ok ? ((await paymentsRes.json()) as PaymentRow[]) : [];
    const profiles = profilesRes.ok ? ((await profilesRes.json()) as ProfileRow[]) : [];
    const subs = subsRes.ok ? ((await subsRes.json()) as SubscriptionRow[]) : [];
    const unlocks = unlocksRes.ok ? ((await unlocksRes.json()) as SingleUnlockRow[]) : [];
    const usage = usageRes.ok ? ((await usageRes.json()) as UsageLogRow[]) : [];

    const emailById = new Map<string, string>();
    for (const p of profiles) {
      if (p.id && p.email) emailById.set(p.id, p.email);
    }

    // Identificar e expirar automaticamente transações pending vencidas (Pix 35 min / Cartão 24h)
    const stalePendingIds: string[] = [];
    const normalizedPayments = payments.map((pay) => {
      let effectiveStatus = pay.status;
      if (pay.status === 'pending') {
        const ageMs = nowMs - new Date(pay.created_at).getTime();
        const limitMs = pay.kind === 'monthly_card' ? CARD_EXPIRE_MS : PIX_EXPIRE_MS;
        if (ageMs > limitMs) {
          effectiveStatus = 'expired';
          stalePendingIds.push(pay.id);
        }
      }
      return {
        ...pay,
        status: effectiveStatus,
        user_email: emailById.get(pay.user_id) || pay.user_id,
      };
    });

    let expiredConstraintPending = false;
    if (stalePendingIds.length > 0) {
      for (let i = 0; i < stalePendingIds.length; i += 80) {
        const chunk = stalePendingIds.slice(i, i + 80);
        try {
          const patchRes = await supabaseAdminFetch(
            `/rest/v1/payments?id=in.(${chunk.join(',')})&status=eq.pending`,
            {
              method: 'PATCH',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({ status: 'expired' }),
            }
          );
          if (!patchRes.ok) {
            expiredConstraintPending = true;
            break;
          }
        } catch {
          expiredConstraintPending = true;
          break;
        }
      }
    }

    let revenueToday = 0;
    let revenueMonth = 0;
    let revenueTotal = 0;
    let singleRevenue = 0;
    let monthlyRevenue = 0;
    let singleCount = 0;
    let monthlyCount = 0;

    for (const pay of normalizedPayments) {
      if (pay.status !== 'approved') continue;
      const amount = Number(pay.amount_brl || 0);
      const refDateKey = toSpDateKey(pay.paid_at || pay.created_at);

      revenueTotal += amount;
      if (refDateKey.startsWith(monthPrefix)) revenueMonth += amount;
      if (refDateKey === todayKey) revenueToday += amount;

      if (pay.kind === 'single_24h') {
        singleRevenue += amount;
        singleCount += 1;
      } else {
        monthlyRevenue += amount;
        monthlyCount += 1;
      }
    }

    const totalAccounts = profiles.filter((p) => !p.deleted_at).length;
    const activeSubscribers = subs.filter(
      (s) =>
        s.status === 'active' &&
        s.current_period_end &&
        new Date(s.current_period_end).getTime() > nowMs
    ).length;
    const activeSingleUnlocks24h = unlocks.filter(
      (u) => u.status === 'approved' && u.expires_at && new Date(u.expires_at).getTime() > nowMs
    ).length;

    let pdfsToday = 0;
    let pdfsMonth = 0;
    let previewsToday = 0;
    let fullRendersToday = 0;
    const uniquePreviewHashesToday = new Set<string>();

    for (const log of usage) {
      if (log.is_dev_mode) continue;
      const dateKey = toSpDateKey(log.created_at);
      if (log.action === 'export_pdf') {
        if (dateKey.startsWith(monthPrefix)) pdfsMonth += 1;
        if (dateKey === todayKey) pdfsToday += 1;
      } else if (log.action === 'render_preview' && dateKey === todayKey) {
        previewsToday += 1;
        if (log.file_hash) uniquePreviewHashesToday.add(log.file_hash);
      } else if (log.action === 'render_full' && dateKey === todayKey) {
        fullRendersToday += 1;
      }
    }

    // Filtrar transações e logs para o período selecionado
    const periodTransactions = normalizedPayments.filter((pay) => {
      if (!periodCutoffMs) return true;
      return new Date(pay.created_at).getTime() >= periodCutoffMs;
    });

    const periodUsage = usage
      .filter((log) => {
        if (log.is_dev_mode) return false;
        if (!periodCutoffMs) return true;
        return new Date(log.created_at).getTime() >= periodCutoffMs;
      })
      .map((u) => ({
        ...u,
        user_email: u.user_id ? emailById.get(u.user_id) || u.user_id : 'Visitante (Anônimo)',
      }));

    const txCounts = {
      approved: 0,
      pending: 0,
      expired: 0,
      rejected: 0,
      pixApproved: 0,
      cardApproved: 0,
    };

    for (const pay of periodTransactions) {
      if (pay.status === 'approved') {
        txCounts.approved += 1;
        if (pay.kind === 'monthly_card') txCounts.cardApproved += 1;
        else txCounts.pixApproved += 1;
      } else if (pay.status === 'pending') {
        txCounts.pending += 1;
      } else if (pay.status === 'expired') {
        txCounts.expired += 1;
      } else {
        txCounts.rejected += 1;
      }
    }

    // Construir série diária para gráficos SVG (7d, 30d ou 90d; 'all' exibe últimos 30d)
    const chartWindowDays = period === '7' ? 7 : period === '90' ? 90 : 30;
    const dayBucketMap = new Map<
      string,
      {
        date: string;
        label: string;
        singleRevenue: number;
        monthlyRevenue: number;
        totalRevenue: number;
        approvedCount: number;
        uniqueHashes: Set<string>;
        totalPreviews: number;
        fullRenders: number;
        pdfs: number;
      }
    >();

    for (let i = chartWindowDays - 1; i >= 0; i--) {
      const key = toSpDateKey(nowMs - i * 24 * 60 * 60 * 1000);
      dayBucketMap.set(key, {
        date: key,
        label: formatDayLabel(key),
        singleRevenue: 0,
        monthlyRevenue: 0,
        totalRevenue: 0,
        approvedCount: 0,
        uniqueHashes: new Set<string>(),
        totalPreviews: 0,
        fullRenders: 0,
        pdfs: 0,
      });
    }

    for (const pay of normalizedPayments) {
      if (pay.status !== 'approved') continue;
      const key = toSpDateKey(pay.paid_at || pay.created_at);
      const bucket = dayBucketMap.get(key);
      if (!bucket) continue;
      const amount = Number(pay.amount_brl || 0);
      bucket.totalRevenue += amount;
      bucket.approvedCount += 1;
      if (pay.kind === 'single_24h') {
        bucket.singleRevenue += amount;
      } else {
        bucket.monthlyRevenue += amount;
      }
    }

    for (const log of usage) {
      if (log.is_dev_mode) continue;
      const key = toSpDateKey(log.created_at);
      const bucket = dayBucketMap.get(key);
      if (!bucket) continue;
      if (log.action === 'render_preview') {
        bucket.totalPreviews += 1;
        if (log.file_hash) bucket.uniqueHashes.add(log.file_hash);
      } else if (log.action === 'render_full') {
        bucket.fullRenders += 1;
      } else if (log.action === 'export_pdf') {
        bucket.pdfs += 1;
      }
    }

    const dailySeries = Array.from(dayBucketMap.values()).map((b) => ({
      date: b.date,
      label: b.label,
      singleRevenue: Number(b.singleRevenue.toFixed(2)),
      monthlyRevenue: Number(b.monthlyRevenue.toFixed(2)),
      totalRevenue: Number(b.totalRevenue.toFixed(2)),
      approvedCount: b.approvedCount,
      uniquePreviews: b.uniqueHashes.size,
      totalPreviews: b.totalPreviews,
      fullRenders: b.fullRenders,
      pdfs: b.pdfs,
    }));

    return NextResponse.json({
      configured: true,
      period,
      expiredConstraintPending,
      metrics: {
        revenueToday,
        revenueMonth,
        revenueTotal,
        singleRevenue,
        monthlyRevenue,
        singleCount,
        monthlyCount,
        totalAccounts,
        activeSubscribers,
        activeSingleUnlocks24h,
        pdfsToday,
        pdfsMonth,
        previewsToday,
        uniquePreviewScoresToday: uniquePreviewHashesToday.size,
        fullRendersToday,
      },
      txCounts,
      dailySeries,
      recentTransactions: periodTransactions.slice(0, 200),
      allPeriodTransactions: periodTransactions,
      recentUsage: periodUsage.slice(0, 60),
      allPeriodUsage: periodUsage,
      queue,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Falha ao carregar métricas do painel administrativo.',
      },
      { status: 500 }
    );
  }
}
