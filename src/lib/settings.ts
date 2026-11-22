import {
  getSupabaseUrl,
  isSupabaseConfigured,
  supabaseAdminFetch,
} from './supabase/admin';

export interface PricingSettings {
  single_price_brl: number;
  single_duration_hours: number;
  monthly_price_brl: number;
  single_enabled: boolean;
  monthly_card_enabled: boolean;
  monthly_pix_enabled: boolean;
}

export interface PaywallSettings {
  paywall_enabled: boolean;
  preview_crop_percent: number;
  cta_button_text: string;
  modal_headline: string;
}

export interface AnnouncementSettings {
  enabled: boolean;
  message: string;
  link_url: string;
  link_label: string;
  type: 'info' | 'warning' | 'promo';
}

export interface OperationsSettings {
  maintenance_mode: boolean;
  maintenance_message: string;
  max_mscore_concurrency: number;
  monthly_pdf_fair_use_limit: number;
  tmp_cleanup_minutes: number;
}

export interface SupportLinksSettings {
  whatsapp_url: string;
  support_email: string;
  store_url: string;
  catalog_url: string;
}

export interface TutorialSettings {
  enabled: boolean;
  title: string;
  youtube_input: string;
}

export interface FreePassSettings {
  enabled: boolean;
  cooldown_days: number;
  unlock_hours: number;
  max_ip_uses_per_cooldown: number;
  pdf_watermark_enabled: boolean;
  pdf_watermark_text: string;
}

export interface AppSettings {
  pricing: PricingSettings;
  paywall: PaywallSettings;
  announcement: AnnouncementSettings;
  operations: OperationsSettings;
  support_links: SupportLinksSettings;
  tutorial: TutorialSettings;
  free_pass: FreePassSettings;
}

export type AppSettingKey = keyof AppSettings;

export const SETTING_DESCRIPTIONS: Record<AppSettingKey, string> = {
  pricing: 'Valores e disponibilidade dos planos Avulso e Mensal.',
  paywall: 'Controle do modo prévia, percentual de recorte da Página 1 e textos de conversão.',
  announcement: 'Banner global exibido no topo da aplicação para comunicados ou promoções.',
  operations: 'Modo manutenção, limite de concorrência do MuseScore 3, uso justo e limpeza de /tmp.',
  support_links: 'Links oficiais de suporte, WhatsApp, loja e catálogo.',
  tutorial: 'Vídeo tutorial oficial do YouTube exibido na tela inicial e no botão Tutorial.',
  free_pass: 'Configurações do Modo Gratuito (Passe por conta), cooldown, anti-abuso e rodapé no PDF.',
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  pricing: {
    single_price_brl: 5.9,
    single_duration_hours: 24,
    monthly_price_brl: 19.9,
    single_enabled: true,
    monthly_card_enabled: true,
    monthly_pix_enabled: true,
  },
  paywall: {
    paywall_enabled: true,
    preview_crop_percent: 50,
    cta_button_text: 'Visualizar partitura inteira',
    modal_headline: 'Desbloqueie sua partitura completa',
  },
  announcement: {
    enabled: false,
    message: '',
    link_url: '',
    link_label: '',
    type: 'info',
  },
  operations: {
    maintenance_mode: false,
    maintenance_message:
      'Estamos realizando uma melhoria rápida. Voltamos em instantes!',
    max_mscore_concurrency: 1,
    monthly_pdf_fair_use_limit: 150,
    tmp_cleanup_minutes: 15,
  },
  support_links: {
    whatsapp_url: 'https://wa.me/5513997452922',
    support_email: 'contato@rubsax.com.br',
    store_url: 'https://www.rubsax.com.br/',
    catalog_url: 'https://catalogo.rubsax.com.br/',
  },
  tutorial: {
    enabled: false,
    title: 'Como usar o Rubsax Transposer',
    youtube_input: '',
  },
  free_pass: {
    enabled: true,
    cooldown_days: 7,
    unlock_hours: 24,
    max_ip_uses_per_cooldown: 3,
    pdf_watermark_enabled: true,
    pdf_watermark_text: 'Transposto gratuitamente em app.rubsax.com.br',
  },
};

const CACHE_TTL_MS = 60 * 1000;

interface SettingsCacheEntry {
  data: AppSettings;
  expiresAt: number;
}

let settingsCache: SettingsCacheEntry | null = null;
let inFlightSettingsFetch: Promise<AppSettings> | null = null;

function mergeSettingsWithDefaults(rows: Array<{ key: string; value: unknown }>): AppSettings {
  const merged: AppSettings = {
    pricing: { ...DEFAULT_APP_SETTINGS.pricing },
    paywall: { ...DEFAULT_APP_SETTINGS.paywall },
    announcement: { ...DEFAULT_APP_SETTINGS.announcement },
    operations: { ...DEFAULT_APP_SETTINGS.operations },
    support_links: { ...DEFAULT_APP_SETTINGS.support_links },
    tutorial: { ...DEFAULT_APP_SETTINGS.tutorial },
    free_pass: { ...DEFAULT_APP_SETTINGS.free_pass },
  };

  for (const row of rows) {
    if (!row || typeof row.value !== 'object' || row.value === null) continue;
    const val = row.value as Record<string, unknown>;
    if (row.key === 'pricing') {
      merged.pricing = {
        single_price_brl: Number(val.single_price_brl ?? merged.pricing.single_price_brl) || 5.9,
        single_duration_hours:
          Number(val.single_duration_hours ?? merged.pricing.single_duration_hours) || 24,
        monthly_price_brl: Number(val.monthly_price_brl ?? merged.pricing.monthly_price_brl) || 19.9,
        single_enabled:
          typeof val.single_enabled === 'boolean' ? val.single_enabled : merged.pricing.single_enabled,
        monthly_card_enabled:
          typeof val.monthly_card_enabled === 'boolean'
            ? val.monthly_card_enabled
            : merged.pricing.monthly_card_enabled,
        monthly_pix_enabled:
          typeof val.monthly_pix_enabled === 'boolean'
            ? val.monthly_pix_enabled
            : merged.pricing.monthly_pix_enabled,
      };
    } else if (row.key === 'paywall') {
      const rawCrop = Number(val.preview_crop_percent ?? merged.paywall.preview_crop_percent);
      merged.paywall = {
        paywall_enabled:
          typeof val.paywall_enabled === 'boolean' ? val.paywall_enabled : merged.paywall.paywall_enabled,
        preview_crop_percent: Math.max(15, Math.min(90, Number.isFinite(rawCrop) ? rawCrop : 50)),
        cta_button_text:
          typeof val.cta_button_text === 'string' && val.cta_button_text.trim()
            ? val.cta_button_text.trim()
            : merged.paywall.cta_button_text,
        modal_headline:
          typeof val.modal_headline === 'string' && val.modal_headline.trim()
            ? val.modal_headline.trim()
            : merged.paywall.modal_headline,
      };
    } else if (row.key === 'announcement') {
      const t = val.type;
      merged.announcement = {
        enabled: typeof val.enabled === 'boolean' ? val.enabled : merged.announcement.enabled,
        message: typeof val.message === 'string' ? val.message : merged.announcement.message,
        link_url: typeof val.link_url === 'string' ? val.link_url : merged.announcement.link_url,
        link_label:
          typeof val.link_label === 'string' ? val.link_label : merged.announcement.link_label,
        type: t === 'warning' || t === 'promo' || t === 'info' ? t : merged.announcement.type,
      };
    } else if (row.key === 'operations') {
      const maxConc = Number(
        val.max_mscore_concurrency ?? merged.operations.max_mscore_concurrency
      );
      const fairUse = Number(
        val.monthly_pdf_fair_use_limit ?? merged.operations.monthly_pdf_fair_use_limit
      );
      const tmpMins = Number(val.tmp_cleanup_minutes ?? merged.operations.tmp_cleanup_minutes);
      merged.operations = {
        maintenance_mode:
          typeof val.maintenance_mode === 'boolean'
            ? val.maintenance_mode
            : merged.operations.maintenance_mode,
        maintenance_message:
          typeof val.maintenance_message === 'string' && val.maintenance_message.trim()
            ? val.maintenance_message
            : merged.operations.maintenance_message,
        max_mscore_concurrency: Math.max(1, Math.min(3, Number.isFinite(maxConc) ? maxConc : 1)),
        monthly_pdf_fair_use_limit: Math.max(
          1,
          Number.isFinite(fairUse) ? fairUse : merged.operations.monthly_pdf_fair_use_limit
        ),
        tmp_cleanup_minutes: Math.max(1, Math.min(180, Number.isFinite(tmpMins) ? tmpMins : 15)),
      };
    } else if (row.key === 'support_links') {
      merged.support_links = {
        whatsapp_url:
          typeof val.whatsapp_url === 'string' && val.whatsapp_url.trim()
            ? val.whatsapp_url.trim()
            : merged.support_links.whatsapp_url,
        support_email:
          typeof val.support_email === 'string' && val.support_email.trim()
            ? val.support_email.trim()
            : merged.support_links.support_email,
        store_url:
          typeof val.store_url === 'string' && val.store_url.trim()
            ? val.store_url.trim()
            : merged.support_links.store_url,
        catalog_url:
          typeof val.catalog_url === 'string' && val.catalog_url.trim()
            ? val.catalog_url.trim()
            : merged.support_links.catalog_url,
      };
    } else if (row.key === 'tutorial') {
      merged.tutorial = {
        enabled:
          typeof val.enabled === 'boolean' ? val.enabled : merged.tutorial.enabled,
        title:
          typeof val.title === 'string' && val.title.trim()
            ? val.title.trim()
            : merged.tutorial.title,
        youtube_input:
          typeof val.youtube_input === 'string'
            ? val.youtube_input.trim()
            : merged.tutorial.youtube_input,
      };
    } else if (row.key === 'free_pass') {
      const rawCooldown = Number(val.cooldown_days ?? merged.free_pass.cooldown_days);
      const rawUnlockHours = Number(val.unlock_hours ?? merged.free_pass.unlock_hours);
      const rawMaxIp = Number(
        val.max_ip_uses_per_cooldown ?? merged.free_pass.max_ip_uses_per_cooldown
      );
      merged.free_pass = {
        enabled:
          typeof val.enabled === 'boolean' ? val.enabled : merged.free_pass.enabled,
        cooldown_days: Math.max(
          1,
          Math.min(365, Number.isFinite(rawCooldown) ? Math.round(rawCooldown) : 7)
        ),
        unlock_hours: Math.max(
          1,
          Math.min(168, Number.isFinite(rawUnlockHours) ? Math.round(rawUnlockHours) : 24)
        ),
        max_ip_uses_per_cooldown: Math.max(
          1,
          Math.min(50, Number.isFinite(rawMaxIp) ? Math.round(rawMaxIp) : 3)
        ),
        pdf_watermark_enabled:
          typeof val.pdf_watermark_enabled === 'boolean'
            ? val.pdf_watermark_enabled
            : merged.free_pass.pdf_watermark_enabled,
        pdf_watermark_text:
          typeof val.pdf_watermark_text === 'string' && val.pdf_watermark_text.trim()
            ? val.pdf_watermark_text.trim()
            : merged.free_pass.pdf_watermark_text,
      };
    }
  }

  return merged;
}

export function invalidateSettingsCache(): void {
  settingsCache = null;
  inFlightSettingsFetch = null;
}

export async function getAppSettings(): Promise<AppSettings> {
  const now = Date.now();
  if (settingsCache && settingsCache.expiresAt > now) {
    return settingsCache.data;
  }

  if (!isSupabaseConfigured() || !getSupabaseUrl()) {
    return DEFAULT_APP_SETTINGS;
  }

  if (inFlightSettingsFetch) {
    return inFlightSettingsFetch;
  }

  inFlightSettingsFetch = (async () => {
    try {
      const res = await supabaseAdminFetch('/rest/v1/app_settings?select=key,value', {
        method: 'GET',
      });
      if (!res.ok) {
        return settingsCache?.data || DEFAULT_APP_SETTINGS;
      }
      const rows = (await res.json()) as Array<{ key: string; value: unknown }>;
      const merged = mergeSettingsWithDefaults(Array.isArray(rows) ? rows : []);
      settingsCache = {
        data: merged,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      return merged;
    } catch {
      return settingsCache?.data || DEFAULT_APP_SETTINGS;
    } finally {
      inFlightSettingsFetch = null;
    }
  })();

  return inFlightSettingsFetch;
}

export async function saveAppSettings(
  nextPartial: Partial<AppSettings>,
  updatedByEmail: string
): Promise<AppSettings> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase não configurado no servidor.');
  }

  const current = await getAppSettings();
  const sanitized = mergeSettingsWithDefaults([
    { key: 'pricing', value: { ...current.pricing, ...(nextPartial.pricing || {}) } },
    { key: 'paywall', value: { ...current.paywall, ...(nextPartial.paywall || {}) } },
    {
      key: 'announcement',
      value: { ...current.announcement, ...(nextPartial.announcement || {}) },
    },
    { key: 'operations', value: { ...current.operations, ...(nextPartial.operations || {}) } },
    {
      key: 'support_links',
      value: { ...current.support_links, ...(nextPartial.support_links || {}) },
    },
    {
      key: 'tutorial',
      value: { ...current.tutorial, ...(nextPartial.tutorial || {}) },
    },
    {
      key: 'free_pass',
      value: { ...current.free_pass, ...(nextPartial.free_pass || {}) },
    },
  ]);

  const nowIso = new Date().toISOString();
  const keysToPersist: AppSettingKey[] = [
    'pricing',
    'paywall',
    'announcement',
    'operations',
    'support_links',
    'tutorial',
    'free_pass',
  ];

  const payload = keysToPersist.map((key) => ({
    key,
    value: sanitized[key],
    description: SETTING_DESCRIPTIONS[key],
    updated_at: nowIso,
    updated_by: updatedByEmail,
  }));

  const res = await supabaseAdminFetch('/rest/v1/app_settings?on_conflict=key', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Falha ao salvar configurações no Supabase: ${errText || res.status}`);
  }

  invalidateSettingsCache();
  settingsCache = {
    data: sanitized,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return sanitized;
}
