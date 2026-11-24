import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveUserAccessSnapshot } from '@/lib/access';
import { checkFairUseLimit } from '@/lib/fair-use';
import {
  ScoreTransformOptions,
  analyzeScoreXml,
  buildModifiedMsczBuffer,
  transformScoreXml,
  unpackScoreBuffer,
  validateUploadFileName,
} from '@/lib/music/mscz-engine';
import { applyFreePassPdfWatermark } from '@/lib/pdf-watermark';
import { buildFreePassRestrictedMsczBuffer } from '@/lib/server/free-pass-transform';
import { runMuseScoreHeadlessPdf } from '@/lib/server/musescore-cli';
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
    let semitoneShift: number | undefined;
    let octaveShift: number | undefined;
    let lineBreakMeasures: number[] | undefined;
    let pageBreakMeasures: number[] | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      optionsJson = formData.get('options') as string | null;
      const modifiedMscxField = formData.get('modifiedMscx') as string | null;
      const semiField = formData.get('semitoneShift') as string | null;
      const octField = formData.get('octaveShift') as string | null;
      const lineBreakField = formData.get('lineBreakMeasures') as string | null;
      const pageBreakField = formData.get('pageBreakMeasures') as string | null;

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
      if (semiField !== null) semitoneShift = Number(semiField) || 0;
      if (octField !== null) octaveShift = Number(octField) || 0;
      if (lineBreakField) {
        try {
          lineBreakMeasures = JSON.parse(lineBreakField) as number[];
        } catch {
          // Ignore invalid JSON
        }
      }
      if (pageBreakField) {
        try {
          pageBreakMeasures = JSON.parse(pageBreakField) as number[];
        } catch {
          // Ignore invalid JSON
        }
      }
    } else {
      const body = await req.json();
      const parsed = body as {
        originalBase64: string;
        fileName?: string;
        modifiedMscx?: string;
        options?: ScoreTransformOptions;
        customPdfName?: string;
        semitoneShift?: number;
        octaveShift?: number;
        lineBreakMeasures?: number[];
        pageBreakMeasures?: number[];
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
      semitoneShift = parsed.semitoneShift;
      octaveShift = parsed.octaveShift;
      lineBreakMeasures = parsed.lineBreakMeasures;
      pageBreakMeasures = parsed.pageBreakMeasures;
    }

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

    if (access.level === 'free_pass') {
      // Enforcement estrito no servidor para Passe Gratuito: somente 1ª parte (ou pauta dupla) + Tom/Oitava + Quebras
      const built = await buildFreePassRestrictedMsczBuffer({
        rawBuffer,
        fileName: uploadFileName,
        fileHash: resolvedFileHash,
        semitoneShift: semitoneShift ?? optionsObj?.semitoneShift,
        octaveShift: octaveShift ?? optionsObj?.octaveShift,
        lineBreakMeasures: lineBreakMeasures ?? optionsObj?.lineBreakMeasures,
        pageBreakMeasures: pageBreakMeasures ?? optionsObj?.pageBreakMeasures,
        isDev: access.isDev,
      });
      msczBuffer = built.msczBuffer;
      const cleanTitle = (built.analysis.headers.title.text || 'Partitura')
        .replace(/[<>:"/\\|?*]+/g, '')
        .trim();
      exportFileName = `${cleanTitle} - ${built.transformed.activeStaff.displayName} (${built.transformed.writtenTonality.majorName}) - Rubsax.pdf`;
    } else if (modifiedMscxText) {
      msczBuffer = await buildModifiedMsczBuffer(rawBuffer, uploadFileName, modifiedMscxText);
      if (customPdfName) {
        exportFileName = customPdfName;
      }
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
      } else {
        exportFileName = customPdfName;
      }
    } else {
      msczBuffer = rawBuffer;
      if (customPdfName) {
        exportFileName = customPdfName;
      }
    }

    let pdfBuffer = await runMuseScoreHeadlessPdf(msczBuffer, {
      isDev: access.isDev,
    });

    // Rodapé sutil no PDF EXCLUSIVAMENTE para exportações em free_pass
    if (
      access.level === 'free_pass' &&
      settings.free_pass.pdf_watermark_enabled
    ) {
      pdfBuffer = await applyFreePassPdfWatermark(
        pdfBuffer,
        settings.free_pass.pdf_watermark_text
      );
    }

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
