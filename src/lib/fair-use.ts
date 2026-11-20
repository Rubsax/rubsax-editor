import { getAppSettings } from './settings';
import {
  AuthUser,
  isSupabaseConfigured,
  supabaseAdminFetch,
} from './supabase/admin';

export interface FairUseResult {
  allowed: boolean;
  usedCount: number;
  limit: number;
  message?: string;
  supportUrl?: string;
}

/**
 * Trava invisível de uso justo para exportações de PDF em contas individuais.
 * Consulta `usage_logs` (action = 'export_pdf') nos últimos 30 dias vs. `app_settings.operations.monthly_pdf_fair_use_limit`.
 */
export async function checkFairUseLimit(
  user: AuthUser | null,
  isDev: boolean
): Promise<FairUseResult> {
  if (isDev) {
    return { allowed: true, usedCount: 0, limit: 999999 };
  }

  const settings = await getAppSettings();
  const limit = Math.max(1, settings.operations.monthly_pdf_fair_use_limit || 150);

  if (!user?.id || !isSupabaseConfigured()) {
    return { allowed: true, usedCount: 0, limit };
  }

  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const res = await supabaseAdminFetch(
      `/rest/v1/usage_logs?select=id&user_id=eq.${encodeURIComponent(
        user.id
      )}&action=eq.export_pdf&created_at=gte.${encodeURIComponent(sinceIso)}`,
      {
        method: 'GET',
        headers: {
          Prefer: 'count=exact',
        },
      }
    );

    if (!res.ok) {
      return { allowed: true, usedCount: 0, limit };
    }

    const contentRange = res.headers.get('content-range') || '';
    let count = 0;
    const match = contentRange.match(/\/(\d+)$/);
    if (match) {
      count = parseInt(match[1], 10) || 0;
    } else {
      const rows = (await res.json()) as Array<{ id: string }>;
      count = Array.isArray(rows) ? rows.length : 0;
    }

    if (count >= limit) {
      return {
        allowed: false,
        usedCount: count,
        limit,
        message:
          'Você atingiu o limite mensal de uso justo de exportações em PDF para contas individuais. Se precisar de volume maior ou uso institucional, fale com nosso suporte.',
        supportUrl: settings.support_links.whatsapp_url,
      };
    }

    return { allowed: true, usedCount: count, limit };
  } catch {
    return { allowed: true, usedCount: 0, limit };
  }
}
