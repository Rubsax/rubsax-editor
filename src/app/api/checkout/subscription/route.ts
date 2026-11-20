import { NextRequest, NextResponse } from 'next/server';
import { createRecurringSubscription } from '@/lib/mercadopago';
import { getAppSettings } from '@/lib/settings';
import {
  isSupabaseConfigured,
  logLegalConsent,
  supabaseAdminFetch,
} from '@/lib/supabase/admin';
import { getServerSessionUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getServerSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Faça login antes de assinar no cartão.' },
        { status: 401 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Banco de dados não configurado no servidor.' },
        { status: 503 }
      );
    }

    const settings = await getAppSettings();
    if (!settings.pricing.monthly_card_enabled) {
      return NextResponse.json(
        { error: 'A assinatura no cartão está temporariamente desativada.' },
        { status: 400 }
      );
    }

    await logLegalConsent({
      userId: user.id,
      consentType: 'checkout_subscription',
      termsVersion: 'v1.0',
      fileHash: null,
    });

    const appUrl =
      (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '') ||
      req.nextUrl.origin;

    const amountBrl = settings.pricing.monthly_price_brl;
    const sub = await createRecurringSubscription({
      amountBrl,
      reason: 'Rubsax Transposer - Plano Mensal Completo',
      externalReference: `sub:${user.id}`,
      payerEmail: user.email,
      backUrl: `${appUrl}/conta?assinatura=processando`,
    });

    // Registrar pagamento pendente (e tentativa de assinatura pendente caso a constraint permita)
    await supabaseAdminFetch('/rest/v1/payments', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        mp_payment_id: sub.preapprovalId,
        kind: 'monthly_card',
        amount_brl: amountBrl,
        status: 'pending',
      }),
    }).catch(() => {});

    await supabaseAdminFetch('/rest/v1/subscriptions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id,
        plan_type: 'monthly_card',
        status: 'pending',
        mp_preapproval_id: sub.preapprovalId,
        cancel_at_period_end: false,
      }),
    }).catch(() => {});

    return NextResponse.json({
      preapprovalId: sub.preapprovalId,
      initPoint: sub.initPoint,
    });
  } catch (err: unknown) {
    console.error('[Checkout Subscription] Erro:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Erro ao iniciar assinatura recorrente no Mercado Pago.',
      },
      { status: 500 }
    );
  }
}
