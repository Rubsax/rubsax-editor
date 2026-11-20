import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkUserAccess } from '@/lib/access';
import { checkFairUseLimit } from '@/lib/fair-use';
import {
  ScoreTransformOptions,
  analyzeScoreXml,
  buildModifiedMsczBuffer,
  transformScoreXml,
  unpackScoreBuffer,
  validateUploadFileName,
} from '@/lib/music/mscz-engine';
import { runMuseScoreHeadlessPdf } from '@/lib/server/musescore-cli';
import { getAppSettings } from '@/lib/settings';
import { logUsage } from '@/lib/supabase/admin';
import { getServerSessionUser } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let rawBuffer: Buffer;
    let msczBuffer: Buffer;
    let exportFileName = 'Partitura-Rubsax.pdf';
    let uploadFileName = 'partitura.mscz';
    let optionsJson: string | null = null;
    let optionsObj: ScoreTransformOptions | undefined;
    let modifiedMscxText: string | undefined;
    let customPdfName: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      optionsJson = formData.get('options') as string | null;
      const modifiedMscxField = formData.get('modifiedMscx') as string | null;

      if (!file) {
        return NextResponse.json(
          { error: 'Nenhum arquivo enviado para exportação.' },
          { status: 400 }
        );
      }

      uploadFileName = file.name;
      const validation = validateUploadFileName(uploadFileName);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const arrayBuf = await file.arrayBuffer();
      rawBuffer = Buffer.from(arrayBuf);
      modifiedMscxText = modifiedMscxField || undefined;
    } else {
      const body = await req.json();
      const parsed = body as {
        originalBase64: string;
        fileName?: string;
        modifiedMscx?: string;
        options?: ScoreTransformOptions;
        customPdfName?: string;
      };

      if (!parsed.originalBase64) {
        return NextResponse.json(
          { error: 'Dados do arquivo original ausentes na requisição.' },
          { status: 400 }
        );
      }

      uploadFileName = parsed.fileName || 'partitura.mscz';
      const validation = validateUploadFileName(uploadFileName);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      rawBuffer = Buffer.from(parsed.originalBase64, 'base64');
      modifiedMscxText = parsed.modifiedMscx;
      optionsObj = parsed.options;
      customPdfName = parsed.customPdfName;
    }

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

    // Censura blindada no servidor: bloqueia exportação em PDF para Modo Prévia
    if (access.level === 'preview') {
      return NextResponse.json(
        { error: 'PAYWALL_REQUIRED' },
        { status: 403 }
      );
    }

    // Trava invisível de uso justo (anti-abuso para contas individuais)
    const fairUse = await checkFairUseLimit(user, access.isDev);
    if (!fairUse.allowed) {
      return NextResponse.json(
        {
          error: fairUse.message,
          code: 'FAIR_USE_LIMIT',
          supportUrl: fairUse.supportUrl,
        },
        { status: 429 }
      );
    }

    if (modifiedMscxText) {
      msczBuffer = await buildModifiedMsczBuffer(rawBuffer, uploadFileName, modifiedMscxText);
    } else if (optionsJson || optionsObj) {
      const opts = optionsObj || (JSON.parse(optionsJson!) as ScoreTransformOptions);
      const unpacked = await unpackScoreBuffer(rawBuffer, uploadFileName);
      const analysis = analyzeScoreXml(
        unpacked.mscxContent,
        uploadFileName,
        unpacked.fileFormat
      );
      const transformed = transformScoreXml(unpacked.mscxContent, analysis, opts);
      msczBuffer = await buildModifiedMsczBuffer(
        rawBuffer,
        uploadFileName,
        transformed.modifiedMscx
      );
      if (!customPdfName) {
        const cleanTitle = (
          opts.headers.title.text ||
          analysis.headers.title.text ||
          'Partitura'
        )
          .replace(/[<>:"/\\|?*]+/g, '')
          .trim();
        exportFileName = `${cleanTitle} - ${transformed.targetInstrument.name} (${transformed.writtenTonality.majorName}) - Rubsax.pdf`;
      }
    } else {
      msczBuffer = rawBuffer;
    }

    if (customPdfName) {
      exportFileName = customPdfName;
    }

    const pdfBuffer = await runMuseScoreHeadlessPdf(msczBuffer, {
      isDev: access.isDev,
    });

    void logUsage({
      userId: user?.id || null,
      action: 'export_pdf',
      fileHash: resolvedFileHash,
      isDevMode: access.isDev,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(exportFileName)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Erro interno ao exportar PDF pelo MuseScore 3.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
