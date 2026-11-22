import { AppSettings, getAppSettings } from './settings';
import {
  AuthUser,
  FreeUnlockRow,
  SingleUnlockRow,
  SubscriptionPlanType,
  SubscriptionRow,
  isSupabaseConfigured,
  supabaseAdminFetch,
} from './supabase/admin';
import { isAdminEmail } from './supabase/server';

export type AccessLevel =
  | 'dev'
  | 'subscription'
  | 'single'
  | 'free_pass'
  | 'preview';

export interface AccessCheckResult {
  level: AccessLevel;
  isDev: boolean;
  reason: string;
  planType?: SubscriptionPlanType;
  subscriptionEndsAt?: string | null;
  singleUnlockExpiresAt?: string | null;
  freeUnlockExpiresAt?: string | null;
}

export interface FreePassStatus {
  enabled: boolean;
  cooldownDays: number;
  unlockHours: number;
  state:
    | 'disabled'
    | 'unauthenticated'
    | 'email_unconfirmed'
    | 'pro'
    | 'active_for_file'
    | 'cooldown'
    | 'available';
  activeUnlock: {
    id: string;
    fileHash: string;
    fileName: string | null;
    unlockedAt: string;
    expiresAt: string;
    cooldownUntil: string;
  } | null;
  cooldownUntil: string | null;
}

export interface UserAccessSnapshot {
  access: AccessCheckResult;
  settings: AppSettings;
  activeSubscription: SubscriptionRow | null;
  activeSingleUnlocks: SingleUnlockRow[];
  freePassStatus: FreePassStatus;
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

export async function getUserFreeUnlocks(
  userId: string
): Promise<FreeUnlockRow[]> {
  if (!isSupabaseConfigured() || !userId) return [];
  try {
    const nowIso = new Date().toISOString();
    const res = await supabaseAdminFetch(
      `/rest/v1/free_unlocks?user_id=eq.${encodeURIComponent(
        userId
      )}&or=(expires_at.gt.${encodeURIComponent(
        nowIso
      )},cooldown_until.gt.${encodeURIComponent(
        nowIso
      )})&order=unlocked_at.desc`,
      { method: 'GET' }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as FreeUnlockRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function mapFreeUnlockSummary(row: FreeUnlockRow) {
  return {
    id: row.id,
    fileHash: row.file_hash,
    fileName: row.file_name,
    unlockedAt: row.unlocked_at,
    expiresAt: row.expires_at,
    cooldownUntil: row.cooldown_until,
  };
}

/**
 * Resolve acesso completo, assinatura, avulsos e status do Passe Gratuito em paralelo
 * (evita consultas duplicadas ao Supabase).
 */
export async function resolveUserAccessSnapshot(
  user: AuthUser | null,
  fileHash?: string | null
): Promise<UserAccessSnapshot> {
  const isUserDev = Boolean(user && isAdminEmail(user.email));
  const shouldFetchUserData = Boolean(user?.id && isSupabaseConfigured());

  const [settings, activeSubscription, activeSingleUnlocks, freeUnlocks] =
    await Promise.all([
      getAppSettings(),
      shouldFetchUserData
        ? getUserActiveSubscription(user!.id)
        : Promise.resolve(null),
      shouldFetchUserData
        ? getUserActiveSingleUnlocks(user!.id)
        : Promise.resolve([] as SingleUnlockRow[]),
      shouldFetchUserData
        ? getUserFreeUnlocks(user!.id)
        : Promise.resolve([] as FreeUnlockRow[]),
    ]);

  const nowMs = Date.now();
  const matchingSingleUnlock = fileHash
    ? activeSingleUnlocks.find((u) => u.file_hash === fileHash)
    : undefined;

  const matchingActiveFreeUnlock = fileHash
    ? freeUnlocks.find(
        (u) =>
          u.file_hash === fileHash &&
          Boolean(u.expires_at) &&
          new Date(u.expires_at).getTime() > nowMs
      )
    : undefined;

  const anyActiveFreeUnlock =
    freeUnlocks.find(
      (u) => Boolean(u.expires_at) && new Date(u.expires_at).getTime() > nowMs
    ) || null;

  const activeCooldownRow =
    freeUnlocks.find(
      (u) =>
        Boolean(u.cooldown_until) &&
        new Date(u.cooldown_until).getTime() > nowMs
    ) || null;

  let access: AccessCheckResult;
  if (isUserDev) {
    access = {
      level: 'dev',
      isDev: true,
      reason: 'Modo Dev (Proprietário)',
    };
  } else if (settings.paywall.paywall_enabled === false) {
    access = {
      level: 'subscription',
      isDev: false,
      reason: 'Acesso completo liberado (Paywall desativado nas configurações)',
    };
  } else if (activeSubscription) {
    access = {
      level: 'subscription',
      isDev: false,
      reason:
        activeSubscription.plan_type === 'manual_vip'
          ? 'Acesso VIP Ativo'
          : 'Assinatura Mensal Ativa',
      planType: activeSubscription.plan_type,
      subscriptionEndsAt: activeSubscription.current_period_end,
    };
  } else if (matchingSingleUnlock) {
    access = {
      level: 'single',
      isDev: false,
      reason: 'Desbloqueio Avulso Ativo',
      singleUnlockExpiresAt: matchingSingleUnlock.expires_at,
    };
  } else if (matchingActiveFreeUnlock) {
    access = {
      level: 'free_pass',
      isDev: false,
      reason: 'Passe Gratuito Ativo (24h)',
      freeUnlockExpiresAt: matchingActiveFreeUnlock.expires_at,
    };
  } else {
    access = {
      level: 'preview',
      isDev: false,
      reason: 'Modo Prévia',
    };
  }

  let freePassState: FreePassStatus['state'];
  if (
    access.level === 'dev' ||
    access.level === 'subscription' ||
    access.level === 'single'
  ) {
    freePassState = 'pro';
  } else if (matchingActiveFreeUnlock) {
    freePassState = 'active_for_file';
  } else if (!settings.free_pass.enabled) {
    freePassState = 'disabled';
  } else if (!user) {
    freePassState = 'unauthenticated';
  } else if (!user.email_confirmed_at) {
    freePassState = 'email_unconfirmed';
  } else if (activeCooldownRow) {
    freePassState = 'cooldown';
  } else {
    freePassState = 'available';
  }

  const displayedActiveUnlock = matchingActiveFreeUnlock || anyActiveFreeUnlock;

  return {
    access,
    settings,
    activeSubscription,
    activeSingleUnlocks,
    freePassStatus: {
      enabled: settings.free_pass.enabled,
      cooldownDays: settings.free_pass.cooldown_days,
      unlockHours: settings.free_pass.unlock_hours,
      state: freePassState,
      activeUnlock: displayedActiveUnlock
        ? mapFreeUnlockSummary(displayedActiveUnlock)
        : null,
      cooldownUntil: activeCooldownRow ? activeCooldownRow.cooldown_until : null,
    },
  };
}

export async function checkUserAccess(
  user: AuthUser | null,
  fileHash?: string | null
): Promise<AccessCheckResult> {
  const snapshot = await resolveUserAccessSnapshot(user, fileHash);
  return snapshot.access;
}
