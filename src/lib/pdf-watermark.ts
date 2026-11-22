import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const DEFAULT_FREE_WATERMARK = 'Transposto gratuitamente em app.rubsax.com.br';

/**
 * Converte texto para caracteres compatíveis com WinAnsi (StandardFonts.Helvetica)
 * preservando acentuação em português (ex.: ã, ç, é) e evitando falha de encoding.
 */
function sanitizeWinAnsiText(input: string): string {
  const cleaned = (input || DEFAULT_FREE_WATERMARK).trim() || DEFAULT_FREE_WATERMARK;
  let out = '';
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    // ASCII imprimível + bloco Latin-1 (U+00A0..U+00FF)
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      out += cleaned[i];
    }
  }
  return out.trim() || DEFAULT_FREE_WATERMARK;
}

/**
 * Pós-processa o PDF gerado pelo MuseScore 3 adicionando um rodapé discreto
 * na margem inferior de todas as páginas exclusivamente para exportações no Modo Gratuito.
 */
export async function applyFreePassPdfWatermark(
  pdfBuffer: Buffer,
  watermarkText: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const safeText = sanitizeWinAnsiText(watermarkText);
  const fontSize = 8.5;
  const textWidth = font.widthOfTextAtSize(safeText, fontSize);
  const textColor = rgb(0.45, 0.45, 0.45);

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width } = page.getSize();
    const x = Math.max(18, (width - textWidth) / 2);
    const y = 14;
    page.drawText(safeText, {
      x,
      y,
      size: fontSize,
      font,
      color: textColor,
    });
  }

  const savedBytes = await pdfDoc.save();
  return Buffer.from(savedBytes);
}
