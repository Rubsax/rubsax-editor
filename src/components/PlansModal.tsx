'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { FreePassStatus } from '@/lib/access';
import {
  DEFAULT_APP_SETTINGS,
  type FreePassSettings,
  type PaywallSettings,
  type PricingSettings,
} from '@/lib/settings';
import type { ClientAuthUser } from '@/lib/supabase/client';
import FreePassCountdown from './FreePassCountdown';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  Lock,
  LogIn,
  Maximize2,
  QrCode,
  Sparkles,
  X,
} from 'lucide-react';

export type PlanCheckoutKind = 'single' | 'monthly_pix' | 'monthly_card';

interface PixChargeState {
  kind: 'single' | 'monthly_pix';
  paymentId: string;
  orderId: string;
  amountBrl: number;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expiresAt: string;
}

interface PlansModalProps {
  open: boolean;
  onClose: () => void;
  user: ClientAuthUser | null;
  pricing: PricingSettings;
  paywall: PaywallSettings;
  fileHash?: string;
  fileName?: string;
  initialPlanToStart?: PlanCheckoutKind | null;
  freePassSettings?: FreePassSettings;
  freePassStatus?: FreePassStatus | null;
  isClaimingFreePass?: boolean;
  freePassError?: string | null;
  modalContextReason?: 'fullscreen' | 'pro' | 'default';
  onClaimFreePass?: () => void;
  onRequireLoginForFreePass?: () => void;
  onFreePassExpired?: () => void;
  onRequireLogin: (pendingPlan?: PlanCheckoutKind) => void;
  onPaymentApproved?: () => void;
}

function formatPriceBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function PlansModal({
  open,
  onClose,
  user,
  pricing,
  paywall,
  fileHash,
  fileName,
  initialPlanToStart,
  freePassSettings,
  freePassStatus,
  isClaimingFreePass = false,
  freePassError = null,
  modalContextReason = 'default',
  onClaimFreePass,
  onRequireLoginForFreePass,
  onFreePassExpired,
  onRequireLogin,
  onPaymentApproved,
}: PlansModalProps) {
  const effectiveFreePass = freePassSettings || DEFAULT_APP_SETTINGS.free_pass;
  const [loadingKind, setLoadingKind] = useState<PlanCheckoutKind | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pixCharge, setPixCharge] = useState<PixChargeState | null>(null);
  const [copiedPix, setCopiedPix] = useState<boolean>(false);
  const [paymentStatus, setPaymentStatus] = useState<
    'idle' | 'pending' | 'approved' | 'rejected' | 'expired'
  >('idle');

  const onPaymentApprovedRef = useRef(onPaymentApproved);
  const onCloseRef = useRef(onClose);
  const approvedHandledRef = useRef(false);

  useEffect(() => {
    onPaymentApprovedRef.current = onPaymentApproved;
  }, [onPaymentApproved]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const finishApprovedFlow = useCallback(() => {
    if (approvedHandledRef.current) return;
    approvedHandledRef.current = true;
    onPaymentApprovedRef.current?.();
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) {
      setPixCharge(null);
      setErrorMsg(null);
      setLoadingKind(null);
      setCopiedPix(false);
      setPaymentStatus('idle');
      approvedHandledRef.current = false;
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const startCheckout = async (kind: PlanCheckoutKind) => {
    if (!user) {
      onClose();
      onRequireLogin(kind);
      return;
    }

    setErrorMsg(null);
    setLoadingKind(kind);

    try {
      if (kind === 'single' || kind === 'monthly_pix') {
        const res = await fetch('/api/checkout/pix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            fileHash,
            fileName,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          onClose();
          onRequireLogin(kind);
          return;
        }
        if (!res.ok) {
          throw new Error(data.error || 'Não foi possível gerar o Pix agora.');
        }

        setPixCharge({
          kind,
          paymentId: data.paymentId,
          orderId: data.orderId,
          amountBrl: Number(data.amountBrl || 0),
          qrCode: data.qrCode || '',
          qrCodeBase64: data.qrCodeBase64 || '',
          ticketUrl: data.ticketUrl || '',
          expiresAt: data.expiresAt || '',
        });
        setPaymentStatus('pending');
      } else {
        const res = await fetch('/api/checkout/subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          onClose();
          onRequireLogin(kind);
          return;
        }
        if (!res.ok || !data.initPoint) {
          throw new Error(
            data.error || 'Não foi possível iniciar o checkout no cartão.'
          );
        }
        window.location.href = data.initPoint;
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao processar pagamento.'
      );
    } finally {
      setLoadingKind(null);
    }
  };

  // Disparo automático quando o modal abre com intenção prévia (ex: "Renovar +30 dias via Pix")
  useEffect(() => {
    if (open && user && initialPlanToStart && !pixCharge && !loadingKind) {
      void startCheckout(initialPlanToStart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, initialPlanToStart]);

  // Polling automático de confirmação Pix a cada 3 segundos
  useEffect(() => {
    if (!open || !pixCharge?.orderId || paymentStatus !== 'pending') {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/checkout/status?orderId=${encodeURIComponent(pixCharge.orderId)}`,
          { cache: 'no-store' }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          status?: 'pending' | 'approved' | 'rejected' | 'expired';
          unlocked?: boolean;
        };

        if (cancelled) return;

        if (data.unlocked || data.status === 'approved') {
          setPaymentStatus('approved');
        } else if (data.status === 'rejected' || data.status === 'expired') {
          setPaymentStatus(data.status);
        }
      } catch {
        // Ignora falha transitória de rede durante o polling
      }
    };

    const intervalId = setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [open, pixCharge, paymentStatus]);

  // Efeito dedicado ao fechamento automático após aprovação (sem ser cancelado pelo reset do efeito de polling)
  useEffect(() => {
    if (!open || paymentStatus !== 'approved') {
      approvedHandledRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      finishApprovedFlow();
    }, 1000);
    return () => clearTimeout(timer);
  }, [open, paymentStatus, finishApprovedFlow]);

  if (!open) return null;

  const handleCopyPix = async () => {
    if (!pixCharge?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixCharge.qrCode);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2500);
    } catch {
      // Fallback silencioso
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl bg-studio-900 border-2 border-sax-500/50 shadow-2xl overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-gradient-to-r from-sax-600/25 via-sax-500/10 to-transparent border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sax-500/20 border border-sax-500/40 text-sax-400">
              {pixCharge ? <QrCode className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sax-300">
                {pixCharge
                  ? 'Pix Transparente • Liberação Instantânea'
                  : 'Desbloqueio Imediato • Sem Fidelidade'}
              </span>
              <h3 className="text-base sm:text-xl font-extrabold text-white">
                {pixCharge
                  ? `Pague ${formatPriceBRL(pixCharge.amountBrl)} via Pix`
                  : paywall.modal_headline || 'Desbloqueie sua partitura completa'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-950/70 border border-red-500/50 text-red-100 text-xs sm:text-sm flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ETAPA 2: TELA PIX TRANSPARENTE */}
          {pixCharge ? (
            <div className="space-y-5">
              {paymentStatus === 'approved' ? (
                <div className="p-8 rounded-2xl bg-emerald-950/50 border-2 border-emerald-500/60 flex flex-col items-center text-center gap-3 animate-fadeIn">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  </div>
                  <h4 className="text-lg font-extrabold text-white">
                    Pagamento Confirmado!
                  </h4>
                  <p className="text-xs sm:text-sm text-emerald-200">
                    Desbloqueando sua partitura completa, Tela Cheia e exportação em PDF...
                  </p>
                  <button
                    type="button"
                    onClick={finishApprovedFlow}
                    className="mt-1 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-studio-950 text-xs sm:text-sm font-extrabold shadow-md active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    Ver partitura liberada agora
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  {/* QR Code */}
                  <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white text-slate-900 shadow-lg">
                    {pixCharge.qrCodeBase64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={
                          pixCharge.qrCodeBase64.startsWith('data:')
                            ? pixCharge.qrCodeBase64
                            : `data:image/png;base64,${pixCharge.qrCodeBase64}`
                        }
                        alt="QR Code Pix"
                        className="w-52 h-52 object-contain"
                      />
                    ) : (
                      <div className="w-52 h-52 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-4 text-center text-xs text-slate-600 gap-2">
                        <QrCode className="w-10 h-10 text-slate-400" />
                        <span>Use o código Pix Copia e Cola ao lado no app do seu banco.</span>
                      </div>
                    )}
                    <span className="mt-2 text-xs font-extrabold text-slate-800">
                      Valor: {formatPriceBRL(pixCharge.amountBrl)}
                    </span>
                  </div>

                  {/* Instruções + Copia e Cola + Status Polling */}
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                        Pix Copia e Cola
                      </span>
                      <p className="text-xs text-zinc-300">
                        Abra o app do seu banco, escaneie o QR Code ou copie o código Pix abaixo:
                      </p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-studio-950 border border-zinc-700 font-mono text-[11px] text-zinc-300 break-all max-h-24 overflow-y-auto select-all">
                      {pixCharge.qrCode || 'Código Pix indisponível'}
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCopyPix()}
                      className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                        copiedPix
                          ? 'bg-emerald-500 text-studio-950'
                          : 'bg-[#D97706] hover:bg-sax-400 text-studio-950 shadow-md'
                      }`}
                    >
                      {copiedPix ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copiar código Pix (Copia e Cola)</span>
                        </>
                      )}
                    </button>

                    {pixCharge.expiresAt && (
                      <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                        <span>
                          Expira em:{' '}
                          {new Date(pixCharge.expiresAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </p>
                    )}

                    <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-2.5 text-xs">
                      {paymentStatus === 'pending' ? (
                        <>
                          <Loader2 className="w-4 h-4 text-sax-400 animate-spin shrink-0" />
                          <span className="text-zinc-200 font-semibold">
                            Aguardando confirmação do pagamento...
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                          <span className="text-red-200 font-semibold">
                            Este Pix expirou ou foi cancelado. Gere um novo código.
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPixCharge(null);
                          setPaymentStatus('idle');
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-zinc-200"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Voltar aos planos</span>
                      </button>

                      {pixCharge.ticketUrl && (
                        <a
                          href={pixCharge.ticketUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-sax-400 hover:underline"
                        >
                          <span>Abrir comprovante Pix</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ETAPA 1: SELEÇÃO DE PLANO */
            <>
              {modalContextReason === 'fullscreen' && (
                <div className="p-3.5 rounded-2xl bg-amber-950/50 border border-amber-500/45 flex items-start gap-2.5 text-xs text-amber-100">
                  <Maximize2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-amber-200">
                      Modo Tela Cheia exclusivo para planos Avulso e Mensal (PRO)
                    </p>
                    <p className="text-amber-200/80">
                      O Modo Gratuito libera apenas Transposição &amp; Oitava e exportação em PDF
                      com quebra automática. Assine ou libere avulso para usar Tela Cheia e todas as
                      ferramentas.
                    </p>
                  </div>
                </div>
              )}

              {!user && (
                <div className="p-3.5 rounded-2xl bg-sky-950/40 border border-sky-500/40 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <p className="font-bold text-sky-200">
                      Entre com sua conta antes de desbloquear
                    </p>
                    <p className="text-sky-300/80">
                      Assim seu acesso avulso ({pricing.single_duration_hours}h) ou assinatura mensal
                      fica vinculado à sua conta mesmo trocando de celular ou computador.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onRequireLogin();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-slate-900 font-extrabold text-xs shadow hover:bg-zinc-100 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Entrar com Google / E-mail</span>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Plano Avulso */}
                {pricing.single_enabled && (
                  <div className="p-5 rounded-2xl bg-studio-950/90 border border-zinc-700 flex flex-col justify-between gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-sky-300">
                          <Clock className="w-3.5 h-3.5" />
                          Avulso ({pricing.single_duration_hours}h)
                        </span>
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-semibold text-zinc-300">
                          1 Música
                        </span>
                      </div>

                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl sm:text-3xl font-extrabold text-white">
                            {formatPriceBRL(pricing.single_price_brl)}
                          </span>
                          <span className="text-xs text-zinc-400">pagamento único</span>
                        </div>
                        {fileName && (
                          <p className="text-[11px] text-zinc-400 mt-1 truncate">
                            Arquivo atual: <strong className="text-zinc-200">{fileName}</strong>
                          </p>
                        )}
                      </div>

                      <ul className="space-y-2 text-xs text-zinc-300">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>
                            Todas as páginas, Tela Cheia e PDF ilimitado desta música por{' '}
                            <strong>{pricing.single_duration_hours} horas</strong>.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>
                            Re-edite o tom, oitavas e pautas quantas vezes quiser durante o prazo
                            sem pagar novamente.
                          </span>
                        </li>
                      </ul>
                    </div>

                    <button
                      type="button"
                      disabled={loadingKind !== null || !fileHash}
                      onClick={() => void startCheckout('single')}
                      className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50"
                    >
                      {loadingKind === 'single' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-sax-400" />
                      ) : (
                        <QrCode className="w-4 h-4 text-sax-400" />
                      )}
                      <span>
                        {!fileHash
                          ? 'Envie uma partitura para desbloquear avulso'
                          : user
                          ? `Desbloquear via Pix (${formatPriceBRL(pricing.single_price_brl)})`
                          : 'Entrar e Desbloquear via Pix'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Plano Mensal Completo */}
                {(pricing.monthly_card_enabled || pricing.monthly_pix_enabled) && (
                  <div className="p-5 rounded-2xl bg-gradient-to-b from-sax-500/15 to-studio-950 border-2 border-sax-500/70 flex flex-col justify-between gap-4 relative shadow-lg shadow-sax-500/10">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-sax-400">
                          <Crown className="w-3.5 h-3.5" />
                          Mensal Completo
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-[#D97706] text-[10px] font-extrabold text-studio-950">
                          Mais Vantajoso
                        </span>
                      </div>

                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-2xl sm:text-3xl font-extrabold text-white">
                            {formatPriceBRL(pricing.monthly_price_brl)}
                          </span>
                          <span className="text-xs text-zinc-300">/ mês</span>
                        </div>
                        <p className="text-[11px] text-sax-300/90 mt-1">
                          Sem fidelidade • Cancele em 1 clique quando quiser
                        </p>
                      </div>

                      <ul className="space-y-2 text-xs text-zinc-200">
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-sax-400 shrink-0 mt-0.5" />
                          <span>
                            Desbloqueio completo de <strong>qualquer partitura</strong> que você
                            enviar.
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-sax-400 shrink-0 mt-0.5" />
                          <span>Modo Tela Cheia e Exportação PDF em alta definição liberados.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-sax-400 shrink-0 mt-0.5" />
                          <span>Garantia incondicional de 7 dias (Art. 49 do CDC).</span>
                        </li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      {pricing.monthly_card_enabled && (
                        <button
                          type="button"
                          disabled={loadingKind !== null}
                          onClick={() => void startCheckout('monthly_card')}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50"
                        >
                          {loadingKind === 'monthly_card' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CreditCard className="w-4 h-4" />
                          )}
                          <span>
                            {user ? 'Assinar no Cartão' : 'Entrar e Assinar no Cartão'}
                          </span>
                        </button>
                      )}
                      {pricing.monthly_pix_enabled && (
                        <button
                          type="button"
                          disabled={loadingKind !== null}
                          onClick={() => void startCheckout('monthly_pix')}
                          className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-sax-500/40 text-sax-300 text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50"
                        >
                          {loadingKind === 'monthly_pix' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <QrCode className="w-4 h-4" />
                          )}
                          <span>
                            {user ? 'Pagar 30 dias via Pix' : 'Entrar e Pagar 30 dias via Pix'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Bloco Explicativo do Modo Gratuito */}
              {effectiveFreePass.enabled && (
                <div className="p-4 rounded-2xl bg-emerald-950/25 border border-emerald-500/35 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                      <h4 className="font-extrabold text-emerald-200">
                        Modo Gratuito (Passe por Conta — 1 música a cada{' '}
                        {effectiveFreePass.cooldown_days}{' '}
                        {effectiveFreePass.cooldown_days === 1 ? 'dia' : 'dias'})
                      </h4>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                      Grátis • Login + E-mail confirmado
                    </span>
                  </div>

                  <p className="text-zinc-300 leading-relaxed">
                    Permite liberar <strong>1 partitura por {effectiveFreePass.unlock_hours}h</strong>{' '}
                    para visualizar todas as páginas e baixar PDF apenas com{' '}
                    <strong>Transposição &amp; Oitava</strong>, quebra de compasso automática e rodapé
                    discreto no PDF (sem Tela Cheia nem edição de cifras/cabeçalho/pautas).
                  </p>

                  {freePassError && (
                    <p className="p-2.5 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 font-semibold">
                      {freePassError}
                    </p>
                  )}

                  {!user ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        (onRequireLoginForFreePass || onRequireLogin)();
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-studio-950 font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Entrar para usar meu Passe Gratuito</span>
                    </button>
                  ) : freePassStatus?.state === 'email_unconfirmed' ? (
                    <p className="text-amber-200 font-semibold">
                      Confirme seu e-mail para liberar o Passe Gratuito (contas Google já entram
                      confirmadas).
                    </p>
                  ) : freePassStatus?.state === 'active_for_file' &&
                    freePassStatus.activeUnlock?.expiresAt ? (
                    <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200">
                      <FreePassCountdown
                        targetIso={freePassStatus.activeUnlock.expiresAt}
                        mode="active"
                        onExpire={onFreePassExpired}
                      />
                    </div>
                  ) : freePassStatus?.state === 'cooldown' && freePassStatus.cooldownUntil ? (
                    <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-amber-500/35 text-amber-200 flex flex-wrap items-center justify-between gap-2">
                      <FreePassCountdown
                        targetIso={freePassStatus.cooldownUntil}
                        mode="cooldown"
                        onExpire={onFreePassExpired}
                      />
                      <span className="text-[11px] text-zinc-400">
                        Ou desbloqueie imediatamente acima nos planos PRO.
                      </span>
                    </div>
                  ) : fileHash && onClaimFreePass ? (
                    <button
                      type="button"
                      disabled={isClaimingFreePass}
                      onClick={onClaimFreePass}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-studio-950 font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-60"
                    >
                      {isClaimingFreePass ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isClaimingFreePass
                          ? 'Ativando...'
                          : 'Usar meu Passe Gratuito nesta música'}
                      </span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-emerald-300 font-bold">
                      <Check className="w-3.5 h-3.5" />
                      <span>Passe Gratuito disponível para sua próxima partitura!</span>
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
            Garantia de arrependimento em 7 dias (Art. 49 do CDC). Ao contratar, você concorda com
            os{' '}
            <Link href="/termos" className="text-sax-400 hover:underline">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" className="text-sax-400 hover:underline">
              Política de Privacidade
            </Link>
            . Suporte estritamente técnico.
          </p>
        </div>
      </div>
    </div>
  );
}
