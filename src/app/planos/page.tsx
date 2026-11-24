import React from 'react';
import Link from 'next/link';
import { getAppSettings } from '@/lib/settings';
import SmartBackButton from '@/components/SmartBackButton';
import EcosystemFooter from '@/components/EcosystemFooter';
import PlansPageClient from '@/components/PlansPageClient';
import { CreditCard, HelpCircle, Music } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nossos Planos | Rubsax Transposer',
  description:
    'Compare os modos Visitante, Modo Gratuito, Passe Avulso (24h) e Assinatura Mensal PRO do Rubsax Transposer.',
};

export default async function PlanosPage() {
  const settings = await getAppSettings();

  return (
    <div className="min-h-screen flex flex-col bg-studio-950 text-zinc-100">
      {/* Cabeçalho */}
      <header className="border-b border-zinc-800 bg-studio-900/95 backdrop-blur-md px-4 sm:px-6 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SmartBackButton
              currentPath="/planos"
              label="Voltar"
              fallbackHref="/?view=editor"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700 active:scale-[0.97] active:brightness-90 transition-all duration-75"
            />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sax-400 to-sax-600 flex items-center justify-center shadow">
                <Music className="w-4 h-4 text-studio-950 stroke-[2.5]" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-extrabold text-white">
                  Nossos Planos &amp; Comparativo
                </h1>
                <p className="text-[11px] text-zinc-400">
                  Rubsax Transposer v1.4 — Transparência total para músicos e igrejas
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/ajuda"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700"
            >
              <HelpCircle className="w-3.5 h-3.5 text-sax-400" />
              <span>Guia de Uso &amp; FAQ</span>
            </Link>
            <Link
              href="/?view=editor"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs font-extrabold shadow-sm"
            >
              <span>Abrir Editor</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <section className="rounded-3xl bg-gradient-to-br from-studio-900 via-studio-900 to-sax-500/10 border border-zinc-800 p-6 sm:p-8 shadow-2xl space-y-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sax-500/15 border border-sax-500/35 text-sax-300 text-[10px] font-bold uppercase tracking-wider">
            <CreditCard className="w-3 h-3" />
            <span>Planos &amp; Benefícios</span>
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Escolha o modo ideal para a sua música ou ministério
          </h2>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-3xl">
            Comece gratuitamente no modo Visitante ou Modo Gratuito (com 1 música grátis a cada{' '}
            {settings.free_pass.cooldown_days || 7} dias e {settings.free_pass.unlock_hours || 24}h
            para editar e baixar), desbloqueie uma música específica pelo Passe Avulso via Pix ou
            tenha controle ilimitado de grades, cifras e pautas com o Mensal PRO.
          </p>
        </section>

        <PlansPageClient initialSettings={settings} />
      </main>

      <EcosystemFooter supportLinks={settings.support_links} />
    </div>
  );
}
