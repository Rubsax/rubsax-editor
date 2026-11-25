import crypto from 'crypto';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import { buildModifiedMsczBuffer } from '@/lib/music/mscz-engine';
import { runMuseScoreHeadlessSvgPages } from '@/lib/server/musescore-cli';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

// Pasta isolada em /tmp que NÃO começa com TEMP_DIR_PREFIXES para não ser apagada pelo cleaner de 15 min
const DEMO_CACHE_DIR = path.join(os.tmpdir(), 'rubsax_demo_cache_v1');
const MAX_DEMO_CACHE_FILES = 300;

const inflightDemoRenders = new Map<string, Promise<string[]>>();

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

/**
 * Cache em disco sob demanda (lazy cache) para a partitura oficial de demonstração:
 * salva de forma comprimida (.json.gz) apenas as combinações realmente testadas pelos visitantes,
 * evitando rajadas no MuseScore após deploys e mantendo custo mínimo de CPU/RAM.
 */
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
