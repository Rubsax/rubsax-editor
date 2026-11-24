import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import {
  ClefType,
  INSTRUMENT_DEFINITIONS,
  InstrumentDefinition,
  InstrumentGroupId,
  TonalityDefinition,
  getInstrumentById,
  getTonalityByFifths,
  getTonalityByPitchClass,
  normalizeKeySigFifths,
  pitchClassToSimpleTpc,
  tpcToNoteName,
  tpcToPitchClass,
} from './constants';

export const UNSUPPORTED_FORMAT_MESSAGE =
  'Formato não suportado. Envie apenas arquivos do MuseScore (.mscz, .mscx) ou MusicXML (.xml, .mxl).';

export const ALLOWED_EXTENSIONS = ['.mscz', '.mscx', '.xml', '.musicxml', '.mxl'];
export const BLOCKED_EXTENSIONS = ['.mus', '.musx', '.sib', '.mid', '.midi', '.enc'];

export type ScoreLayoutViewMode = 'portrait' | 'full-score';

export interface FloatingTextBox {
  id: string;
  text: string;
  xPercent: number;
  yPercent: number;
  fontSize: number;
  pageIndex: number;
}

export interface HeaderTextFieldState {
  text: string;
  visible: boolean;
  removed: boolean;
}

export interface ScoreHeadersState {
  showAllHeaders: boolean;
  title: HeaderTextFieldState;
  subtitle: HeaderTextFieldState;
  composer: HeaderTextFieldState & { autoSyncInstrument: boolean };
  lyricist: HeaderTextFieldState & { autoSyncPianoKey: boolean };
}

export interface StaffSummary {
  staffId: string;
  xmlStaffIds: string[];
  staffCount: number;
  isGrandStaff: boolean;
  partIndex: number;
  trackName: string;
  displayName: string;
  partSelectorLabel: string;
  headerInstrumentLabel: string;
  instrumentId: string;
  isVisibleSolo: boolean;
  isPercussion: boolean;
  transposeChromatic: number;
  transposeDiatonic: number;
  fifthsOffset: number;
  writtenSemitoneOffset: number;
  transpositionLabel: string;
  isTransposing: boolean;
  clef: ClefType;
}

export interface ChordOccurrence {
  occurrenceIndex: number;
  occurrenceKey: string;
  staffId: string;
  measureNumber: number;
  originalSymbol: string;
  currentSymbol: string;
}

export interface ScoreAnalysis {
  fileName: string;
  fileFormat: 'mscz' | 'mscx' | 'xml' | 'mxl';
  detectedInstrumentId: string;
  detectedInstrumentName: string;
  detectedGroupId: InstrumentGroupId;
  originalTransposeChromatic: number;
  originalTransposeDiatonic: number;
  originalClef: ClefType;
  /** Concert Pitch (Piano / Dó) fifths (-5..+6) */
  originalConcertKeyFifths: number;
  /** Concert Pitch Class (0..11) */
  originalConcertPitchClass: number;
  originalConcertTonality: TonalityDefinition;
  /** Written Key fifths on Staff 1 */
  originalWrittenKeyFifths: number;
  originalWrittenTonality: TonalityDefinition;
  /** Median Concert MIDI pitch of notes on Staff 1 */
  originalMedianConcertPitch: number;
  measureCount: number;
  noteCount: number;
  chordCount: number;
  lyricCount: number;
  hasChords: boolean;
  hasLyrics: boolean;
  sampleChords: string[];
  /** True if file has a transposing instrument and chords */
  needsBbEbChordPrompt: boolean;
  headers: ScoreHeadersState;
  staves: StaffSummary[];
  hiddenDuplicateStaffIds: string[];
  watermarkText: string;
  originalSpatium: number;
  initialLineBreakMeasures: number[];
  initialPageBreakMeasures: number[];
}

export interface ScoreTransformOptions {
  /** Semitone shift applied to Concert Pitch (-12..+12) */
  semitoneShift: number;
  /** Manual octave shift applied to active staff (-2..+2 octaves) */
  octaveShift: number;
  /** Optional per-part octave shifts keyed by StaffSummary.staffId (-2..+2 octaves) */
  octaveShiftsByPart?: Record<string, number>;
  /** Target instrument ID (kept from detected file instrument) */
  targetInstrumentId: string;
  /** Selected staff ID to view/export ('1', '2', '3', etc.) */
  selectedStaffId: string;
  /** Multiple selected staff IDs when user keeps specific staves active */
  selectedStaffIds?: string[];
  /** Layout mode: portrait A4 or full-score stacked staves */
  viewMode: ScoreLayoutViewMode;
  /** Whether visible chords on a transposing staff should be transposed to the instrument's written key */
  convertBbEbChordsToWritten: boolean;
  /** Visibility toggles */
  showChords: boolean;
  showLyrics: boolean;
  /** Header text controls */
  headers: ScoreHeadersState;
  /** User edits to existing chord symbols (maps transposed chord symbol or '#staffId:idx' -> new chord symbol) */
  chordOverrides: Record<string, string>;
  /** User-created floating text boxes positioned over the score */
  floatingTexts: FloatingTextBox[];
  /** 1-based measure numbers where <LayoutBreak><subtype>line</subtype></LayoutBreak> must be active */
  lineBreakMeasures?: number[];
  /** 1-based measure numbers where <LayoutBreak><subtype>page</subtype></LayoutBreak> must be active */
  pageBreakMeasures?: number[];
  /** Staff scale multiplier percentage applied to <Style><Spatium> (default 100) */
  staffScalePercent?: number;
}

export interface TransformResult {
  modifiedMscx: string;
  concertTonality: TonalityDefinition;
  writtenTonality: TonalityDefinition;
  activeStaff: StaffSummary;
  targetInstrument: InstrumentDefinition;
  appliedSemitoneShift: number;
  appliedAutoOctaveSemitones: number;
  appliedManualOctaveSemitones: number;
  previewChords: string[];
  chordOccurrences: ChordOccurrence[];
}

export function validateUploadFileName(fileName: string): {
  valid: boolean;
  error?: string;
  extension: string;
} {
  const lower = (fileName || '').trim().toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : '';

  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: UNSUPPORTED_FORMAT_MESSAGE,
      extension: ext,
    };
  }

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: UNSUPPORTED_FORMAT_MESSAGE,
      extension: ext,
    };
  }

  return { valid: true, extension: ext };
}

function getDirectChildrenByTag(parent: Element, tagName: string): Element[] {
  const result: Element[] = [];
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const node = children.item(i);
    if (node && node.nodeType === 1 && (node as Element).tagName === tagName) {
      result.push(node as Element);
    }
  }
  return result;
}

function getFirstDirectChildByTag(parent: Element, tagName: string): Element | null {
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const node = children.item(i);
    if (node && node.nodeType === 1 && (node as Element).tagName === tagName) {
      return node as Element;
    }
  }
  return null;
}

function getDirectChildText(parent: Element, tagName: string, defaultVal = ''): string {
  const child = getFirstDirectChildByTag(parent, tagName);
  if (!child) return defaultVal;
  return (child.textContent || '').trim();
}

function setOrCreateDirectChildText(
  doc: Document,
  parent: Element,
  tagName: string,
  value: string,
  insertBeforeTag?: string
): Element {
  let child = getFirstDirectChildByTag(parent, tagName);
  if (!child) {
    child = doc.createElement(tagName);
    if (insertBeforeTag) {
      const refNode = getFirstDirectChildByTag(parent, insertBeforeTag);
      if (refNode) {
        parent.insertBefore(child, refNode);
      } else {
        parent.appendChild(child);
      }
    } else {
      parent.appendChild(child);
    }
  }
  while (child.firstChild) {
    child.removeChild(child.firstChild);
  }
  child.appendChild(doc.createTextNode(value));
  return child;
}

function removeDirectChildrenByTag(parent: Element, tagName: string): void {
  const children = getDirectChildrenByTag(parent, tagName);
  for (const ch of children) {
    parent.removeChild(ch);
  }
}

function cleanMscxTextNode(textEl: Element | null): string {
  if (!textEl) return '';
  const symMap: Record<string, string> = {
    accidentalFlat: '♭',
    accidentalSharp: '♯',
    accidentalNatural: '♮',
  };
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      parts.push(node.nodeValue || '');
    } else if (node.nodeType === 1) {
      const el = node as Element;
      if (el.tagName === 'sym') {
        const symName = (el.textContent || '').trim();
        parts.push(symMap[symName] || symName);
      } else {
        for (let i = 0; i < el.childNodes.length; i++) {
          const ch = el.childNodes.item(i);
          if (ch) walk(ch);
        }
      }
    }
  };
  walk(textEl);
  const raw = parts.join('').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const cleaned = lines.join('\n').trim();
  if (cleaned.toLowerCase() === 'x' || cleaned.toLowerCase() === 'xxx') {
    return '';
  }
  return cleaned;
}

function updateMscxTextPreservingFontTags(
  doc: Document,
  textEl: Element,
  newPlainText: string
): void {
  const fontAttrs: Array<{ size?: string; face?: string }> = [];
  const childNodes = textEl.childNodes;
  for (let i = 0; i < childNodes.length; i++) {
    const n = childNodes.item(i);
    if (n && n.nodeType === 1 && (n as Element).tagName === 'font') {
      const fEl = n as Element;
      fontAttrs.push({
        size: fEl.getAttribute('size') || undefined,
        face: fEl.getAttribute('face') || undefined,
      });
    }
  }

  while (textEl.firstChild) {
    textEl.removeChild(textEl.firstChild);
  }

  for (const fa of fontAttrs) {
    const fNode = doc.createElement('font');
    if (fa.size) fNode.setAttribute('size', fa.size);
    if (fa.face) fNode.setAttribute('face', fa.face);
    textEl.appendChild(fNode);
  }

  textEl.appendChild(doc.createTextNode(newPlainText));
}

function escapeXmlText(val: string): string {
  return (val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function detectPercussionPart(partEl: Element, trackName: string, instrumentId: string): boolean {
  const norm = `${trackName} ${instrumentId}`.toLowerCase();
  if (
    norm.includes('drum') ||
    norm.includes('bateria') ||
    norm.includes('percuss') ||
    instrumentId.startsWith('drum.')
  ) {
    return true;
  }
  const staffEls = getDirectChildrenByTag(partEl, 'Staff');
  for (const st of staffEls) {
    const stType = getFirstDirectChildByTag(st, 'StaffType');
    if (stType && (stType.getAttribute('group') || '').toLowerCase() === 'percussion') {
      return true;
    }
  }
  const channels = partEl.getElementsByTagName('Channel');
  for (let i = 0; i < channels.length; i++) {
    const ch = channels.item(i);
    if (ch) {
      const midiCh = getDirectChildText(ch, 'midiChannel');
      if (midiCh === '9') return true;
    }
  }
  return false;
}

export interface StaffTranspositionInfo {
  fifthsOffset: number;
  writtenSemitoneOffset: number;
  transpositionLabel: string;
  isTransposing: boolean;
}

export function computeStaffOffsetsFromTranspose(
  transposeChromatic: number,
  transposeDiatonic = 0
): StaffTranspositionInfo {
  const writtenSemitoneOffset = (((-transposeChromatic) % 12) + 12) % 12;
  const instrumentPitchClass = ((transposeChromatic % 12) + 12) % 12;

  switch (instrumentPitchClass) {
    case 0:
      return {
        fifthsOffset: 0,
        writtenSemitoneOffset: 0,
        transpositionLabel: 'Dó',
        isTransposing: false,
      };
    case 10:
      return {
        fifthsOffset: 2,
        writtenSemitoneOffset: 2,
        transpositionLabel: 'Sib',
        isTransposing: true,
      };
    case 3:
      return {
        fifthsOffset: 3,
        writtenSemitoneOffset: 9,
        transpositionLabel: 'Mib',
        isTransposing: true,
      };
    case 5:
      return {
        fifthsOffset: 1,
        writtenSemitoneOffset: 7,
        transpositionLabel: 'Fá',
        isTransposing: true,
      };
    case 7:
      return {
        fifthsOffset: -1,
        writtenSemitoneOffset: 5,
        transpositionLabel: 'Sol',
        isTransposing: true,
      };
    case 2:
      return {
        fifthsOffset: -2,
        writtenSemitoneOffset: 10,
        transpositionLabel: 'Ré',
        isTransposing: true,
      };
    case 9:
      return {
        fifthsOffset: -3,
        writtenSemitoneOffset: 3,
        transpositionLabel: 'Lá',
        isTransposing: true,
      };
    case 4:
      return {
        fifthsOffset: -4,
        writtenSemitoneOffset: 8,
        transpositionLabel: 'Mi',
        isTransposing: true,
      };
    case 11:
      return {
        fifthsOffset: -5,
        writtenSemitoneOffset: 1,
        transpositionLabel: 'Si',
        isTransposing: true,
      };
    case 8:
      return {
        fifthsOffset: 4,
        writtenSemitoneOffset: 4,
        transpositionLabel: 'Láb',
        isTransposing: true,
      };
    case 1:
      return {
        fifthsOffset: 5,
        writtenSemitoneOffset: 11,
        transpositionLabel: 'Réb',
        isTransposing: true,
      };
    case 6: {
      const preferFlat = transposeDiatonic > 0 || (((-transposeDiatonic) % 7) + 7) % 7 === 3;
      return {
        fifthsOffset: normalizeKeySigFifths(preferFlat ? -6 : 6),
        writtenSemitoneOffset: 6,
        transpositionLabel: preferFlat ? 'Solb' : 'Fá#',
        isTransposing: true,
      };
    }
    default:
      return {
        fifthsOffset: 0,
        writtenSemitoneOffset: 0,
        transpositionLabel: 'Dó',
        isTransposing: false,
      };
  }
}

function readTransposeFromPartOrInstrument(
  partEl: Element,
  instrEl: Element | null
): { transposeChromatic: number; transposeDiatonic: number } {
  const instrTransposeTag = instrEl ? getFirstDirectChildByTag(instrEl, 'transpose') : null;
  const partTransposeTag = getFirstDirectChildByTag(partEl, 'transpose');

  const chromStr =
    (instrEl && getDirectChildText(instrEl, 'transposeChromatic')) ||
    (instrTransposeTag && getDirectChildText(instrTransposeTag, 'chromatic')) ||
    getDirectChildText(partEl, 'transposeChromatic') ||
    (partTransposeTag && getDirectChildText(partTransposeTag, 'chromatic')) ||
    '0';

  const diatStr =
    (instrEl && getDirectChildText(instrEl, 'transposeDiatonic')) ||
    (instrTransposeTag && getDirectChildText(instrTransposeTag, 'diatonic')) ||
    getDirectChildText(partEl, 'transposeDiatonic') ||
    (partTransposeTag && getDirectChildText(partTransposeTag, 'diatonic')) ||
    '0';

  return {
    transposeChromatic: parseInt(chromStr, 10) || 0,
    transposeDiatonic: parseInt(diatStr, 10) || 0,
  };
}

function cleanPartDisplayName(rawName: string): string {
  return (rawName || '')
    .replace(/\s+em\s+B♭/gi, ' Sib')
    .replace(/\s+em\s+E♭/gi, ' Mib')
    .replace(/\s+em\s+F\b/gi, ' Fá')
    .replace(/\s+in\s+B♭/gi, ' Sib')
    .replace(/\s+in\s+Bb\b/gi, ' Sib')
    .replace(/\s+in\s+E♭/gi, ' Mib')
    .replace(/\s+in\s+Eb\b/gi, ' Mib')
    .replace(/\s+in\s+F\b/gi, ' Fá')
    .trim();
}

function detectInitialInstrumentFromPart(
  trackName: string,
  instrumentId: string,
  composerHeader: string,
  transposeChromatic: number,
  clef: ClefType
): InstrumentDefinition {
  const primaryTrack = `${trackName} ${instrumentId}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const fallbackAll = `${trackName} ${instrumentId} ${composerHeader}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // 1. Check Eb group (-9 or -21)
  if (
    transposeChromatic === -9 ||
    transposeChromatic === -21 ||
    transposeChromatic === 3 ||
    primaryTrack.includes('alto-sax') ||
    primaryTrack.includes('saxofone alto') ||
    primaryTrack.includes('sax alto') ||
    primaryTrack.includes('baritono')
  ) {
    if (primaryTrack.includes('baritono')) {
      return getInstrumentById('baritone-sax');
    }
    return getInstrumentById('alto-sax');
  }

  // 2. Check Bb group (-2 or -14) — prioritize trackName/instrumentId before composerHeader!
  if (
    transposeChromatic === -2 ||
    transposeChromatic === -14 ||
    primaryTrack.includes('clarinet') ||
    primaryTrack.includes('trumpet') ||
    primaryTrack.includes('trompete') ||
    primaryTrack.includes('tenor-sax') ||
    primaryTrack.includes('saxofone tenor') ||
    primaryTrack.includes('soprano-sax') ||
    primaryTrack.includes('saxofone soprano')
  ) {
    if (primaryTrack.includes('clarinet')) return getInstrumentById('clarinet');
    if (primaryTrack.includes('trumpet') || primaryTrack.includes('trompete'))
      return getInstrumentById('trumpet');
    if (primaryTrack.includes('tenor')) return getInstrumentById('tenor-sax');
    if (primaryTrack.includes('soprano')) return getInstrumentById('soprano-sax');
    return getInstrumentById('clarinet');
  }

  // 3. Check Bass Clef (Clave de Fá)
  if (
    clef === 'F' ||
    primaryTrack.includes('trombone') ||
    primaryTrack.includes('bombardino') ||
    primaryTrack.includes('euphonium') ||
    primaryTrack.includes('violoncelo') ||
    primaryTrack.includes('cello')
  ) {
    if (primaryTrack.includes('bombardino') || primaryTrack.includes('euphonium')) {
      return getInstrumentById('euphonium');
    }
    if (primaryTrack.includes('violoncelo') || primaryTrack.includes('cello')) {
      return getInstrumentById('cello');
    }
    return getInstrumentById('trombone');
  }

  // 4. Check C Treble group
  if (fallbackAll.includes('flauta doce') || fallbackAll.includes('recorder')) {
    return getInstrumentById('recorder');
  }
  if (fallbackAll.includes('flauta') || fallbackAll.includes('flute')) {
    return getInstrumentById('flute');
  }
  if (fallbackAll.includes('oboe')) {
    return getInstrumentById('oboe');
  }
  if (fallbackAll.includes('teclado') || fallbackAll.includes('piano')) {
    return getInstrumentById('keyboard');
  }
  return getInstrumentById('violin');
}

const NOTE_STEP_TO_TPC: Record<string, number> = {
  C: 14,
  'C#': 21,
  'C♯': 21,
  Cb: 7,
  'C♭': 7,
  D: 16,
  'D#': 23,
  'D♯': 23,
  Db: 9,
  'D♭': 9,
  E: 18,
  'E#': 25,
  'E♯': 25,
  Eb: 11,
  'E♭': 11,
  F: 13,
  'F#': 20,
  'F♯': 20,
  Fb: 6,
  'F♭': 6,
  G: 15,
  'G#': 22,
  'G♯': 22,
  Gb: 8,
  'G♭': 8,
  A: 17,
  'A#': 24,
  'A♯': 24,
  Ab: 10,
  'A♭': 10,
  B: 19,
  'B#': 26,
  'B♯': 26,
  Bb: 12,
  'B♭': 12,
};

/**
 * Analisa uma cifra digitada pelo usuário (ex: "Dm7(9)", "A7/C#", "Bb9", "C#º")
 * e converte para <root>, <name> e <base> nativos do MuseScore 3.
 */
export function parseChordStringToHarmonyParts(rawInput: string): {
  rootTpc: number;
  name: string;
  baseTpc: number | null;
} | null {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  let mainPart = trimmed;
  let baseTpc: number | null = null;

  // Verificar baixo após '/' (ex: A7/C#, C/E, Gm/Bb)
  const slashMatch = trimmed.match(/^(.*)\/([A-Ga-g][#b♯♭]?)$/);
  if (slashMatch) {
    mainPart = slashMatch[1].trim();
    const bassRaw = slashMatch[2];
    const normalizedBass = bassRaw.charAt(0).toUpperCase() + bassRaw.slice(1);
    if (NOTE_STEP_TO_TPC[normalizedBass] !== undefined) {
      baseTpc = NOTE_STEP_TO_TPC[normalizedBass];
    }
  }

  const rootMatch = mainPart.match(/^([A-Ga-g])([#b♯♭]?)(.*)$/);
  if (!rootMatch) return null;

  const rootNoteKey = rootMatch[1].toUpperCase() + (rootMatch[2] || '');
  const rootTpc = NOTE_STEP_TO_TPC[rootNoteKey];
  if (rootTpc === undefined) return null;

  let quality = (rootMatch[3] || '').trim();
  // Normalizar símbolo de diminuto para o padrão MuseScore
  if (quality === 'º' || quality === '°') {
    quality = '0';
  }

  return {
    rootTpc,
    name: quality,
    baseTpc,
  };
}

/**
 * Formata um elemento <Harmony> em texto legível (ex: "Dm7", "C/E", "C#º")
 */
export function formatHarmonyElementSymbol(
  rootTpc: number,
  nameStr: string,
  baseTpc: number | null
): string {
  const rootName = tpcToNoteName(rootTpc);
  const displayQuality = nameStr === '0' ? 'º' : nameStr;
  const bassSuffix =
    baseTpc !== null && !Number.isNaN(baseTpc) ? `/${tpcToNoteName(baseTpc)}` : '';
  return `${rootName}${displayQuality}${bassSuffix}`;
}

export function convertMusicXmlToMscxIfNeeded(xmlContent: string): string {
  if (xmlContent.includes('<museScore') || xmlContent.includes('<Score>')) {
    return xmlContent;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'text/xml');
  const workTitleEl = doc.getElementsByTagName('work-title').item(0);
  const movementTitleEl = doc.getElementsByTagName('movement-title').item(0);
  const title = (
    workTitleEl?.textContent ||
    movementTitleEl?.textContent ||
    'Partitura MusicXML'
  ).trim();

  const stepToPc: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  // Mapear nomes das partes em <part-list>/<score-part>
  const partNameById = new Map<string, string>();
  const scoreParts = doc.getElementsByTagName('score-part');
  for (let i = 0; i < scoreParts.length; i++) {
    const sp = scoreParts.item(i);
    if (!sp) continue;
    const pid = sp.getAttribute('id') || '';
    const pName =
      getDirectChildText(sp, 'part-name') ||
      getDirectChildText(sp, 'part-abbreviation') ||
      '';
    if (pid && pName) {
      partNameById.set(pid, pName);
    }
  }

  const parts = doc.getElementsByTagName('part');
  let globalDivisions = 1;
  let initialConcertFifthsForHeader = 0;

  interface ConvertedPartXml {
    partDefXml: string;
    staffBodiesXml: string[];
  }

  const convertedParts: ConvertedPartXml[] = [];
  let nextXmlStaffId = 1;

  for (let pIdx = 0; pIdx < parts.length; pIdx++) {
    const partEl = parts.item(pIdx);
    if (!partEl) continue;
    const partId = partEl.getAttribute('id') || `P${pIdx + 1}`;
    const rawPartName = partNameById.get(partId) || `Parte ${pIdx + 1}`;
    const safePartName = escapeXmlText(rawPartName);

    const measureNodes = getDirectChildrenByTag(partEl, 'measure');
    let divisions = 1;
    let partFifths = 0;
    let sigN = 4;
    let sigD = 4;
    let stavesCount = 1;
    let transposeDiatonic = 0;
    let transposeChromatic = 0;
    const clefsByStaffNum: Record<number, 'G' | 'F'> = {};

    // Ler metadados iniciais do primeiro bloco <attributes> do instrumento
    for (let m = 0; m < measureNodes.length; m++) {
      const mEl = measureNodes[m];
      const attrEls = getDirectChildrenByTag(mEl, 'attributes');
      for (const attr of attrEls) {
        const divText = getDirectChildText(attr, 'divisions');
        if (divText && m === 0) {
          divisions = parseInt(divText, 10) || 1;
          if (pIdx === 0) globalDivisions = divisions;
        }
        const stavesText = getDirectChildText(attr, 'staves');
        if (stavesText) {
          stavesCount = Math.max(1, Math.min(4, parseInt(stavesText, 10) || 1));
        }
        const keyEl = getFirstDirectChildByTag(attr, 'key');
        if (keyEl && m === 0) {
          partFifths = parseInt(getDirectChildText(keyEl, 'fifths', '0'), 10) || 0;
        }
        const timeEl = getFirstDirectChildByTag(attr, 'time');
        if (timeEl && m === 0) {
          sigN = parseInt(getDirectChildText(timeEl, 'beats', '4'), 10) || 4;
          sigD = parseInt(getDirectChildText(timeEl, 'beat-type', '4'), 10) || 4;
        }
        const clefEls = getDirectChildrenByTag(attr, 'clef');
        for (const cEl of clefEls) {
          const cNum = parseInt(cEl.getAttribute('number') || '1', 10) || 1;
          const sign = getDirectChildText(cEl, 'sign', 'G').toUpperCase();
          if (!clefsByStaffNum[cNum]) {
            clefsByStaffNum[cNum] = sign === 'F' ? 'F' : 'G';
          }
        }
        const trEl = getFirstDirectChildByTag(attr, 'transpose');
        if (trEl) {
          const diat = parseInt(getDirectChildText(trEl, 'diatonic', '0'), 10) || 0;
          const chrom = parseInt(getDirectChildText(trEl, 'chromatic', '0'), 10) || 0;
          const octChg = parseInt(getDirectChildText(trEl, 'octave-change', '0'), 10) || 0;
          transposeChromatic = chrom + octChg * 12;
          transposeDiatonic = diat + octChg * 7;
        }
      }
      if (m === 0) break;
    }

    const offsetInfo = computeStaffOffsetsFromTranspose(transposeChromatic, transposeDiatonic);
    if (pIdx === 0) {
      initialConcertFifthsForHeader = normalizeKeySigFifths(
        partFifths - offsetInfo.fifthsOffset
      );
    }

    const assignedStaffIds: number[] = [];
    for (let s = 1; s <= stavesCount; s++) {
      assignedStaffIds.push(nextXmlStaffId++);
    }

    const partStavesXml = assignedStaffIds
      .map((sid, idx) => {
        const defClef = clefsByStaffNum[idx + 1] === 'F' ? '<defaultClef>F</defaultClef>' : '';
        const bracketXml =
          stavesCount >= 2 && idx === 0
            ? `<bracket type="1" span="${stavesCount}" col="0"/>`
            : '';
        return `      <Staff id="${sid}">
        <StaffType group="pitched">
          <name>stdNormal</name>
        </StaffType>
        ${defClef}
        ${bracketXml}
      </Staff>`;
      })
      .join('\n');

    const transposeXml =
      transposeChromatic !== 0 || transposeDiatonic !== 0
        ? `<transposeDiatonic>${transposeDiatonic}</transposeDiatonic>
        <transposeChromatic>${transposeChromatic}</transposeChromatic>`
        : '';

    const partDefXml = `    <Part>
${partStavesXml}
      <trackName>${safePartName}</trackName>
      <Instrument>
        <longName>${safePartName}</longName>
        <trackName>${safePartName}</trackName>
        ${transposeXml}
        <Channel>
          <program value="0"/>
          <synti>Fluid</synti>
        </Channel>
      </Instrument>
    </Part>`;

    // Detectar quebras (<print new-system="yes"/> e <print new-page="yes"/>) no compasso M -> LayoutBreak no compasso M-1
    const lineBreaksBefore = new Set<number>();
    const pageBreaksBefore = new Set<number>();
    for (let m = 0; m < measureNodes.length; m++) {
      const mEl = measureNodes[m];
      const prints = getDirectChildrenByTag(mEl, 'print');
      for (const pr of prints) {
        if ((pr.getAttribute('new-system') || '').toLowerCase() === 'yes' && m > 0) {
          lineBreaksBefore.add(m - 1);
        }
        if ((pr.getAttribute('new-page') || '').toLowerCase() === 'yes' && m > 0) {
          pageBreaksBefore.add(m - 1);
        }
      }
    }

    const staffBodiesXml: string[] = [];

    for (let sIdx = 0; sIdx < stavesCount; sIdx++) {
      const staffNumOneBased = sIdx + 1;
      const xmlSid = assignedStaffIds[sIdx];
      let currentFifths = partFifths;
      const measuresXml: string[] = [];

      for (let m = 0; m < measureNodes.length; m++) {
        const mEl = measureNodes[m];
        const voiceItems: string[] = [];
        const layoutBreaksXml: string[] = [];

        if (lineBreaksBefore.has(m)) {
          layoutBreaksXml.push('<LayoutBreak><subtype>line</subtype></LayoutBreak>');
        }
        if (pageBreaksBefore.has(m)) {
          layoutBreaksXml.push('<LayoutBreak><subtype>page</subtype></LayoutBreak>');
        }

        if (m === 0) {
          if (clefsByStaffNum[staffNumOneBased] === 'F') {
            voiceItems.push(
              '<Clef><concertClefType>F</concertClefType><transposingClefType>F</transposingClefType></Clef>'
            );
          }
          voiceItems.push(
            `<KeySig><accidental>${currentFifths}</accidental></KeySig>`,
            `<TimeSig><sigN>${sigN}</sigN><sigD>${sigD}</sigD></TimeSig>`
          );
        }

        const children = mEl.childNodes;
        for (let c = 0; c < children.length; c++) {
          const ch = children.item(c);
          if (!ch || ch.nodeType !== 1) continue;
          const el = ch as Element;

          if (el.tagName === 'attributes' && m > 0) {
            const kEl = getFirstDirectChildByTag(el, 'key');
            if (kEl) {
              currentFifths = parseInt(getDirectChildText(kEl, 'fifths', '0'), 10) || 0;
              voiceItems.push(`<KeySig><accidental>${currentFifths}</accidental></KeySig>`);
            }
          } else if (el.tagName === 'harmony') {
            const hStaff = parseInt(getDirectChildText(el, 'staff', '1'), 10) || 1;
            if (hStaff !== staffNumOneBased) continue;
            const rootStep =
              el.getElementsByTagName('root-step').item(0)?.textContent?.trim() || 'C';
            const rootAlter = parseInt(
              el.getElementsByTagName('root-alter').item(0)?.textContent || '0',
              10
            );
            const kindEl = el.getElementsByTagName('kind').item(0);
            const kindText = kindEl?.getAttribute('text') || '';
            const pc = ((stepToPc[rootStep] ?? 0) + rootAlter + 12) % 12;
            const rootTpc = pitchClassToSimpleTpc(pc, currentFifths);

            const bassStep = el.getElementsByTagName('bass-step').item(0)?.textContent?.trim();
            let bassTag = '';
            if (bassStep) {
              const bassAlter = parseInt(
                el.getElementsByTagName('bass-alter').item(0)?.textContent || '0',
                10
              );
              const bassPc = ((stepToPc[bassStep] ?? 0) + bassAlter + 12) % 12;
              const bassTpc = pitchClassToSimpleTpc(bassPc, currentFifths);
              bassTag = `<base>${bassTpc}</base>`;
            }

            voiceItems.push(
              `<Harmony><root>${rootTpc}</root>${
                kindText ? `<name>${escapeXmlText(kindText)}</name>` : ''
              }${bassTag}<play>0</play></Harmony>`
            );
          } else if (el.tagName === 'note') {
            const nStaff = parseInt(getDirectChildText(el, 'staff', '1'), 10) || 1;
            if (nStaff !== staffNumOneBased) continue;

            const isRest = el.getElementsByTagName('rest').length > 0;
            const typeText =
              el.getElementsByTagName('type').item(0)?.textContent?.trim() || 'quarter';
            const durationMap: Record<string, string> = {
              whole: 'whole',
              half: 'half',
              quarter: 'quarter',
              eighth: 'eighth',
              '16th': '16th',
              '32nd': '32nd',
            };
            const durType = durationMap[typeText] || 'quarter';
            const dotsCount = el.getElementsByTagName('dot').length;
            const dotsTag = dotsCount > 0 ? `<dots>${dotsCount}</dots>` : '';

            const lyricText =
              el.getElementsByTagName('text').item(0)?.textContent?.trim() || '';
            const lyricXml = lyricText
              ? `<Lyrics><text>${escapeXmlText(lyricText)}</text></Lyrics>`
              : '';

            if (isRest) {
              voiceItems.push(
                `<Rest>${dotsTag}<durationType>${durType}</durationType>${lyricXml}</Rest>`
              );
            } else {
              const step = el.getElementsByTagName('step').item(0)?.textContent?.trim() || 'C';
              const octave = parseInt(
                el.getElementsByTagName('octave').item(0)?.textContent || '4',
                10
              );
              const alter = parseInt(
                el.getElementsByTagName('alter').item(0)?.textContent || '0',
                10
              );
              const writtenMidiPitch = (octave + 1) * 12 + (stepToPc[step] ?? 0) + alter;
              const concertMidiPitch = writtenMidiPitch + transposeChromatic;
              const concertPc = ((concertMidiPitch % 12) + 12) % 12;
              const concertFifths = normalizeKeySigFifths(
                currentFifths - offsetInfo.fifthsOffset
              );
              const tpc = pitchClassToSimpleTpc(concertPc, concertFifths);
              const writtenPc = ((writtenMidiPitch % 12) + 12) % 12;
              const tpc2Tag =
                transposeChromatic !== 0
                  ? `<tpc2>${pitchClassToSimpleTpc(writtenPc, currentFifths)}</tpc2>`
                  : '';
              voiceItems.push(
                `<Chord>${dotsTag}<durationType>${durType}</durationType>${lyricXml}<Note><pitch>${concertMidiPitch}</pitch><tpc>${tpc}</tpc>${tpc2Tag}</Note></Chord>`
              );
            }
          }
        }

        if (voiceItems.length === 0) {
          voiceItems.push(
            `<Rest><durationType>measure</durationType><duration>${sigN}/${sigD}</duration></Rest>`
          );
        }

        measuresXml.push(
          `<Measure>${layoutBreaksXml.join('')}<voice>${voiceItems.join('\n')}</voice></Measure>`
        );
      }

      const concertHeaderTonality = getTonalityByFifths(initialConcertFifthsForHeader);
      const vboxXml =
        xmlSid === 1
          ? `<VBox>
        <height>7</height>
        <Text>
          <style>Title</style>
          <text>${escapeXmlText(title)}</text>
        </Text>
        <Text>
          <style>Lyricist</style>
          <text>Tom para Piano:\n${concertHeaderTonality.majorName}</text>
        </Text>
        <Text>
          <style>Composer</style>
          <text>${safePartName}</text>
        </Text>
      </VBox>`
          : '';

      staffBodiesXml.push(`    <Staff id="${xmlSid}">
      ${vboxXml}
      ${measuresXml.join('\n      ')}
    </Staff>`);
    }

    convertedParts.push({ partDefXml, staffBodiesXml });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <programVersion>3.6.2</programVersion>
  <Score>
    <Division>${globalDivisions * 480}</Division>
    <Style>
      <pageWidth>8.27</pageWidth>
      <pageHeight>11.69</pageHeight>
      <showFooter>1</showFooter>
      <footerFirstPage>1</footerFirstPage>
      <evenFooterR>Rubsax Partituras</evenFooterR>
      <oddFooterR>Rubsax Partituras</oddFooterR>
      <Spatium>1.75</Spatium>
    </Style>
    <metaTag name="copyright">Rubsax Partituras</metaTag>
    <metaTag name="workTitle">${escapeXmlText(title)}</metaTag>
${convertedParts.map((p) => p.partDefXml).join('\n')}
${convertedParts.flatMap((p) => p.staffBodiesXml).join('\n')}
  </Score>
</museScore>`;
}

/**
 * Descompacta .mscz ou .mxl (ou lê .mscx / .xml diretamente)
 */
export async function unpackScoreBuffer(
  buffer: ArrayBuffer | Uint8Array | Buffer,
  fileName: string,
  serverConvertedMscx?: string
): Promise<{
  mscxContent: string;
  mscxEntryName: string;
  fileFormat: 'mscz' | 'mscx' | 'xml' | 'mxl';
}> {
  const validation = validateUploadFileName(fileName);
  if (!validation.valid) {
    throw new Error(validation.error || UNSUPPORTED_FORMAT_MESSAGE);
  }

  const ext = validation.extension;
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (ext === '.mscz') {
    const zip = await JSZip.loadAsync(uint8);
    const entryNames = Object.keys(zip.files);
    const mscxEntryName = entryNames.find((n) => n.toLowerCase().endsWith('.mscx'));
    if (!mscxEntryName) {
      throw new Error(
        'O arquivo .mscz enviado está corrompido ou não contém uma partitura .mscx interna válida.'
      );
    }
    const mscxContent = await zip.file(mscxEntryName)!.async('string');
    return {
      mscxContent,
      mscxEntryName,
      fileFormat: 'mscz',
    };
  }

  if (ext === '.mxl') {
    if (serverConvertedMscx) {
      return {
        mscxContent: serverConvertedMscx,
        mscxEntryName: 'score.mscx',
        fileFormat: 'mxl',
      };
    }
    const zip = await JSZip.loadAsync(uint8);
    const entryNames = Object.keys(zip.files);
    const xmlEntryName = entryNames.find(
      (n) =>
        (n.toLowerCase().endsWith('.xml') || n.toLowerCase().endsWith('.musicxml')) &&
        !n.toLowerCase().includes('container.xml')
    );
    if (!xmlEntryName) {
      throw new Error('O arquivo .mxl enviado não contém um documento MusicXML válido.');
    }
    const xmlText = await zip.file(xmlEntryName)!.async('string');
    return {
      mscxContent: convertMusicXmlToMscxIfNeeded(xmlText),
      mscxEntryName: 'score.mscx',
      fileFormat: 'mxl',
    };
  }

  const rawText = new TextDecoder('utf-8').decode(uint8);
  if (ext === '.xml' || ext === '.musicxml') {
    const mscxContent = serverConvertedMscx || convertMusicXmlToMscxIfNeeded(rawText);
    return {
      mscxContent,
      mscxEntryName: 'score.mscx',
      fileFormat: 'xml',
    };
  }

  return {
    mscxContent: rawText,
    mscxEntryName: 'score.mscx',
    fileFormat: 'mscx',
  };
}

export function analyzeScoreXml(
  mscxContent: string,
  fileName = 'partitura.mscz',
  fileFormat: 'mscz' | 'mscx' | 'xml' | 'mxl' = 'mscz'
): ScoreAnalysis {
  const parser = new DOMParser();
  const doc = parser.parseFromString(mscxContent, 'text/xml');
  const scoreEls = doc.getElementsByTagName('Score');
  const scoreEl = scoreEls.item(0);
  if (!scoreEl) {
    throw new Error('Estrutura <Score> não encontrada no arquivo.');
  }

  const partEls = getDirectChildrenByTag(scoreEl, 'Part');
  const staffBodies = getDirectChildrenByTag(scoreEl, 'Staff');

  // Primeiro extrair VBox da pauta 1 para conhecer o Composer original
  const firstStaffBody = staffBodies[0];
  let titleText = '';
  let subtitleText = '';
  let composerText = '';
  let lyricistText = '';

  if (firstStaffBody) {
    const vboxes = getDirectChildrenByTag(firstStaffBody, 'VBox');
    for (const vbox of vboxes) {
      const textBlocks = getDirectChildrenByTag(vbox, 'Text');
      for (const tb of textBlocks) {
        const styleName = (
          getDirectChildText(tb, 'style') ||
          getDirectChildText(tb, 'tid') ||
          ''
        ).toLowerCase();
        const val = cleanMscxTextNode(getFirstDirectChildByTag(tb, 'text'));
        if (!val) continue;
        if (styleName === 'title' && !titleText) titleText = val;
        else if (styleName === 'subtitle' && !subtitleText) subtitleText = val;
        else if (styleName === 'composer' && !composerText) composerText = val;
        else if (
          (styleName === 'lyricist' ||
            styleName === 'poet' ||
            /tom\s*(para|p\/)?\s*piano/i.test(val)) &&
          !lyricistText
        ) {
          lyricistText = val;
        }
      }
    }
  }

  const metaTags = getDirectChildrenByTag(scoreEl, 'metaTag');
  for (const mt of metaTags) {
    const name = (mt.getAttribute('name') || '').toLowerCase();
    const val = (mt.textContent || '').trim();
    if (!val || val.toLowerCase() === 'x' || val.toLowerCase() === 'xxx') continue;
    if ((name === 'worktitle' || name === 'title') && !titleText) titleText = val;
    else if (name === 'subtitle' && !subtitleText) subtitleText = val;
    else if (name === 'composer' && !composerText) composerText = val;
    else if ((name === 'lyricist' || name === 'poet') && !lyricistText) lyricistText = val;
  }

  if (!titleText) {
    titleText = fileName.replace(/\.(mscz|mscx|xml|musicxml|mxl)$/i, '');
  }

  const stavesSummary: StaffSummary[] = [];
  let mainStaffId = '1';
  let origTransposeChromatic = 0;
  let origTransposeDiatonic = 0;
  let origClef: ClefType = 'G';
  let mainTrackName = '';
  let mainInstrumentId = '';
  let nextAutoStaffId = 1;

  if (partEls.length > 0) {
    partEls.forEach((partEl, pIdx) => {
      const trackName = getDirectChildText(partEl, 'trackName');
      const instrEl = getFirstDirectChildByTag(partEl, 'Instrument');
      const longName = instrEl
        ? cleanMscxTextNode(getFirstDirectChildByTag(instrEl, 'longName'))
        : '';
      const instrTrackName = instrEl ? getDirectChildText(instrEl, 'trackName') : '';
      const instrTagId = instrEl ? getDirectChildText(instrEl, 'instrumentId') : '';
      const instrAttrId = instrEl ? instrEl.getAttribute('id') || '' : '';
      const instrId = instrTagId || instrAttrId;
      const { transposeChromatic: tChrom, transposeDiatonic: tDiat } =
        readTransposeFromPartOrInstrument(partEl, instrEl);

      const isPerc = detectPercussionPart(partEl, trackName || instrTrackName, instrId);
      const transposeInfo = isPerc
        ? {
            fifthsOffset: 0,
            writtenSemitoneOffset: 0,
            transpositionLabel: 'Dó',
            isTransposing: false,
          }
        : computeStaffOffsetsFromTranspose(tChrom, tDiat);

      const partStaves = getDirectChildrenByTag(partEl, 'Staff');
      const xmlStaffIds: string[] = [];
      let partClef: ClefType = 'G';

      if (partStaves.length > 0) {
        partStaves.forEach((pStaff, sIdx) => {
          const sid = pStaff.getAttribute('id') || String(nextAutoStaffId);
          nextAutoStaffId++;
          xmlStaffIds.push(sid);
          if (sIdx === 0) {
            const defClefText = getDirectChildText(pStaff, 'defaultClef', 'G').toUpperCase();
            partClef = defClefText.startsWith('F') ? 'F' : 'G';
          }
        });
      } else {
        const sid = String(nextAutoStaffId);
        nextAutoStaffId++;
        xmlStaffIds.push(sid);
      }

      const primaryStaffId = xmlStaffIds[0] || String(pIdx + 1);
      const staffCount = xmlStaffIds.length;
      const isGrandStaff = staffCount >= 2;
      const isMain = pIdx === 0;

      const rawDisplayName =
        trackName || instrTrackName || longName || (isPerc ? 'Bateria' : `Parte ${pIdx + 1}`);
      const cleanName = cleanPartDisplayName(rawDisplayName) || `Parte ${pIdx + 1}`;
      const partSelectorLabel =
        staffCount === 2
          ? `${cleanName} (Pauta Dupla)`
          : staffCount > 2
          ? `${cleanName} (${staffCount} Pautas)`
          : cleanName;

      if (isMain) {
        mainStaffId = primaryStaffId;
        origTransposeChromatic = tChrom;
        origTransposeDiatonic = tDiat;
        origClef = partClef;
        mainTrackName = rawDisplayName;
        mainInstrumentId = instrId;
      }

      stavesSummary.push({
        staffId: primaryStaffId,
        xmlStaffIds,
        staffCount,
        isGrandStaff,
        partIndex: pIdx,
        trackName: rawDisplayName,
        displayName: cleanName,
        partSelectorLabel,
        headerInstrumentLabel: isMain ? composerText || cleanName : cleanName,
        instrumentId: instrId,
        isVisibleSolo: isMain,
        isPercussion: isPerc,
        transposeChromatic: tChrom,
        transposeDiatonic: tDiat,
        fifthsOffset: transposeInfo.fifthsOffset,
        writtenSemitoneOffset: transposeInfo.writtenSemitoneOffset,
        transpositionLabel: transposeInfo.transpositionLabel,
        isTransposing: transposeInfo.isTransposing,
        clef: partClef,
      });
    });
  } else {
    staffBodies.forEach((sb, idx) => {
      const sid = sb.getAttribute('id') || String(idx + 1);
      const isMain = idx === 0;
      const cleanName = `Pauta ${sid}`;
      if (isMain) {
        mainStaffId = sid;
      }
      stavesSummary.push({
        staffId: sid,
        xmlStaffIds: [sid],
        staffCount: 1,
        isGrandStaff: false,
        partIndex: idx,
        trackName: cleanName,
        displayName: cleanName,
        partSelectorLabel: cleanName,
        headerInstrumentLabel: isMain ? composerText || cleanName : cleanName,
        instrumentId: '',
        isVisibleSolo: isMain,
        isPercussion: false,
        transposeChromatic: 0,
        transposeDiatonic: 0,
        fifthsOffset: 0,
        writtenSemitoneOffset: 0,
        transpositionLabel: 'Dó',
        isTransposing: false,
        clef: 'G',
      });
    });
  }

  const mainStaffBody =
    staffBodies.find((s) => (s.getAttribute('id') || '1') === mainStaffId) || staffBodies[0];

  if (mainStaffBody) {
    const clefEls = mainStaffBody.getElementsByTagName('Clef');
    if (clefEls.length > 0) {
      const firstClef = clefEls.item(0)!;
      const cType =
        getDirectChildText(firstClef, 'concertClefType') ||
        getDirectChildText(firstClef, 'transposingClefType') ||
        '';
      if (cType.toUpperCase().startsWith('F')) {
        origClef = 'F';
      }
    }
  }

  const detectedInstrument = detectInitialInstrumentFromPart(
    mainTrackName,
    mainInstrumentId,
    composerText,
    origTransposeChromatic,
    origClef
  );

  // Atualizar displayName da 1ª parte com nome amigável caso trackName estivesse genérico
  if (stavesSummary[0]) {
    if (
      !stavesSummary[0].trackName ||
      stavesSummary[0].trackName === 'Pauta 1' ||
      stavesSummary[0].trackName === 'Parte 1'
    ) {
      stavesSummary[0].trackName = detectedInstrument.name;
      stavesSummary[0].displayName = detectedInstrument.name;
      stavesSummary[0].partSelectorLabel =
        stavesSummary[0].staffCount === 2
          ? `${detectedInstrument.name} (Pauta Dupla)`
          : stavesSummary[0].staffCount > 2
          ? `${detectedInstrument.name} (${stavesSummary[0].staffCount} Pautas)`
          : detectedInstrument.name;
    }
  }

  const getFirstMeasureKeyFifths = (staffBody: Element | undefined): number | null => {
    if (!staffBody) return null;
    const measures = getDirectChildrenByTag(staffBody, 'Measure');
    const firstMeasure = measures[0];
    if (!firstMeasure) {
      const keySigs = staffBody.getElementsByTagName('KeySig');
      if (keySigs.length > 0) {
        const accText = getDirectChildText(keySigs.item(0)!, 'accidental', '0');
        return normalizeKeySigFifths(parseInt(accText, 10) || 0);
      }
      return null;
    }
    const keySigsInFirst = firstMeasure.getElementsByTagName('KeySig');
    if (keySigsInFirst.length === 0) return 0;
    const accText = getDirectChildText(keySigsInFirst.item(0)!, 'accidental', '0');
    return normalizeKeySigFifths(parseInt(accText, 10) || 0);
  };

  const writtenKeyFifths = getFirstMeasureKeyFifths(mainStaffBody) ?? 0;

  const mainFifthsOffset =
    stavesSummary[0]?.fifthsOffset ?? detectedInstrument.fifthsOffset;
  let concertKeyFifths = normalizeKeySigFifths(writtenKeyFifths - mainFifthsOffset);

  const nonTransposingPart = stavesSummary.find((s) => !s.isPercussion && !s.isTransposing);
  if (nonTransposingPart) {
    const cStaffBody =
      staffBodies.find((sb) => (sb.getAttribute('id') || '') === nonTransposingPart.staffId) ||
      (staffBodies.length === 1 ? staffBodies[0] : undefined);
    const cFifths = getFirstMeasureKeyFifths(cStaffBody);
    if (cFifths !== null) {
      concertKeyFifths = cFifths;
    }
  }

  const concertTonality = getTonalityByFifths(concertKeyFifths);
  const writtenTonality = getTonalityByFifths(writtenKeyFifths);

  // Filtro inteligente descontinuado na v1.4: todas as partes permanecem disponíveis
  const hiddenDuplicateStaffIds: string[] = [];
  const visibleStavesSummary = stavesSummary;

  const styleEl = getFirstDirectChildByTag(scoreEl, 'Style');
  const rawSpatium = styleEl
    ? getDirectChildText(styleEl, 'Spatium') || getDirectChildText(styleEl, 'spatium')
    : '';
  const parsedSpatium = parseFloat(rawSpatium);
  const originalSpatium = parsedSpatium > 0 ? parsedSpatium : 1.75;

  let measureCount = 0;
  let noteCount = 0;
  let chordCount = 0;
  let lyricCount = 0;
  const sampleChords: string[] = [];
  const concertPitches: number[] = [];
  const lineBreakSetFound = new Set<number>();
  const pageBreakSetFound = new Set<number>();

  staffBodies.forEach((sb, idx) => {
    const measures = getDirectChildrenByTag(sb, 'Measure');
    if (measures.length > measureCount) {
      measureCount = measures.length;
    }

    measures.forEach((mEl, mIdx) => {
      const breaks = getDirectChildrenByTag(mEl, 'LayoutBreak');
      for (const lb of breaks) {
        const sub = getDirectChildText(lb, 'subtype').toLowerCase();
        if (sub === 'line') lineBreakSetFound.add(mIdx + 1);
        if (sub === 'page') pageBreakSetFound.add(mIdx + 1);
      }
    });

    if (idx === 0 || sb === mainStaffBody) {
      const notes = sb.getElementsByTagName('Note');
      if (notes.length > noteCount) {
        noteCount = notes.length;
        concertPitches.length = 0;
        for (let i = 0; i < notes.length; i++) {
          const nEl = notes.item(i)!;
          const pVal = parseInt(getDirectChildText(nEl, 'pitch', '60'), 10);
          if (!Number.isNaN(pVal)) {
            concertPitches.push(pVal);
          }
        }
      }
    }

    const harmonies = sb.getElementsByTagName('Harmony');
    chordCount += harmonies.length;
    for (let i = 0; i < harmonies.length; i++) {
      const hEl = harmonies.item(i)!;
      const rootTpc = parseInt(getDirectChildText(hEl, 'root', '14'), 10);
      const nameStr = getDirectChildText(hEl, 'name', '');
      const baseStr = getDirectChildText(hEl, 'base', '');
      const baseTpc = baseStr ? parseInt(baseStr, 10) : null;
      if (!Number.isNaN(rootTpc)) {
        const fullChord = formatHarmonyElementSymbol(rootTpc, nameStr, baseTpc);
        if (!sampleChords.includes(fullChord)) {
          sampleChords.push(fullChord);
        }
      }
    }

    const lyrics = sb.getElementsByTagName('Lyrics');
    lyricCount += lyrics.length;
  });

  const initialLineBreakMeasures = Array.from(lineBreakSetFound).sort((a, b) => a - b);
  const initialPageBreakMeasures = Array.from(pageBreakSetFound).sort((a, b) => a - b);

  let medianConcertPitch = 65;
  if (concertPitches.length > 0) {
    const sorted = [...concertPitches].sort((a, b) => a - b);
    medianConcertPitch = sorted[Math.floor(sorted.length / 2)];
  }

  const hasAnyTransposingPart = stavesSummary.some((s) => s.isTransposing);

  const defaultLyricistText =
    lyricistText || `Tom para Piano:\n${concertTonality.majorName}`;
  const defaultComposerText =
    composerText || stavesSummary[0]?.headerInstrumentLabel || detectedInstrument.headerInstrumentText;

  return {
    fileName,
    fileFormat,
    detectedInstrumentId: detectedInstrument.id,
    detectedInstrumentName: stavesSummary[0]?.displayName || detectedInstrument.name,
    detectedGroupId: detectedInstrument.groupId,
    originalTransposeChromatic: origTransposeChromatic,
    originalTransposeDiatonic: origTransposeDiatonic,
    originalClef: origClef,
    originalConcertKeyFifths: concertKeyFifths,
    originalConcertPitchClass: concertTonality.pitchClass,
    originalConcertTonality: concertTonality,
    originalWrittenKeyFifths: writtenKeyFifths,
    originalWrittenTonality: writtenTonality,
    originalMedianConcertPitch: medianConcertPitch,
    measureCount,
    noteCount,
    chordCount,
    lyricCount,
    hasChords: chordCount > 0,
    hasLyrics: lyricCount > 0,
    sampleChords,
    needsBbEbChordPrompt: (hasAnyTransposingPart || mainFifthsOffset !== 0) && chordCount > 0,
    headers: {
      showAllHeaders: true,
      title: {
        text: titleText,
        visible: true,
        removed: false,
      },
      subtitle: {
        text: subtitleText,
        visible: Boolean(subtitleText),
        removed: false,
      },
      composer: {
        text: defaultComposerText,
        visible: true,
        removed: false,
        autoSyncInstrument: true,
      },
      lyricist: {
        text: defaultLyricistText,
        visible: true,
        removed: false,
        autoSyncPianoKey: true,
      },
    },
    staves: visibleStavesSummary,
    hiddenDuplicateStaffIds,
    watermarkText: 'Rubsax Partituras',
    originalSpatium,
    initialLineBreakMeasures,
    initialPageBreakMeasures,
  };
}

export function transformScoreXml(
  originalMscxContent: string,
  analysis: ScoreAnalysis,
  options: ScoreTransformOptions
): TransformResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(originalMscxContent, 'text/xml');
  if (doc.documentElement && doc.documentElement.tagName === 'museScore') {
    // Normaliza versão para 3.01 garantindo leitura tanto no MuseScore 3.2.3 (Linux) quanto 3.6.2 (Windows)
    doc.documentElement.setAttribute('version', '3.01');
  }
  const scoreEls = doc.getElementsByTagName('Score');
  const scoreEl = scoreEls.item(0);
  if (!scoreEl) {
    throw new Error('Elemento <Score> inválido.');
  }

  const targetInstrument = getInstrumentById(
    options.targetInstrumentId || analysis.detectedInstrumentId
  );
  const semitoneShift = options.semitoneShift;
  const viewMode: ScoreLayoutViewMode = options.viewMode || 'portrait';
  const isFullScore = viewMode === 'full-score';

  // Determinar partes selecionadas (agrupando pautas duplas pertencentes à mesma <Part>)
  const rawSelectedIds = isFullScore
    ? analysis.staves.map((s) => s.staffId)
    : options.selectedStaffIds && options.selectedStaffIds.length > 0
    ? options.selectedStaffIds
    : [options.selectedStaffId || analysis.staves[0]?.staffId || '1'];

  const activeStavesList = analysis.staves.filter(
    (s) =>
      rawSelectedIds.includes(s.staffId) ||
      (Array.isArray(s.xmlStaffIds) && s.xmlStaffIds.some((xid) => rawSelectedIds.includes(xid)))
  );
  if (activeStavesList.length === 0 && analysis.staves[0]) {
    activeStavesList.push(analysis.staves[0]);
  }

  const activeXmlStaffIdsSet = new Set(
    activeStavesList.flatMap((s) =>
      Array.isArray(s.xmlStaffIds) && s.xmlStaffIds.length > 0 ? s.xmlStaffIds : [s.staffId]
    )
  );
  const multipleInstrumentsActive = activeStavesList.length > 1;

  // Identificar parte primária de referência
  const activeStaff: StaffSummary =
    activeStavesList[0] ||
    analysis.staves[0] || {
      staffId: '1',
      xmlStaffIds: ['1'],
      staffCount: 1,
      isGrandStaff: false,
      partIndex: 0,
      trackName: targetInstrument.name,
      displayName: targetInstrument.name,
      partSelectorLabel: targetInstrument.name,
      headerInstrumentLabel: targetInstrument.headerInstrumentText,
      instrumentId: targetInstrument.musescoreInstrumentId,
      isVisibleSolo: true,
      isPercussion: false,
      transposeChromatic: analysis.originalTransposeChromatic,
      transposeDiatonic: analysis.originalTransposeDiatonic,
      fifthsOffset: targetInstrument.fifthsOffset,
      writtenSemitoneOffset: targetInstrument.writtenSemitoneOffset,
      transpositionLabel:
        targetInstrument.fifthsOffset === 2
          ? 'Sib'
          : targetInstrument.fifthsOffset === 3
          ? 'Mib'
          : 'Dó',
      isTransposing: targetInstrument.writtenSemitoneOffset !== 0,
      clef: analysis.originalClef,
    };

  // 1. Calcular nova Tonalidade Base (Piano / Dó) e Tonalidade Escrita na Parte Ativa
  const newConcertPc =
    ((analysis.originalConcertPitchClass + semitoneShift) % 12 + 12) % 12;
  const concertTonality = getTonalityByPitchClass(newConcertPc);
  const newConcertKeyFifths = concertTonality.fifths;

  const activeWrittenPc =
    ((newConcertPc + activeStaff.writtenSemitoneOffset) % 12 + 12) % 12;
  const writtenTonality = getTonalityByPitchClass(activeWrittenPc);

  // 2. Garantir layoutMode paginado (removendo line/system para renderização limpa)
  removeDirectChildrenByTag(scoreEl, 'layoutMode');

  // 3. Configurar <Style>: Dimensões A4, Escala Vetorial, Nomes na Grade e Marca d'Água
  let styleEl = getFirstDirectChildByTag(scoreEl, 'Style');
  if (!styleEl) {
    styleEl = doc.createElement('Style');
    scoreEl.insertBefore(styleEl, scoreEl.firstChild);
  }

  setOrCreateDirectChildText(doc, styleEl, 'pageWidth', '8.27');
  setOrCreateDirectChildText(doc, styleEl, 'pageHeight', '11.69');
  setOrCreateDirectChildText(doc, styleEl, 'pagePrintableWidth', '7.09');

  setOrCreateDirectChildText(doc, styleEl, 'showFooter', '1');
  setOrCreateDirectChildText(doc, styleEl, 'footerFirstPage', '1');

  if (multipleInstrumentsActive) {
    setOrCreateDirectChildText(doc, styleEl, 'hideInstrumentNameIfOneInstrument', '0');
  }

  setOrCreateDirectChildText(doc, styleEl, 'oddFooterR', 'Rubsax Partituras');
  setOrCreateDirectChildText(doc, styleEl, 'evenFooterR', 'Rubsax Partituras');
  setOrCreateDirectChildText(doc, styleEl, 'oddFooterC', '© Rubsax Partituras');
  setOrCreateDirectChildText(doc, styleEl, 'evenFooterC', '© Rubsax Partituras');

  // Escala vetorial da pauta (<Spatium>) mantendo textos do cabeçalho em pontos fixos
  const scaleRatio = Math.max(0.5, Math.min(1.5, (options.staffScalePercent ?? 100) / 100));
  const baseSpatium = analysis.originalSpatium || 1.75;
  const effectiveSpatium = Number((baseSpatium * scaleRatio).toFixed(5));

  removeDirectChildrenByTag(styleEl, 'spatium');
  setOrCreateDirectChildText(doc, styleEl, 'Spatium', String(effectiveSpatium));
  setOrCreateDirectChildText(doc, styleEl, 'titleFontSpatiumDependent', '0');
  setOrCreateDirectChildText(doc, styleEl, 'subTitleFontSpatiumDependent', '0');
  setOrCreateDirectChildText(doc, styleEl, 'composerFontSpatiumDependent', '0');
  setOrCreateDirectChildText(doc, styleEl, 'lyricistFontSpatiumDependent', '0');
  setOrCreateDirectChildText(doc, styleEl, 'poetFontSpatiumDependent', '0');

  const spatiumMm = effectiveSpatium;
  const pageWidthIn =
    parseFloat(getDirectChildText(styleEl, 'pageWidth', '8.27')) || 8.27;
  const pageHeightIn =
    parseFloat(getDirectChildText(styleEl, 'pageHeight', '11.69')) || 11.69;
  const pageWidthMm = pageWidthIn * 25.4;
  const pageHeightMm = pageHeightIn * 25.4;

  const oddLeftMarginInStr = getDirectChildText(styleEl, 'pageOddLeftMargin', '');
  const printableWidthInStr = getDirectChildText(styleEl, 'pagePrintableWidth', '');
  const leftMarginMm = oddLeftMarginInStr
    ? parseFloat(oddLeftMarginInStr) * 25.4
    : printableWidthInStr
    ? Math.max(8, (pageWidthMm - parseFloat(printableWidthInStr) * 25.4) / 2)
    : 15.0;

  const oddTopMarginInStr = getDirectChildText(styleEl, 'pageOddTopMargin', '');
  const topMarginMm = oddTopMarginInStr ? parseFloat(oddTopMarginInStr) * 25.4 : 12.7;

  const metaTags = getDirectChildrenByTag(scoreEl, 'metaTag');
  let foundCopyrightMeta = false;
  for (const mt of metaTags) {
    if ((mt.getAttribute('name') || '').toLowerCase() === 'copyright') {
      while (mt.firstChild) mt.removeChild(mt.firstChild);
      mt.appendChild(doc.createTextNode('Rubsax Partituras'));
      foundCopyrightMeta = true;
    }
  }
  if (!foundCopyrightMeta) {
    const cMeta = doc.createElement('metaTag');
    cMeta.setAttribute('name', 'copyright');
    cMeta.appendChild(doc.createTextNode('Rubsax Partituras'));
    scoreEl.appendChild(cMeta);
  }

  // 4. Configurar visibilidade dos <Part>s conforme as partes selecionadas ou Grade Completa
  const partEls = getDirectChildrenByTag(scoreEl, 'Part');
  let fallbackStaffCounter = 1;
  partEls.forEach((partEl) => {
    const partStaffEls = getDirectChildrenByTag(partEl, 'Staff');
    const partStaffIds = partStaffEls.map((ps) => {
      const id = ps.getAttribute('id') || String(fallbackStaffCounter);
      fallbackStaffCounter++;
      return id;
    });
    const hasAnyActiveStaff = partStaffIds.some((id) => activeXmlStaffIdsSet.has(id));

    if (hasAnyActiveStaff) {
      removeDirectChildrenByTag(partEl, 'show');
      partStaffEls.forEach((ps, i) => {
        const psId = partStaffIds[i];
        if (activeXmlStaffIdsSet.has(psId)) {
          removeDirectChildrenByTag(ps, 'invisible');
          removeDirectChildrenByTag(ps, 'visible');
        } else {
          setOrCreateDirectChildText(doc, ps, 'invisible', '1');
        }
      });

      if (multipleInstrumentsActive) {
        const instrEl = getFirstDirectChildByTag(partEl, 'Instrument');
        const tName = getDirectChildText(partEl, 'trackName');
        if (instrEl && tName && !getFirstDirectChildByTag(instrEl, 'longName')) {
          setOrCreateDirectChildText(doc, instrEl, 'longName', tName, 'trackName');
        }
      }
    } else {
      setOrCreateDirectChildText(doc, partEl, 'show', '0');
    }
  });

  // 5. Garantir que o <VBox> de cabeçalho esteja sempre atualizado na pauta 1 (<Staff id="1">),
  // pois o MuseScore 3 renderiza os frames de cabeçalho a partir dela mesmo ao isolar pautas internas.
  const staffBodies = getDirectChildrenByTag(scoreEl, 'Staff');
  const firstStaffBody = staffBodies[0];

  if (firstStaffBody && getDirectChildrenByTag(firstStaffBody, 'VBox').length === 0) {
    for (let i = 1; i < staffBodies.length; i++) {
      const secVBoxes = getDirectChildrenByTag(staffBodies[i], 'VBox');
      if (secVBoxes.length > 0) {
        const cloned = secVBoxes[0].cloneNode(true) as Element;
        const firstMeasure = getFirstDirectChildByTag(firstStaffBody, 'Measure');
        if (firstMeasure) {
          firstStaffBody.insertBefore(cloned, firstMeasure);
        } else {
          firstStaffBody.appendChild(cloned);
        }
        break;
      }
    }
  }

  for (let i = 1; i < staffBodies.length; i++) {
    removeDirectChildrenByTag(staffBodies[i], 'VBox');
  }

  // Atualizar cabeçalhos e injetar Caixas de Texto Flutuantes no VBox principal
  if (firstStaffBody) {
    const allPartsSelected =
      analysis.staves.length > 1 &&
      activeStavesList.length === analysis.staves.length;

    const headerLabelForActiveMode =
      isFullScore || allPartsSelected
        ? 'Grade Completa'
        : multipleInstrumentsActive
        ? activeStavesList.map((s) => s.displayName).join(' + ')
        : activeStaff.headerInstrumentLabel;

    updateStaffHeadersAndFloatingTexts(
      doc,
      firstStaffBody,
      options.headers,
      concertTonality,
      headerLabelForActiveMode,
      options.floatingTexts || [],
      pageWidthMm,
      pageHeightMm,
      leftMarginMm,
      topMarginMm,
      spatiumMm
    );
  }

  // 6. Processar cada <Staff> dentro de <Score> (Quebras de Sistema/Página, Transposição, Oitava, Cifras e Letras)
  const clampedOctaveShift = Math.max(-2, Math.min(2, Math.round(options.octaveShift || 0)));
  const activePartOctave = options.octaveShiftsByPart
    ? Math.max(-2, Math.min(2, Math.round(options.octaveShiftsByPart[activeStaff.staffId] ?? 0)))
    : multipleInstrumentsActive
    ? 0
    : clampedOctaveShift;
  const manualOctaveSemitones = activePartOctave * 12;

  const previewChords: string[] = [];
  const chordOccurrences: ChordOccurrence[] = [];
  const hasExplicitLineBreaks = options.lineBreakMeasures !== undefined;
  const lineBreakSet = hasExplicitLineBreaks ? new Set(options.lineBreakMeasures) : null;
  const hasExplicitPageBreaks = options.pageBreakMeasures !== undefined;
  const pageBreakSet = hasExplicitPageBreaks ? new Set(options.pageBreakMeasures) : null;

  // Bloqueia conversão global para tom escrito quando houver mistura de afinações na tela
  const pitchedActiveParts = activeStavesList.filter((s) => !s.isPercussion);
  const uniqueWrittenOffsets = new Set(
    pitchedActiveParts.map((s) => s.writtenSemitoneOffset)
  );
  const allowGlobalWrittenChords =
    uniqueWrittenOffsets.size === 1 &&
    pitchedActiveParts.some((s) => s.isTransposing);

  staffBodies.forEach((staffBody, sIdx) => {
    const sid = staffBody.getAttribute('id') || String(sIdx + 1);
    const staffMeta =
      analysis.staves.find(
        (st) =>
          st.staffId === sid ||
          (Array.isArray(st.xmlStaffIds) && st.xmlStaffIds.includes(sid))
      ) || analysis.staves[sIdx];
    const isThisStaffActive = activeXmlStaffIdsSet.has(sid);
    const isPercussion = staffMeta ? staffMeta.isPercussion : false;
    const staffFifthsOffset = staffMeta ? staffMeta.fifthsOffset : 0;
    const staffWrittenSemitoneOffset = staffMeta ? staffMeta.writtenSemitoneOffset : 0;
    const staffTransposeChromatic = staffMeta ? staffMeta.transposeChromatic : 0;

    if (isThisStaffActive) {
      removeDirectChildrenByTag(staffBody, 'visible');
    } else {
      setOrCreateDirectChildText(doc, staffBody, 'visible', '0', 'Measure');
    }

    const staffMeasures = getDirectChildrenByTag(staffBody, 'Measure');

    // Atualizar <LayoutBreak> de linha (compasso) e página em todos os compassos desta pauta
    if (lineBreakSet || pageBreakSet) {
      staffMeasures.forEach((mEl, mIdx) => {
        const mNum = mIdx + 1;
        const existingBreaks = getDirectChildrenByTag(mEl, 'LayoutBreak');
        for (const lb of existingBreaks) {
          const subtype = getDirectChildText(lb, 'subtype').toLowerCase();
          if (lineBreakSet && subtype === 'line') {
            mEl.removeChild(lb);
          } else if (pageBreakSet && subtype === 'page') {
            mEl.removeChild(lb);
          }
        }
        const insertBreak = (subtype: 'line' | 'page') => {
          const lbEl = doc.createElement('LayoutBreak');
          setOrCreateDirectChildText(doc, lbEl, 'subtype', subtype);
          const firstVoice = getFirstDirectChildByTag(mEl, 'voice');
          if (firstVoice) {
            mEl.insertBefore(lbEl, firstVoice);
          } else {
            mEl.appendChild(lbEl);
          }
        };
        if (lineBreakSet && lineBreakSet.has(mNum)) {
          insertBreak('line');
        }
        if (pageBreakSet && pageBreakSet.has(mNum)) {
          insertBreak('page');
        }
      });
    }

    // Ignorar transposição de alturas e armadura em pautas de Percussão / Bateria
    if (isPercussion) {
      const percHarmonies = staffBody.getElementsByTagName('Harmony');
      for (let i = 0; i < percHarmonies.length; i++) {
        removeDirectChildrenByTag(percHarmonies.item(i)!, 'play');
      }
      return;
    }

    // Calcular nova armadura escrita para esta pauta específica
    const staffWrittenPc =
      ((newConcertPc + staffWrittenSemitoneOffset) % 12 + 12) % 12;
    const staffWrittenTonality = getTonalityByPitchClass(staffWrittenPc);
    const targetStaffKeyFifths = staffWrittenTonality.fifths;

    const origStaffKeyFifths = normalizeKeySigFifths(
      analysis.originalConcertKeyFifths + staffFifthsOffset
    );
    const fifthsDeltaForModulations = targetStaffKeyFifths - origStaffKeyFifths;

    // 6a. Atualizar armaduras de clave (<KeySig>) — inclusive criando no 1º compasso caso estivesse em Dó sem tag <KeySig>
    const firstMeasure = staffMeasures[0];
    const existingFirstKeySigs = firstMeasure
      ? Array.from(firstMeasure.getElementsByTagName('KeySig'))
      : [];
    const preExistingKeySigs = Array.from(staffBody.getElementsByTagName('KeySig'));
    for (const ksNode of preExistingKeySigs) {
      const isFirstMeasureKs = existingFirstKeySigs.includes(ksNode);
      const oldAcc = parseInt(getDirectChildText(ksNode, 'accidental', '0'), 10) || 0;
      const newAcc = isFirstMeasureKs
        ? targetStaffKeyFifths
        : normalizeKeySigFifths(oldAcc + fifthsDeltaForModulations);
      setOrCreateDirectChildText(doc, ksNode, 'accidental', String(newAcc));
    }
    if (existingFirstKeySigs.length === 0 && firstMeasure && targetStaffKeyFifths !== 0) {
      const voiceEl = getFirstDirectChildByTag(firstMeasure, 'voice');
      if (voiceEl) {
        const ksEl = doc.createElement('KeySig');
        setOrCreateDirectChildText(doc, ksEl, 'accidental', String(targetStaffKeyFifths));
        const clefChild = getFirstDirectChildByTag(voiceEl, 'Clef');
        const timeChild = getFirstDirectChildByTag(voiceEl, 'TimeSig');
        if (clefChild && clefChild.nextSibling) {
          voiceEl.insertBefore(ksEl, clefChild.nextSibling);
        } else if (timeChild) {
          voiceEl.insertBefore(ksEl, timeChild);
        } else if (voiceEl.firstChild) {
          voiceEl.insertBefore(ksEl, voiceEl.firstChild);
        } else {
          voiceEl.appendChild(ksEl);
        }
      }
    }

    // 6b. Transpor todas as notas (<Note>) da pauta com regra estrita de acidentes simples (# ou b) e oitava isolada por parte
    let partOctaveForThisStaff = 0;
    if (staffMeta) {
      if (options.octaveShiftsByPart) {
        partOctaveForThisStaff = Math.max(
          -2,
          Math.min(2, Math.round(options.octaveShiftsByPart[staffMeta.staffId] ?? 0))
        );
      } else if (!multipleInstrumentsActive && staffMeta.staffId === activeStaff.staffId) {
        partOctaveForThisStaff = clampedOctaveShift;
      }
    }
    const staffPitchDelta = semitoneShift + partOctaveForThisStaff * 12;

    const noteNodes = staffBody.getElementsByTagName('Note');
    for (let i = 0; i < noteNodes.length; i++) {
      const noteNode = noteNodes.item(i)!;
      const origPitch = parseInt(getDirectChildText(noteNode, 'pitch', '60'), 10);
      const origTpc = parseInt(getDirectChildText(noteNode, 'tpc', '14'), 10);
      if (Number.isNaN(origPitch)) continue;

      let newConcertPitch = origPitch + staffPitchDelta;
      while (newConcertPitch < 12) newConcertPitch += 12;
      while (newConcertPitch > 115) newConcertPitch -= 12;

      const preferFlat = origTpc <= 12;
      const newConcertNotePc = ((newConcertPitch % 12) + 12) % 12;
      const newConcertTpc = pitchClassToSimpleTpc(
        newConcertNotePc,
        newConcertKeyFifths,
        preferFlat
      );

      setOrCreateDirectChildText(doc, noteNode, 'pitch', String(newConcertPitch));
      setOrCreateDirectChildText(doc, noteNode, 'tpc', String(newConcertTpc));

      if (staffTransposeChromatic !== 0) {
        const newWrittenPitch = newConcertPitch - staffTransposeChromatic;
        const newWrittenNotePc = ((newWrittenPitch % 12) + 12) % 12;
        const newWrittenTpc = pitchClassToSimpleTpc(
          newWrittenNotePc,
          targetStaffKeyFifths,
          preferFlat
        );
        setOrCreateDirectChildText(doc, noteNode, 'tpc2', String(newWrittenTpc));
      } else {
        removeDirectChildrenByTag(noteNode, 'tpc2');
      }

      removeDirectChildrenByTag(noteNode, 'Accidental');
    }

    // 6c. Processar Cifras (<Harmony>) e Edições de Cifras Existentes em todas as pautas
    const shouldTransposeVisibleChordsToInstrument = Boolean(
      allowGlobalWrittenChords &&
        staffMeta?.isTransposing &&
        options.convertBbEbChordsToWritten
    );

    const chordSemitoneDelta =
      semitoneShift +
      (shouldTransposeVisibleChordsToInstrument ? staffWrittenSemitoneOffset : 0);
    const chordKeyFifths = shouldTransposeVisibleChordsToInstrument
      ? targetStaffKeyFifths
      : newConcertKeyFifths;

    let staffHarmonyIdx = 0;
    staffMeasures.forEach((mEl, mIdx) => {
      const mHarmonies = Array.from(mEl.getElementsByTagName('Harmony'));
      for (const hNode of mHarmonies) {
        if (!options.showChords && isThisStaffActive) {
          if (hNode.parentNode) {
            hNode.parentNode.removeChild(hNode);
          }
          continue;
        }

        const rootText = getDirectChildText(hNode, 'root');
        if (rootText) {
          const origRootTpc = parseInt(rootText, 10);
          if (!Number.isNaN(origRootTpc)) {
            const origRootPc = tpcToPitchClass(origRootTpc);
            const newRootPc = ((origRootPc + chordSemitoneDelta) % 12 + 12) % 12;
            let finalRootTpc = pitchClassToSimpleTpc(
              newRootPc,
              chordKeyFifths,
              origRootTpc <= 12
            );

            let finalName = getDirectChildText(hNode, 'name', '');
            const baseText = getDirectChildText(hNode, 'base');
            let finalBaseTpc: number | null = null;

            if (baseText) {
              const origBaseTpc = parseInt(baseText, 10);
              if (!Number.isNaN(origBaseTpc)) {
                const origBasePc = tpcToPitchClass(origBaseTpc);
                const newBasePc = ((origBasePc + chordSemitoneDelta) % 12 + 12) % 12;
                finalBaseTpc = pitchClassToSimpleTpc(
                  newBasePc,
                  chordKeyFifths,
                  origBaseTpc <= 12
                );
              }
            }

            const autoTransposedSymbol = formatHarmonyElementSymbol(
              finalRootTpc,
              finalName,
              finalBaseTpc
            );

            const occKey = `#${sid}:${staffHarmonyIdx}`;
            const legacyOccKey = `#${staffHarmonyIdx}`;
            const overrideByOccurrence =
              options.chordOverrides?.[occKey] ??
              (sid === activeStaff.staffId ? options.chordOverrides?.[legacyOccKey] : undefined);
            const overrideBySymbol = options.chordOverrides?.[autoTransposedSymbol];
            const chosenOverride = overrideByOccurrence || overrideBySymbol;

            if (chosenOverride) {
              const parsed = parseChordStringToHarmonyParts(chosenOverride);
              if (parsed) {
                finalRootTpc = parsed.rootTpc;
                finalName = parsed.name;
                finalBaseTpc = parsed.baseTpc;
              }
            }

            setOrCreateDirectChildText(doc, hNode, 'root', String(finalRootTpc));
            if (finalName) {
              setOrCreateDirectChildText(doc, hNode, 'name', finalName);
            } else {
              removeDirectChildrenByTag(hNode, 'name');
            }

            if (finalBaseTpc !== null) {
              setOrCreateDirectChildText(doc, hNode, 'base', String(finalBaseTpc));
            } else {
              removeDirectChildrenByTag(hNode, 'base');
            }

            const finalDisplaySymbol = formatHarmonyElementSymbol(
              finalRootTpc,
              finalName,
              finalBaseTpc
            );

            if (isThisStaffActive) {
              if (!previewChords.includes(finalDisplaySymbol)) {
                previewChords.push(finalDisplaySymbol);
              }
              chordOccurrences.push({
                occurrenceIndex: staffHarmonyIdx,
                occurrenceKey: occKey,
                staffId: sid,
                measureNumber: mIdx + 1,
                originalSymbol: autoTransposedSymbol,
                currentSymbol: finalDisplaySymbol,
              });
            }

            staffHarmonyIdx++;
          }
        }

        if (sIdx === 0) {
          setOrCreateDirectChildText(doc, hNode, 'play', '0');
        } else {
          removeDirectChildrenByTag(hNode, 'play');
        }
      }
    });

    // 6d. Processar Letras (<Lyrics>) e Textos de Pauta (<StaffText>), preservando <SystemText> e cabeçalho <VBox>
    if (!options.showLyrics && isThisStaffActive) {
      const lyricNodes = Array.from(staffBody.getElementsByTagName('Lyrics'));
      for (const lNode of lyricNodes) {
        if (lNode.parentNode) {
          lNode.parentNode.removeChild(lNode);
        }
      }

      const staffTextNodes = Array.from(staffBody.getElementsByTagName('StaffText'));
      for (const stNode of staffTextNodes) {
        if (stNode.parentNode) {
          stNode.parentNode.removeChild(stNode);
        }
      }
    }
  });

  const serializer = new XMLSerializer();
  const modifiedMscx = serializer.serializeToString(doc);

  return {
    modifiedMscx,
    concertTonality,
    writtenTonality,
    activeStaff,
    targetInstrument,
    appliedSemitoneShift: semitoneShift,
    appliedAutoOctaveSemitones: 0,
    appliedManualOctaveSemitones: manualOctaveSemitones,
    previewChords,
    chordOccurrences,
  };
}

function updateStaffHeadersAndFloatingTexts(
  doc: Document,
  staffBody: Element,
  headers: ScoreHeadersState,
  concertTonality: TonalityDefinition,
  activeInstrumentHeaderLabel: string,
  floatingTexts: FloatingTextBox[],
  pageWidthMm: number,
  pageHeightMm: number,
  leftMarginMm: number,
  topMarginMm: number,
  spatiumMm: number
): void {
  const vboxes = getDirectChildrenByTag(staffBody, 'VBox');
  if (!headers.showAllHeaders && floatingTexts.length === 0) {
    for (const vbox of vboxes) {
      if (vbox.parentNode) {
        vbox.parentNode.removeChild(vbox);
      }
    }
    return;
  }

  let vbox = vboxes[0];
  if (!vbox) {
    vbox = doc.createElement('VBox');
    setOrCreateDirectChildText(doc, vbox, 'height', '7');
    const firstMeasure = getFirstDirectChildByTag(staffBody, 'Measure');
    if (firstMeasure) {
      staffBody.insertBefore(vbox, firstMeasure);
    } else {
      staffBody.appendChild(vbox);
    }
  }

  // Remover textos flutuantes injetados anteriormente
  const existingTexts = getDirectChildrenByTag(vbox, 'Text');
  for (const tb of existingTexts) {
    if (tb.getAttribute('data-floating') === '1') {
      vbox.removeChild(tb);
    }
  }

  if (!headers.showAllHeaders) {
    for (const tb of getDirectChildrenByTag(vbox, 'Text')) {
      vbox.removeChild(tb);
    }
  } else {
    const effectiveLyricistText = headers.lyricist.autoSyncPianoKey
      ? `Tom para Piano:\n${concertTonality.majorName}`
      : headers.lyricist.text;

    const effectiveComposerText = headers.composer.autoSyncInstrument
      ? activeInstrumentHeaderLabel
      : headers.composer.text;

    const fieldMap: Record<
      'title' | 'subtitle' | 'composer' | 'lyricist',
      { styleLabel: string; text: string; visible: boolean; removed: boolean }
    > = {
      title: {
        styleLabel: 'Title',
        text: headers.title.text,
        visible: headers.title.visible,
        removed: headers.title.removed,
      },
      subtitle: {
        styleLabel: 'Subtitle',
        text: headers.subtitle.text,
        visible: headers.subtitle.visible,
        removed: headers.subtitle.removed,
      },
      composer: {
        styleLabel: 'Composer',
        text: effectiveComposerText,
        visible: headers.composer.visible,
        removed: headers.composer.removed,
      },
      lyricist: {
        styleLabel: 'Lyricist',
        text: effectiveLyricistText,
        visible: headers.lyricist.visible,
        removed: headers.lyricist.removed,
      },
    };

    const currentTextEls = getDirectChildrenByTag(vbox, 'Text');
    const handledKeys = new Set<string>();

    for (const tb of currentTextEls) {
      const rawStyle = (
        getDirectChildText(tb, 'style') ||
        getDirectChildText(tb, 'tid') ||
        ''
      ).toLowerCase();
      const currentTextVal = cleanMscxTextNode(getFirstDirectChildByTag(tb, 'text'));

      let key: 'title' | 'subtitle' | 'composer' | 'lyricist' | null = null;
      if (rawStyle === 'title') key = 'title';
      else if (rawStyle === 'subtitle') key = 'subtitle';
      else if (rawStyle === 'composer') key = 'composer';
      else if (
        rawStyle === 'lyricist' ||
        rawStyle === 'poet' ||
        /tom\s*(para|p\/)?\s*piano/i.test(currentTextVal)
      ) {
        key = 'lyricist';
      }

      if (!key || handledKeys.has(key)) continue;
      handledKeys.add(key);
      const cfg = fieldMap[key];

      if (cfg.removed || !cfg.visible || !cfg.text.trim()) {
        vbox.removeChild(tb);
      } else {
        let textNode = getFirstDirectChildByTag(tb, 'text');
        if (!textNode) {
          textNode = doc.createElement('text');
          tb.appendChild(textNode);
        }
        updateMscxTextPreservingFontTags(doc, textNode, cfg.text);
      }
    }

    (['title', 'subtitle', 'composer', 'lyricist'] as const).forEach((key) => {
      if (handledKeys.has(key)) return;
      const cfg = fieldMap[key];
      if (cfg.removed || !cfg.visible || !cfg.text.trim()) return;

      const tb = doc.createElement('Text');
      setOrCreateDirectChildText(doc, tb, 'style', cfg.styleLabel);
      const textNode = doc.createElement('text');
      textNode.appendChild(doc.createTextNode(cfg.text));
      tb.appendChild(textNode);
      vbox!.appendChild(tb);
    });
  }

  // Garantir <boxAutoSize>0</boxAutoSize> quando houver textos flutuantes para não empurrar as pautas para baixo
  if (floatingTexts.length > 0) {
    setOrCreateDirectChildText(doc, vbox, 'boxAutoSize', '0');
  }

  const vboxHeightSp = parseFloat(getDirectChildText(vbox, 'height', '7')) || 7;
  const anchorXmm = leftMarginMm;
  const anchorYmm = topMarginMm + vboxHeightSp * spatiumMm - 0.3;

  // Injetar Caixas de Texto Flutuantes no VBox com coordenadas exatas em milímetros (mm)
  for (const ft of floatingTexts) {
    if (!ft.text || !ft.text.trim()) continue;
    const tb = doc.createElement('Text');
    tb.setAttribute('data-floating', '1');
    setOrCreateDirectChildText(doc, tb, 'style', 'Lyricist');

    const fontSizePt = ft.fontSize || 12;
    const fontHeightMm = fontSizePt * 0.3527;

    // Converter porcentagem (top-left na tela A4) diretamente para milímetros no MuseScore 3
    const targetXmm = (ft.xPercent / 100) * pageWidthMm;
    const targetYmm = (ft.yPercent / 100) * pageHeightMm + fontHeightMm;

    const offsetX = targetXmm - anchorXmm;
    const offsetY = targetYmm - anchorYmm;

    const offsetEl = doc.createElement('offset');
    offsetEl.setAttribute('x', offsetX.toFixed(2));
    offsetEl.setAttribute('y', offsetY.toFixed(2));
    tb.appendChild(offsetEl);

    const textNode = doc.createElement('text');
    const fontEl = doc.createElement('font');
    fontEl.setAttribute('size', String(fontSizePt));
    textNode.appendChild(fontEl);
    textNode.appendChild(doc.createTextNode(ft.text));
    tb.appendChild(textNode);

    vbox.appendChild(tb);
  }
}

/**
 * Recompacta o .mscx modificado dentro do arquivo .mscz original (preservando estilos .mss, áudio e estrutura)
 * e normaliza o nome interno para "score.mscx" em container.xml para compatibilidade 100% no Linux/Docker.
 */
export async function buildModifiedMsczBuffer(
  originalFileBuffer: ArrayBuffer | Uint8Array | Buffer,
  originalFileName: string,
  modifiedMscxContent: string
): Promise<Buffer> {
  const ext = originalFileName.trim().toLowerCase();
  const uint8 =
    originalFileBuffer instanceof Uint8Array
      ? originalFileBuffer
      : new Uint8Array(originalFileBuffer);

  const safeInternalMscxName = 'score.mscx';
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="${safeInternalMscxName}"/>
  </rootfiles>
</container>`;

  if (ext.endsWith('.mscz')) {
    const zip = await JSZip.loadAsync(uint8);
    const entryNames = Object.keys(zip.files);
    for (const name of entryNames) {
      if (name.toLowerCase().endsWith('.mscx')) {
        zip.remove(name);
      }
    }
    zip.file('META-INF/container.xml', containerXml);
    zip.file(safeInternalMscxName, modifiedMscxContent);
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  const zip = new JSZip();
  zip.file('META-INF/container.xml', containerXml);
  zip.file(safeInternalMscxName, modifiedMscxContent);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
