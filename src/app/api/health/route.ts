import { NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  supabaseAdminFetch,
} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, db: 'unconfigured', timestamp },
      { status: 503 }
    );
  }

  try {
    const res = await supabaseAdminFetch('/rest/v1/app_settings?select=key&limit=1', {
      method: 'GET',
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, db: 'error', status: res.status, timestamp },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      db: 'ok',
      timestamp,
    });
  } catch {
    return NextResponse.json(
      { ok: false, db: 'error', timestamp },
      { status: 503 }
    );
  }
}
