import { NextRequest, NextResponse } from 'next/server';
import {
  buildSupabaseHeaders,
  getSupabaseAnonKey,
  getSupabaseUrl,
} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Informe um e-mail válido.' },
        { status: 400 }
      );
    }

    const supabaseUrl = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { error: 'Serviço de recuperação não configurado no servidor.' },
        { status: 503 }
      );
    }

    const appUrl =
      (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '') ||
      req.nextUrl.origin;

    const res = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: buildSupabaseHeaders(anonKey),
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        redirect_to: `${appUrl}/auth/callback`,
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Não foi possível enviar o link de recuperação agora.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        'Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes.',
    });
  } catch {
    return NextResponse.json(
      { error: 'Erro ao solicitar recuperação de senha.' },
      { status: 500 }
    );
  }
}
