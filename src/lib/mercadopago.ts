import crypto from 'crypto';
import { getAppSettings } from './settings';
import {
  PaymentRow,
  SubscriptionRow,
  isSupabaseConfigured,
  supabaseAdminFetch,
} from './supabase/admin';

const MP_API_BASE = 'https://api.mercadopago.com';

function getMpAccessToken(): string {
  const token = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!token) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado no servidor.');
  }
  return token;
}

export interface PixOrderResult {
  orderId: string;
  paymentId: string | null;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expiresAt: string;
}

export interface MpOrderPaymentItem {
  id?: string;
  amount?: string;
  status?: string;
  status_detail?: string;
  payment_method?: {
    id?: string;
    type?: string;
    qr_code?: string;
    qr_code_base64?: string;
    ticket_url?: string;
  };
  date_of_expiration?: string;
}

export interface MpOrderResponse {
  id: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string;
  transactions?: {
    payments?: MpOrderPaymentItem[];
  };
}

export interface MpPreapprovalResponse {
  id: string;
  status?: string;
  reason?: string;
  external_reference?: string;
  payer_email?: string;
  init_point?: string;
  next_payment_date?: string;
  auto_recurring?: {
    transaction_amount?: number;
    currency_id?: string;
  };
}

export async function createPixOrder(params: {
  amountBrl: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerFirstName?: string | null;
  payerLastName?: string | null;
  expirationMinutes?: number;
}): Promise<PixOrderResult> {
  const token = getMpAccessToken();
  const amountStr = Number(params.amountBrl).toFixed(2);
  const expMinutes = Math.max(5, Math.min(1440, params.expirationMinutes || 30));

  const payload = {
    type: 'online',
    processing_mode: 'automatic',
    external_reference: params.externalReference,
    description: params.description.slice(0, 140),
    total_amount: amountStr,
    payer: {
      email: params.payerEmail,
      first_name: (params.payerFirstName || 'Cliente').slice(0, 60),
      last_name: (params.payerLastName || 'Rubsax').slice(0, 60),
    },
    transactions: {
      payments: [
        {
          amount: amountStr,
          expiration_time: `PT${expMinutes}M`,
          payment_method: {
            id: 'pix',
            type: 'bank_transfer',
          },
        },
      ],
    },
  };

  const res = await fetch(`${MP_API_BASE}/v1/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = (await res.json().catch(() => ({}))) as MpOrderResponse & {
    errors?: Array<{ message?: string; description?: string }>;
    message?: string;
  };

  if (!res.ok || !data.id) {
    const errMsg =
      data.errors?.map((e) => e.message || e.description).filter(Boolean).join('; ') ||
      data.message ||
      `Erro HTTP ${res.status} ao criar Order Pix no Mercado Pago.`;
    throw new Error(errMsg);
  }

  const firstPayment = data.transactions?.payments?.[0];
  const pm = firstPayment?.payment_method;
  const expiresAt =
    firstPayment?.date_of_expiration ||
    new Date(Date.now() + expMinutes * 60 * 1000).toISOString();

  return {
    orderId: String(data.id),
    paymentId: firstPayment?.id ? String(firstPayment.id) : null,
    status: String(data.status || firstPayment?.status || 'action_required'),
    qrCode: pm?.qr_code || '',
    qrCodeBase64: pm?.qr_code_base64 || '',
    ticketUrl: pm?.ticket_url || '',
    expiresAt,
  };
}

export async function getOrderById(orderId: string): Promise<MpOrderResponse> {
  const token = getMpAccessToken();
  const res = await fetch(`${MP_API_BASE}/v1/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  const data = (await res.json().catch(() => ({}))) as MpOrderResponse & {
    message?: string;
  };

  if (!res.ok || !data.id) {
    throw new Error(
      data.message || `Falha ao consultar Order ${orderId} no Mercado Pago.`
    );
  }

  return data;
}

export async function createRecurringSubscription(params: {
  amountBrl: number;
  reason: string;
  externalReference: string;
  payerEmail: string;
  backUrl: string;
}): Promise<{ preapprovalId: string; initPoint: string; status: string }> {
  const token = getMpAccessToken();
  const amountNum = Number(Number(params.amountBrl).toFixed(2));

  const res = await fetch(`${MP_API_BASE}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: params.reason.slice(0, 140),
      external_reference: params.externalReference,
      payer_email: params.payerEmail,
      back_url: params.backUrl,
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amountNum,
        currency_id: 'BRL',
      },
    }),
    cache: 'no-store',
  });

  const data = (await res.json().catch(() => ({}))) as MpPreapprovalResponse & {
    message?: string;
  };

  if (!res.ok || !data.id || !data.init_point) {
    throw new Error(
      data.message || `Erro HTTP ${res.status} ao criar assinatura no Mercado Pago.`
    );
  }

  return {
    preapprovalId: String(data.id),
    initPoint: String(data.init_point),
    status: String(data.status || 'pending'),
  };
}

export async function getPreapprovalById(
  preapprovalId: string
): Promise<MpPreapprovalResponse> {
  const token = getMpAccessToken();
  const res = await fetch(
    `${MP_API_BASE}/preapproval/${encodeURIComponent(preapprovalId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );

  const data = (await res.json().catch(() => ({}))) as MpPreapprovalResponse & {
    message?: string;
  };

  if (!res.ok || !data.id) {
    throw new Error(
      data.message || `Falha ao consultar assinatura ${preapprovalId} no Mercado Pago.`
    );
  }

  return data;
}

export async function getAuthorizedPaymentById(authPaymentId: string): Promise<{
  id: string;
  preapproval_id?: string;
  status?: string;
  transaction_amount?: number;
}> {
  const token = getMpAccessToken();
  const res = await fetch(
    `${MP_API_BASE}/authorized_payments/${encodeURIComponent(authPaymentId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    preapproval_id?: string;
    status?: string;
    transaction_amount?: number;
    message?: string;
  };

  if (!res.ok || !data.id) {
    throw new Error(
      data.message ||
        `Falha ao consultar pagamento recorrente ${authPaymentId} no Mercado Pago.`
    );
  }

  return {
    id: String(data.id),
    preapproval_id: data.preapproval_id ? String(data.preapproval_id) : undefined,
    status: data.status,
    transaction_amount: data.transaction_amount,
  };
}

export async function cancelPreapproval(
  preapprovalId: string
): Promise<MpPreapprovalResponse> {
  const token = getMpAccessToken();
  const res = await fetch(
    `${MP_API_BASE}/preapproval/${encodeURIComponent(preapprovalId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'cancelled' }),
      cache: 'no-store',
    }
  );

  const data = (await res.json().catch(() => ({}))) as MpPreapprovalResponse & {
    message?: string;
  };

  if (!res.ok) {
    throw new Error(
      data.message || `Erro HTTP ${res.status} ao cancelar assinatura no Mercado Pago.`
    );
  }

  return data;
}

export function verifyWebhookSignature(
  headers: Headers,
  dataId: string
): { valid: boolean; skippedSecret: boolean } {
  const secret = (process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    console.warn(
      '[MP Webhook] MERCADOPAGO_WEBHOOK_SECRET ausente. Validando exclusivamente via consulta autoritativa na API do Mercado Pago.'
    );
    return { valid: true, skippedSecret: true };
  }

  const xSignature = headers.get('x-signature') || '';
  const xRequestId = headers.get('x-request-id') || '';
  if (!xSignature || !xRequestId || !dataId) {
    return { valid: false, skippedSecret: false };
  }

  let ts = '';
  let v1 = '';
  for (const part of xSignature.split(',')) {
    const [k, ...rest] = part.trim().split('=');
    const val = rest.join('=').trim();
    if (k === 'ts') ts = val;
    if (k === 'v1') v1 = val;
  }

  if (!ts || !v1) {
    return { valid: false, skippedSecret: false };
  }

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
  const calculated = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  try {
    const calcBuf = Buffer.from(calculated, 'hex');
    const recvBuf = Buffer.from(v1, 'hex');
    if (calcBuf.length === 0 || calcBuf.length !== recvBuf.length) {
      return { valid: false, skippedSecret: false };
    }
    return {
      valid: crypto.timingSafeEqual(calcBuf, recvBuf),
      skippedSecret: false,
    };
  } catch {
    return { valid: false, skippedSecret: false };
  }
}

export function isMpOrderPaid(order: MpOrderResponse): boolean {
  const orderStatus = (order.status || '').toLowerCase();
  const payStatus = (order.transactions?.payments?.[0]?.status || '').toLowerCase();
  return (
    orderStatus === 'processed' ||
    orderStatus === 'paid' ||
    payStatus === 'processed' ||
    payStatus === 'accredited' ||
    payStatus === 'approved'
  );
}

export function isMpOrderRefundedOrCancelled(order: MpOrderResponse): boolean {
  const orderStatus = (order.status || '').toLowerCase();
  const payStatus = (order.transactions?.payments?.[0]?.status || '').toLowerCase();
  return (
    orderStatus === 'refunded' ||
    orderStatus === 'cancelled' ||
    orderStatus === 'canceled' ||
    orderStatus === 'expired' ||
    payStatus === 'refunded' ||
    payStatus === 'cancelled'
  );
}

/**
 * Concilia de forma idempotente uma Order Pix no Supabase.
 * Pode ser chamada simultaneamente pelo Webhook e pelo polling do cliente sem duplicar dias.
 */
export async function reconcileMpOrder(order: MpOrderResponse): Promise<{
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  unlocked: boolean;
}> {
  if (!isSupabaseConfigured()) {
    return { status: 'pending', unlocked: false };
  }

  const orderId = String(order.id);
  const settings = await getAppSettings();
  const paid = isMpOrderPaid(order);
  const cancelledOrRefunded = isMpOrderRefundedOrCancelled(order);

  // Localizar registro em payments pelo mp_payment_id ou pelo paymentRowId em external_reference
  let paymentRow: PaymentRow | null = null;
  const byMpRes = await supabaseAdminFetch(
    `/rest/v1/payments?mp_payment_id=eq.${encodeURIComponent(orderId)}&limit=1`
  );
  if (byMpRes.ok) {
    const rows = (await byMpRes.json()) as PaymentRow[];
    if (rows.length > 0) paymentRow = rows[0];
  }

  const extParts = (order.external_reference || '').split(':');
  const extKind = extParts[0];
  const extUserId = extParts[1];
  const extPaymentId = extParts[2];

  if (!paymentRow && extPaymentId) {
    const byIdRes = await supabaseAdminFetch(
      `/rest/v1/payments?id=eq.${encodeURIComponent(extPaymentId)}&limit=1`
    );
    if (byIdRes.ok) {
      const rows = (await byIdRes.json()) as PaymentRow[];
      if (rows.length > 0) paymentRow = rows[0];
    }
  }

  if (!paymentRow) {
    return { status: paid ? 'approved' : 'pending', unlocked: paid };
  }

  if (cancelledOrRefunded) {
    const orderStatusLower = (order.status || '').toLowerCase();
    const mappedStatus = orderStatusLower === 'refunded' ? 'refunded' : 'rejected';
    await supabaseAdminFetch(
      `/rest/v1/payments?id=eq.${encodeURIComponent(paymentRow.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: mappedStatus }),
      }
    );

    if (paymentRow.kind === 'single_24h') {
      await supabaseAdminFetch(
        `/rest/v1/single_unlocks?mp_payment_id=eq.${encodeURIComponent(orderId)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'refunded',
            expires_at: new Date().toISOString(),
          }),
        }
      );
    }

    return {
      status: orderStatusLower === 'expired' ? 'expired' : 'rejected',
      unlocked: false,
    };
  }

  if (!paid) {
    return { status: 'pending', unlocked: false };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Atualização atômica condicional: apenas o primeiro executor a transicionar pending -> approved libera dias/horas
  const claimRes = await supabaseAdminFetch(
    `/rest/v1/payments?id=eq.${encodeURIComponent(paymentRow.id)}&status=neq.approved`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'approved',
        paid_at: nowIso,
        mp_payment_id: orderId,
      }),
    }
  );

  const claimedRows = claimRes.ok ? ((await claimRes.json()) as PaymentRow[]) : [];
  if (claimedRows.length === 0) {
    // Já foi processado por outra requisição concorrente (idempotente)
    return { status: 'approved', unlocked: true };
  }

  const targetUserId = paymentRow.user_id || extUserId;
  const resolvedKind =
    paymentRow.kind || (extKind === 'monthly_pix' ? 'monthly_pix' : 'single_24h');

  if (resolvedKind === 'single_24h') {
    const hours = Math.max(1, settings.pricing.single_duration_hours || 24);
    const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

    await supabaseAdminFetch(
      `/rest/v1/single_unlocks?mp_payment_id=eq.${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'approved',
          expires_at: expiresAt,
        }),
      }
    );
  } else if (resolvedKind === 'monthly_pix' && targetUserId) {
    await extendOrActivateMonthlySubscription({
      userId: targetUserId,
      planType: 'monthly_pix',
      mpLastPaymentId: orderId,
    });
  }

  console.log(
    `[MP Reconcile] Order ${orderId} aprovada (${resolvedKind}) para usuário ${targetUserId}`
  );
  return { status: 'approved', unlocked: true };
}

export async function extendOrActivateMonthlySubscription(params: {
  userId: string;
  planType: 'monthly_pix' | 'monthly_card';
  mpPreapprovalId?: string | null;
  mpLastPaymentId?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured() || !params.userId) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const subRes = await supabaseAdminFetch(
    `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(
      params.userId
    )}&status=eq.active&order=current_period_end.desc&limit=1`
  );
  const existingSubs = subRes.ok ? ((await subRes.json()) as SubscriptionRow[]) : [];
  const activeSub = existingSubs[0];

  if (activeSub && activeSub.current_period_end) {
    const currentEndMs = new Date(activeSub.current_period_end).getTime();
    const baseMs = Math.max(now.getTime(), currentEndMs);
    const nextEndIso = new Date(baseMs + thirtyDaysMs).toISOString();

    await supabaseAdminFetch(
      `/rest/v1/subscriptions?id=eq.${encodeURIComponent(activeSub.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          plan_type: params.planType,
          status: 'active',
          mp_preapproval_id: params.mpPreapprovalId || activeSub.mp_preapproval_id,
          mp_last_payment_id: params.mpLastPaymentId || activeSub.mp_last_payment_id,
          current_period_end: nextEndIso,
          cancel_at_period_end: false,
          updated_at: nowIso,
        }),
      }
    );
    return;
  }

  // Verificar se existe assinatura pendente com o mesmo preapprovalId
  if (params.mpPreapprovalId) {
    const pendingRes = await supabaseAdminFetch(
      `/rest/v1/subscriptions?mp_preapproval_id=eq.${encodeURIComponent(
        params.mpPreapprovalId
      )}&limit=1`
    );
    const pendingRows = pendingRes.ok
      ? ((await pendingRes.json()) as SubscriptionRow[])
      : [];
    if (pendingRows.length > 0) {
      const nextEndIso = new Date(now.getTime() + thirtyDaysMs).toISOString();
      await supabaseAdminFetch(
        `/rest/v1/subscriptions?id=eq.${encodeURIComponent(pendingRows[0].id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            plan_type: params.planType,
            status: 'active',
            mp_last_payment_id: params.mpLastPaymentId || null,
            current_period_start: nowIso,
            current_period_end: nextEndIso,
            cancel_at_period_end: false,
            updated_at: nowIso,
          }),
        }
      );
      return;
    }
  }

  const nextEndIso = new Date(now.getTime() + thirtyDaysMs).toISOString();
  await supabaseAdminFetch('/rest/v1/subscriptions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: params.userId,
      plan_type: params.planType,
      status: 'active',
      mp_preapproval_id: params.mpPreapprovalId || null,
      mp_last_payment_id: params.mpLastPaymentId || null,
      current_period_start: nowIso,
      current_period_end: nextEndIso,
      cancel_at_period_end: false,
      updated_at: nowIso,
    }),
  });
}

export async function reconcileMpPreapproval(
  preapproval: MpPreapprovalResponse,
  authorizedPaymentId?: string
): Promise<{ status: string; unlocked: boolean }> {
  if (!isSupabaseConfigured()) {
    return { status: preapproval.status || 'pending', unlocked: false };
  }

  const preapprovalId = String(preapproval.id);
  const mpStatus = (preapproval.status || '').toLowerCase();
  const extParts = (preapproval.external_reference || '').split(':');
  const extUserId = extParts[0] === 'sub' ? extParts[1] : '';

  const subLookup = await supabaseAdminFetch(
    `/rest/v1/subscriptions?mp_preapproval_id=eq.${encodeURIComponent(preapprovalId)}&limit=1`
  );
  const subRows = subLookup.ok ? ((await subLookup.json()) as SubscriptionRow[]) : [];
  const targetUserId = subRows[0]?.user_id || extUserId;
  const nowIso = new Date().toISOString();

  if (mpStatus === 'authorized') {
    const paymentKey = authorizedPaymentId
      ? `authpay_${authorizedPaymentId}`
      : preapprovalId;

    // Trava idempotente por pagamento/ciclo em payments
    const existingPayRes = await supabaseAdminFetch(
      `/rest/v1/payments?mp_payment_id=eq.${encodeURIComponent(paymentKey)}&limit=1`
    );
    const existingPays = existingPayRes.ok
      ? ((await existingPayRes.json()) as PaymentRow[])
      : [];

    let shouldExtend = false;
    if (existingPays.length > 0) {
      if (existingPays[0].status !== 'approved') {
        const claim = await supabaseAdminFetch(
          `/rest/v1/payments?id=eq.${encodeURIComponent(existingPays[0].id)}&status=neq.approved`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ status: 'approved', paid_at: nowIso }),
          }
        );
        const claimed = claim.ok ? ((await claim.json()) as PaymentRow[]) : [];
        shouldExtend = claimed.length > 0;
      }
    } else if (targetUserId) {
      const settings = await getAppSettings();
      const amountBrl =
        Number(preapproval.auto_recurring?.transaction_amount) ||
        settings.pricing.monthly_price_brl;

      const insRes = await supabaseAdminFetch('/rest/v1/payments', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: targetUserId,
          mp_payment_id: paymentKey,
          kind: 'monthly_card',
          amount_brl: amountBrl,
          status: 'approved',
          paid_at: nowIso,
        }),
      });
      shouldExtend = insRes.ok;
    }

    if (shouldExtend && targetUserId) {
      await extendOrActivateMonthlySubscription({
        userId: targetUserId,
        planType: 'monthly_card',
        mpPreapprovalId: preapprovalId,
        mpLastPaymentId: paymentKey,
      });
      console.log(
        `[MP Reconcile] Assinatura Preapproval ${preapprovalId} ativada/estendida para ${targetUserId}`
      );
    }

    return { status: 'approved', unlocked: true };
  }

  if (mpStatus === 'cancelled' || mpStatus === 'paused') {
    if (subRows[0]) {
      const hasRemainingDays =
        subRows[0].current_period_end &&
        new Date(subRows[0].current_period_end).getTime() > Date.now();

      await supabaseAdminFetch(
        `/rest/v1/subscriptions?id=eq.${encodeURIComponent(subRows[0].id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            cancel_at_period_end: true,
            status: hasRemainingDays ? 'active' : 'cancelled',
            updated_at: nowIso,
          }),
        }
      );
    }
    return { status: 'cancelled', unlocked: false };
  }

  return { status: mpStatus || 'pending', unlocked: false };
}
