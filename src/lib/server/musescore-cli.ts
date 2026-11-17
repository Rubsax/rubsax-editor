import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

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

  const dirs = ['/tmp/runtime-rubsax', '/tmp/fontconfig-cache', '/tmp/musescore-home'];
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
      fs.chmodSync(dir, 0o777);
    } catch {
      // Ignore chmod errors if directory is already owned by another process with 777
    }
  }

  return {
    ...process.env,
    HOME: '/tmp/musescore-home',
    XDG_RUNTIME_DIR: '/tmp/runtime-rubsax',
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

  if (process.platform === 'win32') {
    await execFileAsync(binPath, ['-o', outputPath, inputPath], {
      timeout: 60000,
      windowsHide: true,
      env: childEnv,
    });
    return;
  }

  // No Linux/Docker, tenta primeiro com QT_QPA_PLATFORM=offscreen direto no mscore3
  try {
    await execFileAsync(binPath, ['-o', outputPath, inputPath], {
      timeout: 60000,
      env: childEnv,
    });
    return;
  } catch (firstErr: unknown) {
    // Fallback para xvfb-run caso o ambiente exija servidor X virtual
    try {
      await execFileAsync(
        'xvfb-run',
        ['-a', binPath, '-o', outputPath, inputPath],
        {
          timeout: 60000,
          env: {
            ...childEnv,
            QT_QPA_PLATFORM: 'xcb',
          },
        }
      );
      return;
    } catch {
      throw firstErr;
    }
  }
}

export async function runMuseScoreHeadlessPdf(msczBuffer: Buffer): Promise<Buffer> {
  ensureMuseScoreRuntimeDirs();
  const jobId = crypto.randomUUID();
  const tempDir = path.join(os.tmpdir(), `rubsax_pdf_${jobId}`);
  await fsp.mkdir(tempDir, { recursive: true });

  const inputMsczPath = path.join(tempDir, 'input.mscz');
  const outputPdfPath = path.join(tempDir, 'output.pdf');

  try {
    await fsp.writeFile(inputMsczPath, msczBuffer);
    await executeMuseScoreCommand(inputMsczPath, outputPdfPath);

    const pdfBuffer = await fsp.readFile(outputPdfPath);
    return pdfBuffer;
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runMuseScoreHeadlessSvgPages(msczBuffer: Buffer): Promise<string[]> {
  ensureMuseScoreRuntimeDirs();
  const jobId = crypto.randomUUID();
  const tempDir = path.join(os.tmpdir(), `rubsax_svg_${jobId}`);
  await fsp.mkdir(tempDir, { recursive: true });

  const inputMsczPath = path.join(tempDir, 'input.mscz');
  const outputSvgBase = path.join(tempDir, 'page.svg');

  try {
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
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Converte um arquivo .xml ou .mxl (MusicXML do Finale/Sibelius) diretamente em .mscx nativo usando o MuseScore 3
 */
export async function runMuseScoreConvertToMscx(
  inputBuffer: Buffer,
  originalExtension: string
): Promise<string> {
  ensureMuseScoreRuntimeDirs();
  const jobId = crypto.randomUUID();
  const tempDir = path.join(os.tmpdir(), `rubsax_conv_${jobId}`);
  await fsp.mkdir(tempDir, { recursive: true });

  const safeExt = originalExtension.startsWith('.')
    ? originalExtension.toLowerCase()
    : `.${originalExtension.toLowerCase()}`;
  const inputPath = path.join(tempDir, `input${safeExt}`);
  const outputMscxPath = path.join(tempDir, 'converted.mscx');

  try {
    await fsp.writeFile(inputPath, inputBuffer);
    await executeMuseScoreCommand(inputPath, outputMscxPath);
    const mscxContent = await fsp.readFile(outputMscxPath, 'utf-8');
    return mscxContent;
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
