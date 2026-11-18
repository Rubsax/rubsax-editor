import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

const TEMP_DIR_PREFIXES = ['rubsax_pdf_', 'rubsax_svg_', 'rubsax_conv_'] as const;
const STALE_TEMP_AGE_MS = 2 * 60 * 1000;

const MAX_PENDING_JOBS = 15;

/**
 * Fila sequencial em memória para limitar a 1 execução simultânea do MuseScore 3,
 * protegendo servidores de 1 vCPU / 2 GB RAM contra picos de concorrência.
 */
let museScoreQueueTail: Promise<void> = Promise.resolve();
let pendingJobsCount = 0;

function withMuseScoreLock<T>(task: () => Promise<T>): Promise<T> {
  if (pendingJobsCount >= MAX_PENDING_JOBS) {
    return Promise.reject(
      new Error(
        'Servidor ocupado processando outras partituras no momento. Aguarde alguns segundos e tente novamente.'
      )
    );
  }

  pendingJobsCount += 1;
  const run = museScoreQueueTail.then(task, task);
  museScoreQueueTail = run.then(
    () => undefined,
    () => undefined
  );

  return run.finally(() => {
    pendingJobsCount = Math.max(0, pendingJobsCount - 1);
  });
}

/**
 * Remove pastas temporárias órfãs em /tmp com mais de 2 minutos para manter o disco sempre limpo.
 */
async function cleanupStaleTempDirs(): Promise<void> {
  try {
    const tmpRoot = os.tmpdir();
    const entries = await fsp.readdir(tmpRoot, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!TEMP_DIR_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) {
        continue;
      }
      const fullPath = path.join(tmpRoot, entry.name);
      try {
        const stat = await fsp.stat(fullPath);
        if (now - stat.mtimeMs > STALE_TEMP_AGE_MS) {
          await fsp.rm(fullPath, { recursive: true, force: true });
        }
      } catch {
        // Ignora entrada já removida por outra requisição
      }
    }
  } catch {
    // Falha não crítica na varredura de limpeza
  }
}

export function getMuseScoreBinPath(): string {
  if (process.env.MUSESCORE_BIN_PATH && process.env.MUSESCORE_BIN_PATH.trim()) {
    return process.env.MUSESCORE_BIN_PATH.trim();
  }
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\MuseScore 3\\bin\\MuseScore3.exe';
  }
  return 'mscore3';
}

export function ensureMuseScoreRuntimeDirs(): NodeJS.ProcessEnv {
  if (process.platform === 'win32') {
    return { ...process.env };
  }

  // QStandardPaths exige exatamente 0700 no XDG_RUNTIME_DIR
  const runtimeDir = '/tmp/runtime-rubsax';
  try {
    fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(runtimeDir, 0o700);
  } catch {
    // Ignora erro caso já exista com permissão do usuário
  }

  for (const dir of ['/tmp/fontconfig-cache', '/tmp/musescore-home']) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
      fs.chmodSync(dir, 0o777);
    } catch {
      // Ignora erro caso o diretório já exista com 777
    }
  }

  return {
    ...process.env,
    HOME: '/tmp/musescore-home',
    XDG_RUNTIME_DIR: runtimeDir,
    XDG_CACHE_HOME: '/tmp/fontconfig-cache',
    QT_QPA_PLATFORM: 'offscreen',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
  };
}

async function executeMuseScoreCommand(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const binPath = getMuseScoreBinPath();
  const childEnv = ensureMuseScoreRuntimeDirs();
  // -f (--force) permite abrir partituras salvas no MuseScore 3.6.2 (3.02) no mscore3 3.2.3 (3.01)
  const args = ['-f', '-o', outputPath, inputPath];

  if (process.platform === 'win32') {
    await execFileAsync(binPath, args, {
      timeout: 60000,
      windowsHide: true,
      env: childEnv,
    });
    return;
  }

  // No Linux/Docker, tenta primeiro com QT_QPA_PLATFORM=offscreen direto no mscore3
  try {
    await execFileAsync(binPath, args, {
      timeout: 60000,
      env: childEnv,
    });
    return;
  } catch (firstErr: unknown) {
    // Fallback para xvfb-run caso o ambiente exija servidor X virtual
    try {
      await execFileAsync('xvfb-run', ['-a', binPath, ...args], {
        timeout: 60000,
        env: {
          ...childEnv,
          QT_QPA_PLATFORM: 'xcb',
        },
      });
      return;
    } catch {
      throw firstErr;
    }
  }
}

async function withTempMuseScoreDir<T>(
  prefix: (typeof TEMP_DIR_PREFIXES)[number],
  fn: (tempDir: string) => Promise<T>
): Promise<T> {
  return withMuseScoreLock(async () => {
    ensureMuseScoreRuntimeDirs();
    await cleanupStaleTempDirs();

    const tempDir = path.join(os.tmpdir(), `${prefix}${crypto.randomUUID()}`);
    await fsp.mkdir(tempDir, { recursive: true });

    try {
      return await fn(tempDir);
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
}

export async function runMuseScoreHeadlessPdf(msczBuffer: Buffer): Promise<Buffer> {
  return withTempMuseScoreDir('rubsax_pdf_', async (tempDir) => {
    const inputMsczPath = path.join(tempDir, 'input.mscz');
    const outputPdfPath = path.join(tempDir, 'output.pdf');

    await fsp.writeFile(inputMsczPath, msczBuffer);
    await executeMuseScoreCommand(inputMsczPath, outputPdfPath);

    return await fsp.readFile(outputPdfPath);
  });
}

export async function runMuseScoreHeadlessSvgPages(msczBuffer: Buffer): Promise<string[]> {
  return withTempMuseScoreDir('rubsax_svg_', async (tempDir) => {
    const inputMsczPath = path.join(tempDir, 'input.mscz');
    const outputSvgBase = path.join(tempDir, 'page.svg');

    await fsp.writeFile(inputMsczPath, msczBuffer);
    await executeMuseScoreCommand(inputMsczPath, outputSvgBase);

    const files = await fsp.readdir(tempDir);
    const svgFiles = files
      .filter((f) => f.toLowerCase().endsWith('.svg'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/(\d+)\.svg$/i)?.[1] || '1', 10);
        const numB = parseInt(b.match(/(\d+)\.svg$/i)?.[1] || '1', 10);
        return numA - numB;
      });

    const pages: string[] = [];
    for (const svgFile of svgFiles) {
      const content = await fsp.readFile(path.join(tempDir, svgFile), 'utf-8');
      pages.push(content);
    }
    return pages;
  });
}

/**
 * Converte um arquivo .xml ou .mxl (MusicXML do Finale/Sibelius) diretamente em .mscx nativo usando o MuseScore 3
 */
export async function runMuseScoreConvertToMscx(
  inputBuffer: Buffer,
  originalExtension: string
): Promise<string> {
  return withTempMuseScoreDir('rubsax_conv_', async (tempDir) => {
    const safeExt = originalExtension.startsWith('.')
      ? originalExtension.toLowerCase()
      : `.${originalExtension.toLowerCase()}`;
    const inputPath = path.join(tempDir, `input${safeExt}`);
    const outputMscxPath = path.join(tempDir, 'converted.mscx');

    await fsp.writeFile(inputPath, inputBuffer);
    await executeMuseScoreCommand(inputPath, outputMscxPath);
    return await fsp.readFile(outputMscxPath, 'utf-8');
  });
}
