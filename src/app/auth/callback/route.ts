import { NextRequest, NextResponse } from 'next/server';
import {
  buildSupabaseHeaders,
  ensureUserProfile,
  getSupabaseAnonKey,
  getSupabaseUrl,
} from '@/lib/supabase/admin';
import {
  PKCE_VERIFIER_COOKIE,
  fetchSupabaseUserByAccessToken,
  setAuthCookiesOnResponse,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSafeBaseOrigin(req: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return req.nextUrl.origin;
}

function getSafeNextPath(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith('/') || rawNext.startsWith('//')) {
    return '/';
  }
  return rawNext;
}

export async function GET(req: NextRequest) {
  const baseOrigin = getSafeBaseOrigin(req);
  const code = req.nextUrl.searchParams.get('code');
  const errorDesc =
    req.nextUrl.searchParams.get('error_description') ||
    req.nextUrl.searchParams.get('error');
  const nextPath = getSafeNextPath(req.nextUrl.searchParams.get('next'));

  if (errorDesc) {
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(errorDesc)}`, baseOrigin)
    );
  }

  if (code) {
    const supabaseUrl = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();
    const verifier = req.cookies.get(PKCE_VERIFIER_COOKIE)?.value || '';

    if (!supabaseUrl || !anonKey) {
      return NextResponse.redirect(
        new URL('/?auth_error=configuracao_ausente', baseOrigin)
      );
    }

    try {
      const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
        method: 'POST',
        headers: buildSupabaseHeaders(anonKey),
        body: JSON.stringify({
          auth_code: code,
          code_verifier: verifier,
        }),
        cache: 'no-store',
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text().catch(() => '');
        console.error('Supabase PKCE exchange failed:', tokenRes.status, errBody);
        return NextResponse.redirect(
          new URL('/?auth_error=falha_login_google', baseOrigin)
        );
      }

      const sessionData = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      if (!sessionData.access_token) {
        return NextResponse.redirect(
          new URL('/?auth_error=token_invalido', baseOrigin)
        );
      }

      const user = await fetchSupabaseUserByAccessToken(sessionData.access_token);
      if (user) {
        await ensureUserProfile(user);
      }

      const res = NextResponse.redirect(new URL(nextPath, baseOrigin));
      setAuthCookiesOnResponse(res, {
        access_token: sessionData.access_token,
        refresh_token: sessionData.refresh_token,
        expires_in: sessionData.expires_in,
      });
      res.cookies.set(PKCE_VERIFIER_COOKIE, '', { path: '/', maxAge: 0 });
      return res;
    } catch {
      return NextResponse.redirect(
        new URL('/?auth_error=erro_conexao_google', baseOrigin)
      );
    }
  }

  // Fallback caso o provedor retorne tokens via #access_token=... no hash da URL
  const escapedNext = JSON.stringify(nextPath);
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><title>Autenticando...</title></head>
<body style="background:#09090b;color:#f4f4f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <p>Concluindo login seguro...</p>
  <script>
    (async function () {
      try {
        var hash = (window.location.hash || '').replace(/^#/, '');
        var params = new URLSearchParams(hash);
        var accessToken = params.get('access_token');
        var refreshToken = params.get('refresh_token');
        var expiresIn = parseInt(params.get('expires_in') || '3600', 10);
        if (accessToken) {
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_in: expiresIn
            })
          });
          window.location.replace(${escapedNext});
          return;
        }
      } catch (e) {}
      window.location.replace('/?auth_error=sessao_nao_encontrada');
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
