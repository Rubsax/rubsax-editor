'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccountPanelContent } from '@/components/AccountModal';
import { useAuth } from '@/components/AuthProvider';
import AuthModal from '@/components/AuthModal';
import PlansModal, { PlanCheckoutKind } from '@/components/PlansModal';
import SmartBackButton from '@/components/SmartBackButton';
import { signOutUser } from '@/lib/supabase/client';
import { CheckCircle2, Loader2, LogIn, User } from 'lucide-react';

export default function ContaPage() {
  const router = useRouter();
  const {
    user,
    isDev,
    activeSubscription: activeSub,
    activeSingleUnlocks: activeUnlocks,
    freePassStatus,
    settings: appSettings,
    refreshAuth,
    clearAuthSession,
  } = useAuth();
  const [syncingReturn, setSyncingReturn] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [plansModalOpen, setPlansModalOpen] = useState<boolean>(false);
  const [initialPlan, setInitialPlan] = useState<PlanCheckoutKind | null>(null);
  const [initialAccountTab, setInitialAccountTab] = useState<'account' | 'projects'>('account');
  const [returnBanner, setReturnBanner] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    await refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    const syncReturnAndLoad = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('aba') === 'projetos') {
          setInitialAccountTab('projects');
        }
        if (params.get('assinatura') === 'processando') {
          setSyncingReturn(true);
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
      } finally {
        setSyncingReturn(false);
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

        {syncingReturn ? (
          <div className="py-16 flex items-center justify-center gap-2 text-zinc-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-sax-400" />
            <span>Confirmando assinatura junto ao Mercado Pago...</span>
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
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs sm:text-sm font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
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
              freePassSettings={appSettings.free_pass}
              freePassStatus={freePassStatus}
              initialTab={initialAccountTab}
              onOpenPlans={() => setPlansModalOpen(true)}
              onFreePassExpired={() => void loadAccount()}
              onSignOut={async () => {
                await signOutUser();
                clearAuthSession();
                router.push('/');
              }}
              onAccountDeleted={() => {
                clearAuthSession();
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
        freePassSettings={appSettings.free_pass}
        freePassStatus={freePassStatus}
        onFreePassExpired={() => void loadAccount()}
        initialPlanToStart={initialPlan}
        onRequireLogin={() => setAuthModalOpen(true)}
        onPaymentApproved={() => {
          void loadAccount();
        }}
      />
    </div>
  );
}
