'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AccountPanelContent } from '@/components/AccountModal';
import AuthModal from '@/components/AuthModal';
import type { SingleUnlockRow, SubscriptionRow } from '@/lib/supabase/admin';
import { ClientAuthUser, signOutUser } from '@/lib/supabase/client';
import { ArrowLeft, Loader2, LogIn, User } from 'lucide-react';

export default function ContaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [user, setUser] = useState<ClientAuthUser | null>(null);
  const [isDev, setIsDev] = useState<boolean>(false);
  const [activeSub, setActiveSub] = useState<SubscriptionRow | null>(null);
  const [activeUnlocks, setActiveUnlocks] = useState<SingleUnlockRow[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);

  const loadAccount = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
        setIsDev(Boolean(data.isDev));
        setActiveSub(data.activeSubscription || null);
        setActiveUnlocks(data.activeSingleUnlocks || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccount();
  }, []);

  return (
    <div className="min-h-screen bg-studio-950 text-zinc-100 flex flex-col">
      <header className="bg-studio-900 border-b border-zinc-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-sax-400 hover:text-sax-300 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Editor</span>
          </Link>
          <span className="text-xs font-extrabold text-white">Área do Cliente</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
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
              Visualize seu plano atual, músicas avulsas desbloqueadas e configurações de
              privacidade LGPD.
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
    </div>
  );
}
