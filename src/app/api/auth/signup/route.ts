import { NextRequest, NextResponse } from 'next/server';
import { isDisposableEmail } from '@/lib/anti-abuse';
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
    const { email, password, fullName } = (await req.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
    };

    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { error: 'Informe um e-mail válido e senha com no mínimo 6 caracteres.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    if (isDisposableEmail(cleanEmail)) {
      return NextResponse.json(
        {
          error:
            'E-mails temporários ou descartáveis não são permitidos. Utilize um e-mail pessoal válido (Gmail, Outlook, iCloud, etc.).',
        },
        { status: 400 }
      );
    }

    const supabaseUrl = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { error: 'Cadastro ainda não configurado no servidor.' },
        { status: 503 }
      );
    }

    const appUrl =
      (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '') ||
      req.nextUrl.origin;

    const signUpRes = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: buildSupabaseHeaders(anonKey),
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        data: {
          full_name: (fullName || '').trim() || undefined,
        },
        gotrue_meta_security: {},
        redirect_to: `${appUrl}/auth/callback`,
      }),
      cache: 'no-store',
    });

    const data = (await signUpRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      msg?: string;
      error_description?: string;
    };

    if (!signUpRes.ok) {
      return NextResponse.json(
        {
          error:
            data.error_description ||
            data.msg ||
            'Não foi possível criar a conta. Verifique se o e-mail já está cadastrado.',
        },
        { status: 400 }
      );
    }

    if (data.access_token) {
      const user = await fetchSupabaseUserByAccessToken(data.access_token);
      if (user) {
        await ensureUserProfile(user);
      }
      const res = NextResponse.json({
        user,
        requiresEmailConfirmation: false,
      });
      setAuthCookiesOnResponse(res, {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      });
      return res;
    }

    return NextResponse.json({
      user: null,
      requiresEmailConfirmation: true,
      message:
        'Conta criada! Verifique sua caixa de entrada para confirmar seu e-mail antes de entrar.',
    });
  } catch {
    return NextResponse.json(
      { error: 'Erro interno ao criar conta.' },
      { status: 500 }
    );
  }
}
