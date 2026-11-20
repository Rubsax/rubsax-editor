import { NextRequest, NextResponse } from 'next/server';
import { ensureUserProfile } from '@/lib/supabase/admin';
import {
  fetchSupabaseUserByAccessToken,
  setAuthCookiesOnResponse,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!body.access_token) {
      return NextResponse.json({ error: 'Token ausente.' }, { status: 400 });
    }

    const user = await fetchSupabaseUserByAccessToken(body.access_token);
    if (!user) {
      return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
    }

    await ensureUserProfile(user);

    const res = NextResponse.json({ user });
    setAuthCookiesOnResponse(res, {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_in: body.expires_in,
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Erro ao registrar sessão.' }, { status: 500 });
  }
}
