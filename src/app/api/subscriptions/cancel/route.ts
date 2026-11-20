import { NextResponse } from 'next/server';
import { getUserActiveSubscription } from '@/lib/access';
import { cancelPreapproval } from '@/lib/mercadopago';
import {
  isSupabaseConfigured,
  supabaseAdminFetch,
} from '@/lib/supabase/admin';
import { getServerSessionUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await getServerSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Faça login para gerenciar sua assinatura.' },
        { status: 401 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Banco de dados não configurado.' },
        { status: 503 }
      );
    }

    const activeSub = await getUserActiveSubscription(user.id);
    if (!activeSub) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura ativa encontrada para cancelar.' },
        { status: 404 }
      );
    }

    if (activeSub.plan_type === 'monthly_card' && activeSub.mp_preapproval_id) {
      await cancelPreapproval(activeSub.mp_preapproval_id);
    }

    const nowIso = new Date().toISOString();
    const patchRes = await supabaseAdminFetch(
      `/rest/v1/subscriptions?id=eq.${encodeURIComponent(activeSub.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          cancel_at_period_end: true,
          updated_at: nowIso,
        }),
      }
    );

    if (!patchRes.ok) {
      return NextResponse.json(
        { error: 'Não foi possível atualizar o cancelamento no banco.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      accessUntil: activeSub.current_period_end,
    });
  } catch (err: unknown) {
    console.error('[Subscriptions Cancel] Erro:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Erro ao cancelar assinatura no Mercado Pago.',
      },
      { status: 500 }
    );
  }
}
