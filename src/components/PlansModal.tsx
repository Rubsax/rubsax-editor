'use client';

import React, { useEffect, useState } from 'react';
import type { PaywallSettings, PricingSettings } from '@/lib/settings';
import type { ClientAuthUser } from '@/lib/supabase/client';
import {
  Check,
  Clock,
  CreditCard,
  Crown,
  Lock,
  QrCode,
  Sparkles,
  X,
  LogIn,
} from 'lucide-react';

interface PlansModalProps {
  open: boolean;
  onClose: () => void;
  user: ClientAuthUser | null;
  pricing: PricingSettings;
  paywall: PaywallSettings;
  fileName?: string;
  onRequireLogin: () => void;
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
  fileName,
  onRequireLogin,
}: PlansModalProps) {
  const [selectedNotice, setSelectedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedNotice(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleCheckoutAttempt = (planLabel: string) => {
    if (!user) {
      onClose();
      onRequireLogin();
      return;
    }
    setSelectedNotice(
      `Pagamentos em ativação — em breve você poderá finalizar o plano "${planLabel}" via Pix ou Cartão com liberação automática.`
    );
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
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sax-300">
                Desbloqueio Imediato • Sem Fidelidade
              </span>
              <h3 className="text-base sm:text-xl font-extrabold text-white">
                {paywall.modal_headline || 'Desbloqueie sua partitura completa'}
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
          {!user && (
            <div className="p-3.5 rounded-2xl bg-sky-950/40 border border-sky-500/40 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <p className="font-bold text-sky-200">
                  Entre com sua conta antes de desbloquear
                </p>
                <p className="text-sky-300/80">
                  Assim seu acesso de 24h ou assinatura mensal fica salvo mesmo se você trocar de
                  dispositivo ou atualizar a página.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequireLogin();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-slate-900 font-extrabold text-xs shadow hover:bg-zinc-100 transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Entrar com Google / E-mail</span>
              </button>
            </div>
          )}

          {selectedNotice && (
            <div className="p-3.5 rounded-2xl bg-sax-500/15 border border-sax-500/50 text-sax-200 text-xs sm:text-sm font-semibold flex items-center gap-2.5 animate-fadeIn">
              <Sparkles className="w-4 h-4 text-sax-400 shrink-0" />
              <span>{selectedNotice}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Plano Avulso 24h */}
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
                        Re-edite o tom, oitavas e pautas quantas vezes quiser durante o prazo sem
                        pagar de novo.
                      </span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => handleCheckoutAttempt('Avulso (1 Música)')}
                  className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition"
                >
                  <QrCode className="w-4 h-4 text-sax-400" />
                  <span>
                    {user
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
                        Desbloqueio completo de <strong>qualquer partitura</strong> que você enviar.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-sax-400 shrink-0 mt-0.5" />
                      <span>Modo Tela Cheia e Exportação PDF em alta definição liberados.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-sax-400 shrink-0 mt-0.5" />
                      <span>Garantia de 7 dias (Art. 49 do CDC).</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-2">
                  {pricing.monthly_card_enabled && (
                    <button
                      type="button"
                      onClick={() => handleCheckoutAttempt('Mensal Cartão')}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>
                        {user ? 'Assinar no Cartão' : 'Entrar e Assinar no Cartão'}
                      </span>
                    </button>
                  )}
                  {pricing.monthly_pix_enabled && (
                    <button
                      type="button"
                      onClick={() => handleCheckoutAttempt('Mensal Pix (30 dias)')}
                      className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-sax-500/40 text-sax-300 text-xs font-bold flex items-center justify-center gap-2 transition"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Pagar 30 dias via Pix</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-zinc-500 text-center">
            Suporte estritamente técnico (login, pagamentos e operação da ferramenta). Pagamentos em
            ativação — em breve com Mercado Pago.
          </p>
        </div>
      </div>
    </div>
  );
}
