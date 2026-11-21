import { NextRequest, NextResponse } from 'next/server';
import { createPixOrder } from '@/lib/mercadopago';
import { getAppSettings } from '@/lib/settings';
import {
  PaymentRow,
  SingleUnlockRow,
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
        { error: 'Faça login antes de gerar o pagamento Pix.' },
        { status: 401 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Banco de dados não configurado no servidor.' },
        { status: 503 }
      );
    }

    const body = (await req.json()) as {
      kind?: 'single' | 'monthly_pix';
      fileHash?: string;
      fileName?: string;
    };

    const kind = body.kind === 'monthly_pix' ? 'monthly_pix' : 'single';
    const settings = await getAppSettings();

    if (kind === 'single') {
      if (!settings.pricing.single_enabled) {
        return NextResponse.json(
          { error: 'O desbloqueio avulso está temporariamente desativado.' },
          { status: 400 }
        );
      }
      if (!body.fileHash || !body.fileHash.trim()) {
        return NextResponse.json(
          { error: 'Hash do arquivo obrigatório para desbloqueio avulso.' },
          { status: 400 }
        );
      }
    } else if (!settings.pricing.monthly_pix_enabled) {
      return NextResponse.json(
        { error: 'O pagamento mensal via Pix está temporariamente desativado.' },
        { status: 400 }
      );
    }

    const amountBrl =
      kind === 'single'
        ? settings.pricing.single_price_brl
        : settings.pricing.monthly_price_brl;

    const dbKind = kind === 'single' ? 'single_24h' : 'monthly_pix';

    // 1. Auditoria legal de consentimento de compra
    await logLegalConsent({
      userId: user.id,
      consentType: 'checkout_purchase',
      termsVersion: 'v1.0',
      fileHash: body.fileHash || null,
    });

    // 2. Criar registro pendente em payments
    const payInsertRes = await supabaseAdminFetch('/rest/v1/payments', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: user.id,
        kind: dbKind,
        amount_brl: amountBrl,
        status: 'pending',
      }),
    });

    const createdPayments = payInsertRes.ok
      ? ((await payInsertRes.json()) as PaymentRow[])
      : [];
    const paymentRow = createdPayments[0];
    if (!paymentRow?.id) {
      const errTxt = await payInsertRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Erro ao registrar pagamento pendente: ${errTxt}` },
        { status: 500 }
      );
    }

    // 3. Se avulso, criar ou atualizar registro pending em single_unlocks
    let singleUnlockRowId: string | null = null;
    if (kind === 'single' && body.fileHash) {
      const existingUnlockRes = await supabaseAdminFetch(
        `/rest/v1/single_unlocks?user_id=eq.${encodeURIComponent(
          user.id
        )}&file_hash=eq.${encodeURIComponent(
          body.fileHash
        )}&status=eq.pending&limit=1`
      );
      const existingUnlocks = existingUnlockRes.ok
        ? ((await existingUnlockRes.json()) as SingleUnlockRow[])
        : [];

      if (existingUnlocks[0]?.id) {
        singleUnlockRowId = existingUnlocks[0].id;
        await supabaseAdminFetch(
          `/rest/v1/single_unlocks?id=eq.${encodeURIComponent(singleUnlockRowId)}`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              file_name: body.fileName || existingUnlocks[0].file_name,
              amount_brl: amountBrl,
            }),
          }
        );
      } else {
        const unlockRes = await supabaseAdminFetch('/rest/v1/single_unlocks', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            user_id: user.id,
            file_hash: body.fileHash,
            file_name: body.fileName || 'partitura.mscz',
            amount_brl: amountBrl,
            status: 'pending',
          }),
        });
        const unlockRows = unlockRes.ok
          ? ((await unlockRes.json()) as SingleUnlockRow[])
          : [];
        singleUnlockRowId = unlockRows[0]?.id || null;
      }
    }

    // 4. Criar Order Pix na API /v1/orders do Mercado Pago
    // Passa apenas o UUID puro de payments.id (36 chars) como external_reference
    const order = await createPixOrder({
      amountBrl,
      externalReference: paymentRow.id,
      payerEmail: user.email,
      expirationMinutes: 30,
    });

    // 5. Vincular orderId retornado ao payments e single_unlocks
    await supabaseAdminFetch(
      `/rest/v1/payments?id=eq.${encodeURIComponent(paymentRow.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ mp_payment_id: order.orderId }),
      }
    );

    if (singleUnlockRowId) {
      await supabaseAdminFetch(
        `/rest/v1/single_unlocks?id=eq.${encodeURIComponent(singleUnlockRowId)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ mp_payment_id: order.orderId }),
        }
      );
    }

    return NextResponse.json({
      paymentId: paymentRow.id,
      orderId: order.orderId,
      amountBrl,
      qrCode: order.qrCode,
      qrCodeBase64: order.qrCodeBase64,
      ticketUrl: order.ticketUrl,
      expiresAt: order.expiresAt,
    });
  } catch (err: unknown) {
    console.error('[Checkout Pix] Erro:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Erro ao gerar cobrança Pix no Mercado Pago.',
      },
      { status: 500 }
    );
  }
}
