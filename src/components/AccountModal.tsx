'use client';

import React, { useEffect, useState } from 'react';
import type { FreePassStatus } from '@/lib/access';
import { DEFAULT_APP_SETTINGS, type FreePassSettings } from '@/lib/settings';
import type { SingleUnlockRow, SubscriptionRow } from '@/lib/supabase/admin';
import type { ClientAuthUser } from '@/lib/supabase/client';
import FreePassCountdown from './FreePassCountdown';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Crown,
  Loader2,
  LogOut,
  QrCode,
  ShieldAlert,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  user: ClientAuthUser | null;
  isDev: boolean;
  activeSubscription: SubscriptionRow | null;
  activeSingleUnlocks: SingleUnlockRow[];
  freePassSettings?: FreePassSettings;
  freePassStatus?: FreePassStatus | null;
  onOpenPlans?: () => void;
  onFreePassExpired?: () => void;
  onSignOut: () => Promise<void>;
  onAccountDeleted: () => void;
  onSubscriptionUpdated?: () => void;
  onRenewMonthlyPix?: () => void;
}

function formatCountdown(expiresAtIso: string | null): string {
  if (!expiresAtIso) return '';
  const diffMs = new Date(expiresAtIso).getTime() - Date.now();
  if (diffMs <= 0) return 'Expirado';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins}min restantes`;
}

export function AccountPanelContent({
  user,
  isDev,
  activeSubscription,
  activeSingleUnlocks,
  freePassSettings,
  freePassStatus,
  onOpenPlans,
  onFreePassExpired,
  onSignOut,
  onAccountDeleted,
  onSubscriptionUpdated,
  onRenewMonthlyPix,
}: Omit<AccountModalProps, 'open' | 'onClose'>) {
  const effectiveFreePass = freePassSettings || DEFAULT_APP_SETTINGS.free_pass;
  const [confirmCancelSub, setConfirmCancelSub] = useState<boolean>(false);
  const [cancellingSub, setCancellingSub] = useState<boolean>(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!user) return null;

  const handleCancelSubscription = async () => {
    setCancellingSub(true);
    setCancelErr(null);
    setCancelMsg(null);
    try {
      const res = await fetch('/api/subscriptions/cancel', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelErr(data.error || 'Erro ao cancelar renovação automática.');
        return;
      }
      const untilLabel = data.accessUntil
        ? new Date(data.accessUntil).toLocaleDateString('pt-BR')
        : 'o fim do período atual';
      setCancelMsg(
        `Renovação automática cancelada. Seu acesso completo permanece ativo até ${untilLabel}.`
      );
      setConfirmCancelSub(false);
      onSubscriptionUpdated?.();
    } finally {
      setCancellingSub(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error || 'Não foi possível excluir a conta agora.');
        return;
      }
      onAccountDeleted();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5 text-xs sm:text-sm">
      {/* Dados do Usuário */}
      <div className="p-4 rounded-2xl bg-studio-950 border border-zinc-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar_url}
              alt={user.full_name || user.email}
              className="w-11 h-11 rounded-full object-cover border border-sax-500/40 shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-sax-500/15 border border-sax-500/40 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-sax-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-extrabold text-white truncate">
              {user.full_name || 'Músico Rubsax'}
            </p>
            <p className="text-xs text-zinc-400 truncate">{user.email}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onSignOut()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 border border-zinc-700 shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair</span>
        </button>
      </div>

      {/* Plano Atual */}
      <div className="p-4 rounded-2xl bg-studio-950 border border-zinc-800 space-y-3">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-sax-400">
          Status do Seu Plano
        </span>

        {cancelMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{cancelMsg}</span>
          </div>
        )}

        {cancelErr && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs">
            {cancelErr}
          </div>
        )}

        {isDev ? (
          <div className="flex items-center gap-2 text-sax-300 font-bold">
            <Crown className="w-4 h-4 text-sax-400" />
            <span>Modo Dev (Acesso Irrestrito do Proprietário)</span>
          </div>
        ) : activeSubscription ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-extrabold">
                <Crown className="w-4 h-4" />
                <span>
                  {activeSubscription.plan_type === 'manual_vip'
                    ? 'Acesso VIP Ativo (Cortesia)'
                    : activeSubscription.plan_type === 'monthly_pix'
                    ? 'Plano Mensal Completo (Pix 30 dias)'
                    : 'Assinante Mensal Completo (Cartão Recorrente)'}
                </span>
              </div>
              {activeSubscription.current_period_end && (
                <p className="text-xs text-zinc-400">
                  Acesso liberado até:{' '}
                  <strong className="text-zinc-200">
                    {new Date(activeSubscription.current_period_end).toLocaleDateString('pt-BR')}
                  </strong>
                </p>
              )}
              {activeSubscription.cancel_at_period_end && (
                <p className="text-xs text-amber-300 font-semibold">
                  Renovação automática cancelada. Você não será cobrado novamente.
                </p>
              )}
            </div>

            {/* Cancelamento em 1 clique para assinantes no cartão */}
            {activeSubscription.plan_type === 'monthly_card' &&
              !activeSubscription.cancel_at_period_end && (
                <div>
                  {!confirmCancelSub ? (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelSub(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold transition"
                    >
                      <Ban className="w-3.5 h-3.5 text-amber-400" />
                      <span>Cancelar renovação automática</span>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2 text-xs">
                      <p className="text-amber-100">
                        Você continuará com acesso até o fim do período já pago. Confirmar
                        cancelamento da próxima cobrança?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={cancellingSub}
                          onClick={() => void handleCancelSubscription()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-studio-950 font-extrabold disabled:opacity-50"
                        >
                          {cancellingSub && <Loader2 className="w-3 h-3 animate-spin" />}
                          <span>Confirmar Cancelamento</span>
                        </button>
                        <button
                          type="button"
                          disabled={cancellingSub}
                          onClick={() => setConfirmCancelSub(false)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300"
                        >
                          Manter Assinatura
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* Renovar por +30 dias via Pix para plano monthly_pix */}
            {activeSubscription.plan_type === 'monthly_pix' && onRenewMonthlyPix && (
              <button
                type="button"
                onClick={onRenewMonthlyPix}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs font-extrabold transition"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Renovar por +30 dias via Pix</span>
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-300">
            Plano atual: <strong>Modo Prévia (Gratuito)</strong>. Você pode enviar arquivos e
            testar todos os controles; a partitura completa libera ao adquirir um avulso ou mensal.
          </p>
        )}
      </div>

      {/* Músicas Avulsas Ativas */}
      {activeSingleUnlocks.length > 0 && (
        <div className="p-4 rounded-2xl bg-studio-950 border border-zinc-800 space-y-2.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-400">
            Músicas Avulsas Liberadas
          </span>
          <div className="space-y-2">
            {activeSingleUnlocks.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs"
              >
                <span className="font-semibold text-zinc-200 truncate">
                  {u.file_name || `Arquivo ${u.file_hash.slice(0, 8)}...`}
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-400 font-mono font-bold shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  {formatCountdown(u.expires_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modo Gratuito (Passe por Conta) */}
      {!isDev && !activeSubscription && effectiveFreePass.enabled && (
        <div className="p-4 rounded-2xl bg-studio-950 border border-emerald-500/35 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Modo Gratuito (Passe por Conta)</span>
            </span>
            <span className="text-[11px] text-zinc-400">
              1 música / {effectiveFreePass.cooldown_days} dias • {effectiveFreePass.unlock_hours}h
            </span>
          </div>

          {!user.email_confirmed_at ? (
            <p className="text-xs text-amber-200 font-semibold">
              Confirme seu e-mail para liberar o Passe Gratuito (ou entre com uma conta Google).
            </p>
          ) : freePassStatus?.activeUnlock &&
            new Date(freePassStatus.activeUnlock.expiresAt).getTime() > Date.now() ? (
            <div className="p-3 rounded-xl bg-emerald-950/35 border border-emerald-500/35 space-y-1.5 text-xs">
              <p className="text-zinc-200 font-semibold truncate">
                Música ativa:{' '}
                <strong className="text-white">
                  {freePassStatus.activeUnlock.fileName ||
                    `Arquivo ${freePassStatus.activeUnlock.fileHash.slice(0, 8)}...`}
                </strong>
              </p>
              <FreePassCountdown
                targetIso={freePassStatus.activeUnlock.expiresAt}
                mode="active"
                onExpire={onFreePassExpired}
                className="text-emerald-300"
              />
            </div>
          ) : freePassStatus?.state === 'cooldown' && freePassStatus.cooldownUntil ? (
            <div className="p-3 rounded-xl bg-zinc-900 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <FreePassCountdown
                targetIso={freePassStatus.cooldownUntil}
                mode="cooldown"
                onExpire={onFreePassExpired}
                className="text-amber-300"
              />
              {onOpenPlans && (
                <button
                  type="button"
                  onClick={onOpenPlans}
                  className="px-3 py-1.5 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                >
                  Desbloquear agora (PRO)
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-emerald-300 font-semibold">
              Seu Passe Gratuito está disponível! Envie uma partitura no editor e clique em
              &ldquo;Usar meu Passe Gratuito nesta música&rdquo;.
            </p>
          )}
        </div>
      )}

      {/* Exclusão de Conta (LGPD) com Confirmação Dupla */}
      <div className="p-4 rounded-2xl bg-red-950/25 border border-red-500/30 space-y-3">
        <div className="flex items-center gap-2 text-red-300 font-bold text-xs">
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
          <span>Privacidade &amp; LGPD — Exclusão Definitiva</span>
        </div>

        {deleteError && (
          <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs">
            {deleteError}
          </div>
        )}

        {confirmStep === 0 && (
          <button
            type="button"
            onClick={() => setConfirmStep(1)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-950 hover:bg-red-900 border border-red-500/40 text-red-200 text-xs font-bold transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Excluir Minha Conta e Dados (LGPD)</span>
          </button>
        )}

        {confirmStep === 1 && (
          <div className="space-y-2.5 text-xs text-red-200">
            <p className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>
                <strong>Confirmação 1 de 2:</strong> Tem certeza? Esta ação apaga seus dados
                pessoais, remove seu login e encerra eventuais acessos ativos imediatamente.
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmStep(2)}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold"
              >
                Sim, quero continuar
              </button>
              <button
                type="button"
                onClick={() => setConfirmStep(0)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {confirmStep === 2 && (
          <div className="space-y-2.5 text-xs text-red-200">
            <p className="font-bold text-red-300">
              Confirmação Final (2 de 2): Esta operação é irreversível.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDeleteAccount()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-extrabold disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirmar Exclusão Definitiva</span>
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmStep(0)}
                className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300"
              >
                Voltar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AccountModal(props: AccountModalProps) {
  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props]);

  if (!props.open || !props.user) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      onClick={props.onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-studio-900 border-2 border-sax-500/50 shadow-2xl overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-sax-600/20 via-sax-500/10 to-transparent border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sax-500/20 border border-sax-500/40 text-sax-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Minha Conta</h3>
              <p className="text-[11px] text-zinc-400">
                Gerencie seu plano, músicas avulsas e privacidade.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[80vh] overflow-y-auto">
          <AccountPanelContent
            user={props.user}
            isDev={props.isDev}
            activeSubscription={props.activeSubscription}
            activeSingleUnlocks={props.activeSingleUnlocks}
            freePassSettings={props.freePassSettings}
            freePassStatus={props.freePassStatus}
            onOpenPlans={props.onOpenPlans}
            onFreePassExpired={props.onFreePassExpired}
            onSignOut={props.onSignOut}
            onAccountDeleted={props.onAccountDeleted}
            onSubscriptionUpdated={props.onSubscriptionUpdated}
            onRenewMonthlyPix={props.onRenewMonthlyPix}
          />
        </div>
      </div>
    </div>
  );
}
