'use client';

export interface ClientAuthUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  email_confirmed_at?: string | null;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const randomBytes = new Uint8Array(32);
  window.crypto.getRandomValues(randomBytes);
  const verifier = base64UrlEncode(randomBytes);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const challenge = base64UrlEncode(new Uint8Array(digest));
  return { verifier, challenge };
}

export async function signInWithGoogle(nextPath = '/'): Promise<void> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  if (!supabaseUrl) {
    throw new Error('Autenticação Google ainda não configurada no servidor.');
  }

  const origin = window.location.origin;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  try {
    const { verifier, challenge } = await generatePkcePair();
    document.cookie = `rubsax_pkce_verifier=${encodeURIComponent(
      verifier
    )}; Path=/; Max-Age=600; SameSite=Lax`;

    const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
      redirectTo
    )}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=s256`;

    window.location.href = authUrl;
  } catch {
    // Fallback para fluxo implicit caso crypto.subtle não esteja disponível (ex: contexto não seguro local)
    const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
      redirectTo
    )}`;
    window.location.href = authUrl;
  }
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: ClientAuthUser | null; error?: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { user: null, error: data.error || 'Falha ao entrar.' };
  }
  return { user: data.user || null };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string
): Promise<{
  user: ClientAuthUser | null;
  requiresEmailConfirmation?: boolean;
  message?: string;
  error?: string;
}> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { user: null, error: data.error || 'Falha ao criar conta.' };
  }
  return {
    user: data.user || null,
    requiresEmailConfirmation: Boolean(data.requiresEmailConfirmation),
    message: data.message,
  };
}

export async function recoverPassword(
  email: string
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch('/api/auth/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error || 'Não foi possível enviar o e-mail de recuperação.' };
  }
  return { ok: true, message: data.message };
}

export async function signOutUser(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function computeFileSha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    const bytes = Array.from(new Uint8Array(hashBuffer));
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return '';
}
