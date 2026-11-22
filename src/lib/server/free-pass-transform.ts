import {
  ScoreAnalysis,
  TransformResult,
  analyzeScoreXml,
  buildModifiedMsczBuffer,
  transformScoreXml,
  unpackScoreBuffer,
  validateUploadFileName,
} from '@/lib/music/mscz-engine';
import { runMuseScoreConvertToMscx } from '@/lib/server/musescore-cli';

interface ConvertedMscxCacheEntry {
  mscx: string;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 4;
const CACHE_TTL_MS = 5 * 60 * 1000;
const convertedXmlCache = new Map<string, ConvertedMscxCacheEntry>();

function getCachedConvertedMscx(fileHash: string): string | null {
  const entry = convertedXmlCache.get(fileHash);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    convertedXmlCache.delete(fileHash);
    return null;
  }
  return entry.mscx;
}

function setCachedConvertedMscx(fileHash: string, mscx: string): void {
  if (convertedXmlCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = convertedXmlCache.keys().next().value;
    if (oldestKey) convertedXmlCache.delete(oldestKey);
  }
  convertedXmlCache.set(fileHash, {
    mscx,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Constrói o pacote .mscz estritamente restringido no servidor para usuários em `free_pass`:
 * ignora `modifiedMscx` enviado pelo cliente, permite exclusivamente transposição (-12..+12)
 * e oitava (-2..+2) e força quebra de compasso automática (sem `<LayoutBreak>` manuais).
 */
export async function buildFreePassRestrictedMsczBuffer(params: {
  rawBuffer: Buffer;
  fileName: string;
  fileHash: string;
  semitoneShift?: number;
  octaveShift?: number;
  isDev?: boolean;
}): Promise<{
  msczBuffer: Buffer;
  transformed: TransformResult;
  analysis: ScoreAnalysis;
}> {
  const { rawBuffer, fileName, fileHash, semitoneShift, octaveShift, isDev } = params;
  const validation = validateUploadFileName(fileName);
  const ext = validation.extension;

  let serverConvertedMscx: string | undefined;
  if (ext === '.xml' || ext === '.musicxml' || ext === '.mxl') {
    serverConvertedMscx = getCachedConvertedMscx(fileHash) || undefined;
    if (!serverConvertedMscx) {
      try {
        serverConvertedMscx = await runMuseScoreConvertToMscx(rawBuffer, ext, {
          isDev: Boolean(isDev),
        });
        setCachedConvertedMscx(fileHash, serverConvertedMscx);
      } catch {
        // Fallback automático ao conversor interno em unpackScoreBuffer
      }
    }
  }

  const unpacked = await unpackScoreBuffer(rawBuffer, fileName, serverConvertedMscx);
  const analysis = analyzeScoreXml(unpacked.mscxContent, fileName, unpacked.fileFormat);

  const safeSemitoneShift = Math.max(-12, Math.min(12, Math.round(semitoneShift ?? 0)));
  const safeOctaveShift = Math.max(-2, Math.min(2, Math.round(octaveShift ?? 0)));
  const firstStaffId = analysis.staves[0]?.staffId || '1';

  const transformed = transformScoreXml(unpacked.mscxContent, analysis, {
    semitoneShift: safeSemitoneShift,
    octaveShift: safeOctaveShift,
    targetInstrumentId: analysis.detectedInstrumentId,
    selectedStaffId: firstStaffId,
    selectedStaffIds: [firstStaffId],
    viewMode: 'portrait',
    convertBbEbChordsToWritten: false,
    showChords: true,
    showLyrics: true,
    headers: analysis.headers,
    chordOverrides: {},
    floatingTexts: [],
    lineBreakMeasures: [],
    staffScalePercent: 100,
  });

  const msczBuffer = await buildModifiedMsczBuffer(
    rawBuffer,
    fileName,
    transformed.modifiedMscx
  );

  return { msczBuffer, transformed, analysis };
}
