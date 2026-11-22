export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  email_confirmed_at?: string | null;
}

export interface FreeUnlockRow {
  id: string;
  user_id: string;
  file_hash: string;
  file_name: string | null;
  ip_hash: string | null;
  unlocked_at: string;
  expires_at: string;
  cooldown_until: string;
}

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type SubscriptionPlanType = 'monthly_card' | 'monthly_pix' | 'manual_vip';

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_type: SubscriptionPlanType;
  status: 'pending' | 'active' | 'cancelled' | 'expired' | 'past_due';
  mp_preapproval_id: string | null;
  mp_last_payment_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface SingleUnlockRow {
  id: string;
  user_id: string;
  file_hash: string;
  file_name: string | null;
  mp_payment_id: string | null;
  amount_brl: number;
  status: 'pending' | 'approved' | 'refunded';
  expires_at: string | null;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  user_id: string;
  mp_payment_id: string | null;
  kind: 'single_24h' | 'monthly_pix' | 'monthly_card';
  amount_brl: number;
  status: 'pending' | 'approved' | 'refunded' | 'rejected' | 'expired';
  paid_at: string | null;
  created_at: string;
}

export type ConsentType =
  | 'copyright_upload'
  | 'privacy_terms'
  | 'checkout_purchase'
  | 'checkout_subscription';

export interface LegalConsentRow {
  id?: string;
  user_id: string | null;
  consent_type: ConsentType;
  terms_version: string;
  file_hash: string | null;
  accepted_at?: string;
}

export interface UsageLogRow {
  id: string;
  user_id: string | null;
  action: 'render_preview' | 'render_full' | 'export_pdf';
  file_hash: string;
  is_dev_mode: boolean;
  created_at: string;
}

export function getSupabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

export function getSupabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
}

export function getSupabaseServiceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

/**
 * Monta headers compatíveis tanto com chaves JWT legadas (eyJ...) quanto com
 * o novo padrão do Supabase (sb_publishable_... / sb_secret_...).
 */
export function buildSupabaseHeaders(
  apiKey: string,
  userAccessToken?: string | null,
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: apiKey,
    'Content-Type': 'application/json',
    ...extra,
  };

  if (userAccessToken) {
    headers['Authorization'] = `Bearer ${userAccessToken}`;
  } else if (apiKey.startsWith('eyJ')) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}

export async function supabaseAdminFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const baseUrl = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();
  if (!baseUrl || !serviceKey) {
    throw new Error('Supabase server credentials not configured.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const incomingHeaders = (init.headers as Record<string, string> | undefined) || {};
    const headers = buildSupabaseHeaders(serviceKey, null, incomingHeaders);
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    return await fetch(url, {
      ...init,
      headers,
      signal: init.signal || controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureUserProfile(user: AuthUser): Promise<void> {
  if (!isSupabaseConfigured() || !user.id) return;
  try {
    await supabaseAdminFetch('/rest/v1/profiles?on_conflict=id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        deleted_at: null,
      }),
    });
  } catch {
    // Falha não crítica de sincronização de perfil
  }
}

export async function logUsage(params: {
  userId?: string | null;
  action: 'render_preview' | 'render_full' | 'export_pdf';
  fileHash: string;
  isDevMode: boolean;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await supabaseAdminFetch('/rest/v1/usage_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: params.userId || null,
        action: params.action,
        file_hash: params.fileHash || 'unknown',
        is_dev_mode: Boolean(params.isDevMode),
      }),
    });
  } catch {
    // Log assíncrono não deve interromper o fluxo do usuário
  }
}

export async function logLegalConsent(params: {
  userId?: string | null;
  consentType: ConsentType;
  termsVersion: string;
  fileHash?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await supabaseAdminFetch('/rest/v1/legal_consents', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: params.userId || null,
        consent_type: params.consentType,
        terms_version: params.termsVersion || 'v1.3',
        file_hash: params.fileHash || null,
      }),
    });
  } catch {
    // Falha não crítica ao gravar log de consentimento
  }
}

export const admin = {
  auth: {
    admin: {
      async deleteUser(userId: string): Promise<{ error: string | null }> {
        if (!isSupabaseConfigured()) {
          return { error: 'Supabase não configurado no servidor.' };
        }
        try {
          const res = await supabaseAdminFetch(
            `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
            {
              method: 'DELETE',
            }
          );
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            return { error: txt || `Erro HTTP ${res.status} ao excluir usuário no Auth.` };
          }
          return { error: null };
        } catch (err: unknown) {
          return {
            error: err instanceof Error ? err.message : 'Erro ao excluir usuário no Auth.',
          };
        }
      },
    },
  },
};
