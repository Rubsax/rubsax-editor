import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkUserAccess } from '@/lib/access';
import {
  buildModifiedMsczBuffer,
  validateUploadFileName,
} from '@/lib/music/mscz-engine';
import { runMuseScoreHeadlessSvgPages } from '@/lib/server/musescore-cli';
import { getAppSettings } from '@/lib/settings';
import { logUsage } from '@/lib/supabase/admin';
import { getServerSessionUser } from '@/lib/supabase/server';
import { cropSvgForPreview } from '@/lib/svg-crop';

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
    const resolvedFileHash = crypto
      .createHash('sha256')
      .update(rawBuffer)
      .digest('hex');

    const [user, settings] = await Promise.all([
      getServerSessionUser(),
      getAppSettings(),
    ]);

    const access = await checkUserAccess(user, resolvedFileHash);

    if (settings.operations.maintenance_mode && !access.isDev) {
      return NextResponse.json(
        {
          error: settings.operations.maintenance_message,
          code: 'MAINTENANCE_MODE',
        },
        { status: 503 }
      );
    }

    const msczBuffer = await buildModifiedMsczBuffer(rawBuffer, fileName, modifiedMscx);
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
      fileHash: resolvedFileHash,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Falha ao renderizar páginas SVG via MuseScore CLI.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
