import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import {
  AuthUser,
  buildSupabaseHeaders,
  getSupabaseAnonKey,
  getSupabaseUrl,
} from './admin';

export const ACCESS_TOKEN_COOKIE = 'rubsax_access_token';
export const REFRESH_TOKEN_COOKIE = 'rubsax_refresh_token';
export const PKCE_VERIFIER_COOKIE = 'rubsax_pkce_verifier';

export function isAdminEmail(email?: string | null): boolean {
  const configuredAdmin = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!configuredAdmin || !email) return false;
  return email.trim().toLowerCase() === configuredAdmin;
}

function mapSupabaseRawUser(raw: Record<string, unknown>): AuthUser | null {
  const id = typeof raw.id === 'string' ? raw.id : '';
  const email = typeof raw.email === 'string' ? raw.email : '';
  if (!id || !email) return null;

  const meta =
    raw.user_metadata && typeof raw.user_metadata === 'object'
      ? (raw.user_metadata as Record<string, unknown>)
      : {};

  const fullName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    null;

  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null;

  return {
    id,
    email,
    full_name: fullName,
    avatar_url: avatarUrl,
  };
}

export async function fetchSupabaseUserByAccessToken(
  accessToken: string
): Promise<AuthUser | null> {
  const baseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!baseUrl || !anonKey || !accessToken) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`${baseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: buildSupabaseHeaders(anonKey, accessToken),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    return mapSupabaseRawUser(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshSupabaseSession(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser | null;
} | null> {
  const baseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!baseUrl || !anonKey || !refreshToken) return null;

  try {
    const res = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: buildSupabaseHeaders(anonKey),
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user?: Record<string, unknown>;
    };
    if (!data.access_token) return null;
    const user = data.user
      ? mapSupabaseRawUser(data.user)
      : await fetchSupabaseUserByAccessToken(data.access_token);

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_in: data.expires_in || 3600,
      user,
    };
  } catch {
    return null;
  }
}

export async function getServerSessionUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value || '';
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value || '';

    if (accessToken) {
      const user = await fetchSupabaseUserByAccessToken(accessToken);
      if (user) return user;
    }

    if (refreshToken) {
      const refreshed = await refreshSupabaseSession(refreshToken);
      if (refreshed?.user) return refreshed.user;
    }

    return null;
  } catch {
    return null;
  }
}

export function setAuthCookiesOnResponse(
  res: NextResponse,
  session: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }
): void {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = Math.max(3600, session.expires_in || 3600);

  res.cookies.set(ACCESS_TOKEN_COOKIE, session.access_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  if (session.refresh_token) {
    res.cookies.set(REFRESH_TOKEN_COOKIE, session.refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
}

export function clearAuthCookiesOnResponse(res: NextResponse): void {
  res.cookies.set(ACCESS_TOKEN_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  res.cookies.set(REFRESH_TOKEN_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  res.cookies.set(PKCE_VERIFIER_COOKIE, '', {
    httpOnly: false,
    path: '/',
    maxAge: 0,
  });
}
