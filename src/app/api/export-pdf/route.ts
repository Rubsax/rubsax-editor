import { NextRequest, NextResponse } from 'next/server';
import {
  ScoreTransformOptions,
  analyzeScoreXml,
  buildModifiedMsczBuffer,
  transformScoreXml,
  unpackScoreBuffer,
  validateUploadFileName,
} from '@/lib/music/mscz-engine';
import { runMuseScoreHeadlessPdf } from '@/lib/server/musescore-cli';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let msczBuffer: Buffer;
    let exportFileName = 'Partitura-Rubsax.pdf';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const optionsJson = formData.get('options') as string | null;
      const modifiedMscxField = formData.get('modifiedMscx') as string | null;

      if (!file) {
        return NextResponse.json(
          { error: 'Nenhum arquivo enviado para exportação.' },
          { status: 400 }
        );
      }

      const validation = validateUploadFileName(file.name);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const arrayBuf = await file.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuf);

      if (modifiedMscxField) {
        msczBuffer = await buildModifiedMsczBuffer(rawBuffer, file.name, modifiedMscxField);
      } else if (optionsJson) {
        const options = JSON.parse(optionsJson) as ScoreTransformOptions;
        const unpacked = await unpackScoreBuffer(rawBuffer, file.name);
        const analysis = analyzeScoreXml(
          unpacked.mscxContent,
          file.name,
          unpacked.fileFormat
        );
        const transformed = transformScoreXml(unpacked.mscxContent, analysis, options);
        msczBuffer = await buildModifiedMsczBuffer(
          rawBuffer,
          file.name,
          transformed.modifiedMscx
        );
        const cleanTitle = (options.headers.title.text || analysis.headers.title.text || 'Partitura')
          .replace(/[<>:"/\\|?*]+/g, '')
          .trim();
        exportFileName = `${cleanTitle} - ${transformed.targetInstrument.name} (${transformed.writtenTonality.majorName}) - Rubsax.pdf`;
      } else {
        msczBuffer = rawBuffer;
      }
    } else {
      const body = await req.json();
      const {
        originalBase64,
        fileName = 'partitura.mscz',
        modifiedMscx,
        options,
        customPdfName,
      } = body as {
        originalBase64: string;
        fileName?: string;
        modifiedMscx?: string;
        options?: ScoreTransformOptions;
        customPdfName?: string;
      };

      if (!originalBase64) {
        return NextResponse.json(
          { error: 'Dados do arquivo original ausentes na requisição.' },
          { status: 400 }
        );
      }

      const validation = validateUploadFileName(fileName);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const rawBuffer = Buffer.from(originalBase64, 'base64');

      if (modifiedMscx) {
        msczBuffer = await buildModifiedMsczBuffer(rawBuffer, fileName, modifiedMscx);
      } else if (options) {
        const unpacked = await unpackScoreBuffer(rawBuffer, fileName);
        const analysis = analyzeScoreXml(
          unpacked.mscxContent,
          fileName,
          unpacked.fileFormat
        );
        const transformed = transformScoreXml(unpacked.mscxContent, analysis, options);
        msczBuffer = await buildModifiedMsczBuffer(
          rawBuffer,
          fileName,
          transformed.modifiedMscx
        );
      } else {
        msczBuffer = rawBuffer;
      }

      if (customPdfName) {
        exportFileName = customPdfName;
      }
    }

    const pdfBuffer = await runMuseScoreHeadlessPdf(msczBuffer);

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
