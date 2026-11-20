import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

interface Point2D {
  x: number;
  y: number;
}

function parseViewBox(svgEl: Element): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  const vbAttr = (svgEl.getAttribute('viewBox') || '').trim();
  if (vbAttr) {
    const parts = vbAttr
      .split(/[\s,]+/)
      .map((n) => parseFloat(n))
      .filter((n) => !Number.isNaN(n));
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return {
        minX: parts[0],
        minY: parts[1],
        width: parts[2],
        height: parts[3],
      };
    }
  }

  const w = parseFloat(svgEl.getAttribute('width') || '2976.38') || 2976.38;
  const h = parseFloat(svgEl.getAttribute('height') || '4209.45') || 4209.45;
  return { minX: 0, minY: 0, width: w, height: h };
}

function scaleDimensionAttr(rawAttr: string | null, factor: number): string | null {
  if (!rawAttr) return null;
  const match = rawAttr.trim().match(/^([+-]?\d*\.?\d+)([a-z%]*)$/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = match[2] || '';
  if (Number.isNaN(num) || num <= 0) return null;
  return `${(num * factor).toFixed(3)}${unit}`;
}

/**
 * Extrai a menor coordenada Y aproximada de um atributo SVG path `d="..."`
 */
function getMinYFromPathData(dAttr: string): number | null {
  if (!dAttr) return null;
  const tokens = dAttr.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  if (!tokens || tokens.length === 0) return null;

  let idx = 0;
  let cmd = '';
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let minY = Infinity;

  const isCommand = (t: string) => /^[a-zA-Z]$/.test(t);
  const nextNum = (): number | null => {
    if (idx >= tokens.length || isCommand(tokens[idx])) return null;
    const val = parseFloat(tokens[idx++]);
    return Number.isNaN(val) ? null : val;
  };
  const recordY = (y: number) => {
    if (y < minY) minY = y;
  };

  while (idx < tokens.length) {
    if (isCommand(tokens[idx])) {
      cmd = tokens[idx++];
      if (cmd === 'Z' || cmd === 'z') {
        curX = startX;
        curY = startY;
        recordY(curY);
        continue;
      }
    }

    switch (cmd) {
      case 'M': {
        const x = nextNum();
        const y = nextNum();
        if (x === null || y === null) break;
        curX = x;
        curY = y;
        startX = curX;
        startY = curY;
        recordY(curY);
        cmd = 'L';
        break;
      }
      case 'm': {
        const dx = nextNum();
        const dy = nextNum();
        if (dx === null || dy === null) break;
        curX += dx;
        curY += dy;
        startX = curX;
        startY = curY;
        recordY(curY);
        cmd = 'l';
        break;
      }
      case 'L':
      case 'T': {
        const x = nextNum();
        const y = nextNum();
        if (x === null || y === null) break;
        curX = x;
        curY = y;
        recordY(curY);
        break;
      }
      case 'l':
      case 't': {
        const dx = nextNum();
        const dy = nextNum();
        if (dx === null || dy === null) break;
        curX += dx;
        curY += dy;
        recordY(curY);
        break;
      }
      case 'H': {
        const x = nextNum();
        if (x === null) break;
        curX = x;
        recordY(curY);
        break;
      }
      case 'h': {
        const dx = nextNum();
        if (dx === null) break;
        curX += dx;
        recordY(curY);
        break;
      }
      case 'V': {
        const y = nextNum();
        if (y === null) break;
        curY = y;
        recordY(curY);
        break;
      }
      case 'v': {
        const dy = nextNum();
        if (dy === null) break;
        curY += dy;
        recordY(curY);
        break;
      }
      case 'C': {
        const x1 = nextNum();
        const y1 = nextNum();
        const x2 = nextNum();
        const y2 = nextNum();
        const x = nextNum();
        const y = nextNum();
        if (x1 === null || y1 === null || x2 === null || y2 === null || x === null || y === null) {
          break;
        }
        recordY(y1);
        recordY(y2);
        curX = x;
        curY = y;
        recordY(curY);
        break;
      }
      case 'c': {
        const dx1 = nextNum();
        const dy1 = nextNum();
        const dx2 = nextNum();
        const dy2 = nextNum();
        const dx = nextNum();
        const dy = nextNum();
        if (
          dx1 === null ||
          dy1 === null ||
          dx2 === null ||
          dy2 === null ||
          dx === null ||
          dy === null
        ) {
          break;
        }
        recordY(curY + dy1);
        recordY(curY + dy2);
        curX += dx;
        curY += dy;
        recordY(curY);
        break;
      }
      case 'S':
      case 'Q': {
        const x1 = nextNum();
        const y1 = nextNum();
        const x = nextNum();
        const y = nextNum();
        if (x1 === null || y1 === null || x === null || y === null) break;
        recordY(y1);
        curX = x;
        curY = y;
        recordY(curY);
        break;
      }
      case 's':
      case 'q': {
        const dx1 = nextNum();
        const dy1 = nextNum();
        const dx = nextNum();
        const dy = nextNum();
        if (dx1 === null || dy1 === null || dx === null || dy === null) break;
        recordY(curY + dy1);
        curX += dx;
        curY += dy;
        recordY(curY);
        break;
      }
      case 'A': {
        nextNum();
        nextNum();
        nextNum();
        nextNum();
        nextNum();
        const x = nextNum();
        const y = nextNum();
        if (x === null || y === null) break;
        curX = x;
        curY = y;
        recordY(curY);
        break;
      }
      case 'a': {
        nextNum();
        nextNum();
        nextNum();
        nextNum();
        nextNum();
        const dx = nextNum();
        const dy = nextNum();
        if (dx === null || dy === null) break;
        curX += dx;
        curY += dy;
        recordY(curY);
        break;
      }
      default: {
        idx++;
        break;
      }
    }
  }

  return Number.isFinite(minY) ? minY : null;
}

function parsePoints(pointsAttr: string): Point2D[] {
  const nums = (pointsAttr || '')
    .trim()
    .split(/[\s,]+/)
    .map((n) => parseFloat(n))
    .filter((n) => !Number.isNaN(n));
  const pts: Point2D[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] });
  }
  return pts;
}

function parseTransformOffset(transformAttr: string): { ty: number; sy: number } {
  let ty = 0;
  let sy = 1;
  if (!transformAttr) return { ty, sy };

  const matrixMatch = transformAttr.match(/matrix\(([^)]+)\)/i);
  if (matrixMatch) {
    const vals = matrixMatch[1]
      .split(/[\s,]+/)
      .map((v) => parseFloat(v))
      .filter((n) => !Number.isNaN(n));
    if (vals.length === 6) {
      sy *= vals[3] || 1;
      ty += vals[5] || 0;
    }
  }

  const translateMatches = Array.from(
    transformAttr.matchAll(/translate\(([^)]+)\)/gi)
  );
  for (const m of translateMatches) {
    const vals = m[1]
      .split(/[\s,]+/)
      .map((v) => parseFloat(v))
      .filter((n) => !Number.isNaN(n));
    if (vals.length >= 2) {
      ty += vals[1] * sy;
    }
  }

  return { ty, sy };
}

function getElementEffectiveMinY(el: Element, accTy: number, accSy: number): number | null {
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'text' || tag === 'tspan') {
    const fontSize = parseFloat(el.getAttribute('font-size') || '16') || 16;
    const yAttr = el.getAttribute('y');
    if (yAttr !== null) {
      const yVal = parseFloat(yAttr);
      if (!Number.isNaN(yVal)) {
        // O baseline do <text> fica na coordenada y; o topo fica ~fontSize acima
        return accTy + (yVal - fontSize * 0.9) * accSy;
      }
    }
    if (accTy !== 0) {
      return accTy - fontSize * 0.9 * accSy;
    }
    return null;
  }

  if (tag === 'path') {
    const dAttr = el.getAttribute('d') || '';
    const minPathY = getMinYFromPathData(dAttr);
    if (minPathY !== null) {
      return accTy + minPathY * accSy;
    }
    return null;
  }

  if (tag === 'polyline' || tag === 'polygon') {
    const pts = parsePoints(el.getAttribute('points') || '');
    if (pts.length === 0) return null;
    const minPtY = Math.min(...pts.map((p) => p.y));
    return accTy + minPtY * accSy;
  }

  if (tag === 'rect' || tag === 'image' || tag === 'use') {
    const yAttr = parseFloat(el.getAttribute('y') || 'NaN');
    if (!Number.isNaN(yAttr)) {
      return accTy + yAttr * accSy;
    }
    return null;
  }

  if (tag === 'line') {
    const y1 = parseFloat(el.getAttribute('y1') || 'NaN');
    const y2 = parseFloat(el.getAttribute('y2') || 'NaN');
    const valid = [y1, y2].filter((v) => !Number.isNaN(v));
    if (valid.length > 0) {
      return accTy + Math.min(...valid) * accSy;
    }
    return null;
  }

  if (tag === 'circle' || tag === 'ellipse') {
    const cy = parseFloat(el.getAttribute('cy') || 'NaN');
    const r = parseFloat(el.getAttribute('r') || el.getAttribute('ry') || '0') || 0;
    if (!Number.isNaN(cy)) {
      return accTy + (cy - r) * accSy;
    }
    return null;
  }

  return null;
}

function pruneBelowCutoff(
  doc: Document,
  parent: Element,
  cutY: number,
  accTy: number,
  accSy: number
): void {
  const children = Array.from(parent.childNodes);
  for (const node of children) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    const tag = (el.tagName || '').toLowerCase();

    if (tag === 'defs' || tag === 'style' || tag === 'clippath' || tag === 'title') {
      continue;
    }

    const localTx = parseTransformOffset(el.getAttribute('transform') || '');
    const nextTy = accTy + localTx.ty * accSy;
    const nextSy = accSy * localTx.sy;

    if (tag === 'g' || tag === 'a') {
      pruneBelowCutoff(doc, el, cutY, nextTy, nextSy);
      // Remove grupo caso tenha ficado vazio após remoção dos filhos
      const remainingElChildren = Array.from(el.childNodes).some((n) => n.nodeType === 1);
      if (!remainingElChildren && el.parentNode) {
        el.parentNode.removeChild(el);
      }
      continue;
    }

    const minY = getElementEffectiveMinY(el, nextTy, nextSy);
    if (minY !== null && minY > cutY) {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
      continue;
    }

    // Se uma barra/polilinha atravessa o corte, limita seus pontos Y para não vazar além do corte
    if (tag === 'polyline' && nextSy > 0) {
      const localCutY = (cutY - nextTy) / nextSy;
      const pts = parsePoints(el.getAttribute('points') || '');
      if (pts.some((p) => p.y > localCutY)) {
        const clipped = pts.map(
          (p) => `${p.x.toFixed(2)},${Math.min(p.y, localCutY).toFixed(2)}`
        );
        el.setAttribute('points', clipped.join(' '));
      }
    } else if (tag === 'line' && nextSy > 0) {
      const localCutY = (cutY - nextTy) / nextSy;
      const y1 = parseFloat(el.getAttribute('y1') || 'NaN');
      const y2 = parseFloat(el.getAttribute('y2') || 'NaN');
      if (!Number.isNaN(y1) && y1 > localCutY) el.setAttribute('y1', localCutY.toFixed(2));
      if (!Number.isNaN(y2) && y2 > localCutY) el.setAttribute('y2', localCutY.toFixed(2));
    } else if (tag === 'rect' && nextSy > 0) {
      const localCutY = (cutY - nextTy) / nextSy;
      const yAttr = parseFloat(el.getAttribute('y') || '0') || 0;
      const hAttr = parseFloat(el.getAttribute('height') || '0') || 0;
      if (yAttr + hAttr > localCutY) {
        const clampedH = Math.max(0, localCutY - yAttr);
        el.setAttribute('height', clampedH.toFixed(2));
      }
    }
  }
}

/**
 * Recorta fisicamente o SVG da Página 1 no percentual configurado (ex: 50%),
 * ajustando viewBox/height e removendo do XML todos os elementos musicais abaixo do corte.
 * Garante censura à prova de F12 (DevTools).
 */
export function cropSvgForPreview(rawSvg: string, cropPercent = 50): string {
  if (!rawSvg || !rawSvg.includes('<svg')) {
    return rawSvg;
  }

  const clampedPercent = Math.max(15, Math.min(90, Number(cropPercent) || 50));
  const factor = clampedPercent / 100;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
    const svgEl = doc.getElementsByTagName('svg').item(0);
    if (!svgEl) return rawSvg;

    const { minX, minY, width, height } = parseViewBox(svgEl);
    const croppedHeight = height * factor;
    const cutY = minY + croppedHeight;

    // 1. Remove fisicamente do XML todos os nós musicais/textos abaixo da linha de corte
    pruneBelowCutoff(doc, svgEl, cutY, 0, 1);

    // 2. Atualiza viewBox e height para exibir exclusivamente a faixa superior
    svgEl.setAttribute(
      'viewBox',
      `${minX} ${minY} ${width.toFixed(2)} ${croppedHeight.toFixed(2)}`
    );
    const scaledHeightAttr = scaleDimensionAttr(svgEl.getAttribute('height'), factor);
    if (scaledHeightAttr) {
      svgEl.setAttribute('height', scaledHeightAttr);
    }

    // 3. Envolve o restante em <clipPath> para cortar com precisão elementos que cruzam o limite
    const clipId = 'rubsax-preview-clip';
    const defs = doc.createElement('defs');
    const clipPath = doc.createElement('clipPath');
    clipPath.setAttribute('id', clipId);
    const clipRect = doc.createElement('rect');
    clipRect.setAttribute('x', String(minX));
    clipRect.setAttribute('y', String(minY));
    clipRect.setAttribute('width', width.toFixed(2));
    clipRect.setAttribute('height', croppedHeight.toFixed(2));
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);

    const wrapperGroup = doc.createElement('g');
    wrapperGroup.setAttribute('clip-path', `url(#${clipId})`);

    const existingNodes = Array.from(svgEl.childNodes);
    for (const child of existingNodes) {
      if (child.nodeType === 1) {
        const tag = ((child as Element).tagName || '').toLowerCase();
        if (tag === 'defs' || tag === 'style' || tag === 'title') {
          continue;
        }
      }
      svgEl.removeChild(child);
      wrapperGroup.appendChild(child);
    }

    svgEl.insertBefore(defs, svgEl.firstChild);
    svgEl.appendChild(wrapperGroup);

    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgEl);
  } catch {
    return rawSvg;
  }
}
