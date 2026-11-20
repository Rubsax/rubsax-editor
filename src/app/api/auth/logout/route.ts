import { NextResponse } from 'next/server';
import { clearAuthCookiesOnResponse } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAuthCookiesOnResponse(res);
  return res;
}
