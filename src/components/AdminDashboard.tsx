'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminCharts, { DailySeriesPoint, TxStatusCounts } from '@/components/AdminCharts';
import SmartBackButton from '@/components/SmartBackButton';
import type { AppSettings } from '@/lib/settings';
import { DEFAULT_APP_SETTINGS } from '@/lib/settings';
import type { MuseScoreQueueStats } from '@/lib/mscore-queue';
import { extractYouTubeVideoId } from '@/lib/youtube';
import {
  BarChart3,
  CheckCircle2,
  Crown,
  Download,
  Loader2,
  PlayCircle,
  RefreshCw,
  Save,
  Search,
  Server,
  Sliders,
  Trash2,
  Users,
  AlertTriangle,
  Ban,
} from 'lucide-react';

type AdminTab = 'overview' | 'settings' | 'users' | 'system';
type OverviewPeriod = '7' | '30' | '90' | 'all';
type TxStatusFilter = 'all' | 'approved' | 'pending' | 'expired' | 'rejected';

interface OverviewMetrics {
  revenueToday: number;
  revenueMonth: number;
  revenueTotal: number;
  singleRevenue: number;
  monthlyRevenue: number;
  singleCount: number;
  monthlyCount: number;
  totalAccounts: number;
  activeSubscribers: number;
  activeSingleUnlocks24h: number;
  pdfsToday: number;
  pdfsMonth: number;
  previewsToday: number;
  uniquePreviewScoresToday: number;
  fullRendersToday: number;
}

interface TransactionItem {
  id: string;
  user_email: string;
  mp_payment_id?: string | null;
  kind: string;
  amount_brl: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

interface UsageItem {
  id: string;
  user_email: string;
  action: string;
  file_hash: string;
  created_at: string;
}

interface AdminUserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  isAdmin: boolean;
  activeSubscription: {
    id: string;
    plan_type: string;
    status: string;
    current_period_end: string;
  } | null;
  activeSingleUnlocksCount: number;
}

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function downloadCsvPtBr(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): void {
  const escapeCell = (val: string | number | null | undefined): string => {
    const raw = val === null || val === undefined ? '' : String(val);
    const needsQuotes = raw.includes(';') || raw.includes('"') || raw.includes('\n');
    const escaped = raw.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };
  const lines = [
    headers.map(escapeCell).join(';'),
    ...rows.map((r) => r.map(escapeCell).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderStatusBadge(status: string) {
  if (status === 'approved') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        approved
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30">
        pending
      </span>
    );
  }
  if (status === 'expired') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-700/50 text-zinc-300 border border-zinc-600">
        expired
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500/15 text-red-300 border border-red-500/30">
      {status}
    </span>
  );
}

export default function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [periodDays, setPeriodDays] = useState<OverviewPeriod>('30');
  const [txFilter, setTxFilter] = useState<TxStatusFilter>('all');
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [configured, setConfigured] = useState<boolean>(true);
  const [expiredConstraintPending, setExpiredConstraintPending] =
    useState<boolean>(false);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [txCounts, setTxCounts] = useState<TxStatusCounts>({
    approved: 0,
    pending: 0,
    expired: 0,
    rejected: 0,
    pixApproved: 0,
    cardApproved: 0,
  });
  const [dailySeries, setDailySeries] = useState<DailySeriesPoint[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);
  const [allPeriodTransactions, setAllPeriodTransactions] = useState<TransactionItem[]>(
    []
  );
  const [recentUsage, setRecentUsage] = useState<UsageItem[]>([]);
  const [allPeriodUsage, setAllPeriodUsage] = useState<UsageItem[]>([]);
  const [queueStats, setQueueStats] = useState<MuseScoreQueueStats | null>(null);

  // Settings editor
  const [settingsForm, setSettingsForm] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Users & VIP grants
  const [userQuery, setUserQuery] = useState<string>('');
  const [usersList, setUsersList] = useState<AdminUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [vipDaysByUser, setVipDaysByUser] = useState<Record<string, number>>({});
  const [userActionId, setUserActionId] = useState<string | null>(null);
  const [userFeedback, setUserFeedback] = useState<string | null>(null);

  // System cleanup
  const [cleaningTmp, setCleaningTmp] = useState<boolean>(false);
  const [tmpResultMsg, setTmpResultMsg] = useState<string | null>(null);

  const loadOverview = useCallback(async (days: OverviewPeriod = periodDays) => {
    setLoadingOverview(true);
    try {
      const res = await fetch(
        `/api/admin/overview?days=${encodeURIComponent(days)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return;
      const data = await res.json();
      setConfigured(data.configured !== false);
      setExpiredConstraintPending(Boolean(data.expiredConstraintPending));
      setMetrics(data.metrics || null);
      if (data.txCounts) setTxCounts(data.txCounts);
      setDailySeries(data.dailySeries || []);
      setRecentTransactions(data.recentTransactions || []);
      setAllPeriodTransactions(
        data.allPeriodTransactions || data.recentTransactions || []
      );
      setRecentUsage(data.recentUsage || []);
      setAllPeriodUsage(data.allPeriodUsage || data.recentUsage || []);
      setQueueStats(data.queue || null);
    } finally {
      setLoadingOverview(false);
    }
  }, [periodDays]);

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/admin/settings', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.settings) {
        setSettingsForm({
          ...DEFAULT_APP_SETTINGS,
          ...data.settings,
          free_pass: {
            ...DEFAULT_APP_SETTINGS.free_pass,
            ...(data.settings.free_pass || {}),
          },
        });
      }
    }
  }, []);

  const loadUsers = useCallback(async (q = '') => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
      }
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadSystemStats = useCallback(async () => {
    const res = await fetch('/api/admin/system', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setQueueStats(data.stats || null);
    }
  }, []);

  useEffect(() => {
    void loadOverview(periodDays);
  }, [loadOverview, periodDays]);

  useEffect(() => {
    void loadSettings();
    void loadUsers('');
  }, [loadSettings, loadUsers]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar configurações.');
      }
      if (data.settings) setSettingsForm(data.settings);
      setSettingsMsg({
        type: 'ok',
        text: 'Configurações salvas no Supabase e cache atualizado em tempo real!',
      });
    } catch (err: unknown) {
      setSettingsMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao salvar.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleGrantVip = async (userId: string) => {
    const days = vipDaysByUser[userId] || 30;
    setUserActionId(userId);
    setUserFeedback(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant_vip', userId, days }),
      });
      const data = await res.json();
      setUserFeedback(data.message || data.error || 'Atualizado.');
      await loadUsers(userQuery);
    } finally {
      setUserActionId(null);
    }
  };

  const handleRevokeUser = async (userId: string) => {
    setUserActionId(userId);
    setUserFeedback(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', userId }),
      });
      const data = await res.json();
      setUserFeedback(data.message || data.error || 'Acesso revogado.');
      await loadUsers(userQuery);
    } finally {
      setUserActionId(null);
    }
  };

  const handleCleanupTmp = async () => {
    setCleaningTmp(true);
    setTmpResultMsg(null);
    try {
      const res = await fetch('/api/admin/system', { method: 'POST' });
      const data = await res.json();
      if (data.stats) setQueueStats(data.stats);
      const removed = data.cleanupResult?.removedCount ?? 0;
      const remaining = data.cleanupResult?.remainingCount ?? 0;
      setTmpResultMsg(
        `Limpeza concluída: ${removed} diretório(s) temporário(s) removido(s), ${remaining} restante(s).`
      );
    } finally {
      setCleaningTmp(false);
    }
  };

  const filteredTransactions = recentTransactions.filter((t) => {
    if (txFilter === 'all') return true;
    if (txFilter === 'rejected') {
      return t.status === 'rejected' || t.status === 'refunded';
    }
    return t.status === txFilter;
  });

  const handleExportTransactionsCsv = () => {
    downloadCsvPtBr(
      `rubsax-transacoes-${periodDays}d.csv`,
      ['ID', 'Usuário', 'Tipo', 'Valor (BRL)', 'Status', 'MP Payment ID', 'Pago em', 'Criado em'],
      allPeriodTransactions.map((t) => [
        t.id,
        t.user_email,
        t.kind,
        Number(t.amount_brl || 0).toFixed(2).replace('.', ','),
        t.status,
        t.mp_payment_id || '',
        t.paid_at ? new Date(t.paid_at).toLocaleString('pt-BR') : '',
        new Date(t.created_at).toLocaleString('pt-BR'),
      ])
    );
  };

  const handleExportUsageCsv = () => {
    downloadCsvPtBr(
      `rubsax-uso-${periodDays}d.csv`,
      ['ID', 'Usuário', 'Ação', 'Hash Partitura', 'Data'],
      allPeriodUsage.map((u) => [
        u.id,
        u.user_email,
        u.action,
        u.file_hash,
        new Date(u.created_at).toLocaleString('pt-BR'),
      ])
    );
  };

  const handleExportUsersCsv = () => {
    downloadCsvPtBr(
      'rubsax-usuarios.csv',
      ['ID', 'E-mail', 'Nome', 'Tipo Acesso', 'Validade', 'Avulsos Ativos', 'Criado em'],
      usersList.map((u) => [
        u.id,
        u.email || '',
        u.full_name || '',
        u.isAdmin
          ? 'Admin / Dev'
          : u.activeSubscription
          ? u.activeSubscription.plan_type
          : u.activeSingleUnlocksCount > 0
          ? 'Avulso 24h'
          : 'Prévia',
        u.activeSubscription?.current_period_end
          ? new Date(u.activeSubscription.current_period_end).toLocaleDateString('pt-BR')
          : '',
        u.activeSingleUnlocksCount,
        new Date(u.created_at).toLocaleDateString('pt-BR'),
      ])
    );
  };

  const extractedTutorialId = extractYouTubeVideoId(settingsForm.tutorial.youtube_input);

  return (
    <div className="min-h-screen bg-studio-950 text-zinc-100 flex flex-col">
      {/* Header Admin */}
      <header className="sticky top-0 z-30 bg-studio-900/95 backdrop-blur-md border-b border-zinc-800 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SmartBackButton
              currentPath="/admin"
              label="Voltar"
              fallbackHref="/?view=editor"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition"
            />
            <Link
              href="/?view=home"
              title="Ir para a Tela Inicial"
              className="w-8 h-8 rounded-xl bg-gradient-to-br from-sax-400 to-sax-600 p-1 flex items-center justify-center shadow-md overflow-hidden shrink-0 hover:opacity-90 transition"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon.png"
                alt="Rubsax Logo"
                className="w-full h-full object-contain rounded"
              />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-white">
                  RUBSAX <span className="text-sax-400">ADMIN</span>
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sax-500/20 text-sax-300 border border-sax-500/40">
                  Modo Dev
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">{adminEmail}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/?view=editor"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sax-500/15 hover:bg-sax-500/25 text-xs font-bold text-sax-300 border border-sax-500/40 transition"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Ir ao Editor</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                void loadOverview(periodDays);
                void loadSystemStats();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-sax-300 border border-zinc-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {!configured && (
          <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Supabase não configurado completamente nas variáveis de ambiente. Exibindo dados de
              fallback.
            </span>
          </div>
        )}

        {/* 4 Abas */}
        <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3">
          {(
            [
              { id: 'overview', label: 'Visão Geral (Métricas)', icon: BarChart3 },
              { id: 'settings', label: 'Configurações Dinâmicas', icon: Sliders },
              { id: 'users', label: 'Usuários & Cortesias VIP', icon: Users },
              { id: 'system', label: 'Sistema & Saúde', icon: Server },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition ${
                  active
                    ? 'bg-[#D97706] text-studio-950 border-sax-400 shadow-md'
                    : 'bg-studio-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* ABA 1: VISÃO GERAL (MÉTRICAS, GRÁFICOS E EXPORTAÇÃO CSV) */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Barra de Filtro de Período e Botões de Exportação CSV */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-studio-900 border border-zinc-800">
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="text-zinc-400 font-semibold mr-1">Período:</span>
                {(
                  [
                    { id: '7', label: '7 dias' },
                    { id: '30', label: '30 dias' },
                    { id: '90', label: '90 dias' },
                    { id: 'all', label: 'Tudo' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriodDays(p.id)}
                    className={`px-3 py-1.5 rounded-lg font-bold border transition ${
                      periodDays === p.id
                        ? 'bg-[#D97706] text-studio-950 border-sax-400'
                        : 'bg-studio-950 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <button
                  type="button"
                  onClick={handleExportTransactionsCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-emerald-300 font-bold border border-zinc-700 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Transações (CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportUsageCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sky-300 font-bold border border-zinc-700 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Uso (CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportUsersCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sax-300 font-bold border border-zinc-700 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Usuários (CSV)</span>
                </button>
              </div>
            </div>

            {expiredConstraintPending && (
              <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs space-y-1">
                <p className="font-bold">
                  Observação do Supabase: as cobranças vencidas já estão sendo exibidas como{' '}
                  <code className="text-white">expired</code> aqui no painel. Para gravar{' '}
                  <code className="text-white">expired</code> permanentemente no banco, rode no SQL
                  Editor do Supabase:
                </p>
                <pre className="p-2 rounded-lg bg-black/50 font-mono text-[11px] text-amber-100 overflow-x-auto">
                  {`ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;\nALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status IN ('pending','approved','refunded','rejected','expired'));`}
                </pre>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-studio-900 border border-zinc-800">
                <span className="text-[11px] uppercase font-bold text-zinc-400">
                  Receita Hoje / Mês
                </span>
                <p className="text-xl font-extrabold text-emerald-400 mt-1">
                  {formatBRL(metrics?.revenueToday || 0)}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  No mês: {formatBRL(metrics?.revenueMonth || 0)}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-studio-900 border border-zinc-800">
                <span className="text-[11px] uppercase font-bold text-zinc-400">
                  Receita Total (Avulsos vs Mensais)
                </span>
                <p className="text-xl font-extrabold text-sax-400 mt-1">
                  {formatBRL(metrics?.revenueTotal || 0)}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Avulsos ({metrics?.singleCount || 0}): {formatBRL(metrics?.singleRevenue || 0)} •
                  Mensais ({metrics?.monthlyCount || 0}): {formatBRL(metrics?.monthlyRevenue || 0)}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-studio-900 border border-zinc-800">
                <span className="text-[11px] uppercase font-bold text-zinc-400">
                  Contas &amp; Assinantes Ativos
                </span>
                <p className="text-xl font-extrabold text-white mt-1">
                  {metrics?.totalAccounts || 0} contas
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Assinantes/VIP ativos: <strong className="text-sax-300">{metrics?.activeSubscribers || 0}</strong> •
                  Avulsos 24h: <strong className="text-sky-300">{metrics?.activeSingleUnlocks24h || 0}</strong>
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-studio-900 border border-zinc-800">
                <span className="text-[11px] uppercase font-bold text-zinc-400">
                  PDFs &amp; Prévias Únicas (Sem Modo Dev)
                </span>
                <p className="text-xl font-extrabold text-sky-400 mt-1">
                  {metrics?.pdfsToday || 0} PDFs hoje
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Mês: {metrics?.pdfsMonth || 0} PDFs • Prévias hoje:{' '}
                  <strong className="text-amber-300">
                    {metrics?.uniquePreviewScoresToday || 0} únicas
                  </strong>{' '}
                  ({metrics?.previewsToday || 0} renders)
                </p>
              </div>
            </div>

            {/* Gráficos Visuais SVG */}
            <AdminCharts dailySeries={dailySeries} txCounts={txCounts} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Transações com Filtro por Status */}
              <div className="rounded-2xl bg-studio-900 border border-zinc-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                    Transações ({filteredTransactions.length})
                  </h2>
                  <div className="flex items-center gap-1 flex-wrap text-[10px]">
                    {(
                      [
                        { id: 'all', label: 'Todas' },
                        { id: 'approved', label: 'Aprovadas' },
                        { id: 'pending', label: 'Pendentes' },
                        { id: 'expired', label: 'Expiradas' },
                        { id: 'rejected', label: 'Recusadas' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTxFilter(f.id)}
                        className={`px-2 py-0.5 rounded-md font-bold border transition ${
                          txFilter === f.id
                            ? 'bg-sax-500 text-studio-950 border-sax-400'
                            : 'bg-studio-950 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-studio-950 text-zinc-400 sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Usuário</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Valor</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                            Nenhuma transação encontrada neste filtro.
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((t) => (
                          <tr key={t.id} className="hover:bg-zinc-900/50">
                            <td className="px-3 py-2 truncate max-w-[150px]">{t.user_email}</td>
                            <td className="px-3 py-2 font-mono">{t.kind}</td>
                            <td className="px-3 py-2 font-bold text-emerald-400">
                              {formatBRL(Number(t.amount_brl || 0))}
                            </td>
                            <td className="px-3 py-2">{renderStatusBadge(t.status)}</td>
                            <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                              {new Date(t.paid_at || t.created_at).toLocaleString('pt-BR')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Últimos Logs de Uso Reais */}
              <div className="rounded-2xl bg-studio-900 border border-zinc-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                    Logs de Uso (Clientes Reais • {recentUsage.length})
                  </h2>
                </div>
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-studio-950 text-zinc-400 sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Usuário</th>
                        <th className="px-3 py-2">Ação</th>
                        <th className="px-3 py-2">Arquivo (Hash)</th>
                        <th className="px-3 py-2">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70">
                      {recentUsage.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                            Nenhum log de uso registrado ainda.
                          </td>
                        </tr>
                      ) : (
                        recentUsage.map((u) => (
                          <tr key={u.id} className="hover:bg-zinc-900/50">
                            <td className="px-3 py-2 truncate max-w-[140px]">{u.user_email}</td>
                            <td className="px-3 py-2 font-mono text-sky-300">{u.action}</td>
                            <td className="px-3 py-2 font-mono text-zinc-400">
                              {u.file_hash?.slice(0, 10)}...
                            </td>
                            <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                              {new Date(u.created_at).toLocaleString('pt-BR')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: CONFIGURAÇÕES DINÂMICAS (app_settings) */}
        {tab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            {settingsMsg && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  settingsMsg.type === 'ok'
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                    : 'bg-red-950/60 border-red-500/40 text-red-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{settingsMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Preços */}
              <div className="p-5 rounded-2xl bg-studio-900 border border-zinc-800 space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                  Preços e Planos (pricing)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Avulso (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={settingsForm.pricing.single_price_brl}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          pricing: {
                            ...s.pricing,
                            single_price_brl: parseFloat(e.target.value) || 0,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Duração Avulso (h)</span>
                    <input
                      type="number"
                      value={settingsForm.pricing.single_duration_hours}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          pricing: {
                            ...s.pricing,
                            single_duration_hours: parseInt(e.target.value, 10) || 24,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Mensal (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={settingsForm.pricing.monthly_price_brl}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          pricing: {
                            ...s.pricing,
                            monthly_price_brl: parseFloat(e.target.value) || 0,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-4 pt-1 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.pricing.single_enabled}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          pricing: { ...s.pricing, single_enabled: e.target.checked },
                        }))
                      }
                      className="accent-[#D97706]"
                    />
                    <span>Habilitar Avulso</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.pricing.monthly_card_enabled}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          pricing: { ...s.pricing, monthly_card_enabled: e.target.checked },
                        }))
                      }
                      className="accent-[#D97706]"
                    />
                    <span>Mensal Cartão</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.pricing.monthly_pix_enabled}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          pricing: { ...s.pricing, monthly_pix_enabled: e.target.checked },
                        }))
                      }
                      className="accent-[#D97706]"
                    />
                    <span>Mensal Pix</span>
                  </label>
                </div>
              </div>

              {/* Paywall */}
              <div className="p-5 rounded-2xl bg-studio-900 border border-zinc-800 space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                  Paywall e Recorte de Prévia (paywall)
                </h3>
                <div className="space-y-3 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={settingsForm.paywall.paywall_enabled}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          paywall: { ...s.paywall, paywall_enabled: e.target.checked },
                        }))
                      }
                      className="accent-[#D97706]"
                    />
                    <span>Paywall Ativo (desmarque para modo promocional 100% gratuito)</span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-zinc-300 font-semibold">Recorte da Pág. 1 (%)</span>
                      <input
                        type="number"
                        min={15}
                        max={90}
                        value={settingsForm.paywall.preview_crop_percent}
                        onChange={(e) =>
                          setSettingsForm((s) => ({
                            ...s,
                            paywall: {
                              ...s.paywall,
                              preview_crop_percent: parseInt(e.target.value, 10) || 50,
                            },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-zinc-300 font-semibold">Texto do Botão CTA</span>
                      <input
                        type="text"
                        value={settingsForm.paywall.cta_button_text}
                        onChange={(e) =>
                          setSettingsForm((s) => ({
                            ...s,
                            paywall: { ...s.paywall, cta_button_text: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                      />
                    </label>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-zinc-300 font-semibold">Título do Modal de Planos</span>
                    <input
                      type="text"
                      value={settingsForm.paywall.modal_headline}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          paywall: { ...s.paywall, modal_headline: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                </div>
              </div>

              {/* Banner Global */}
              <div className="p-5 rounded-2xl bg-studio-900 border border-zinc-800 space-y-3 text-xs">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                  Banner Global de Aviso (announcement)
                </h3>
                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={settingsForm.announcement.enabled}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        announcement: { ...s.announcement, enabled: e.target.checked },
                      }))
                    }
                    className="accent-[#D97706]"
                  />
                  <span>Exibir Banner no Topo do App</span>
                </label>
                <label className="block space-y-1">
                  <span className="text-zinc-300 font-semibold">Mensagem</span>
                  <input
                    type="text"
                    value={settingsForm.announcement.message}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        announcement: { ...s.announcement, message: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                  />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Tipo</span>
                    <select
                      value={settingsForm.announcement.type}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          announcement: {
                            ...s.announcement,
                            type: e.target.value as 'info' | 'warning' | 'promo',
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    >
                      <option value="info">Info</option>
                      <option value="promo">Promoção</option>
                      <option value="warning">Aviso</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Texto do Link</span>
                    <input
                      type="text"
                      value={settingsForm.announcement.link_label}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          announcement: { ...s.announcement, link_label: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">URL do Link</span>
                    <input
                      type="text"
                      value={settingsForm.announcement.link_url}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          announcement: { ...s.announcement, link_url: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                </div>
              </div>

              {/* Operações e Links */}
              <div className="p-5 rounded-2xl bg-studio-900 border border-zinc-800 space-y-3 text-xs">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                  Operações &amp; Links de Suporte
                </h3>
                <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-300">
                  <input
                    type="checkbox"
                    checked={settingsForm.operations.maintenance_mode}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        operations: { ...s.operations, maintenance_mode: e.target.checked },
                      }))
                    }
                    className="accent-[#D97706]"
                  />
                  <span>Ativar Modo Manutenção (Modo Dev continua liberado)</span>
                </label>
                <label className="block space-y-1">
                  <span className="text-zinc-300 font-semibold">Mensagem de Manutenção</span>
                  <input
                    type="text"
                    value={settingsForm.operations.maintenance_message}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        operations: { ...s.operations, maintenance_message: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Concorrência mscore3</span>
                    <input
                      type="number"
                      min={1}
                      max={3}
                      value={settingsForm.operations.max_mscore_concurrency}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          operations: {
                            ...s.operations,
                            max_mscore_concurrency: parseInt(e.target.value, 10) || 1,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Limite PDF/Mês</span>
                    <input
                      type="number"
                      min={1}
                      value={settingsForm.operations.monthly_pdf_fair_use_limit}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          operations: {
                            ...s.operations,
                            monthly_pdf_fair_use_limit: parseInt(e.target.value, 10) || 150,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Limpeza /tmp (min)</span>
                    <input
                      type="number"
                      min={1}
                      value={settingsForm.operations.tmp_cleanup_minutes}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          operations: {
                            ...s.operations,
                            tmp_cleanup_minutes: parseInt(e.target.value, 10) || 15,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">WhatsApp URL</span>
                    <input
                      type="text"
                      value={settingsForm.support_links.whatsapp_url}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          support_links: { ...s.support_links, whatsapp_url: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">E-mail de Suporte</span>
                    <input
                      type="text"
                      value={settingsForm.support_links.support_email}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          support_links: { ...s.support_links, support_email: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Loja Oficial URL</span>
                    <input
                      type="text"
                      value={settingsForm.support_links.store_url}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          support_links: { ...s.support_links, store_url: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Catálogo Oficial URL</span>
                    <input
                      type="text"
                      value={settingsForm.support_links.catalog_url}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          support_links: { ...s.support_links, catalog_url: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                </div>
              </div>

              {/* Modo Gratuito (Passe por Conta) */}
              <div className="lg:col-span-2 p-5 rounded-2xl bg-studio-900 border border-emerald-500/35 space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                    Modo Gratuito (Passe — free_pass)
                  </h3>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-200">
                    <input
                      type="checkbox"
                      checked={settingsForm.free_pass.enabled}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          free_pass: { ...s.free_pass, enabled: e.target.checked },
                        }))
                      }
                      className="accent-[#D97706]"
                    />
                    <span>Habilitar Modo Gratuito (Passe)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Cooldown (dias)</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={settingsForm.free_pass.cooldown_days}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          free_pass: {
                            ...s.free_pass,
                            cooldown_days: parseInt(e.target.value, 10) || 7,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Janela da Música (horas)</span>
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={settingsForm.free_pass.unlock_hours}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          free_pass: {
                            ...s.free_pass,
                            unlock_hours: parseInt(e.target.value, 10) || 24,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Máx. Contas / IP</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={settingsForm.free_pass.max_ip_uses_per_cooldown}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          free_pass: {
                            ...s.free_pass,
                            max_ip_uses_per_cooldown: parseInt(e.target.value, 10) || 3,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <label className="flex items-center gap-2 cursor-pointer font-bold py-2">
                    <input
                      type="checkbox"
                      checked={settingsForm.free_pass.pdf_watermark_enabled}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          free_pass: {
                            ...s.free_pass,
                            pdf_watermark_enabled: e.target.checked,
                          },
                        }))
                      }
                      className="accent-[#D97706]"
                    />
                    <span>Ativar marca d&apos;água / rodapé discreto no PDF gratuito</span>
                  </label>

                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Texto do Rodapé no PDF</span>
                    <input
                      type="text"
                      value={settingsForm.free_pass.pdf_watermark_text}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          free_pass: {
                            ...s.free_pass,
                            pdf_watermark_text: e.target.value,
                          },
                        }))
                      }
                      placeholder="Transposto gratuitamente em app.rubsax.com.br"
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                </div>
              </div>

              {/* Vídeo Tutorial YouTube (Tela Inicial + Botão Tutorial no Topo) */}
              <div className="lg:col-span-2 p-5 rounded-2xl bg-studio-900 border border-zinc-800 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                    <PlayCircle className="w-4 h-4 text-red-400" />
                    <span>Vídeo Tutorial do YouTube (tutorial)</span>
                  </h3>
                  {settingsForm.tutorial.youtube_input.trim() && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                        extractedTutorialId
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-red-500/15 border-red-500/40 text-red-300'
                      }`}
                    >
                      {extractedTutorialId
                        ? `ID YouTube válido: ${extractedTutorialId}`
                        : 'Link ou código iframe inválido'}
                    </span>
                  )}
                </div>

                <label className="flex items-center gap-2 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={settingsForm.tutorial.enabled}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        tutorial: { ...s.tutorial, enabled: e.target.checked },
                      }))
                    }
                    className="accent-[#D97706]"
                  />
                  <span>Ativar vídeo tutorial na Tela Inicial e no botão &ldquo;Tutorial&rdquo; do topo</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">Título do Tutorial</span>
                    <input
                      type="text"
                      value={settingsForm.tutorial.title}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          tutorial: { ...s.tutorial, title: e.target.value },
                        }))
                      }
                      placeholder="Como usar o Rubsax Transposer"
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-300 font-semibold">
                      Link do YouTube, ID ou Código &lt;iframe&gt;
                    </span>
                    <input
                      type="text"
                      value={settingsForm.tutorial.youtube_input}
                      onChange={(e) =>
                        setSettingsForm((s) => ({
                          ...s,
                          tutorial: { ...s.tutorial, youtube_input: e.target.value },
                        }))
                      }
                      placeholder="https://www.youtube.com/watch?v=... ou código <iframe>"
                      className="w-full px-3 py-2 rounded-xl bg-studio-950 border border-zinc-700 text-white font-mono"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-sm font-extrabold shadow-lg active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50"
              >
                {savingSettings ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Salvar Alterações</span>
              </button>
            </div>
          </form>
        )}

        {/* ABA 3: USUÁRIOS & CORTESIAS VIP */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void loadUsers(userQuery);
                  }}
                  placeholder="Buscar por e-mail ou nome..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-studio-900 border border-zinc-700 text-xs sm:text-sm text-white focus:outline-none focus:border-sax-500"
                />
              </div>
              <button
                type="button"
                onClick={() => void loadUsers(userQuery)}
                className="px-4 py-2 rounded-xl bg-[#D97706] text-studio-950 text-xs font-extrabold"
              >
                Buscar
              </button>
            </div>

            {userFeedback && (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs font-semibold">
                {userFeedback}
              </div>
            )}

            <div className="rounded-2xl bg-studio-900 border border-zinc-800 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-studio-950 text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Usuário</th>
                    <th className="px-4 py-3">Status Atual</th>
                    <th className="px-4 py-3">Conceder VIP</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                        Carregando usuários...
                      </td>
                    </tr>
                  ) : usersList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  ) : (
                    usersList.map((u) => {
                      const daysVal = vipDaysByUser[u.id] ?? 30;
                      const busy = userActionId === u.id;
                      return (
                        <tr key={u.id} className="hover:bg-zinc-900/40">
                          <td className="px-4 py-3">
                            <p className="font-bold text-white">
                              {u.full_name || 'Sem nome'}
                              {u.isAdmin && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-sax-500/20 text-sax-300 text-[10px]">
                                  Admin
                                </span>
                              )}
                            </p>
                            <p className="text-zinc-400">{u.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            {u.activeSubscription ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold text-[11px]">
                                  <Crown className="w-3 h-3" />
                                  {u.activeSubscription.plan_type === 'manual_vip'
                                    ? 'VIP Cortesia'
                                    : 'Assinante Mensal'}
                                </span>
                                <p className="text-[11px] text-zinc-400 mt-1">
                                  Até{' '}
                                  {new Date(
                                    u.activeSubscription.current_period_end
                                  ).toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                            ) : u.activeSingleUnlocksCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 font-bold text-[11px]">
                                {u.activeSingleUnlocksCount} música(s) avulsa(s)
                              </span>
                            ) : (
                              <span className="text-zinc-500">Modo Prévia</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={daysVal}
                                onChange={(e) =>
                                  setVipDaysByUser((prev) => ({
                                    ...prev,
                                    [u.id]: parseInt(e.target.value, 10) || 30,
                                  }))
                                }
                                className="px-2 py-1 rounded-lg bg-studio-950 border border-zinc-700 text-xs text-white"
                              >
                                <option value={7}>7 dias</option>
                                <option value={30}>30 dias</option>
                                <option value={90}>90 dias</option>
                                <option value={365}>365 dias</option>
                              </select>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleGrantVip(u.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#D97706] hover:bg-sax-400 text-studio-950 font-extrabold disabled:opacity-50"
                              >
                                {busy ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Crown className="w-3 h-3" />
                                )}
                                <span>Conceder Acesso VIP</span>
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleRevokeUser(u.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-500/40 text-red-200 font-bold disabled:opacity-50"
                            >
                              <Ban className="w-3 h-3" />
                              <span>Revogar Acesso</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ABA 4: SISTEMA & SAÚDE */}
        {tab === 'system' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-studio-900 border border-zinc-800 space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                Fila de Concorrência MuseScore 3 (VPS 2 GB RAM)
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-zinc-800">
                  <span className="text-zinc-400">Processos mscore3 em execução agora:</span>
                  <span className="font-mono font-bold text-white">
                    {queueStats?.activeRunners ?? 0} / {queueStats?.maxConcurrency ?? 1}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-800">
                  <span className="text-zinc-400">Na fila prioritária (Modo Dev):</span>
                  <span className="font-mono font-bold text-sax-400">
                    {queueStats?.pendingDev ?? 0}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-800">
                  <span className="text-zinc-400">Na fila normal (Clientes):</span>
                  <span className="font-mono font-bold text-sky-300">
                    {queueStats?.pendingNormal ?? 0}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-zinc-400">Retenção configurada em /tmp:</span>
                  <span className="font-mono font-bold text-zinc-200">
                    {queueStats?.tmpCleanupMinutes ?? 15} minutos
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-studio-900 border border-zinc-800 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                Armazenamento Temporário (/tmp)
              </h3>
              <p className="text-xs text-zinc-400">
                Pastas temporárias encontradas no momento:{' '}
                <strong className="text-white font-mono">
                  {queueStats?.tmpDirsCount ?? 0}
                </strong>
                {queueStats?.lastCleanupAt && (
                  <span className="block mt-1">
                    Última varredura: {new Date(queueStats.lastCleanupAt).toLocaleString('pt-BR')}
                  </span>
                )}
              </p>

              <button
                type="button"
                disabled={cleaningTmp}
                onClick={() => void handleCleanupTmp()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-extrabold transition disabled:opacity-50"
              >
                {cleaningTmp ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Limpar Diretório /tmp Agora</span>
              </button>

              {tmpResultMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs">
                  {tmpResultMsg}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
