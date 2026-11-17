import { NextRequest, NextResponse } from 'next/server';
import {
  buildModifiedMsczBuffer,
  validateUploadFileName,
} from '@/lib/music/mscz-engine';
import { runMuseScoreHeadlessSvgPages } from '@/lib/server/musescore-cli';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      originalBase64,
      fileName = 'partitura.mscz',
      modifiedMscx,
    } = body as {
      originalBase64: string;
      fileName?: string;
      modifiedMscx: string;
    };

    if (!originalBase64 || !modifiedMscx) {
      return NextResponse.json(
        { error: 'Parâmetros insuficientes para renderização SVG.' },
        { status: 400 }
      );
    }

    const validation = validateUploadFileName(fileName);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const rawBuffer = Buffer.from(originalBase64, 'base64');
    const msczBuffer = await buildModifiedMsczBuffer(rawBuffer, fileName, modifiedMscx);
    const svgPages = await runMuseScoreHeadlessSvgPages(msczBuffer);

    return NextResponse.json({
      pages: svgPages,
      pageCount: svgPages.length,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Falha ao renderizar páginas SVG via MuseScore CLI.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
