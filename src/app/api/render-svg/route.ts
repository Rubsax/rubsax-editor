import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessSnapshot } from '@/lib/access';
import {
  buildModifiedMsczBuffer,
  validateUploadFileName,
} from '@/lib/music/mscz-engine';
import { buildFreePassRestrictedMsczBuffer } from '@/lib/server/free-pass-transform';
import { runMuseScoreHeadlessSvgPages } from '@/lib/server/musescore-cli';
import { logUsage } from '@/lib/supabase/admin';
import { getServerSessionUser } from '@/lib/supabase/server';
import { cropSvgForPreview } from '@/lib/svg-crop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let fileName = 'partitura.mscz';
  try {
    const body = await req.json();
    const {
      originalBase64,
      fileName: reqFileName = 'partitura.mscz',
      modifiedMscx,
      semitoneShift,
      octaveShift,
      lineBreakMeasures,
      pageBreakMeasures,
    } = body as {
      originalBase64: string;
      fileName?: string;
      modifiedMscx?: string;
      semitoneShift?: number;
      octaveShift?: number;
      lineBreakMeasures?: number[];
      pageBreakMeasures?: number[];
    };
    fileName = reqFileName;

    if (!originalBase64) {
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
    const resolvedFileHash = crypto
      .createHash('sha256')
      .update(rawBuffer)
      .digest('hex');

    const user = await getServerSessionUser();
    const { access, settings } = await resolveUserAccessSnapshot(
      user,
      resolvedFileHash
    );

    if (settings.operations.maintenance_mode && !access.isDev) {
      return NextResponse.json(
        {
          error: settings.operations.maintenance_message,
          code: 'MAINTENANCE_MODE',
        },
        { status: 503 }
      );
    }

    let msczBuffer: Buffer;
    if (access.level === 'free_pass' || access.level === 'preview') {
      // Enforcement estrito no servidor para preview e free_pass: apenas 1ª parte (ou pauta dupla), Tom/Oitava e Quebras
      const built = await buildFreePassRestrictedMsczBuffer({
        rawBuffer,
        fileName,
        fileHash: resolvedFileHash,
        semitoneShift,
        octaveShift,
        lineBreakMeasures,
        pageBreakMeasures,
        isDev: access.isDev,
      });
      msczBuffer = built.msczBuffer;
    } else {
      if (!modifiedMscx) {
        return NextResponse.json(
          { error: 'Parâmetros insuficientes para renderização SVG.' },
          { status: 400 }
        );
      }
      msczBuffer = await buildModifiedMsczBuffer(rawBuffer, fileName, modifiedMscx);
    }

    const svgPages = await runMuseScoreHeadlessSvgPages(msczBuffer, {
      isDev: access.isDev,
    });

    const totalPages = svgPages.length;

    if (access.level === 'preview') {
      const firstPageRaw = svgPages[0] || '';
      const croppedFirstPage = cropSvgForPreview(
        firstPageRaw,
        settings.paywall.preview_crop_percent
      );

      void logUsage({
        userId: user?.id || null,
        action: 'render_preview',
        fileHash: resolvedFileHash,
        isDevMode: false,
      });

      return NextResponse.json({
        pages: croppedFirstPage ? [croppedFirstPage] : [],
        pageCount: croppedFirstPage ? 1 : 0,
        totalPages,
        isPreview: true,
        accessLevel: 'preview',
        cropPercent: settings.paywall.preview_crop_percent,
        ctaText: settings.paywall.cta_button_text,
        fileHash: resolvedFileHash,
      });
    }

    void logUsage({
      userId: user?.id || null,
      action: 'render_full',
      fileHash: resolvedFileHash,
      isDevMode: access.isDev,
    });

    return NextResponse.json({
      pages: svgPages,
      pageCount: totalPages,
      totalPages,
      isPreview: false,
      accessLevel: access.level,
      isDev: access.isDev,
      freeUnlockExpiresAt: access.freeUnlockExpiresAt || null,
      fileHash: resolvedFileHash,
    });
  } catch (err: unknown) {
    console.error('[api/render-svg] Erro ao renderizar SVG:', {
      fileName,
      error: err,
    });
    const message =
      err instanceof Error ? err.message : 'Falha ao renderizar páginas SVG via MuseScore CLI.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
