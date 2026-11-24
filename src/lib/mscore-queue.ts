import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { getAppSettings } from './settings';

export const TEMP_DIR_PREFIXES = ['rubsax_pdf_', 'rubsax_svg_', 'rubsax_conv_'] as const;

const MAX_PENDING_JOBS = 18;

interface QueuedTask<T = unknown> {
  isDev: boolean;
  isDemo: boolean;
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

const devQueue: QueuedTask[] = [];
const normalQueue: QueuedTask[] = [];
const demoQueue: QueuedTask[] = [];
let activeRunners = 0;
let lastMaxConcurrency = 1;
let lastTmpCleanupMinutes = 15;
let lastCleanupAt: number | null = null;

export interface MuseScoreQueueStats {
  activeRunners: number;
  pendingDev: number;
  pendingNormal: number;
  maxConcurrency: number;
  tmpCleanupMinutes: number;
  tmpDirsCount: number;
  lastCleanupAt: string | null;
}

export async function cleanupMuseScoreTmpDirs(options?: {
  forceAll?: boolean;
  maxAgeMinutes?: number;
}): Promise<{ removedCount: number; remainingCount: number }> {
  let removedCount = 0;
  let remainingCount = 0;

  try {
    const tmpRoot = os.tmpdir();
    const entries = await fsp.readdir(tmpRoot, { withFileTypes: true });
    const now = Date.now();
    const ageLimitMs =
      Math.max(1, options?.maxAgeMinutes ?? lastTmpCleanupMinutes ?? 15) * 60 * 1000;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!TEMP_DIR_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) {
        continue;
      }
      const fullPath = path.join(tmpRoot, entry.name);
      try {
        const stat = await fsp.stat(fullPath);
        if (options?.forceAll || now - stat.mtimeMs > ageLimitMs) {
          await fsp.rm(fullPath, { recursive: true, force: true });
          removedCount += 1;
        } else {
          remainingCount += 1;
        }
      } catch {
        // Ignora caso já tenha sido removido por outra tarefa
      }
    }

    lastCleanupAt = Date.now();
  } catch {
    // Falha não crítica de leitura de /tmp
  }

  return { removedCount, remainingCount };
}

export async function getMuseScoreQueueStats(): Promise<MuseScoreQueueStats> {
  let tmpDirsCount = 0;
  try {
    const settings = await getAppSettings();
    lastMaxConcurrency = Math.max(1, settings.operations.max_mscore_concurrency || 1);
    lastTmpCleanupMinutes = Math.max(1, settings.operations.tmp_cleanup_minutes || 15);

    const entries = await fsp.readdir(os.tmpdir(), { withFileTypes: true });
    tmpDirsCount = entries.filter(
      (e) =>
        e.isDirectory() && TEMP_DIR_PREFIXES.some((prefix) => e.name.startsWith(prefix))
    ).length;
  } catch {
    // Fallback com contadores locais em memória
  }

  return {
    activeRunners,
    pendingDev: devQueue.length,
    pendingNormal: normalQueue.length,
    maxConcurrency: lastMaxConcurrency,
    tmpCleanupMinutes: lastTmpCleanupMinutes,
    tmpDirsCount,
    lastCleanupAt: lastCleanupAt ? new Date(lastCleanupAt).toISOString() : null,
  };
}

function drainQueue(maxConcurrency: number): void {
  while (activeRunners < maxConcurrency) {
    // Prioridade estrita: Modo Dev -> clientes reais -> pré-aquecimento/Demo inédito
    const nextTask = devQueue.shift() || normalQueue.shift() || demoQueue.shift();
    if (!nextTask) break;

    activeRunners += 1;
    Promise.resolve()
      .then(() => nextTask.fn())
      .then((res) => {
        nextTask.resolve(res);
      })
      .catch((err) => {
        nextTask.reject(err);
      })
      .finally(() => {
        activeRunners = Math.max(0, activeRunners - 1);
        drainQueue(lastMaxConcurrency);
      });
  }
}

export function isMuseScoreQueueIdle(): boolean {
  return (
    activeRunners === 0 &&
    devQueue.length === 0 &&
    normalQueue.length === 0 &&
    demoQueue.length === 0
  );
}

export async function enqueueMuseScoreTask<T>(
  fn: () => Promise<T>,
  options?: { isDev?: boolean; isDemo?: boolean }
): Promise<T> {
  const isDev = Boolean(options?.isDev);
  const isDemo = Boolean(options?.isDemo);

  try {
    const settings = await getAppSettings();
    lastMaxConcurrency = Math.max(1, Math.min(3, settings.operations.max_mscore_concurrency || 1));
    lastTmpCleanupMinutes = Math.max(1, settings.operations.tmp_cleanup_minutes || 15);
  } catch {
    lastMaxConcurrency = 1;
    lastTmpCleanupMinutes = 15;
  }

  if (!isDev && devQueue.length + normalQueue.length + demoQueue.length >= MAX_PENDING_JOBS) {
    throw new Error(
      'Servidor ocupado processando outras partituras no momento. Aguarde alguns segundos e tente novamente.'
    );
  }

  return new Promise<T>((resolve, reject) => {
    const task: QueuedTask<T> = {
      isDev,
      isDemo,
      fn,
      resolve,
      reject,
    };

    if (isDev) {
      devQueue.push(task as QueuedTask);
    } else if (isDemo) {
      demoQueue.push(task as QueuedTask);
    } else {
      normalQueue.push(task as QueuedTask);
    }

    drainQueue(lastMaxConcurrency);
  });
}

// Rotina periódica leve em background (sem acumular timers no hot reload)
const globalForQueue = globalThis as unknown as { __rubsaxTmpIntervalStarted?: boolean };
if (
  typeof setInterval === 'function' &&
  !globalForQueue.__rubsaxTmpIntervalStarted &&
  fs.existsSync(os.tmpdir())
) {
  globalForQueue.__rubsaxTmpIntervalStarted = true;
  const interval = setInterval(() => {
    void cleanupMuseScoreTmpDirs();
  }, 5 * 60 * 1000);
  if (typeof interval.unref === 'function') {
    interval.unref();
  }
}
