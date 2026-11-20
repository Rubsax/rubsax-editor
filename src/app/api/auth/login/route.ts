import { NextRequest, NextResponse } from 'next/server';
import {
  buildSupabaseHeaders,
  ensureUserProfile,
  getSupabaseAnonKey,
  getSupabaseUrl,
} from '@/lib/supabase/admin';
import {
  fetchSupabaseUserByAccessToken,
  setAuthCookiesOnResponse,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Informe e-mail e senha para entrar.' },
        { status: 400 }
      );
    }

    const supabaseUrl = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { error: 'Autenticação ainda não configurada no servidor.' },
        { status: 503 }
      );
    }

    const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: buildSupabaseHeaders(anonKey),
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
      cache: 'no-store',
    });

    const data = (await authRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error_description?: string;
      msg?: string;
    };

    if (!authRes.ok || !data.access_token) {
      return NextResponse.json(
        {
          error:
            data.error_description ||
            data.msg ||
            'E-mail ou senha incorretos.',
        },
        { status: 401 }
      );
    }

    const user = await fetchSupabaseUserByAccessToken(data.access_token);
    if (user) {
      await ensureUserProfile(user);
    }

    const res = NextResponse.json({ user });
    setAuthCookiesOnResponse(res, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: 'Falha ao conectar com o serviço de autenticação.' },
      { status: 500 }
    );
  }
}
