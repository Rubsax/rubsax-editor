import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthorizedPaymentById,
  getOrderById,
  getPreapprovalById,
  reconcileMpOrder,
  reconcileMpPreapproval,
  verifyWebhookSignature,
} from '@/lib/mercadopago';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      type?: string;
      topic?: string;
      action?: string;
      data?: { id?: string | number };
      id?: string | number;
    };

    const queryDataId =
      req.nextUrl.searchParams.get('data.id') ||
      req.nextUrl.searchParams.get('id') ||
      '';
    const bodyDataId = body.data?.id ? String(body.data.id) : body.id ? String(body.id) : '';
    const dataId = queryDataId || bodyDataId;

    const eventType = (
      body.type ||
      req.nextUrl.searchParams.get('type') ||
      body.topic ||
      req.nextUrl.searchParams.get('topic') ||
      ''
    ).toLowerCase();
    const action = (body.action || '').toLowerCase();

    if (!dataId) {
      console.warn('[MP Webhook] Notificação recebida sem data.id:', body);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const sigCheck = verifyWebhookSignature(req.headers, dataId);
    if (!sigCheck.valid) {
      console.error('[MP Webhook] Assinatura x-signature inválida para data.id:', dataId);
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    // 1. Eventos da API de Orders (Pix Avulso e Mensal Pix)
    if (eventType === 'order' || eventType === 'orders' || action.startsWith('order.')) {
      const order = await getOrderById(dataId);
      const res = await reconcileMpOrder(order);
      console.log(
        `[MP Webhook] Order ${order.id} (ext=${order.external_reference || '-'}, mp_status=${order.status || '-'}, event=${action || eventType}) -> status=${res.status}, unlocked=${res.unlocked}`
      );
      return NextResponse.json({ received: true, ...res }, { status: 200 });
    }

    // 2. Eventos de Assinatura Recorrente no Cartão (Preapproval)
    if (
      eventType === 'subscription_preapproval' ||
      eventType === 'preapproval' ||
      action.includes('preapproval')
    ) {
      const preapproval = await getPreapprovalById(dataId);
      const res = await reconcileMpPreapproval(preapproval);
      console.log(
        `[MP Webhook] Preapproval ${dataId} -> status=${res.status}, unlocked=${res.unlocked}`
      );
      return NextResponse.json({ received: true, ...res }, { status: 200 });
    }

    // 3. Eventos de cobrança recorrente autorizada (renovações mensais do cartão)
    if (eventType === 'subscription_authorized_payment') {
      const authPayment = await getAuthorizedPaymentById(dataId);
      if (authPayment.preapproval_id) {
        const preapproval = await getPreapprovalById(authPayment.preapproval_id);
        const res = await reconcileMpPreapproval(preapproval, authPayment.id);
        console.log(
          `[MP Webhook] AuthorizedPayment ${dataId} (preapproval ${authPayment.preapproval_id}) -> status=${res.status}`
        );
      }
      return NextResponse.json({ received: true }, { status: 200 });
    }

    console.log(`[MP Webhook] Evento ignorado com sucesso: type=${eventType}, action=${action}, id=${dataId}`);
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: unknown) {
    console.error('[MP Webhook] Erro ao processar notificação:', err);
    // Retorna 500 apenas se falhar consulta autoritativa para o MP retentar com backoff
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
