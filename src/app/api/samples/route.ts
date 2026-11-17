import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAMPLE_FILES: Record<string, { fileName: string; title: string; description: string }> = {
  aleluia: {
    fileName: 'Aleluia-Hallelujah-Mib.mscz',
    title: 'Aleluia (Hallelujah)',
    description: 'Partitura com Cifras, Letra, Sax Alto (Mib) + Piano Oculto (Tom Base: Fá Maior)',
  },
  sorriso: {
    fileName: 'Sorriso-Resplandecente-Mib.mscz',
    title: 'Sorriso Resplandecente (Dragon Ball GT)',
    description: 'Partitura com Cifras, Letra, Acidentes Ocorrentes e Rodapé Rubsax (Tom Base: Dó Maior)',
  },
  marcha: {
    fileName: 'Marcha-Nupcial-Mib.mscz',
    title: 'Marcha Nupcial (F. Mendelssohn)',
    description: 'Partitura Clássica com Quiálteras, Sax Alto/Barítono + Piano Oculto (Tom Base: Dó Maior)',
  },
};

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({
      samples: Object.entries(SAMPLE_FILES).map(([key, val]) => ({
        id: key,
        ...val,
      })),
    });
  }

  const sample = SAMPLE_FILES[id];
  if (!sample) {
    return NextResponse.json({ error: 'Partitura de exemplo não encontrada.' }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'public', 'samples', sample.fileName);
  try {
    const buf = await fs.readFile(filePath);
    return NextResponse.json({
      fileName: sample.fileName,
      base64: buf.toString('base64'),
    });
  } catch {
    return NextResponse.json(
      { error: 'Arquivo de exemplo não encontrado em public/samples.' },
      { status: 404 }
    );
  }
}
