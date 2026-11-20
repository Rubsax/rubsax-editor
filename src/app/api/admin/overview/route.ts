import { NextResponse } from 'next/server';
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

export async function GET() {
  const user = await getServerSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const queue = await getMuseScoreQueueStats();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
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
        fullRendersToday: 0,
      },
      recentTransactions: [],
      recentUsage: [],
      queue,
    });
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nowMs = now.getTime();

  try {
    const [paymentsRes, profilesRes, subsRes, unlocksRes, usageRes] = await Promise.all([
      supabaseAdminFetch(
        '/rest/v1/payments?select=id,user_id,mp_payment_id,kind,amount_brl,status,paid_at,created_at&order=created_at.desc&limit=500'
      ),
      supabaseAdminFetch(
        '/rest/v1/profiles?select=id,email,full_name,created_at,deleted_at&limit=1000'
      ),
      supabaseAdminFetch(
        '/rest/v1/subscriptions?select=id,user_id,plan_type,status,current_period_end&status=eq.active'
      ),
      supabaseAdminFetch(
        '/rest/v1/single_unlocks?select=id,user_id,file_name,amount_brl,status,expires_at,created_at&status=eq.approved'
      ),
      supabaseAdminFetch(
        '/rest/v1/usage_logs?select=id,user_id,action,file_hash,is_dev_mode,created_at&is_dev_mode=eq.false&order=created_at.desc&limit=500'
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

    let revenueToday = 0;
    let revenueMonth = 0;
    let revenueTotal = 0;
    let singleRevenue = 0;
    let monthlyRevenue = 0;
    let singleCount = 0;
    let monthlyCount = 0;

    for (const pay of payments) {
      if (pay.status !== 'approved') continue;
      const amount = Number(pay.amount_brl || 0);
      const ts = new Date(pay.paid_at || pay.created_at).getTime();

      revenueTotal += amount;
      if (ts >= startOfMonth) revenueMonth += amount;
      if (ts >= startOfToday) revenueToday += amount;

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
      (s) => s.status === 'active' && s.current_period_end && new Date(s.current_period_end).getTime() > nowMs
    ).length;
    const activeSingleUnlocks24h = unlocks.filter(
      (u) => u.status === 'approved' && u.expires_at && new Date(u.expires_at).getTime() > nowMs
    ).length;

    let pdfsToday = 0;
    let pdfsMonth = 0;
    let previewsToday = 0;
    let fullRendersToday = 0;

    for (const log of usage) {
      if (log.is_dev_mode) continue;
      const ts = new Date(log.created_at).getTime();
      if (log.action === 'export_pdf') {
        if (ts >= startOfMonth) pdfsMonth += 1;
        if (ts >= startOfToday) pdfsToday += 1;
      } else if (log.action === 'render_preview' && ts >= startOfToday) {
        previewsToday += 1;
      } else if (log.action === 'render_full' && ts >= startOfToday) {
        fullRendersToday += 1;
      }
    }

    const recentTransactions = payments.slice(0, 20).map((p) => ({
      ...p,
      user_email: emailById.get(p.user_id) || p.user_id,
    }));

    const recentUsage = usage.slice(0, 20).map((u) => ({
      ...u,
      user_email: u.user_id ? emailById.get(u.user_id) || u.user_id : 'Visitante (Anônimo)',
    }));

    return NextResponse.json({
      configured: true,
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
        fullRendersToday,
      },
      recentTransactions,
      recentUsage,
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
