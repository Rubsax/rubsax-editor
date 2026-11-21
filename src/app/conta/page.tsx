'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccountPanelContent } from '@/components/AccountModal';
import AuthModal from '@/components/AuthModal';
import PlansModal, { PlanCheckoutKind } from '@/components/PlansModal';
import SmartBackButton from '@/components/SmartBackButton';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/lib/settings';
import type { SingleUnlockRow, SubscriptionRow } from '@/lib/supabase/admin';
import { ClientAuthUser, signOutUser } from '@/lib/supabase/client';
import { CheckCircle2, Loader2, LogIn, User } from 'lucide-react';

export default function ContaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [user, setUser] = useState<ClientAuthUser | null>(null);
  const [isDev, setIsDev] = useState<boolean>(false);
  const [activeSub, setActiveSub] = useState<SubscriptionRow | null>(null);
  const [activeUnlocks, setActiveUnlocks] = useState<SingleUnlockRow[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [plansModalOpen, setPlansModalOpen] = useState<boolean>(false);
  const [initialPlan, setInitialPlan] = useState<PlanCheckoutKind | null>(null);
  const [returnBanner, setReturnBanner] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
        setIsDev(Boolean(data.isDev));
        setActiveSub(data.activeSubscription || null);
        setActiveUnlocks(data.activeSingleUnlocks || []);
        if (data.settings) {
          setAppSettings((prev) => ({
            ...prev,
            pricing: data.settings.pricing || prev.pricing,
            paywall: data.settings.paywall || prev.paywall,
          }));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const syncReturnAndLoad = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('assinatura') === 'processando') {
          setReturnBanner('Verificando confirmação da sua assinatura junto ao Mercado Pago...');
          const syncRes = await fetch('/api/checkout/status?syncSubscription=1', {
            cache: 'no-store',
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            if (syncData.unlocked) {
              setReturnBanner('Assinatura confirmada e ativa na sua conta!');
            } else {
              setReturnBanner(
                'Recebemos sua assinatura! Assim que o Mercado Pago confirmar a operação, o acesso aparecerá ativo aqui.'
              );
            }
          }
        }
      } catch {
        // Ignora erro de sync inicial
      }
      await loadAccount();
    };
    void syncReturnAndLoad();
  }, [loadAccount]);

  return (
    <div className="min-h-screen bg-studio-950 text-zinc-100 flex flex-col">
      <header className="bg-studio-900 border-b border-zinc-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SmartBackButton
              currentPath="/conta"
              label="Voltar"
              fallbackHref="/?view=editor"
            />
            <span className="text-zinc-700">|</span>
            <a
              href="/?view=home"
              title="Ir para a Tela Inicial"
              className="inline-flex items-center gap-2 hover:opacity-90 transition"
            >
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-sax-400 to-sax-600 p-0.5 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icon.png"
                  alt="Rubsax Logo"
                  className="w-full h-full object-contain rounded"
                />
              </span>
              <span className="text-xs font-extrabold tracking-tight text-white hidden sm:inline">
                RUBSAX <span className="text-sax-400">TRANSPOSER</span>
              </span>
            </a>
          </div>
          <span className="text-xs font-extrabold text-white">Área do Cliente</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 space-y-4">
        {returnBanner && (
          <div className="p-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{returnBanner}</span>
          </div>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-zinc-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-sax-400" />
            <span>Carregando dados da conta...</span>
          </div>
        ) : !user ? (
          <div className="p-8 rounded-3xl bg-studio-900 border border-zinc-800 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-sax-500/15 border border-sax-500/40 flex items-center justify-center">
              <User className="w-7 h-7 text-sax-400" />
            </div>
            <h1 className="text-lg font-extrabold text-white">
              Entre para acessar Minha Conta
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              Visualize seu plano atual, cancele ou renove sua assinatura e gerencie seus dados LGPD.
            </p>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs sm:text-sm font-extrabold"
            >
              <LogIn className="w-4 h-4" />
              <span>Entrar com Google / E-mail</span>
            </button>
          </div>
        ) : (
          <div className="p-6 rounded-3xl bg-studio-900 border border-zinc-800 shadow-xl">
            <AccountPanelContent
              user={user}
              isDev={isDev}
              activeSubscription={activeSub}
              activeSingleUnlocks={activeUnlocks}
              onSignOut={async () => {
                await signOutUser();
                setUser(null);
                router.push('/');
              }}
              onAccountDeleted={() => {
                setUser(null);
                router.push('/');
              }}
              onSubscriptionUpdated={() => {
                void loadAccount();
              }}
              onRenewMonthlyPix={() => {
                setInitialPlan('monthly_pix');
                setPlansModalOpen(true);
              }}
            />
          </div>
        )}
      </main>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={() => {
          void loadAccount();
        }}
      />

      <PlansModal
        open={plansModalOpen}
        onClose={() => {
          setPlansModalOpen(false);
          setInitialPlan(null);
        }}
        user={user}
        pricing={appSettings.pricing}
        paywall={appSettings.paywall}
        initialPlanToStart={initialPlan}
        onRequireLogin={() => setAuthModalOpen(true)}
        onPaymentApproved={() => {
          void loadAccount();
        }}
      />
    </div>
  );
}
