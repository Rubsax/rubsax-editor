import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
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

async function executeMuseScoreCommand(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const binPath = getMuseScoreBinPath();

  if (process.platform === 'win32') {
    await execFileAsync(binPath, [inputPath, '-o', outputPath], {
      timeout: 45000,
      windowsHide: true,
    });
    return;
  }

  // No Linux (Hetzner / Coolify), executa via xvfb-run por padrão para garantir renderização gráfica fiel do Qt/MuseScore
  const useXvfb = process.env.MUSESCORE_USE_XVFB !== '0';
  if (useXvfb) {
    try {
      await execFileAsync('xvfb-run', ['-a', binPath, inputPath, '-o', outputPath], {
        timeout: 45000,
      });
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        throw err;
      }
    }
  }

  await execFileAsync(binPath, [inputPath, '-o', outputPath], {
    timeout: 45000,
    env: {
      ...process.env,
      QT_QPA_PLATFORM: process.env.QT_QPA_PLATFORM || 'offscreen',
    },
  });
}

export async function runMuseScoreHeadlessPdf(msczBuffer: Buffer): Promise<Buffer> {
  const jobId = crypto.randomUUID();
  const tempDir = path.join(os.tmpdir(), `rubsax_pdf_${jobId}`);
  await fs.mkdir(tempDir, { recursive: true });

  const inputMsczPath = path.join(tempDir, 'input.mscz');
  const outputPdfPath = path.join(tempDir, 'output.pdf');

  try {
    await fs.writeFile(inputMsczPath, msczBuffer);
    await executeMuseScoreCommand(inputMsczPath, outputPdfPath);

    const pdfBuffer = await fs.readFile(outputPdfPath);
    return pdfBuffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runMuseScoreHeadlessSvgPages(msczBuffer: Buffer): Promise<string[]> {
  const jobId = crypto.randomUUID();
  const tempDir = path.join(os.tmpdir(), `rubsax_svg_${jobId}`);
  await fs.mkdir(tempDir, { recursive: true });

  const inputMsczPath = path.join(tempDir, 'input.mscz');
  const outputSvgBase = path.join(tempDir, 'page.svg');

  try {
    await fs.writeFile(inputMsczPath, msczBuffer);
    await executeMuseScoreCommand(inputMsczPath, outputSvgBase);

    const files = await fs.readdir(tempDir);
    const svgFiles = files
      .filter((f) => f.toLowerCase().endsWith('.svg'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/(\d+)\.svg$/i)?.[1] || '1', 10);
        const numB = parseInt(b.match(/(\d+)\.svg$/i)?.[1] || '1', 10);
        return numA - numB;
      });

    const pages: string[] = [];
    for (const svgFile of svgFiles) {
      const content = await fs.readFile(path.join(tempDir, svgFile), 'utf-8');
      pages.push(content);
    }
    return pages;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
