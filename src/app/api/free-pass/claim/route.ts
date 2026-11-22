import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessSnapshot } from '@/lib/access';
import {
  computeIpHash,
  extractClientIp,
  isDisposableEmail,
  normalizeEmailForAntiAbuse,
} from '@/lib/anti-abuse';
import {
  FreeUnlockRow,
  isSupabaseConfigured,
  supabaseAdminFetch,
} from '@/lib/supabase/admin';
import { getServerSessionUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      fileHash?: string;
      fileName?: string;
    };

    const fileHash = (body.fileHash || '').trim();
    const fileName = (body.fileName || '').trim() || 'Partitura';

    if (!fileHash || fileHash.length < 16) {
      return NextResponse.json(
        { error: 'Identificador do arquivo ausente ou inválido.' },
        { status: 400 }
      );
    }

    const user = await getServerSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Faça login para usar seu Passe Gratuito.', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Banco de dados não configurado no servidor.' },
        { status: 503 }
      );
    }

    if (!user.email_confirmed_at) {
      return NextResponse.json(
        {
          error:
            'Confirme seu endereço de e-mail antes de ativar o Passe Gratuito (contas Google já entram confirmadas).',
          code: 'EMAIL_NOT_CONFIRMED',
        },
        { status: 403 }
      );
    }

    if (isDisposableEmail(user.email)) {
      return NextResponse.json(
        {
          error:
            'E-mails temporários ou descartáveis não são permitidos para o Passe Gratuito.',
          code: 'DISPOSABLE_EMAIL',
        },
        { status: 403 }
      );
    }

    const snapshot = await resolveUserAccessSnapshot(user, fileHash);
    const { settings, access, freePassStatus } = snapshot;

    if (
      access.level === 'dev' ||
      access.level === 'subscription' ||
      access.level === 'single'
    ) {
      return NextResponse.json({
        ok: true,
        alreadyPro: true,
        accessLevel: access.level,
      });
    }

    // Idempotência dentro das 24h para o mesmo arquivo
    if (
      access.level === 'free_pass' &&
      freePassStatus.activeUnlock?.fileHash === fileHash
    ) {
      return NextResponse.json({
        ok: true,
        alreadyUnlocked: true,
        unlock: freePassStatus.activeUnlock,
      });
    }

    if (!settings.free_pass.enabled) {
      return NextResponse.json(
        {
          error: 'O Modo Gratuito está temporariamente desativado.',
          code: 'FREE_PASS_DISABLED',
        },
        { status: 403 }
      );
    }

    if (freePassStatus.state === 'cooldown' && freePassStatus.cooldownUntil) {
      return NextResponse.json(
        {
          error:
            'Você já usou seu Passe Gratuito recentemente. Aguarde a contagem regressiva ou desbloqueie na hora com um plano PRO.',
          code: 'COOLDOWN_ACTIVE',
          cooldownUntil: freePassStatus.cooldownUntil,
        },
        { status: 409 }
      );
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    // 1. Bloqueio de aliases (+tag e pontos no Gmail) entre contas distintas no cooldown
    const activeCooldownRes = await supabaseAdminFetch(
      `/rest/v1/free_unlocks?cooldown_until=gt.${encodeURIComponent(
        nowIso
      )}&select=user_id,cooldown_until`,
      { method: 'GET' }
    );

    if (activeCooldownRes.ok) {
      const cooldownRows = (await activeCooldownRes.json()) as Array<{
        user_id: string;
        cooldown_until: string;
      }>;

      const otherRows = (Array.isArray(cooldownRows) ? cooldownRows : []).filter(
        (r) => r.user_id && r.user_id !== user.id
      );

      if (otherRows.length > 0) {
        const otherIds = Array.from(new Set(otherRows.map((r) => r.user_id)));
        const inClause = otherIds.map((id) => encodeURIComponent(id)).join(',');
        const profilesRes = await supabaseAdminFetch(
          `/rest/v1/profiles?id=in.(${inClause})&select=id,email`,
          { method: 'GET' }
        );

        if (profilesRes.ok) {
          const profiles = (await profilesRes.json()) as Array<{
            id: string;
            email: string | null;
          }>;
          const currentNormalized = normalizeEmailForAntiAbuse(user.email);
          const matchedProfile = (Array.isArray(profiles) ? profiles : []).find(
            (p) => p.email && normalizeEmailForAntiAbuse(p.email) === currentNormalized
          );

          if (matchedProfile) {
            const matchingCooldown = otherRows.find(
              (r) => r.user_id === matchedProfile.id
            );
            return NextResponse.json(
              {
                error:
                  'Já existe um Passe Gratuito em período de espera vinculado a este endereço de e-mail.',
                code: 'EMAIL_ALIAS_COOLDOWN',
                cooldownUntil: matchingCooldown?.cooldown_until || null,
              },
              { status: 409 }
            );
          }
        }
      }
    }

    // 2. Limite suave por IP (ip_hash = SHA-256(IP + salt)) dentro da janela de cooldown_days
    const clientIp = extractClientIp(req.headers);
    const ipHash = clientIp !== 'unknown' ? computeIpHash(clientIp) : null;

    if (ipHash) {
      const windowStartIso = new Date(
        nowMs - settings.free_pass.cooldown_days * 24 * 60 * 60 * 1000
      ).toISOString();

      const ipRes = await supabaseAdminFetch(
        `/rest/v1/free_unlocks?ip_hash=eq.${encodeURIComponent(
          ipHash
        )}&unlocked_at=gte.${encodeURIComponent(windowStartIso)}&select=user_id`,
        { method: 'GET' }
      );

      if (ipRes.ok) {
        const ipRows = (await ipRes.json()) as Array<{ user_id: string }>;
        const distinctOtherAccounts = new Set(
          (Array.isArray(ipRows) ? ipRows : [])
            .map((r) => r.user_id)
            .filter((uid) => Boolean(uid) && uid !== user.id)
        );

        if (
          distinctOtherAccounts.size >=
          settings.free_pass.max_ip_uses_per_cooldown
        ) {
          return NextResponse.json(
            {
              error:
                'Muitas ativações gratuitas foram registradas nesta rede recentemente. Aguarde o prazo ou escolha um plano PRO para liberar imediatamente.',
              code: 'IP_RATE_LIMIT',
            },
            { status: 429 }
          );
        }
      }
    }

    // 3. Registrar Passe Gratuito na tabela public.free_unlocks
    const expiresAtIso = new Date(
      nowMs + settings.free_pass.unlock_hours * 60 * 60 * 1000
    ).toISOString();
    const cooldownUntilIso = new Date(
      nowMs + settings.free_pass.cooldown_days * 24 * 60 * 60 * 1000
    ).toISOString();

    const insertRes = await supabaseAdminFetch('/rest/v1/free_unlocks', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: user.id,
        file_hash: fileHash,
        file_name: fileName.slice(0, 180),
        ip_hash: ipHash,
        unlocked_at: nowIso,
        expires_at: expiresAtIso,
        cooldown_until: cooldownUntilIso,
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: `Não foi possível ativar o Passe Gratuito agora: ${
            errText || insertRes.status
          }`,
        },
        { status: 500 }
      );
    }

    const insertedRows = (await insertRes.json()) as FreeUnlockRow[];
    const created = Array.isArray(insertedRows) ? insertedRows[0] : null;

    return NextResponse.json({
      ok: true,
      unlock: created
        ? {
            id: created.id,
            fileHash: created.file_hash,
            fileName: created.file_name,
            unlockedAt: created.unlocked_at,
            expiresAt: created.expires_at,
            cooldownUntil: created.cooldown_until,
          }
        : {
            id: '',
            fileHash,
            fileName,
            unlockedAt: nowIso,
            expiresAt: expiresAtIso,
            cooldownUntil: cooldownUntilIso,
          },
    });
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao ativar o Passe Gratuito.' },
      { status: 500 }
    );
  }
}
