import { getAppSettings } from './settings';
import {
  AuthUser,
  SingleUnlockRow,
  SubscriptionPlanType,
  SubscriptionRow,
  isSupabaseConfigured,
  supabaseAdminFetch,
} from './supabase/admin';
import { isAdminEmail } from './supabase/server';

export type AccessLevel = 'dev' | 'subscription' | 'single' | 'preview';

export interface AccessCheckResult {
  level: AccessLevel;
  isDev: boolean;
  reason: string;
  planType?: SubscriptionPlanType;
  subscriptionEndsAt?: string | null;
  singleUnlockExpiresAt?: string | null;
}

export async function getUserActiveSubscription(
  userId: string
): Promise<SubscriptionRow | null> {
  if (!isSupabaseConfigured() || !userId) return null;
  try {
    const nowIso = new Date().toISOString();
    const res = await supabaseAdminFetch(
      `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(
        userId
      )}&status=eq.active&current_period_end=gt.${encodeURIComponent(
        nowIso
      )}&order=current_period_end.desc&limit=1`,
      { method: 'GET' }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as SubscriptionRow[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function getUserActiveSingleUnlocks(
  userId: string
): Promise<SingleUnlockRow[]> {
  if (!isSupabaseConfigured() || !userId) return [];
  try {
    const nowIso = new Date().toISOString();
    const res = await supabaseAdminFetch(
      `/rest/v1/single_unlocks?user_id=eq.${encodeURIComponent(
        userId
      )}&status=eq.approved&expires_at=gt.${encodeURIComponent(
        nowIso
      )}&order=expires_at.desc`,
      { method: 'GET' }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as SingleUnlockRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function checkUserAccess(
  user: AuthUser | null,
  fileHash?: string | null
): Promise<AccessCheckResult> {
  // 1. Modo Dev (exclusivo do proprietário via ADMIN_EMAIL)
  if (user && isAdminEmail(user.email)) {
    return {
      level: 'dev',
      isDev: true,
      reason: 'Modo Dev (Proprietário)',
    };
  }

  // 2. Paywall desativado globalmente em app_settings (ex: modo promocional gratuito)
  const settings = await getAppSettings();
  if (settings.paywall.paywall_enabled === false) {
    return {
      level: 'subscription',
      isDev: false,
      reason: 'Acesso completo liberado (Paywall desativado nas configurações)',
    };
  }

  if (user?.id && isSupabaseConfigured()) {
    // 3. Assinatura Mensal ou Cortesia VIP ativa
    const activeSub = await getUserActiveSubscription(user.id);
    if (activeSub) {
      return {
        level: 'subscription',
        isDev: false,
        reason:
          activeSub.plan_type === 'manual_vip'
            ? 'Acesso VIP Ativo'
            : 'Assinatura Mensal Ativa',
        planType: activeSub.plan_type,
        subscriptionEndsAt: activeSub.current_period_end,
      };
    }

    // 4. Desbloqueio Avulso 24h válido para este SHA-256 específico
    if (fileHash) {
      const unlocks = await getUserActiveSingleUnlocks(user.id);
      const matchingUnlock = unlocks.find((u) => u.file_hash === fileHash);
      if (matchingUnlock) {
        return {
          level: 'single',
          isDev: false,
          reason: 'Desbloqueio Avulso Ativo',
          singleUnlockExpiresAt: matchingUnlock.expires_at,
        };
      }
    }
  }

  // 5. Padrão: Modo Prévia censurado no backend
  return {
    level: 'preview',
    isDev: false,
    reason: 'Modo Prévia',
  };
}
