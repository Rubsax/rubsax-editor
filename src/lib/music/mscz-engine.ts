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

export type ScoreLayoutViewMode = 'portrait' | 'landscape' | 'full-score';

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
  partIndex: number;
  trackName: string;
  displayName: string;
  headerInstrumentLabel: string;
  instrumentId: string;
  isVisibleSolo: boolean;
  isPercussion: boolean;
  transposeChromatic: number;
  transposeDiatonic: number;
  fifthsOffset: number;
  writtenSemitoneOffset: number;
  clef: ClefType;
}

export interface ChordOccurrence {
  occurrenceIndex: number;
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
  /** True if file is in Bb or Eb and has chords written in Concert Pitch (Piano) */
  needsBbEbChordPrompt: boolean;
  headers: ScoreHeadersState;
  staves: StaffSummary[];
  watermarkText: string;
}

export interface ScoreTransformOptions {
  /** Semitone shift applied to Concert Pitch (-12..+12) */
  semitoneShift: number;
  /** Manual octave shift applied to active staff (-2..+2 octaves) */
  octaveShift: number;
  /** Target instrument ID (kept from detected file instrument) */
  targetInstrumentId: string;
  /** Selected staff ID to view/export ('1', '2', '3', etc.) */
  selectedStaffId: string;
  /** Layout mode: portrait A4, landscape A4, or full-score stacked staves */
  viewMode: ScoreLayoutViewMode;
  /** Whether visible chords on a Sib/Mib staff should be transposed to the instrument's written key */
  convertBbEbChordsToWritten: boolean;
  /** Visibility toggles */
  showChords: boolean;
  showLyrics: boolean;
  /** Header text controls */
  headers: ScoreHeadersState;
  /** User edits to existing chord symbols (maps transposed chord symbol or '#occurrenceIndex' -> new chord symbol) */
  chordOverrides: Record<string, string>;
  /** User-created floating text boxes positioned over the score */
  floatingTexts: FloatingTextBox[];
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

function computeStaffOffsetsFromTranspose(transposeChromatic: number): {
  fifthsOffset: number;
  writtenSemitoneOffset: number;
} {
  const mod = (((-transposeChromatic) % 12) + 12) % 12;
  if (mod === 2) {
    // Instrumento em Sib (Bb)
    return { fifthsOffset: 2, writtenSemitoneOffset: 2 };
  }
  if (mod === 9 || mod === 3) {
    // Instrumento em Mib (Eb)
    return { fifthsOffset: 3, writtenSemitoneOffset: 9 };
  }
  if (mod === 7) {
    // Instrumento em Fá (F)
    return { fifthsOffset: 1, writtenSemitoneOffset: 7 };
  }
  return { fifthsOffset: 0, writtenSemitoneOffset: 0 };
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
  const title =
    (workTitleEl?.textContent || movementTitleEl?.textContent || 'Partitura MusicXML').trim();

  const fifthsEl = doc.getElementsByTagName('fifths').item(0);
  const fifths = fifthsEl ? parseInt(fifthsEl.textContent || '0', 10) || 0 : 0;

  const beatsEl = doc.getElementsByTagName('beats').item(0);
  const beatTypeEl = doc.getElementsByTagName('beat-type').item(0);
  const sigN = beatsEl ? parseInt(beatsEl.textContent || '4', 10) || 4 : 4;
  const sigD = beatTypeEl ? parseInt(beatTypeEl.textContent || '4', 10) || 4 : 4;

  const divisionsEl = doc.getElementsByTagName('divisions').item(0);
  const divisions = divisionsEl ? parseInt(divisionsEl.textContent || '1', 10) || 1 : 1;

  const stepToPc: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  const parts = doc.getElementsByTagName('part');
  const firstPart = parts.item(0);
  const measuresXml: string[] = [];

  if (firstPart) {
    const measureNodes = firstPart.getElementsByTagName('measure');
    for (let m = 0; m < measureNodes.length; m++) {
      const mEl = measureNodes.item(m);
      if (!mEl) continue;
      const voiceItems: string[] = [];
      if (m === 0) {
        voiceItems.push(
          `<KeySig><accidental>${fifths}</accidental></KeySig>`,
          `<TimeSig><sigN>${sigN}</sigN><sigD>${sigD}</sigD></TimeSig>`
        );
      }

      const children = mEl.childNodes;
      for (let c = 0; c < children.length; c++) {
        const ch = children.item(c);
        if (!ch || ch.nodeType !== 1) continue;
        const el = ch as Element;

        if (el.tagName === 'harmony') {
          const rootStep = el.getElementsByTagName('root-step').item(0)?.textContent?.trim() || 'C';
          const rootAlter = parseInt(
            el.getElementsByTagName('root-alter').item(0)?.textContent || '0',
            10
          );
          const kindEl = el.getElementsByTagName('kind').item(0);
          const kindText = kindEl?.getAttribute('text') || '';
          const pc = ((stepToPc[rootStep] ?? 0) + rootAlter + 12) % 12;
          const rootTpc = pitchClassToSimpleTpc(pc, fifths);
          voiceItems.push(
            `<Harmony><root>${rootTpc}</root>${
              kindText ? `<name>${kindText}</name>` : ''
            }<play>0</play></Harmony>`
          );
        } else if (el.tagName === 'note') {
          const isRest = el.getElementsByTagName('rest').length > 0;
          const typeText = el.getElementsByTagName('type').item(0)?.textContent?.trim() || 'quarter';
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
          const lyricXml = lyricText ? `<Lyrics><text>${lyricText}</text></Lyrics>` : '';

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
            const midiPitch = (octave + 1) * 12 + (stepToPc[step] ?? 0) + alter;
            const pc = ((midiPitch % 12) + 12) % 12;
            const tpc = pitchClassToSimpleTpc(pc, fifths);
            voiceItems.push(
              `<Chord>${dotsTag}<durationType>${durType}</durationType>${lyricXml}<Note><pitch>${midiPitch}</pitch><tpc>${tpc}</tpc></Note></Chord>`
            );
          }
        }
      }

      if (voiceItems.length === 0) {
        voiceItems.push(
          `<Rest><durationType>measure</durationType><duration>${sigN}/${sigD}</duration></Rest>`
        );
      }

      measuresXml.push(`<Measure><voice>${voiceItems.join('\n')}</voice></Measure>`);
    }
  }

  const tonality = getTonalityByFifths(fifths);

  return `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <programVersion>3.6.2</programVersion>
  <Score>
    <Division>${divisions * 480}</Division>
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
    <metaTag name="workTitle">${title}</metaTag>
    <Part>
      <Staff id="1">
        <StaffType group="pitched">
          <name>stdNormal</name>
        </StaffType>
      </Staff>
      <trackName>Instrumento</trackName>
      <Instrument id="violin">
        <trackName>Instrumento</trackName>
        <instrumentId>strings.violin</instrumentId>
        <Channel>
          <program value="40"/>
          <synti>Fluid</synti>
        </Channel>
      </Instrument>
    </Part>
    <Staff id="1">
      <VBox>
        <height>7</height>
        <Text>
          <style>Title</style>
          <text>${title}</text>
        </Text>
        <Text>
          <style>Lyricist</style>
          <text>Tom para Piano:\n${tonality.majorName}</text>
        </Text>
        <Text>
          <style>Composer</style>
          <text>Instrumento em Dó</text>
        </Text>
      </VBox>
      ${measuresXml.join('\n      ')}
    </Staff>
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
        else if ((styleName === 'lyricist' || styleName === 'poet') && !lyricistText)
          lyricistText = val;
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

  partEls.forEach((partEl, pIdx) => {
    const trackName = getDirectChildText(partEl, 'trackName');
    const instrEl = getFirstDirectChildByTag(partEl, 'Instrument');
    const longName = instrEl ? cleanMscxTextNode(getFirstDirectChildByTag(instrEl, 'longName')) : '';
    const instrTrackName = instrEl ? getDirectChildText(instrEl, 'trackName') : '';
    const instrId = instrEl
      ? getDirectChildText(instrEl, 'instrumentId') || instrEl.getAttribute('id') || ''
      : '';
    const tChrom = instrEl
      ? parseInt(getDirectChildText(instrEl, 'transposeChromatic', '0'), 10) || 0
      : 0;
    const tDiat = instrEl
      ? parseInt(getDirectChildText(instrEl, 'transposeDiatonic', '0'), 10) || 0
      : 0;
    const isPerc = detectPercussionPart(partEl, trackName || instrTrackName, instrId);
    const { fifthsOffset, writtenSemitoneOffset } = computeStaffOffsetsFromTranspose(tChrom);

    const partStaves = getDirectChildrenByTag(partEl, 'Staff');
    partStaves.forEach((pStaff, sIdx) => {
      const sid = pStaff.getAttribute('id') || String(stavesSummary.length + 1);
      const defClefText = getDirectChildText(pStaff, 'defaultClef', 'G').toUpperCase();
      const clef: ClefType = defClefText.startsWith('F') ? 'F' : 'G';
      const isMain = pIdx === 0 && sIdx === 0;

      const rawDisplayName =
        trackName || instrTrackName || longName || (isPerc ? 'Bateria' : `Pauta ${sid}`);
      const cleanName = rawDisplayName.replace(/\s+em\s+B♭/i, ' Sib').replace(/\s+em\s+E♭/i, ' Mib');

      if (isMain) {
        mainStaffId = sid;
        origTransposeChromatic = tChrom;
        origTransposeDiatonic = tDiat;
        origClef = clef;
        mainTrackName = rawDisplayName;
        mainInstrumentId = instrId;
      }

      stavesSummary.push({
        staffId: sid,
        partIndex: pIdx,
        trackName: rawDisplayName,
        displayName: cleanName,
        headerInstrumentLabel: isMain
          ? composerText || rawDisplayName
          : rawDisplayName,
        instrumentId: instrId,
        isVisibleSolo: isMain,
        isPercussion: isPerc,
        transposeChromatic: tChrom,
        transposeDiatonic: tDiat,
        fifthsOffset,
        writtenSemitoneOffset,
        clef,
      });
    });
  });

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

  // Atualizar displayName da Pauta 1 com nome amigável caso trackName estivesse genérico
  if (stavesSummary[0]) {
    if (!stavesSummary[0].trackName || stavesSummary[0].trackName === 'Pauta 1') {
      stavesSummary[0].trackName = detectedInstrument.name;
      stavesSummary[0].displayName = detectedInstrument.name;
    }
  }

  let writtenKeyFifths = 0;
  if (mainStaffBody) {
    const keySigs = mainStaffBody.getElementsByTagName('KeySig');
    if (keySigs.length > 0) {
      const accText = getDirectChildText(keySigs.item(0)!, 'accidental', '0');
      writtenKeyFifths = normalizeKeySigFifths(parseInt(accText, 10) || 0);
    }
  }

  const mainFifthsOffset =
    stavesSummary[0]?.fifthsOffset ?? detectedInstrument.fifthsOffset;
  let concertKeyFifths = normalizeKeySigFifths(writtenKeyFifths - mainFifthsOffset);

  if (staffBodies.length > 1) {
    const secondStaff = staffBodies[1];
    const secondSummary = stavesSummary[1];
    if (
      secondStaff &&
      secondSummary &&
      !secondSummary.isPercussion &&
      secondSummary.transposeChromatic === 0
    ) {
      const ks2 = secondStaff.getElementsByTagName('KeySig');
      if (ks2.length > 0) {
        const acc2 = parseInt(getDirectChildText(ks2.item(0)!, 'accidental', '0'), 10);
        if (!Number.isNaN(acc2)) {
          concertKeyFifths = normalizeKeySigFifths(acc2);
        }
      }
    }
  }

  const concertTonality = getTonalityByFifths(concertKeyFifths);
  const writtenTonality = getTonalityByFifths(writtenKeyFifths);

  let measureCount = 0;
  let noteCount = 0;
  let chordCount = 0;
  let lyricCount = 0;
  const sampleChords: string[] = [];
  const concertPitches: number[] = [];

  if (mainStaffBody) {
    const measures = getDirectChildrenByTag(mainStaffBody, 'Measure');
    measureCount = measures.length;

    const notes = mainStaffBody.getElementsByTagName('Note');
    noteCount = notes.length;
    for (let i = 0; i < notes.length; i++) {
      const nEl = notes.item(i)!;
      const pVal = parseInt(getDirectChildText(nEl, 'pitch', '60'), 10);
      if (!Number.isNaN(pVal)) {
        concertPitches.push(pVal);
      }
    }

    const harmonies = mainStaffBody.getElementsByTagName('Harmony');
    chordCount = harmonies.length;
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

    const lyrics = mainStaffBody.getElementsByTagName('Lyrics');
    lyricCount = lyrics.length;
  }

  let medianConcertPitch = 65;
  if (concertPitches.length > 0) {
    const sorted = [...concertPitches].sort((a, b) => a - b);
    medianConcertPitch = sorted[Math.floor(sorted.length / 2)];
  }

  const isBbOrEb =
    detectedInstrument.groupId === 'BB_TREBLE' ||
    detectedInstrument.groupId === 'EB_TREBLE' ||
    mainFifthsOffset !== 0;

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
    needsBbEbChordPrompt: isBbOrEb && chordCount > 0,
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
    staves: stavesSummary,
    watermarkText: 'Rubsax Partituras',
  };
}

export function transformScoreXml(
  originalMscxContent: string,
  analysis: ScoreAnalysis,
  options: ScoreTransformOptions
): TransformResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(originalMscxContent, 'text/xml');
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

  // Identificar pauta ativa selecionada pelo usuário (padrão: Pauta 1)
  const activeStaff =
    analysis.staves.find((s) => s.staffId === options.selectedStaffId) ||
    analysis.staves[0] || {
      staffId: '1',
      partIndex: 0,
      trackName: targetInstrument.name,
      displayName: targetInstrument.name,
      headerInstrumentLabel: targetInstrument.headerInstrumentText,
      instrumentId: targetInstrument.musescoreInstrumentId,
      isVisibleSolo: true,
      isPercussion: false,
      transposeChromatic: analysis.originalTransposeChromatic,
      transposeDiatonic: analysis.originalTransposeDiatonic,
      fifthsOffset: targetInstrument.fifthsOffset,
      writtenSemitoneOffset: targetInstrument.writtenSemitoneOffset,
      clef: analysis.originalClef,
    };

  // 1. Calcular nova Tonalidade Base (Piano / Dó) e Tonalidade Escrita na Pauta Ativa
  const newConcertPc =
    ((analysis.originalConcertPitchClass + semitoneShift) % 12 + 12) % 12;
  const concertTonality = getTonalityByPitchClass(newConcertPc);
  const newConcertKeyFifths = concertTonality.fifths;

  const activeWrittenPc =
    ((newConcertPc + activeStaff.writtenSemitoneOffset) % 12 + 12) % 12;
  const writtenTonality = getTonalityByPitchClass(activeWrittenPc);

  // 2. Garantir layoutMode paginado (removendo line/system para renderização limpa)
  removeDirectChildrenByTag(scoreEl, 'layoutMode');

  // 3. Configurar <Style>: Orientação (Vertical/Retrato vs Horizontal/Paisagem), Nomes na Grade e Marca d'Água
  let styleEl = getFirstDirectChildByTag(scoreEl, 'Style');
  if (!styleEl) {
    styleEl = doc.createElement('Style');
    scoreEl.insertBefore(styleEl, scoreEl.firstChild);
  }

  if (viewMode === 'landscape') {
    setOrCreateDirectChildText(doc, styleEl, 'pageWidth', '11.69');
    setOrCreateDirectChildText(doc, styleEl, 'pageHeight', '8.27');
    setOrCreateDirectChildText(doc, styleEl, 'pagePrintableWidth', '10.50');
  } else {
    setOrCreateDirectChildText(doc, styleEl, 'pageWidth', '8.27');
    setOrCreateDirectChildText(doc, styleEl, 'pageHeight', '11.69');
    setOrCreateDirectChildText(doc, styleEl, 'pagePrintableWidth', '7.09');
  }

  if (isFullScore) {
    setOrCreateDirectChildText(doc, styleEl, 'hideInstrumentNameIfOneInstrument', '0');
  }

  setOrCreateDirectChildText(doc, styleEl, 'showFooter', '1');
  setOrCreateDirectChildText(doc, styleEl, 'footerFirstPage', '1');
  setOrCreateDirectChildText(doc, styleEl, 'oddFooterR', 'Rubsax Partituras');
  setOrCreateDirectChildText(doc, styleEl, 'evenFooterR', 'Rubsax Partituras');
  setOrCreateDirectChildText(doc, styleEl, 'oddFooterC', '© Rubsax Partituras');
  setOrCreateDirectChildText(doc, styleEl, 'evenFooterC', '© Rubsax Partituras');

  const spatiumMm =
    parseFloat(getDirectChildText(styleEl, 'Spatium', '1.75')) || 1.75;
  const pageWidthIn =
    parseFloat(getDirectChildText(styleEl, 'pageWidth', viewMode === 'landscape' ? '11.69' : '8.27')) || 8.27;
  const pageHeightIn =
    parseFloat(getDirectChildText(styleEl, 'pageHeight', viewMode === 'landscape' ? '8.27' : '11.69')) || 11.69;
  const pageWidthSp = (pageWidthIn * 25.4) / spatiumMm;
  const pageHeightSp = (pageHeightIn * 25.4) / spatiumMm;

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

  // 4. Configurar visibilidade dos <Part>s conforme a pauta selecionada ou Grade Completa
  const partEls = getDirectChildrenByTag(scoreEl, 'Part');
  partEls.forEach((partEl, pIdx) => {
    const partStaffEls = getDirectChildrenByTag(partEl, 'Staff');
    const partStaffIds = partStaffEls.map(
      (ps, i) => ps.getAttribute('id') || String(pIdx + i + 1)
    );
    const containsActiveStaff = partStaffIds.includes(activeStaff.staffId);

    if (isFullScore) {
      removeDirectChildrenByTag(partEl, 'show');
      partStaffEls.forEach((ps) => {
        removeDirectChildrenByTag(ps, 'invisible');
        removeDirectChildrenByTag(ps, 'visible');
      });
      // Garantir que <longName> exista no <Instrument> para exibir o nome à esquerda na Grade Completa
      const instrEl = getFirstDirectChildByTag(partEl, 'Instrument');
      const tName = getDirectChildText(partEl, 'trackName');
      if (instrEl && tName && !getFirstDirectChildByTag(instrEl, 'longName')) {
        setOrCreateDirectChildText(doc, instrEl, 'longName', tName, 'trackName');
      }
    } else if (containsActiveStaff) {
      removeDirectChildrenByTag(partEl, 'show');
      partStaffEls.forEach((ps) => {
        const psId = ps.getAttribute('id') || '';
        if (psId === activeStaff.staffId || partStaffEls.length === 1) {
          removeDirectChildrenByTag(ps, 'invisible');
          removeDirectChildrenByTag(ps, 'visible');
        } else {
          setOrCreateDirectChildText(doc, ps, 'invisible', '1');
        }
      });
    } else {
      setOrCreateDirectChildText(doc, partEl, 'show', '0');
    }
  });

  // 5. Garantir que o <VBox> de cabeçalho esteja na pauta visível ativa
  const staffBodies = getDirectChildrenByTag(scoreEl, 'Staff');
  const firstStaffBody = staffBodies[0];
  const activeStaffBody =
    staffBodies.find((s) => (s.getAttribute('id') || '1') === activeStaff.staffId) ||
    firstStaffBody;

  const targetVBoxOwner = isFullScore ? firstStaffBody : activeStaffBody;
  if (firstStaffBody && targetVBoxOwner && targetVBoxOwner !== firstStaffBody) {
    const origVBoxes = getDirectChildrenByTag(firstStaffBody, 'VBox');
    const targetVBoxes = getDirectChildrenByTag(targetVBoxOwner, 'VBox');
    if (origVBoxes.length > 0 && targetVBoxes.length === 0) {
      const clonedVBox = origVBoxes[0].cloneNode(true) as Element;
      const firstMeasure = getFirstDirectChildByTag(targetVBoxOwner, 'Measure');
      if (firstMeasure) {
        targetVBoxOwner.insertBefore(clonedVBox, firstMeasure);
      } else {
        targetVBoxOwner.appendChild(clonedVBox);
      }
    }
  }

  // Atualizar cabeçalhos e injetar Caixas de Texto Flutuantes no VBox da pauta visível
  if (targetVBoxOwner) {
    const headerLabelForActiveMode = isFullScore
      ? 'Grade Completa'
      : activeStaff.headerInstrumentLabel;

    updateStaffHeadersAndFloatingTexts(
      doc,
      targetVBoxOwner,
      options.headers,
      concertTonality,
      headerLabelForActiveMode,
      options.floatingTexts || [],
      pageWidthSp,
      pageHeightSp
    );
  }

  // 6. Processar cada <Staff> dentro de <Score> (Transposição, Oitava, Cifras e Letras)
  const manualOctaveSemitones = options.octaveShift * 12;
  const previewChords: string[] = [];
  const chordOccurrences: ChordOccurrence[] = [];

  staffBodies.forEach((staffBody, sIdx) => {
    const sid = staffBody.getAttribute('id') || String(sIdx + 1);
    const staffMeta =
      analysis.staves.find((st) => st.staffId === sid) || analysis.staves[sIdx];
    const isThisStaffActive = isFullScore || sid === activeStaff.staffId;
    const isPercussion = staffMeta ? staffMeta.isPercussion : false;
    const staffFifthsOffset = staffMeta ? staffMeta.fifthsOffset : 0;
    const staffWrittenSemitoneOffset = staffMeta ? staffMeta.writtenSemitoneOffset : 0;
    const staffTransposeChromatic = staffMeta ? staffMeta.transposeChromatic : 0;

    if (isThisStaffActive) {
      removeDirectChildrenByTag(staffBody, 'visible');
    } else {
      setOrCreateDirectChildText(doc, staffBody, 'visible', '0', 'Measure');
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

    // 6a. Atualizar armaduras de clave (<KeySig>)
    const keySigNodes = staffBody.getElementsByTagName('KeySig');
    for (let i = 0; i < keySigNodes.length; i++) {
      const ksNode = keySigNodes.item(i)!;
      const oldAcc = parseInt(getDirectChildText(ksNode, 'accidental', '0'), 10) || 0;
      const newAcc =
        i === 0
          ? targetStaffKeyFifths
          : normalizeKeySigFifths(oldAcc + fifthsDeltaForModulations);
      setOrCreateDirectChildText(doc, ksNode, 'accidental', String(newAcc));
    }

    // 6b. Transpor todas as notas (<Note>) da pauta com regra estrita de acidentes simples (# ou b)
    const noteNodes = staffBody.getElementsByTagName('Note');
    const applyOctaveToThisStaff =
      sid === activeStaff.staffId || (isFullScore && sIdx === 0);
    const staffPitchDelta =
      semitoneShift + (applyOctaveToThisStaff ? manualOctaveSemitones : 0);

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

    // 6c. Processar Cifras (<Harmony>) e Edições de Cifras Existentes
    const measures = getDirectChildrenByTag(staffBody, 'Measure');
    const isTransposingStaff = staffWrittenSemitoneOffset !== 0;
    const shouldTransposeVisibleChordsToInstrument =
      isTransposingStaff && options.convertBbEbChordsToWritten;

    const chordSemitoneDelta =
      semitoneShift +
      (shouldTransposeVisibleChordsToInstrument ? staffWrittenSemitoneOffset : 0);
    const chordKeyFifths = shouldTransposeVisibleChordsToInstrument
      ? targetStaffKeyFifths
      : newConcertKeyFifths;

    let staffHarmonyIdx = 0;
    measures.forEach((mEl, mIdx) => {
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

            // Verificar se o usuário editou esta cifra (por ocorrência #idx ou pelo nome do acorde)
            const overrideByOccurrence =
              options.chordOverrides?.[`#${staffHarmonyIdx}`];
            const overrideBySymbol =
              options.chordOverrides?.[autoTransposedSymbol];
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

            if (sid === activeStaff.staffId) {
              if (!previewChords.includes(finalDisplaySymbol)) {
                previewChords.push(finalDisplaySymbol);
              }
              chordOccurrences.push({
                occurrenceIndex: staffHarmonyIdx,
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

    // 6d. Processar Letras (<Lyrics>)
    if (!options.showLyrics && isThisStaffActive) {
      const lyricNodes = Array.from(staffBody.getElementsByTagName('Lyrics'));
      for (const lNode of lyricNodes) {
        if (lNode.parentNode) {
          lNode.parentNode.removeChild(lNode);
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
  pageWidthSp: number,
  pageHeightSp: number
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

      let key: 'title' | 'subtitle' | 'composer' | 'lyricist' | null = null;
      if (rawStyle === 'title') key = 'title';
      else if (rawStyle === 'subtitle') key = 'subtitle';
      else if (rawStyle === 'composer') key = 'composer';
      else if (rawStyle === 'lyricist' || rawStyle === 'poet') key = 'lyricist';

      if (!key) continue;
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

  // Injetar Caixas de Texto Flutuantes no VBox com coordenadas em Spatium (sp)
  for (const ft of floatingTexts) {
    if (!ft.text || !ft.text.trim()) continue;
    const tb = doc.createElement('Text');
    tb.setAttribute('data-floating', '1');
    setOrCreateDirectChildText(doc, tb, 'style', 'Lyricist');

    // A âncora de Lyricist no VBox fica no canto esquerdo (~6% X) e base do VBox (~9% Y)
    const offsetX = ((ft.xPercent - 6.0) / 100) * pageWidthSp;
    const offsetY = ((ft.yPercent - 9.0) / 100) * pageHeightSp;

    const offsetEl = doc.createElement('offset');
    offsetEl.setAttribute('x', offsetX.toFixed(2));
    offsetEl.setAttribute('y', offsetY.toFixed(2));
    tb.appendChild(offsetEl);

    const textNode = doc.createElement('text');
    const fontEl = doc.createElement('font');
    fontEl.setAttribute('size', String(ft.fontSize || 12));
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
