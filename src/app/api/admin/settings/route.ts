import { NextRequest, NextResponse } from 'next/server';
import { AppSettings, getAppSettings, saveAppSettings } from '@/lib/settings';
import { getServerSessionUser, isAdminEmail } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getServerSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  const settings = await getAppSettings();
  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const user = await getServerSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  try {
    const body = (await req.json()) as Partial<AppSettings>;
    const updated = await saveAppSettings(body, user.email);
    return NextResponse.json({ ok: true, settings: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Erro ao salvar configurações.',
      },
      { status: 500 }
    );
  }
}
