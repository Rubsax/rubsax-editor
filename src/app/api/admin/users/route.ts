import { NextRequest, NextResponse } from 'next/server';
import {
  ProfileRow,
  SingleUnlockRow,
  SubscriptionRow,
  isSupabaseConfigured,
  supabaseAdminFetch,
} from '@/lib/supabase/admin';
import { getServerSessionUser, isAdminEmail } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getServerSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ users: [] });
  }

  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  try {
    const filter = q
      ? `&or=(email.ilike.*${encodeURIComponent(q)}*,full_name.ilike.*${encodeURIComponent(
          q
        )}*)`
      : '';

    const profilesRes = await supabaseAdminFetch(
      `/rest/v1/profiles?select=id,email,full_name,avatar_url,created_at,deleted_at&deleted_at=is.null${filter}&order=created_at.desc&limit=40`
    );

    const profiles = profilesRes.ok ? ((await profilesRes.json()) as ProfileRow[]) : [];
    const nowIso = new Date().toISOString();

    const [subsRes, unlocksRes] = await Promise.all([
      supabaseAdminFetch(
        `/rest/v1/subscriptions?select=id,user_id,plan_type,status,current_period_end&status=eq.active&current_period_end=gt.${encodeURIComponent(
          nowIso
        )}`
      ),
      supabaseAdminFetch(
        `/rest/v1/single_unlocks?select=id,user_id,file_name,expires_at,status&status=eq.approved&expires_at=gt.${encodeURIComponent(
          nowIso
        )}`
      ),
    ]);

    const subs = subsRes.ok ? ((await subsRes.json()) as SubscriptionRow[]) : [];
    const unlocks = unlocksRes.ok ? ((await unlocksRes.json()) as SingleUnlockRow[]) : [];

    const enriched = profiles.map((p) => ({
      ...p,
      isAdmin: isAdminEmail(p.email),
      activeSubscription: subs.find((s) => s.user_id === p.id) || null,
      activeSingleUnlocksCount: unlocks.filter((u) => u.user_id === p.id).length,
    }));

    return NextResponse.json({ users: enriched });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao buscar usuários.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const adminUser = await getServerSessionUser();
  if (!adminUser || !isAdminEmail(adminUser.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase não configurado no servidor.' },
      { status: 503 }
    );
  }

  try {
    const body = (await req.json()) as {
      action?: 'grant_vip' | 'revoke';
      userId?: string;
      days?: number;
    };

    if (!body.userId) {
      return NextResponse.json({ error: 'ID de usuário obrigatório.' }, { status: 400 });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    if (body.action === 'grant_vip') {
      const days = Math.max(1, Math.min(3650, Number(body.days) || 30));
      const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      // Encerra assinaturas anteriores ativas para evitar duplicidade
      await supabaseAdminFetch(
        `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(body.userId)}&status=eq.active`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'expired',
            updated_at: nowIso,
          }),
        }
      );

      const insertRes = await supabaseAdminFetch('/rest/v1/subscriptions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: body.userId,
          plan_type: 'manual_vip',
          status: 'active',
          current_period_start: nowIso,
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          updated_at: nowIso,
        }),
      });

      if (!insertRes.ok) {
        const errText = await insertRes.text().catch(() => '');
        return NextResponse.json(
          { error: errText || 'Erro ao conceder acesso VIP.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        message: `Acesso VIP concedido por ${days} dias!`,
      });
    }

    if (body.action === 'revoke') {
      await supabaseAdminFetch(
        `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(body.userId)}&status=eq.active`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'cancelled',
            cancel_at_period_end: true,
            updated_at: nowIso,
          }),
        }
      );

      await supabaseAdminFetch(
        `/rest/v1/single_unlocks?user_id=eq.${encodeURIComponent(body.userId)}&status=eq.approved`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            expires_at: nowIso,
          }),
        }
      );

      return NextResponse.json({
        ok: true,
        message: 'Acesso do usuário revogado imediatamente.',
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao atualizar acesso do usuário.' },
      { status: 500 }
    );
  }
}
