'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import AuthModal from './AuthModal';
import PlansModal, { type PlanCheckoutKind } from './PlansModal';
import { useAuth } from './AuthProvider';
import { type AppSettings } from '@/lib/settings';

function formatBrl(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
import {
  Check,
  Crown,
  ExternalLink,
  HelpCircle,
  Lock,
  LogIn,
  Sliders,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';

interface PlansPageClientProps {
  initialSettings: AppSettings;
}

export default function PlansPageClient({ initialSettings }: PlansPageClientProps) {
  const {
    user,
    isDev,
    activeSubscription,
    freePassStatus,
    settings: authSettings,
    refreshAuth,
    setAuthUserImmediate,
  } = useAuth();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [pendingPlanIntent, setPendingPlanIntent] = useState<PlanCheckoutKind | null>(null);

  const settings = initialSettings || authSettings;
  const pricing = settings.pricing;
  const freePass = settings.free_pass;
  const paywall = settings.paywall;
  const isMonthlyPro = Boolean(isDev || activeSubscription);

  const handleOpenMonthlyCheckout = () => {
    setPendingPlanIntent(pricing.monthly_pix_enabled ? 'monthly_pix' : 'monthly_card');
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    setPlansModalOpen(true);
  };

  const singlePriceStr = formatBrl(pricing.single_price_brl);
  const monthlyPriceStr = formatBrl(pricing.monthly_price_brl);
  const singleHours = pricing.single_duration_hours || 24;
  const cooldownDays = freePass.cooldown_days || 7;
  const freeHours = freePass.unlock_hours || 24;
  const previewCrop = paywall.preview_crop_percent || 50;

  return (
    <div className="space-y-8">
      {/* Faixa de status atual da conta */}
      <div className="rounded-2xl bg-studio-900/90 border border-zinc-800 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sax-500/15 border border-sax-500/35 flex items-center justify-center shrink-0">
            {isMonthlyPro ? (
              <Crown className="w-5 h-5 text-sax-400" />
            ) : (
              <UserCheck className="w-5 h-5 text-sky-400" />
            )}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Seu Status Atual
            </p>
            <p className="text-sm font-extrabold text-white">
              {!user
                ? 'Visitante (sem login)'
                : isDev
                ? `Modo Dev ativo (${user.email})`
                : activeSubscription
                ? `Assinatura Mensal PRO ativa (${user.email})`
                : `Conta gratuita conectada (${user.email})`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!user ? (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-100 text-slate-900 text-xs font-extrabold shadow-sm active:scale-[0.97] active:brightness-90 transition-all duration-75"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar / Criar Conta Grátis</span>
            </button>
          ) : !isMonthlyPro ? (
            <button
              type="button"
              onClick={handleOpenMonthlyCheckout}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-sax-500 to-sax-600 hover:from-sax-400 hover:to-sax-500 text-studio-950 text-xs font-extrabold shadow-lg shadow-sax-500/20 active:scale-[0.97] active:brightness-90 transition-all duration-75"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Assinar Mensal PRO ({monthlyPriceStr})</span>
            </button>
          ) : (
            <Link
              href="/conta"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700"
            >
              <span>Gerenciar Assinatura</span>
            </Link>
          )}
          <Link
            href="/?view=editor"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700"
          >
            <Sliders className="w-3.5 h-3.5 text-sax-400" />
            <span>Ir ao Editor</span>
          </Link>
        </div>
      </div>

      {/* Cards dos 4 Planos */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Visitante */}
        <article className="rounded-3xl bg-studio-900/90 border border-zinc-800 p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
              Sem Login
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-white">Visitante</h2>
              <p className="text-2xl font-black text-zinc-200 mt-1">Grátis</p>
              <p className="text-[11px] text-zinc-400 mt-1">
                Teste o estúdio direto no navegador antes de criar sua conta.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-zinc-300 pt-2 border-t border-zinc-800">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Transposição de Tom &amp; Oitava na 1ª parte (ou Piano Pauta Dupla)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Quebra de Compasso e Quebra de Página (inicia automático)</span>
              </li>
              <li className="flex items-start gap-2 text-zinc-400">
                <Lock className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                <span>Visualiza {previewCrop}% da Pág. 1 • Sem exportação de PDF</span>
              </li>
            </ul>
          </div>
          <Link
            href="/?view=editor"
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-extrabold border border-zinc-700 text-center"
          >
            Testar no Editor
          </Link>
        </article>

        {/* 2. Modo Gratuito */}
        <article className="rounded-3xl bg-studio-900/90 border border-sky-500/40 p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-300 border border-sky-500/35">
              Conta Gratuita
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-white">Modo Gratuito</h2>
              <p className="text-base font-black text-sky-300 mt-1">
                1 música grátis a cada {cooldownDays} {cooldownDays === 1 ? 'dia' : 'dias'}
              </p>
              <p className="text-[11px] text-sky-200/80 font-semibold mt-0.5">
                {freeHours}h para editar e baixar
              </p>
            </div>
            <ul className="space-y-2 text-xs text-zinc-300 pt-2 border-t border-zinc-800">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                <span>Páginas completas da 1ª parte (ou Piano Pauta Dupla)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                <span>Transposição de Tom &amp; Oitava + Quebra de Compasso e Página</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                <span>Exportação em PDF fiel (com rodapé discreto do modo gratuito)</span>
              </li>
            </ul>
          </div>
          {!user ? (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-studio-950 text-xs font-extrabold shadow-sm active:scale-[0.97] active:brightness-90 transition-all duration-75"
            >
              Criar Conta Grátis
            </button>
          ) : (
            <Link
              href="/?view=editor"
              className="w-full py-2.5 px-4 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-xs font-extrabold border border-sky-500/40 text-center"
            >
              Usar no Editor
            </Link>
          )}
        </article>

        {/* 3. Passe Avulso */}
        <article className="rounded-3xl bg-studio-900/90 border border-zinc-700 p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-amber-300 border border-amber-500/35">
              Pagamento Único via Pix
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-white">Passe Avulso ({singleHours}h)</h2>
              <p className="text-2xl font-black text-white mt-1">{singlePriceStr}</p>
              <p className="text-[11px] text-zinc-400 mt-1">
                Por partitura específica durante {singleHours} horas sem mensalidade.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-zinc-300 pt-2 border-t border-zinc-800">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Todos os recursos PRO liberados nesta música ({singleHours}h)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Cifras (Sib/Mib/Fá/Lá/etc.), Cabeçalho, Escala &amp; Todas as Pautas</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Modo Tela Cheia + PDF 100% limpo sem rodapé gratuito</span>
              </li>
            </ul>
          </div>
          <Link
            href="/?view=editor"
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-extrabold border border-amber-500/40 text-center"
          >
            Enviar Música para Desbloquear
          </Link>
        </article>

        {/* 4. Mensal PRO */}
        <article className="rounded-3xl bg-gradient-to-b from-sax-500/15 to-studio-900 border-2 border-sax-500/70 p-5 flex flex-col justify-between space-y-5 shadow-xl shadow-sax-500/10">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sax-500 text-studio-950">
              <Sparkles className="w-3 h-3" />
              <span>Recomendado</span>
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-white">Mensal PRO</h2>
              <p className="text-2xl font-black text-sax-400 mt-1">
                {monthlyPriceStr}
                <span className="text-xs font-semibold text-zinc-400"> / mês</span>
              </p>
              <p className="text-[11px] text-zinc-300 mt-1">
                Pix (30 dias) ou Cartão recorrente via Mercado Pago.
              </p>
            </div>
            <ul className="space-y-2 text-xs text-zinc-200 pt-2 border-t border-sax-500/30">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-sax-400 shrink-0 mt-0.5" />
                <span>Partituras ilimitadas (até {settings.operations.monthly_pdf_fair_use_limit || 200} PDFs/mês de uso justo)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-sax-400 shrink-0 mt-0.5" />
                <span>Extrator completo de pautas orquestrais, Grade Completa e Pauta Dupla</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-sax-400 shrink-0 mt-0.5" />
                <span>Cifras transpostas, edição dupla, cabeçalho manual, escala e Tela Cheia</span>
              </li>
            </ul>
          </div>
          {isMonthlyPro ? (
            <Link
              href="/?view=editor"
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold text-center"
            >
              Plano PRO Ativo • Ir ao Editor
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleOpenMonthlyCheckout}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sax-500 to-sax-600 hover:from-sax-400 hover:to-sax-500 text-studio-950 text-xs font-extrabold shadow-lg shadow-sax-500/25 active:scale-[0.97] active:brightness-90 transition-all duration-75"
            >
              Assinar Mensal PRO agora
            </button>
          )}
        </article>
      </div>

      {/* Tabela Comparativa Completa v1.4 */}
      <section className="rounded-3xl bg-studio-900/90 border border-zinc-800 p-5 sm:p-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white">
              Comparativo Completo de Recursos
            </h2>
            <p className="text-xs text-zinc-400">
              Confira em detalhes o que cada modo oferece na versão v1.4 do Rubsax Transposer.
            </p>
          </div>
          <Link
            href="/ajuda"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-sax-400 hover:text-sax-300"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Ver Guia de Uso &amp; FAQ</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                <th className="py-3 px-3">Recurso / Acesso</th>
                <th className="py-3 px-3 text-center">Visitante</th>
                <th className="py-3 px-3 text-center text-sky-300">
                  <div>Modo Gratuito</div>
                  <div className="text-[10px] font-normal normal-case text-sky-200/80">
                    1 música grátis a cada {cooldownDays} dias • {freeHours}h para editar e baixar
                  </div>
                </th>
                <th className="py-3 px-3 text-center">
                  <div>Avulso ({singleHours}h)</div>
                  <div className="text-[10px] font-normal normal-case text-zinc-400">
                    {singlePriceStr}
                  </div>
                </th>
                <th className="py-3 px-3 text-center text-sax-400">
                  <div>Mensal PRO</div>
                  <div className="text-[10px] font-normal normal-case text-sax-300">
                    {monthlyPriceStr} / mês
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200 text-xs">
              <tr>
                <td className="py-3 px-3 font-semibold">Transposição de Tom &amp; Oitava</td>
                <td className="py-3 px-3 text-center">
                  <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                </td>
                <td className="py-3 px-3 text-center">
                  <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                </td>
                <td className="py-3 px-3 text-center">
                  <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                </td>
                <td className="py-3 px-3 text-center">
                  <Check className="w-4 h-4 text-sax-400 mx-auto" />
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-semibold">
                  Quebra de Compasso e Quebra de Página
                </td>
                <td className="py-3 px-3 text-center">
                  <div className="inline-flex flex-col items-center gap-0.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] text-zinc-400">Inicia automático</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-center">
                  <div className="inline-flex flex-col items-center gap-0.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] text-zinc-400">Inicia automático</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-center">
                  <div className="inline-flex flex-col items-center gap-0.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] text-zinc-400">Original / livre</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-center">
                  <div className="inline-flex flex-col items-center gap-0.5">
                    <Check className="w-4 h-4 text-sax-400" />
                    <span className="text-[10px] text-zinc-400">Original / livre</span>
                  </div>
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-semibold">
                  Cifras (Transpositores), Cabeçalho, Escala &amp; Todas as Pautas
                </td>
                <td className="py-3 px-3 text-center text-zinc-500">
                  <X className="w-4 h-4 mx-auto" />
                </td>
                <td className="py-3 px-3 text-center text-zinc-500">
                  <X className="w-4 h-4 mx-auto" />
                </td>
                <td className="py-3 px-3 text-center">
                  <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                </td>
                <td className="py-3 px-3 text-center">
                  <Check className="w-4 h-4 text-sax-400 mx-auto" />
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-semibold">Pautas Exibidas &amp; Grade Completa</td>
                <td className="py-3 px-3 text-center text-zinc-300">
                  Apenas 1ª parte (ou Piano Pauta Dupla)
                </td>
                <td className="py-3 px-3 text-center text-zinc-300">
                  Apenas 1ª parte (ou Piano Pauta Dupla)
                </td>
                <td className="py-3 px-3 text-center text-emerald-300 font-semibold">
                  Todas as partes + Grade Completa
                </td>
                <td className="py-3 px-3 text-center text-sax-300 font-semibold">
                  Todas as partes + Grade Completa
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-semibold">Modo Tela Cheia</td>
                <td className="py-3 px-3 text-center text-zinc-500">
                  <X className="w-4 h-4 mx-auto" />
                </td>
                <td className="py-3 px-3 text-center text-zinc-500">
                  <X className="w-4 h-4 mx-auto" />
                </td>
                <td className="py-3 px-3 text-center">
                  <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                </td>
                <td className="py-3 px-3 text-center">
                  <Check className="w-4 h-4 text-sax-400 mx-auto" />
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-semibold">Visualização &amp; Exportação PDF</td>
                <td className="py-3 px-3 text-center text-amber-300">
                  {previewCrop}% Pág. 1 • Sem PDF
                </td>
                <td className="py-3 px-3 text-center text-sky-300">
                  Completa + PDF (rodapé discreto)
                </td>
                <td className="py-3 px-3 text-center text-emerald-300 font-semibold">
                  PDF 100% limpo ({singleHours}h nesta música)
                </td>
                <td className="py-3 px-3 text-center text-sax-300 font-semibold">
                  PDF 100% limpo e ilimitado
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <AuthModal
        open={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setPendingPlanIntent(null);
        }}
        googleNextPath="/planos"
        onAuthenticated={(u) => {
          setAuthUserImmediate(u);
          void refreshAuth();
          if (pendingPlanIntent) {
            setPlansModalOpen(true);
          }
        }}
      />

      <PlansModal
        open={plansModalOpen}
        onClose={() => {
          setPlansModalOpen(false);
          setPendingPlanIntent(null);
        }}
        user={user}
        pricing={pricing}
        paywall={paywall}
        initialPlanToStart={pendingPlanIntent}
        freePassSettings={freePass}
        freePassStatus={freePassStatus}
        isClaimingFreePass={false}
        modalContextReason="pro"
        onClaimFreePass={() => {}}
        onRequireLoginForFreePass={() => {
          setPlansModalOpen(false);
          setAuthModalOpen(true);
        }}
        onFreePassExpired={() => void refreshAuth()}
        onRequireLogin={(planKind) => {
          setPendingPlanIntent(planKind || null);
          setPlansModalOpen(false);
          setAuthModalOpen(true);
        }}
        onPaymentApproved={() => {
          setPendingPlanIntent(null);
          void refreshAuth();
        }}
      />
    </div>
  );
}
