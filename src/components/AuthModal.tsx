'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ClientAuthUser,
  recoverPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/lib/supabase/client';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogIn,
  Mail,
  UserPlus,
  X,
} from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'recover';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: ClientAuthUser) => void;
  subtitle?: string;
  googleNextPath?: string;
}

export default function AuthModal({
  open,
  onClose,
  onAuthenticated,
  subtitle,
  googleNextPath = '/',
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loadingGoogle, setLoadingGoogle] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setInfoMsg(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleGoogleClick = async () => {
    setErrorMsg(null);
    setLoadingGoogle(true);
    try {
      await signInWithGoogle(googleNextPath);
    } catch (err: unknown) {
      setLoadingGoogle(false);
      setErrorMsg(
        err instanceof Error ? err.message : 'Erro ao iniciar login com o Google.'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        const res = await signInWithEmail(email, password);
        if (res.error || !res.user) {
          setErrorMsg(res.error || 'E-mail ou senha inválidos.');
          return;
        }
        onAuthenticated(res.user);
        onClose();
      } else if (mode === 'signup') {
        const res = await signUpWithEmail(email, password, fullName);
        if (res.error) {
          setErrorMsg(res.error);
          return;
        }
        if (res.user) {
          onAuthenticated(res.user);
          onClose();
        } else {
          setInfoMsg(
            res.message ||
              'Conta criada! Verifique seu e-mail para confirmar o cadastro.'
          );
          setMode('login');
        }
      } else {
        const res = await recoverPassword(email);
        if (!res.ok) {
          setErrorMsg(res.error || 'Não foi possível enviar o link.');
          return;
        }
        setInfoMsg(
          res.message ||
            'Enviamos instruções de redefinição para o seu e-mail.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-studio-900 border-2 border-sax-500/50 shadow-2xl overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-sax-600/20 via-sax-500/10 to-transparent border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sax-500/20 border border-sax-500/40 text-sax-400">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Entrar no Rubsax Transposer
              </h3>
              <p className="text-[11px] text-zinc-400">
                {subtitle || 'Acesse sua conta, músicas avulsas e assinatura.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* BOTÃO PRINCIPAL: CONTINUAR COM O GOOGLE (1 CLIQUE) */}
          <button
            type="button"
            disabled={loadingGoogle}
            onClick={() => void handleGoogleClick()}
            className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-slate-900 font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-60"
          >
            {loadingGoogle ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-800" />
            ) : (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
            )}
            <span>Continuar com o Google</span>
          </button>

          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="h-px flex-1 bg-zinc-800" />
            <span>ou entre com e-mail e senha</span>
            <span className="h-px flex-1 bg-zinc-800" />
          </div>

          {/* Abas Login / Criar Conta / Recuperar */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-studio-950 border border-zinc-800 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`py-1.5 rounded-lg active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                mode === 'login'
                  ? 'bg-sax-500 text-studio-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
              }}
              className={`py-1.5 rounded-lg active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                mode === 'signup'
                  ? 'bg-sax-500 text-studio-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Criar Conta
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('recover');
                setErrorMsg(null);
              }}
              className={`py-1.5 rounded-lg active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                mode === 'recover'
                  ? 'bg-sax-500 text-studio-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Esqueci Senha
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            {mode === 'signup' && (
              <label className="block space-y-1">
                <span className="font-semibold text-zinc-300">Nome Completo</span>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-3 py-2.5 rounded-xl bg-studio-950 border border-zinc-700 text-white focus:outline-none focus:border-sax-500"
                />
              </label>
            )}

            <label className="block space-y-1">
              <span className="font-semibold text-zinc-300">E-mail</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="w-full px-3 py-2.5 rounded-xl bg-studio-950 border border-zinc-700 text-white focus:outline-none focus:border-sax-500"
              />
            </label>

            {mode !== 'recover' && (
              <label className="block space-y-1">
                <span className="font-semibold text-zinc-300">Senha</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3 py-2.5 rounded-xl bg-studio-950 border border-zinc-700 text-white focus:outline-none focus:border-sax-500"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === 'login' ? (
                <Mail className="w-4 h-4" />
              ) : mode === 'signup' ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              <span>
                {mode === 'login'
                  ? 'Entrar com E-mail'
                  : mode === 'signup'
                  ? 'Criar Conta Gratuita'
                  : 'Enviar Link de Recuperação'}
              </span>
            </button>
          </form>

          <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
            Ao entrar, você concorda com nossos{' '}
            <Link href="/termos" className="text-sax-400 hover:underline">
              Termos de Uso
            </Link>{' '}
            e{' '}
            <Link href="/privacidade" className="text-sax-400 hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
