import { NextRequest, NextResponse } from 'next/server';
import {
  getOrderById,
  getPreapprovalById,
  reconcileMpOrder,
  reconcileMpPreapproval,
} from '@/lib/mercadopago';
import {
  PaymentRow,
  SubscriptionRow,
  isSupabaseConfigured,
  supabaseAdminFetch,
} from '@/lib/supabase/admin';
import { getServerSessionUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getServerSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ status: 'pending', unlocked: false });
    }

    const orderId = (req.nextUrl.searchParams.get('orderId') || '').trim();
    const preapprovalId = (req.nextUrl.searchParams.get('preapprovalId') || '').trim();
    const syncSubscription =
      req.nextUrl.searchParams.get('syncSubscription') === '1';

    if (orderId) {
      const payRes = await supabaseAdminFetch(
        `/rest/v1/payments?mp_payment_id=eq.${encodeURIComponent(
          orderId
        )}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`
      );
      const rows = payRes.ok ? ((await payRes.json()) as PaymentRow[]) : [];
      const payment = rows[0];

      if (!payment) {
        return NextResponse.json(
          { error: 'Pagamento não encontrado para esta conta.' },
          { status: 404 }
        );
      }

      if (payment.status === 'approved') {
        return NextResponse.json({ status: 'approved', unlocked: true });
      }

      if (payment.status === 'rejected' || payment.status === 'refunded') {
        return NextResponse.json({ status: 'rejected', unlocked: false });
      }

      // Consulta ativa no Mercado Pago para liberação instantânea sem depender de atraso do webhook
      try {
        const order = await getOrderById(orderId);
        const reconciled = await reconcileMpOrder(order);
        return NextResponse.json(reconciled);
      } catch {
        return NextResponse.json({ status: 'pending', unlocked: false });
      }
    }

    if (preapprovalId || syncSubscription) {
      let targetPreapprovalId = preapprovalId;

      if (!targetPreapprovalId) {
        const latestPayRes = await supabaseAdminFetch(
          `/rest/v1/payments?user_id=eq.${encodeURIComponent(
            user.id
          )}&kind=eq.monthly_card&order=created_at.desc&limit=1`
        );
        const latestPays = latestPayRes.ok
          ? ((await latestPayRes.json()) as PaymentRow[])
          : [];
        if (latestPays[0]?.mp_payment_id) {
          targetPreapprovalId = latestPays[0].mp_payment_id;
        }
      }

      if (targetPreapprovalId) {
        try {
          const pre = await getPreapprovalById(targetPreapprovalId);
          const reconciled = await reconcileMpPreapproval(pre);
          return NextResponse.json(reconciled);
        } catch {
          // Fallback para consulta local em subscriptions
        }
      }

      const subRes = await supabaseAdminFetch(
        `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(
          user.id
        )}&status=eq.active&order=current_period_end.desc&limit=1`
      );
      const subs = subRes.ok ? ((await subRes.json()) as SubscriptionRow[]) : [];
      const active = subs[0];
      const unlocked = Boolean(
        active?.current_period_end &&
          new Date(active.current_period_end).getTime() > Date.now()
      );
      return NextResponse.json({
        status: unlocked ? 'approved' : 'pending',
        unlocked,
      });
    }

    return NextResponse.json(
      { error: 'Informe orderId ou syncSubscription.' },
      { status: 400 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Erro ao consultar status do pagamento.',
      },
      { status: 500 }
    );
  }
}
