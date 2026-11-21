import crypto from 'crypto';
import { getAppSettings } from './settings';
import {
  PaymentRow,
  SingleUnlockRow,
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

interface MpErrorEntry {
  code?: string | number;
  message?: string;
  description?: string;
  details?: string[] | string;
}

interface MpCauseEntry {
  code?: string | number;
  description?: string;
  message?: string;
}

interface MpErrorPayload {
  message?: string;
  error?: string;
  errors?: MpErrorEntry[];
  cause?: MpCauseEntry[] | string | Record<string, unknown>;
}

function formatMpApiError(data: MpErrorPayload, fallback: string): string {
  const parts: string[] = [];

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    for (const entry of data.errors) {
      const chunks: string[] = [];
      if (entry.code !== undefined && entry.code !== null && String(entry.code).trim()) {
        chunks.push(`[${entry.code}]`);
      }
      const msg = entry.message || entry.description;
      if (msg) chunks.push(msg);

      if (Array.isArray(entry.details) && entry.details.length > 0) {
        const detailText = entry.details
          .map((d) => (typeof d === 'string' ? d : JSON.stringify(d)))
          .filter(Boolean)
          .join(', ');
        if (detailText) chunks.push(`details: ${detailText}`);
      } else if (typeof entry.details === 'string' && entry.details.trim()) {
        chunks.push(`details: ${entry.details.trim()}`);
      }

      if (chunks.length > 0) {
        parts.push(chunks.join(' '));
      }
    }
  }

  if (Array.isArray(data.cause) && data.cause.length > 0) {
    for (const causeItem of data.cause) {
      if (causeItem && typeof causeItem === 'object') {
        const codePart =
          causeItem.code !== undefined && causeItem.code !== null
            ? `[${causeItem.code}] `
            : '';
        const text = causeItem.description || causeItem.message;
        if (text) {
          parts.push(`cause: ${codePart}${text}`);
        } else {
          parts.push(`cause: ${JSON.stringify(causeItem)}`);
        }
      } else if (causeItem) {
        parts.push(`cause: ${String(causeItem)}`);
      }
    }
  } else if (typeof data.cause === 'string' && data.cause.trim()) {
    parts.push(`cause: ${data.cause.trim()}`);
  } else if (data.cause && typeof data.cause === 'object') {
    parts.push(`cause: ${JSON.stringify(data.cause)}`);
  }

  const baseMessage = data.message || data.error || '';
  if (parts.length > 0) {
    if (baseMessage && !parts.some((p) => p.includes(baseMessage))) {
      return `${baseMessage} (${parts.join(' | ')})`;
    }
    return parts.join(' | ');
  }

  return baseMessage || fallback;
}

export async function createPixOrder(params: {
  amountBrl: number;
  externalReference: string;
  payerEmail: string;
  expirationMinutes?: number;
}): Promise<PixOrderResult> {
  const token = getMpAccessToken();
  const totalAmountStr = Number(params.amountBrl).toFixed(2);
  const expMinutes = Math.max(30, Math.min(1440, params.expirationMinutes || 30));
  const cleanExternalRef = params.externalReference.trim().slice(0, 64);

  const payload = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: totalAmountStr,
    external_reference: cleanExternalRef,
    expiration_time: `PT${expMinutes}M`,
    payer: {
      email: params.payerEmail.trim(),
    },
    transactions: {
      payments: [
        {
          amount: totalAmountStr,
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

  const rawText = await res.text();
  let data: Partial<MpOrderResponse> & MpErrorPayload = {};
  try {
    data = rawText
      ? (JSON.parse(rawText) as Partial<MpOrderResponse> & MpErrorPayload)
      : {};
  } catch {
    data = { message: rawText || undefined };
  }

  if (!res.ok || !data.id) {
    console.error(
      `[MP createPixOrder] HTTP ${res.status} - resposta completa:`,
      rawText || JSON.stringify(data)
    );
    throw new Error(
      formatMpApiError(
        data,
        `Erro HTTP ${res.status} ao criar Order Pix no Mercado Pago.`
      )
    );
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

  const rawText = await res.text();
  let data: Partial<MpPreapprovalResponse> & MpErrorPayload = {};
  try {
    data = rawText
      ? (JSON.parse(rawText) as Partial<MpPreapprovalResponse> & MpErrorPayload)
      : {};
  } catch {
    data = { message: rawText || undefined };
  }

  if (!res.ok || !data.id || !data.init_point) {
    console.error(
      `[MP createRecurringSubscription] HTTP ${res.status} - resposta completa:`,
      rawText || JSON.stringify(data)
    );
    throw new Error(
      formatMpApiError(
        data,
        `Erro HTTP ${res.status} ao criar assinatura no Mercado Pago.`
      )
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
  paymentStatus?: string;
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
    payment?: {
      status?: string;
      status_detail?: string;
    };
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
    paymentStatus: data.payment?.status || data.status,
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const rawExtRef = (order.external_reference || '').trim();
  const settings = await getAppSettings();
  const paid = isMpOrderPaid(order);
  const cancelledOrRefunded = isMpOrderRefundedOrCancelled(order);

  // Localizar registro em payments por mp_payment_id = order.id OU id = order.external_reference
  let paymentRow: PaymentRow | null = null;
  const byMpRes = await supabaseAdminFetch(
    `/rest/v1/payments?mp_payment_id=eq.${encodeURIComponent(orderId)}&limit=1`
  );
  if (byMpRes.ok) {
    const rows = (await byMpRes.json()) as PaymentRow[];
    if (rows.length > 0) paymentRow = rows[0];
  }

  let extPaymentId = '';
  if (UUID_REGEX.test(rawExtRef)) {
    extPaymentId = rawExtRef;
  } else if (rawExtRef.includes(':')) {
    const legacyPart = (rawExtRef.split(':')[2] || '').trim();
    if (UUID_REGEX.test(legacyPart)) {
      extPaymentId = legacyPart;
    }
  }

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
    console.warn(
      `[MP Reconcile] Pagamento não localizado em payments para order.id=${orderId}, external_reference=${rawExtRef || '(vazio)'}`
    );
    return { status: paid ? 'approved' : 'pending', unlocked: false };
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

  const targetUserId = paymentRow.user_id;
  const resolvedKind = paymentRow.kind;

  if (resolvedKind === 'single_24h') {
    const hours = Math.max(1, settings.pricing.single_duration_hours || 24);
    const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

    const unlockPatchRes = await supabaseAdminFetch(
      `/rest/v1/single_unlocks?mp_payment_id=eq.${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'approved',
          expires_at: expiresAt,
        }),
      }
    );

    const updatedUnlocks = unlockPatchRes.ok
      ? ((await unlockPatchRes.json()) as SingleUnlockRow[])
      : [];

    if (updatedUnlocks.length === 0 && targetUserId) {
      const pendingUnlockRes = await supabaseAdminFetch(
        `/rest/v1/single_unlocks?user_id=eq.${encodeURIComponent(
          targetUserId
        )}&status=eq.pending&order=created_at.desc&limit=1`
      );
      const pendingUnlocks = pendingUnlockRes.ok
        ? ((await pendingUnlockRes.json()) as SingleUnlockRow[])
        : [];
      if (pendingUnlocks[0]?.id) {
        await supabaseAdminFetch(
          `/rest/v1/single_unlocks?id=eq.${encodeURIComponent(pendingUnlocks[0].id)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              status: 'approved',
              expires_at: expiresAt,
              mp_payment_id: orderId,
            }),
          }
        );
      }
    }
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

const PAID_AUTHORIZED_PAYMENT_STATUSES = new Set([
  'processed',
  'approved',
  'accredited',
  'paid',
]);

export async function reconcileMpPreapproval(
  preapproval: MpPreapprovalResponse,
  authorizedPaymentId?: string,
  authorizedPaymentStatus?: string
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
  const currentSub = subRows[0] || null;
  const targetUserId = currentSub?.user_id || extUserId;
  const nowIso = new Date().toISOString();

  if (mpStatus === 'authorized') {
    // 1. Validar se o pagamento recorrente foi efetivamente pago antes de creditar/estender
    if (authorizedPaymentId && authorizedPaymentStatus !== undefined) {
      const apStatus = authorizedPaymentStatus.trim().toLowerCase();
      if (!PAID_AUTHORIZED_PAYMENT_STATUSES.has(apStatus)) {
        console.log(
          `[MP Reconcile] AuthorizedPayment ${authorizedPaymentId} (preapproval ${preapprovalId}) ignorado com status=${apStatus}`
        );
        return { status: apStatus || 'pending', unlocked: false };
      }
    }

    const paymentKey = authorizedPaymentId
      ? `authpay_${authorizedPaymentId}`
      : preapprovalId;

    const existingKeyRes = await supabaseAdminFetch(
      `/rest/v1/payments?mp_payment_id=eq.${encodeURIComponent(paymentKey)}&limit=1`
    );
    const existingByKey = existingKeyRes.ok
      ? ((await existingKeyRes.json()) as PaymentRow[])
      : [];

    if (authorizedPaymentId) {
      const keyRow = existingByKey[0];
      if (keyRow) {
        if (keyRow.status === 'approved') {
          return { status: 'approved', unlocked: true };
        }
        const claim = await supabaseAdminFetch(
          `/rest/v1/payments?id=eq.${encodeURIComponent(keyRow.id)}&status=neq.approved`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ status: 'approved', paid_at: nowIso }),
          }
        );
        const claimed = claim.ok ? ((await claim.json()) as PaymentRow[]) : [];
        if (claimed.length > 0 && targetUserId) {
          await extendOrActivateMonthlySubscription({
            userId: targetUserId,
            planType: 'monthly_card',
            mpPreapprovalId: preapprovalId,
            mpLastPaymentId: paymentKey,
          });
        }
        return { status: 'approved', unlocked: true };
      }

      if (currentSub?.mp_last_payment_id === paymentKey) {
        return { status: 'approved', unlocked: true };
      }

      // Deduplicação da 1ª cobrança: evita somar 2 pagamentos/60 dias quando subscription_preapproval aprovou primeiro
      const initialPayRes = await supabaseAdminFetch(
        `/rest/v1/payments?mp_payment_id=eq.${encodeURIComponent(preapprovalId)}&limit=1`
      );
      const initialPays = initialPayRes.ok
        ? ((await initialPayRes.json()) as PaymentRow[])
        : [];
      const initialPreapprovalPay = initialPays[0] || null;

      if (initialPreapprovalPay) {
        if (initialPreapprovalPay.status !== 'approved') {
          const claim = await supabaseAdminFetch(
            `/rest/v1/payments?id=eq.${encodeURIComponent(
              initialPreapprovalPay.id
            )}&status=neq.approved`,
            {
              method: 'PATCH',
              headers: { Prefer: 'return=representation' },
              body: JSON.stringify({
                status: 'approved',
                paid_at: nowIso,
                mp_payment_id: paymentKey,
              }),
            }
          );
          const claimed = claim.ok ? ((await claim.json()) as PaymentRow[]) : [];
          if (claimed.length > 0 && targetUserId) {
            await extendOrActivateMonthlySubscription({
              userId: targetUserId,
              planType: 'monthly_card',
              mpPreapprovalId: preapprovalId,
              mpLastPaymentId: paymentKey,
            });
            console.log(
              `[MP Reconcile] 1ª cobrança AuthorizedPayment ${authorizedPaymentId} ativou assinatura ${preapprovalId} para ${targetUserId}`
            );
          }
          return { status: 'approved', unlocked: true };
        }

        const paidTs = new Date(
          initialPreapprovalPay.paid_at || initialPreapprovalPay.created_at
        ).getTime();
        const twentyDaysMs = 20 * 24 * 60 * 60 * 1000;
        if (Date.now() - paidTs < twentyDaysMs) {
          // Mesmo pagamento inicial já aprovado via subscription_preapproval: apenas promove a chave sem duplicar receita nem dias
          await supabaseAdminFetch(
            `/rest/v1/payments?id=eq.${encodeURIComponent(
              initialPreapprovalPay.id
            )}&mp_payment_id=eq.${encodeURIComponent(preapprovalId)}`,
            {
              method: 'PATCH',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({ mp_payment_id: paymentKey }),
            }
          );
          if (currentSub?.id) {
            await supabaseAdminFetch(
              `/rest/v1/subscriptions?id=eq.${encodeURIComponent(currentSub.id)}`,
              {
                method: 'PATCH',
                headers: { Prefer: 'return=minimal' },
                body: JSON.stringify({
                  mp_last_payment_id: paymentKey,
                  updated_at: nowIso,
                }),
              }
            );
          }
          console.log(
            `[MP Reconcile] AuthorizedPayment ${authorizedPaymentId} vinculado à 1ª cobrança já computada (${preapprovalId}) sem duplicação.`
          );
          return { status: 'approved', unlocked: true };
        }
      }

      // Renovação mensal real (ou cobrança sem registro prévio): inserir e estender +30 dias
      if (targetUserId) {
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
        if (insRes.ok) {
          await extendOrActivateMonthlySubscription({
            userId: targetUserId,
            planType: 'monthly_card',
            mpPreapprovalId: preapprovalId,
            mpLastPaymentId: paymentKey,
          });
          console.log(
            `[MP Reconcile] Cobrança recorrente ${authorizedPaymentId} estendeu assinatura ${preapprovalId} para ${targetUserId}`
          );
        }
      }
      return { status: 'approved', unlocked: true };
    }

    // Sem authorizedPaymentId (evento subscription_preapproval ou retorno em /conta)
    const prePayRow = existingByKey[0] || null;
    const isCurrentSubAlreadyActive = Boolean(
      currentSub &&
        currentSub.status === 'active' &&
        currentSub.current_period_end &&
        new Date(currentSub.current_period_end).getTime() > Date.now()
    );

    if (prePayRow) {
      if (prePayRow.status === 'approved') {
        return { status: 'approved', unlocked: true };
      }
      const claim = await supabaseAdminFetch(
        `/rest/v1/payments?id=eq.${encodeURIComponent(prePayRow.id)}&status=neq.approved`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'approved', paid_at: nowIso }),
        }
      );
      const claimed = claim.ok ? ((await claim.json()) as PaymentRow[]) : [];
      if (claimed.length > 0 && targetUserId) {
        await extendOrActivateMonthlySubscription({
          userId: targetUserId,
          planType: 'monthly_card',
          mpPreapprovalId: preapprovalId,
          mpLastPaymentId: preapprovalId,
        });
        console.log(
          `[MP Reconcile] Assinatura Preapproval ${preapprovalId} ativada/estendida para ${targetUserId}`
        );
      }
      return { status: 'approved', unlocked: true };
    }

    // Se a 1ª cobrança já foi promovida para authpay_* e a assinatura já está ativa no futuro, não duplicar
    if (isCurrentSubAlreadyActive) {
      return { status: 'approved', unlocked: true };
    }

    if (targetUserId) {
      const settings = await getAppSettings();
      const amountBrl =
        Number(preapproval.auto_recurring?.transaction_amount) ||
        settings.pricing.monthly_price_brl;

      const insRes = await supabaseAdminFetch('/rest/v1/payments', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: targetUserId,
          mp_payment_id: preapprovalId,
          kind: 'monthly_card',
          amount_brl: amountBrl,
          status: 'approved',
          paid_at: nowIso,
        }),
      });
      if (insRes.ok) {
        await extendOrActivateMonthlySubscription({
          userId: targetUserId,
          planType: 'monthly_card',
          mpPreapprovalId: preapprovalId,
          mpLastPaymentId: preapprovalId,
        });
        console.log(
          `[MP Reconcile] Assinatura Preapproval ${preapprovalId} ativada para ${targetUserId}`
        );
      }
    }

    return { status: 'approved', unlocked: true };
  }

  if (mpStatus === 'cancelled' || mpStatus === 'paused') {
    if (currentSub) {
      const hasRemainingDays =
        currentSub.current_period_end &&
        new Date(currentSub.current_period_end).getTime() > Date.now();

      await supabaseAdminFetch(
        `/rest/v1/subscriptions?id=eq.${encodeURIComponent(currentSub.id)}`,
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
