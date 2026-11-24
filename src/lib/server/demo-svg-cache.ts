import crypto from 'crypto';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import {
  DEMO_SCORE_FILE_NAME,
  DEMO_SCORE_SHA256,
} from '@/lib/demo-score';
import { isMuseScoreQueueIdle } from '@/lib/mscore-queue';
import {
  type ScoreAnalysis,
  type ScoreTransformOptions,
  analyzeScoreXml,
  buildModifiedMsczBuffer,
  transformScoreXml,
  unpackScoreBuffer,
} from '@/lib/music/mscz-engine';
import { runMuseScoreHeadlessSvgPages } from '@/lib/server/musescore-cli';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

// Pasta isolada em /tmp que NÃO começa com TEMP_DIR_PREFIXES para não ser apagada pelo cleaner de 15 min
const DEMO_CACHE_DIR = path.join(os.tmpdir(), 'rubsax_demo_cache_v1');
const MAX_DEMO_CACHE_FILES = 300;
const DEMO_PUBLIC_DISK_PATH = path.join(
  process.cwd(),
  'public',
  'demo',
  'parabens-teste-universal.mscz'
);

const inflightDemoRenders = new Map<string, Promise<string[]>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDemoCacheKey(modifiedMscx: string): string {
  return crypto.createHash('sha256').update(modifiedMscx, 'utf8').digest('hex');
}

function getCacheFilePath(cacheKey: string): string {
  return path.join(DEMO_CACHE_DIR, `${cacheKey}.json.gz`);
}

async function readCachedDemoPages(cacheKey: string): Promise<string[] | null> {
  const filePath = getCacheFilePath(cacheKey);
  try {
    const compressed = await fsp.readFile(filePath);
    const jsonBuf = await gunzipAsync(compressed);
    const parsed = JSON.parse(jsonBuf.toString('utf8')) as { pages?: unknown };
    if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
      return parsed.pages.filter((p): p is string => typeof p === 'string');
    }
  } catch {
    // Miss de cache ou arquivo inválido
  }
  return null;
}

async function pruneOldDemoCacheEntries(): Promise<void> {
  try {
    const entries = await fsp.readdir(DEMO_CACHE_DIR, { withFileTypes: true });
    const gzFiles = entries.filter(
      (e) => e.isFile() && e.name.endsWith('.json.gz')
    );
    if (gzFiles.length <= MAX_DEMO_CACHE_FILES) return;

    const withStats = await Promise.all(
      gzFiles.map(async (e) => {
        const fullPath = path.join(DEMO_CACHE_DIR, e.name);
        try {
          const stat = await fsp.stat(fullPath);
          return { fullPath, mtimeMs: stat.mtimeMs };
        } catch {
          return { fullPath, mtimeMs: 0 };
        }
      })
    );

    withStats.sort((a, b) => a.mtimeMs - b.mtimeMs);
    const toRemoveCount = withStats.length - MAX_DEMO_CACHE_FILES;
    for (let i = 0; i < toRemoveCount; i++) {
      await fsp.rm(withStats[i].fullPath, { force: true }).catch(() => {});
    }
  } catch {
    // Limpeza não crítica
  }
}

async function writeCachedDemoPages(cacheKey: string, pages: string[]): Promise<void> {
  if (!pages.length) return;
  try {
    await fsp.mkdir(DEMO_CACHE_DIR, { recursive: true });
    const compressed = await gzipAsync(JSON.stringify({ pages }));
    const finalPath = getCacheFilePath(cacheKey);
    const tmpPath = `${finalPath}.${crypto.randomUUID()}.tmp`;
    await fsp.writeFile(tmpPath, compressed);
    await fsp.rename(tmpPath, finalPath);
    void pruneOldDemoCacheEntries();
  } catch {
    // Falha de gravação em disco não impede resposta ao usuário
  }
}

export async function getOrRenderDemoSvgPages(
  rawBuffer: Buffer,
  fileName: string,
  modifiedMscx: string
): Promise<{ pages: string[]; fromCache: boolean }> {
  const cacheKey = getDemoCacheKey(modifiedMscx);
  const cached = await readCachedDemoPages(cacheKey);
  if (cached) {
    return { pages: cached, fromCache: true };
  }

  const existingPromise = inflightDemoRenders.get(cacheKey);
  if (existingPromise) {
    const pages = await existingPromise;
    return { pages, fromCache: true };
  }

  const renderPromise = (async () => {
    const msczBuffer = await buildModifiedMsczBuffer(rawBuffer, fileName, modifiedMscx);
    const pages = await runMuseScoreHeadlessSvgPages(msczBuffer, { isDemo: true });
    await writeCachedDemoPages(cacheKey, pages);
    return pages;
  })();

  inflightDemoRenders.set(cacheKey, renderPromise);
  try {
    const pages = await renderPromise;
    return { pages, fromCache: false };
  } finally {
    inflightDemoRenders.delete(cacheKey);
  }
}

function buildProbableDemoStates(analysis: ScoreAnalysis): ScoreTransformOptions[] {
  const firstStaffId = analysis.staves[0]?.staffId || '1';
  const baseOptions: ScoreTransformOptions = {
    semitoneShift: 0,
    octaveShift: 0,
    octaveShiftsByPart: {},
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
    lineBreakMeasures: analysis.initialLineBreakMeasures,
    pageBreakMeasures: analysis.initialPageBreakMeasures,
    staffScalePercent: 100,
  };

  const variants: ScoreTransformOptions[] = [
    // 1. Abertura inicial padrão (1ª parte)
    baseOptions,
  ];

  // 2. Todas as outras 11 tonalidades na 1ª parte
  for (let shift = -6; shift <= 5; shift++) {
    if (shift === 0) continue;
    variants.push({
      ...baseOptions,
      semitoneShift: shift,
    });
  }

  // 3. Deslocamento de oitava (-1 e +1) na 1ª parte
  variants.push(
    {
      ...baseOptions,
      octaveShift: -1,
      octaveShiftsByPart: { [firstStaffId]: -1 },
    },
    {
      ...baseOptions,
      octaveShift: 1,
      octaveShiftsByPart: { [firstStaffId]: 1 },
    }
  );

  // 4. Conversão de cifras para Tom Escrito na 1ª parte (se aplicável)
  if (analysis.staves[0]?.isTransposing && analysis.hasChords) {
    variants.push({
      ...baseOptions,
      convertBbEbChordsToWritten: true,
    });
  }

  // 5. Demais partes isoladas na tonalidade original
  for (const st of analysis.staves.slice(1)) {
    variants.push({
      ...baseOptions,
      targetInstrumentId: st.instrumentId,
      selectedStaffId: st.staffId,
      selectedStaffIds: [st.staffId],
    });
  }

  // 6. Grade Completa na tonalidade original
  if (analysis.staves.length > 1) {
    variants.push({
      ...baseOptions,
      viewMode: 'full-score',
    });
  }

  // 7. Variações mais comuns de escala na 1ª parte
  variants.push(
    { ...baseOptions, staffScalePercent: 90 },
    { ...baseOptions, staffScalePercent: 110 }
  );

  return variants;
}

async function runDemoCachePrewarm(): Promise<void> {
  try {
    const rawBuffer = await fsp.readFile(DEMO_PUBLIC_DISK_PATH);
    const sha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');
    if (sha256 !== DEMO_SCORE_SHA256) {
      return;
    }

    const unpacked = await unpackScoreBuffer(rawBuffer, DEMO_SCORE_FILE_NAME);
    const analysis = analyzeScoreXml(
      unpacked.mscxContent,
      DEMO_SCORE_FILE_NAME,
      unpacked.fileFormat
    );

    const probableStates = buildProbableDemoStates(analysis);
    const seenMscxHashes = new Set<string>();

    // Aguarda brevemente o boot HTTP estabilizar antes de iniciar renderizações em segundo plano
    await sleep(3000);

    for (const opts of probableStates) {
      const transformed = transformScoreXml(unpacked.mscxContent, analysis, opts);
      const cacheKey = getDemoCacheKey(transformed.modifiedMscx);
      if (seenMscxHashes.has(cacheKey)) continue;
      seenMscxHashes.add(cacheKey);

      const alreadyCached = await readCachedDemoPages(cacheKey);
      if (alreadyCached) continue;

      // Só pré-aquece quando a fila do MuseScore está ociosa (zero impacto em usuários reais)
      let waitLoops = 0;
      while (!isMuseScoreQueueIdle() && waitLoops < 20) {
        waitLoops += 1;
        await sleep(1500);
      }

      try {
        await getOrRenderDemoSvgPages(
          rawBuffer,
          DEMO_SCORE_FILE_NAME,
          transformed.modifiedMscx
        );
      } catch {
        // Falha pontual no pré-aquecimento não interrompe os próximos estados
      }

      await sleep(250);
    }
  } catch {
    // Falha não crítica caso o ambiente ainda não tenha o binário MuseScore disponível (ex: CI)
  }
}

export function ensureDemoCachePrewarmStarted(): void {
  const g = globalThis as unknown as { __rubsaxDemoPrewarmStarted?: boolean };
  if (g.__rubsaxDemoPrewarmStarted) return;
  g.__rubsaxDemoPrewarmStarted = true;

  void runDemoCachePrewarm();
}
