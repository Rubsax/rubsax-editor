import { NextRequest, NextResponse } from 'next/server';
import { validateUploadFileName } from '@/lib/music/mscz-engine';
import { runMuseScoreConvertToMscx } from '@/lib/server/musescore-cli';
import { getAppSettings } from '@/lib/settings';
import { getServerSessionUser, isAdminEmail } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { originalBase64, fileName = 'score.xml' } = body as {
      originalBase64: string;
      fileName: string;
    };

    if (!originalBase64) {
      return NextResponse.json(
        { error: 'Conteúdo do arquivo ausente.' },
        { status: 400 }
      );
    }

    const validation = validateUploadFileName(fileName);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const [user, settings] = await Promise.all([
      getServerSessionUser(),
      getAppSettings(),
    ]);
    const isDev = user ? isAdminEmail(user.email) : false;

    if (settings.operations.maintenance_mode && !isDev) {
      return NextResponse.json(
        { error: settings.operations.maintenance_message, code: 'MAINTENANCE_MODE' },
        { status: 503 }
      );
    }

    const buffer = Buffer.from(originalBase64, 'base64');
    const mscxContent = await runMuseScoreConvertToMscx(buffer, validation.extension, {
      isDev,
    });

    return NextResponse.json({ mscxContent });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Falha ao converter MusicXML via MuseScore 3.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
