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
  'Formato não suportado. Envie apenas arquivos do MuseScore (.mscz, .mscx) ou MusicXML (.xml).';

export const ALLOWED_EXTENSIONS = ['.mscz', '.mscx', '.xml', '.musicxml'];
export const BLOCKED_EXTENSIONS = ['.mus', '.musx', '.sib', '.mid', '.midi', '.enc'];

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
  instrumentId: string;
  isVisibleSolo: boolean;
  isPercussion: boolean;
  transposeChromatic: number;
  transposeDiatonic: number;
  clef: ClefType;
}

export interface ScoreAnalysis {
  fileName: string;
  fileFormat: 'mscz' | 'mscx' | 'xml';
  detectedInstrumentId: string;
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
  /** Manual octave shift applied to main solo staff (-2..+2 octaves) */
  octaveShift: number;
  /** Target instrument ID from the 13 official instruments */
  targetInstrumentId: string;
  /** Whether visible chords on a Sib/Mib staff should be transposed to the instrument's written key */
  convertBbEbChordsToWritten: boolean;
  /** Visibility toggles */
  showChords: boolean;
  showLyrics: boolean;
  /** Header text controls */
  headers: ScoreHeadersState;
}

export interface TransformResult {
  modifiedMscx: string;
  concertTonality: TonalityDefinition;
  writtenTonality: TonalityDefinition;
  targetInstrument: InstrumentDefinition;
  appliedSemitoneShift: number;
  appliedAutoOctaveSemitones: number;
  appliedManualOctaveSemitones: number;
  previewChords: string[];
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

/**
 * Preserva tags de formatação de fonte originais (<font .../>) ao atualizar o texto de um nó <text> no VBox
 */
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

function detectInitialInstrumentFromPart(
  trackName: string,
  instrumentId: string,
  composerHeader: string,
  transposeChromatic: number,
  clef: ClefType
): InstrumentDefinition {
  const combined = `${trackName} ${instrumentId} ${composerHeader}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Check Eb group first (-9 or -21 or explicit Eb names)
  if (
    transposeChromatic === -9 ||
    transposeChromatic === -21 ||
    transposeChromatic === 3 ||
    combined.includes('sax alto') ||
    combined.includes('alto sax') ||
    combined.includes('saxofone alto') ||
    combined.includes('baritono') ||
    combined.includes('mib')
  ) {
    if (combined.includes('baritono') && !combined.includes('alto')) {
      return getInstrumentById('baritone-sax');
    }
    return getInstrumentById('alto-sax');
  }

  // Check Bb group (-2 or -14 or explicit Bb names)
  if (
    transposeChromatic === -2 ||
    transposeChromatic === -14 ||
    combined.includes('clarinete') ||
    combined.includes('clarinet') ||
    combined.includes('trompete') ||
    combined.includes('trumpet') ||
    combined.includes('sax tenor') ||
    combined.includes('tenor sax') ||
    combined.includes('sax soprano') ||
    combined.includes('soprano sax') ||
    combined.includes('sib')
  ) {
    if (combined.includes('trompete') || combined.includes('trumpet')) {
      return getInstrumentById('trumpet');
    }
    if (combined.includes('tenor') && !combined.includes('clarinete')) {
      return getInstrumentById('tenor-sax');
    }
    if (combined.includes('soprano') && !combined.includes('clarinete')) {
      return getInstrumentById('soprano-sax');
    }
    return getInstrumentById('clarinet');
  }

  // Check Bass Clef (Clave de Fá)
  if (
    clef === 'F' ||
    combined.includes('trombone') ||
    combined.includes('bombardino') ||
    combined.includes('euphonium') ||
    combined.includes('violoncelo') ||
    combined.includes('violoncello') ||
    combined.includes('cello') ||
    combined.includes('clave de fa')
  ) {
    if (combined.includes('bombardino') || combined.includes('euphonium')) {
      return getInstrumentById('euphonium');
    }
    if (combined.includes('violoncelo') || combined.includes('cello')) {
      return getInstrumentById('cello');
    }
    return getInstrumentById('trombone');
  }

  // Default to C Treble group
  if (combined.includes('flauta doce') || combined.includes('recorder')) {
    return getInstrumentById('recorder');
  }
  if (combined.includes('flauta') || combined.includes('flute')) {
    return getInstrumentById('flute');
  }
  if (combined.includes('oboe')) {
    return getInstrumentById('oboe');
  }
  if (combined.includes('teclado') || combined.includes('piano')) {
    return getInstrumentById('keyboard');
  }
  return getInstrumentById('violin');
}

/**
 * Converte um arquivo MusicXML (.xml / .musicxml) básico em estrutura .mscx compatível caso o usuário suba um .xml direto
 */
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
      <trackName>Violino</trackName>
      <Instrument id="violin">
        <trackName>Violino</trackName>
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
          <text>Violino, Flauta, Oboé e Teclado</text>
        </Text>
      </VBox>
      ${measuresXml.join('\n      ')}
    </Staff>
  </Score>
</museScore>`;
}

/**
 * Descompacta um arquivo .mscz (ou lê .mscx / .xml diretamente) e retorna o conteúdo XML .mscx + mapa de arquivos do zip
 */
export async function unpackScoreBuffer(
  buffer: ArrayBuffer | Uint8Array | Buffer,
  fileName: string
): Promise<{
  mscxContent: string;
  mscxEntryName: string;
  fileFormat: 'mscz' | 'mscx' | 'xml';
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

  const rawText = new TextDecoder('utf-8').decode(uint8);
  if (ext === '.xml' || ext === '.musicxml') {
    const converted = convertMusicXmlToMscxIfNeeded(rawText);
    const base = fileName.replace(/\.(musicxml|xml)$/i, '');
    return {
      mscxContent: converted,
      mscxEntryName: `${base}.mscx`,
      fileFormat: 'xml',
    };
  }

  return {
    mscxContent: rawText,
    mscxEntryName: fileName.endsWith('.mscx') ? fileName : `${fileName}.mscx`,
    fileFormat: 'mscx',
  };
}

/**
 * Analisa profundamente o XML .mscx da partitura para extrair tonalidade de concerto (Piano),
 * tonalidade escrita na pauta, instrumento original, cifras, letras, cabeçalhos e pautas ocultas.
 */
export function analyzeScoreXml(
  mscxContent: string,
  fileName = 'partitura.mscz',
  fileFormat: 'mscz' | 'mscx' | 'xml' = 'mscz'
): ScoreAnalysis {
  const parser = new DOMParser();
  const doc = parser.parseFromString(mscxContent, 'text/xml');
  const scoreEls = doc.getElementsByTagName('Score');
  const scoreEl = scoreEls.item(0);
  if (!scoreEl) {
    throw new Error('Estrutura <Score> não encontrada no arquivo do MuseScore.');
  }

  const partEls = getDirectChildrenByTag(scoreEl, 'Part');
  const staffBodies = getDirectChildrenByTag(scoreEl, 'Staff');

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
    const instrId = instrEl
      ? getDirectChildText(instrEl, 'instrumentId') || instrEl.getAttribute('id') || ''
      : '';
    const tChrom = instrEl
      ? parseInt(getDirectChildText(instrEl, 'transposeChromatic', '0'), 10) || 0
      : 0;
    const tDiat = instrEl
      ? parseInt(getDirectChildText(instrEl, 'transposeDiatonic', '0'), 10) || 0
      : 0;
    const isPerc = detectPercussionPart(partEl, trackName, instrId);

    const partStaves = getDirectChildrenByTag(partEl, 'Staff');
    partStaves.forEach((pStaff, sIdx) => {
      const sid = pStaff.getAttribute('id') || String(stavesSummary.length + 1);
      const defClefText = getDirectChildText(pStaff, 'defaultClef', 'G').toUpperCase();
      const clef: ClefType = defClefText.startsWith('F') ? 'F' : 'G';
      const isMain = pIdx === 0 && sIdx === 0;
      if (isMain) {
        mainStaffId = sid;
        origTransposeChromatic = tChrom;
        origTransposeDiatonic = tDiat;
        origClef = clef;
        mainTrackName = trackName;
        mainInstrumentId = instrId;
      }
      stavesSummary.push({
        staffId: sid,
        partIndex: pIdx,
        trackName: trackName || `Pauta ${sid}`,
        instrumentId: instrId,
        isVisibleSolo: isMain,
        isPercussion: isPerc,
        transposeChromatic: tChrom,
        transposeDiatonic: tDiat,
        clef,
      });
    });
  });

  const mainStaffBody =
    staffBodies.find((s) => (s.getAttribute('id') || '1') === mainStaffId) || staffBodies[0];

  // Extract VBox header texts
  let titleText = '';
  let subtitleText = '';
  let composerText = '';
  let lyricistText = '';

  if (mainStaffBody) {
    const vboxes = getDirectChildrenByTag(mainStaffBody, 'VBox');
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

  // Fallback to metaTags if VBox didn't have title
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
    titleText = fileName.replace(/\.(mscz|mscx|xml|musicxml)$/i, '');
  }

  // Check first Clef in mainStaffBody if defaultClef wasn't F
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

  // Extract KeySig from mainStaffBody
  let writtenKeyFifths = 0;
  if (mainStaffBody) {
    const keySigs = mainStaffBody.getElementsByTagName('KeySig');
    if (keySigs.length > 0) {
      const accText = getDirectChildText(keySigs.item(0)!, 'accidental', '0');
      writtenKeyFifths = normalizeKeySigFifths(parseInt(accText, 10) || 0);
    }
  }

  // Determine Concert Key Fifths (Tom Base para Piano / Dó)
  let concertKeyFifths = normalizeKeySigFifths(
    writtenKeyFifths - detectedInstrument.fifthsOffset
  );

  // Also cross-check with Staff 2 (Piano) if present and non-transposing
  if (staffBodies.length > 1) {
    const secondStaff = staffBodies[1];
    const secondSummary = stavesSummary[1];
    if (secondStaff && secondSummary && !secondSummary.isPercussion && secondSummary.transposeChromatic === 0) {
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

  // Count measures, notes, chords, lyrics, and median pitch on mainStaffBody
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
      if (!Number.isNaN(rootTpc) && sampleChords.length < 8) {
        const rootName = tpcToNoteName(rootTpc);
        const bassName = baseStr ? `/${tpcToNoteName(parseInt(baseStr, 10))}` : '';
        const fullChord = `${rootName}${nameStr}${bassName}`;
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
    detectedInstrument.groupId === 'BB_TREBLE' || detectedInstrument.groupId === 'EB_TREBLE';

  const defaultLyricistText =
    lyricistText || `Tom para Piano:\n${concertTonality.majorName}`;
  const defaultComposerText =
    composerText || detectedInstrument.headerInstrumentText;

  return {
    fileName,
    fileFormat,
    detectedInstrumentId: detectedInstrument.id,
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

/**
 * Calcula o deslocamento automático de oitava (em múltiplos de 12 semitons)
 * para proteger a tessitura ao converter entre grupos (ex: Clave de Sol <-> Clave de Fá)
 */
function computeAutoTessituraOctaveSemitones(
  originalMedianConcertPitch: number,
  semitoneShift: number,
  targetInstrument: InstrumentDefinition
): number {
  const shiftedConcertMedian = originalMedianConcertPitch + semitoneShift;
  const rawWrittenMedian = shiftedConcertMedian - targetInstrument.transposeChromatic;
  const ideal = targetInstrument.idealMedianWrittenPitch;

  if (targetInstrument.clef === 'F') {
    // Na Clave de Fá, a região central ideal é em torno de 46..59 (Sib2 a Si3, centro ~53 Fá3)
    let bestShift = 0;
    let bestDist = Math.abs(rawWrittenMedian - ideal);
    for (const candidate of [-24, -12, 0, 12, 24]) {
      const dist = Math.abs(rawWrittenMedian + candidate - ideal);
      if (dist < bestDist) {
        bestDist = dist;
        bestShift = candidate;
      }
    }
    return bestShift;
  }

  // Na Clave de Sol, se a mediana escrita cair muito grave (< 57, Lá3) ou muito aguda (> 81, Lá5), ajusta 1 oitava
  if (rawWrittenMedian < 57) {
    return 12;
  }
  if (rawWrittenMedian > 81) {
    return -12;
  }
  return 0;
}

/**
 * Aplica matematicamente todas as transformações no XML .mscx preservando a diagramação original do MuseScore 3:
 * - Transposição cromática com acidentes estritamente simples (# ou b) fiéis à armadura de clave
 * - Transposição simultânea das pautas ocultas de Piano e Baixo (ignorando Bateria/Percussão)
 * - Adaptação de clave (Sol <-> Fá) e proteção automática de tessitura + controle manual de oitava
 * - Mute obrigatório (<play>0</play>) nas cifras da pauta principal e unmute nas pautas ocultas
 * - Conversão opcional das cifras visíveis para instrumentos em Sib (+2 semitons) e Mib (-3/+9 semitons)
 * - Ocultação/exibição de cifras, letras e cabeçalhos (mantendo fonte e tamanho originais travados)
 * - Injeção imutável da marca d'água "Rubsax Partituras" no rodapé
 */
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

  const targetInstrument = getInstrumentById(options.targetInstrumentId);
  const semitoneShift = options.semitoneShift;

  // 1. Calcular nova Tonalidade Base (Piano / Dó) e Tonalidade Escrita na Pauta Principal
  const newConcertPc =
    ((analysis.originalConcertPitchClass + semitoneShift) % 12 + 12) % 12;
  const concertTonality = getTonalityByPitchClass(newConcertPc);
  const newConcertKeyFifths = concertTonality.fifths;

  const newWrittenPc =
    ((newConcertPc + targetInstrument.writtenSemitoneOffset) % 12 + 12) % 12;
  const writtenTonality = getTonalityByPitchClass(newWrittenPc);
  const newWrittenKeyFifths = writtenTonality.fifths;

  // 2. Garantir layoutMode = page (para renderização limpa e fiel de páginas no SVG e PDF)
  removeDirectChildrenByTag(scoreEl, 'layoutMode');

  // 3. Blindar Marca d'Água Obrigatória "Rubsax Partituras" no <Style> e <metaTag name="copyright">
  let styleEl = getFirstDirectChildByTag(scoreEl, 'Style');
  if (!styleEl) {
    styleEl = doc.createElement('Style');
    scoreEl.insertBefore(styleEl, scoreEl.firstChild);
  }
  setOrCreateDirectChildText(doc, styleEl, 'showFooter', '1');
  setOrCreateDirectChildText(doc, styleEl, 'footerFirstPage', '1');
  setOrCreateDirectChildText(doc, styleEl, 'oddFooterR', 'Rubsax Partituras');
  setOrCreateDirectChildText(doc, styleEl, 'evenFooterR', 'Rubsax Partituras');
  setOrCreateDirectChildText(doc, styleEl, 'oddFooterC', '© Rubsax Partituras');
  setOrCreateDirectChildText(doc, styleEl, 'evenFooterC', '© Rubsax Partituras');

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

  // 4. Atualizar <Part> principal (Instrumento, Clave, Transposição) e ocultar pautas secundárias
  const partEls = getDirectChildrenByTag(scoreEl, 'Part');
  const mainStaffId = analysis.staves[0]?.staffId || '1';

  partEls.forEach((partEl, pIdx) => {
    if (pIdx === 0) {
      // Pauta principal sempre visível
      removeDirectChildrenByTag(partEl, 'show');
      setOrCreateDirectChildText(doc, partEl, 'trackName', targetInstrument.name);

      const pStaff = getFirstDirectChildByTag(partEl, 'Staff');
      if (pStaff) {
        removeDirectChildrenByTag(pStaff, 'invisible');
        if (targetInstrument.clef === 'F') {
          setOrCreateDirectChildText(doc, pStaff, 'defaultClef', 'F');
        } else {
          removeDirectChildrenByTag(pStaff, 'defaultClef');
        }
      }

      const instrEl = getFirstDirectChildByTag(partEl, 'Instrument');
      if (instrEl) {
        setOrCreateDirectChildText(doc, instrEl, 'trackName', targetInstrument.name);
        setOrCreateDirectChildText(
          doc,
          instrEl,
          'instrumentId',
          targetInstrument.musescoreInstrumentId
        );

        if (targetInstrument.transposeChromatic !== 0) {
          setOrCreateDirectChildText(
            doc,
            instrEl,
            'transposeDiatonic',
            String(targetInstrument.transposeDiatonic),
            'instrumentId'
          );
          setOrCreateDirectChildText(
            doc,
            instrEl,
            'transposeChromatic',
            String(targetInstrument.transposeChromatic),
            'instrumentId'
          );
        } else {
          removeDirectChildrenByTag(instrEl, 'transposeDiatonic');
          removeDirectChildrenByTag(instrEl, 'transposeChromatic');
        }

        // Atualizar programa MIDI do canal principal
        const channelEls = getDirectChildrenByTag(instrEl, 'Channel');
        for (const chEl of channelEls) {
          if ((chEl.getAttribute('name') || '') !== 'harmony') {
            const progEl = getFirstDirectChildByTag(chEl, 'program');
            if (progEl) {
              progEl.setAttribute('value', String(targetInstrument.midiProgram));
            }
          }
        }
      }
    } else {
      // Pautas ocultas de acompanhamento (Piano, Baixo, Bateria): sempre ocultas na tela e no PDF
      setOrCreateDirectChildText(doc, partEl, 'show', '0');
    }
  });

  // 5. Calcular ajuste automático de tessitura + oitava manual para a pauta principal
  const autoTessituraOctaveSemitones = computeAutoTessituraOctaveSemitones(
    analysis.originalMedianConcertPitch,
    semitoneShift,
    targetInstrument
  );
  const manualOctaveSemitones = options.octaveShift * 12;
  const totalMainStaffPitchDelta =
    semitoneShift + autoTessituraOctaveSemitones + manualOctaveSemitones;

  // 6. Processar cada <Staff> dentro de <Score>
  const staffBodies = getDirectChildrenByTag(scoreEl, 'Staff');
  const previewChords: string[] = [];

  staffBodies.forEach((staffBody, sIdx) => {
    const sid = staffBody.getAttribute('id') || String(sIdx + 1);
    const staffMeta =
      analysis.staves.find((st) => st.staffId === sid) || analysis.staves[sIdx];
    const isMainSolo = sid === mainStaffId || sIdx === 0;
    const isPercussion = staffMeta ? staffMeta.isPercussion : false;

    if (!isMainSolo) {
      // Garantir que pautas secundárias permaneçam ocultas visualmente
      setOrCreateDirectChildText(doc, staffBody, 'visible', '0', 'Measure');
    } else {
      removeDirectChildrenByTag(staffBody, 'visible');
    }

    // Se for pauta principal, processar <VBox> (Cabeçalhos) e <Clef>
    if (isMainSolo) {
      updateMainStaffHeaders(
        doc,
        staffBody,
        options.headers,
        concertTonality,
        targetInstrument
      );

      // Atualizar ou injetar <Clef> na pauta principal quando mudar entre Clave de Sol (G) e Clave de Fá (F)
      const clefNodes = staffBody.getElementsByTagName('Clef');
      for (let i = 0; i < clefNodes.length; i++) {
        const cNode = clefNodes.item(i)!;
        setOrCreateDirectChildText(doc, cNode, 'concertClefType', targetInstrument.clef);
        setOrCreateDirectChildText(doc, cNode, 'transposingClefType', targetInstrument.clef);
      }
    }

    // Ignorar transposição de alturas e armadura em pautas de Percussão / Bateria
    if (isPercussion) {
      const percHarmonies = staffBody.getElementsByTagName('Harmony');
      for (let i = 0; i < percHarmonies.length; i++) {
        removeDirectChildrenByTag(percHarmonies.item(i)!, 'play');
      }
      return;
    }

    // Determinar nova armadura para esta pauta
    const targetStaffKeyFifths = isMainSolo ? newWrittenKeyFifths : newConcertKeyFifths;
    const origStaffKeyFifths = isMainSolo
      ? analysis.originalWrittenKeyFifths
      : analysis.originalConcertKeyFifths;
    const fifthsDeltaForModulations = targetStaffKeyFifths - origStaffKeyFifths;

    // 6a. Atualizar todas as armaduras de clave (<KeySig>) da pauta
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
    const staffPitchDelta = isMainSolo ? totalMainStaffPitchDelta : semitoneShift;

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

      if (isMainSolo && targetInstrument.transposeChromatic !== 0) {
        const newWrittenPitch = newConcertPitch - targetInstrument.transposeChromatic;
        const newWrittenNotePc = ((newWrittenPitch % 12) + 12) % 12;
        const newWrittenTpc = pitchClassToSimpleTpc(
          newWrittenNotePc,
          newWrittenKeyFifths,
          preferFlat
        );
        setOrCreateDirectChildText(doc, noteNode, 'tpc2', String(newWrittenTpc));
      } else {
        removeDirectChildrenByTag(noteNode, 'tpc2');
      }

      // Remover <Accidental> fixo antigo para que o MuseScore 3 gere os acidentes ocorrentes (#, b ou bequadro)
      // estritamente a partir do novo <tpc>/<tpc2> simples e da nova <KeySig>
      removeDirectChildrenByTag(noteNode, 'Accidental');
    }

    // 6c. Processar Cifras (<Harmony>)
    const harmonyNodes = Array.from(staffBody.getElementsByTagName('Harmony'));
    const isTransposingTarget =
      targetInstrument.groupId === 'BB_TREBLE' || targetInstrument.groupId === 'EB_TREBLE';
    const shouldTransposeVisibleChordsToInstrument =
      isMainSolo && isTransposingTarget && options.convertBbEbChordsToWritten;

    const chordSemitoneDelta =
      semitoneShift +
      (shouldTransposeVisibleChordsToInstrument
        ? targetInstrument.writtenSemitoneOffset
        : 0);
    const chordKeyFifths = shouldTransposeVisibleChordsToInstrument
      ? newWrittenKeyFifths
      : newConcertKeyFifths;

    for (const hNode of harmonyNodes) {
      if (isMainSolo && !options.showChords) {
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
          const newRootTpc = pitchClassToSimpleTpc(
            newRootPc,
            chordKeyFifths,
            origRootTpc <= 12
          );
          setOrCreateDirectChildText(doc, hNode, 'root', String(newRootTpc));

          // Transpor baixo da cifra (slash chord <base>, ex: C/E -> D/F#) se existir
          const baseText = getDirectChildText(hNode, 'base');
          let bassSuffix = '';
          if (baseText) {
            const origBaseTpc = parseInt(baseText, 10);
            if (!Number.isNaN(origBaseTpc)) {
              const origBasePc = tpcToPitchClass(origBaseTpc);
              const newBasePc = ((origBasePc + chordSemitoneDelta) % 12 + 12) % 12;
              const newBaseTpc = pitchClassToSimpleTpc(
                newBasePc,
                chordKeyFifths,
                origBaseTpc <= 12
              );
              setOrCreateDirectChildText(doc, hNode, 'base', String(newBaseTpc));
              bassSuffix = `/${tpcToNoteName(newBaseTpc)}`;
            }
          }

          if (isMainSolo && previewChords.length < 8) {
            const chordQuality = getDirectChildText(hNode, 'name', '');
            const label = `${tpcToNoteName(newRootTpc)}${chordQuality}${bassSuffix}`;
            if (!previewChords.includes(label)) {
              previewChords.push(label);
            }
          }
        }
      }

      // Regra de Mute de Cifras:
      // Na pauta principal do instrumento solo: SEMPRE mutadas (<play>0</play>)
      // Nas pautas ocultas (Piano, Baixo, Bateria): SEMPRE desmutadas
      if (isMainSolo) {
        setOrCreateDirectChildText(doc, hNode, 'play', '0');
      } else {
        removeDirectChildrenByTag(hNode, 'play');
      }
    }

    // 6d. Processar Letras (<Lyrics>) na pauta principal
    if (isMainSolo && !options.showLyrics) {
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
    targetInstrument,
    appliedSemitoneShift: semitoneShift,
    appliedAutoOctaveSemitones: autoTessituraOctaveSemitones,
    appliedManualOctaveSemitones: manualOctaveSemitones,
    previewChords,
  };
}

function updateMainStaffHeaders(
  doc: Document,
  staffBody: Element,
  headers: ScoreHeadersState,
  concertTonality: TonalityDefinition,
  targetInstrument: InstrumentDefinition
): void {
  const vboxes = getDirectChildrenByTag(staffBody, 'VBox');
  if (!headers.showAllHeaders) {
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

  const effectiveLyricistText = headers.lyricist.autoSyncPianoKey
    ? `Tom para Piano:\n${concertTonality.majorName}`
    : headers.lyricist.text;

  const effectiveComposerText = headers.composer.autoSyncInstrument
    ? targetInstrument.headerInstrumentText
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

  const existingTextEls = getDirectChildrenByTag(vbox, 'Text');
  const handledKeys = new Set<string>();

  for (const tb of existingTextEls) {
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

  // Create any missing header blocks that the user enabled and filled in
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

/**
 * Recompacta o .mscx modificado dentro do arquivo .mscz original (preservando META-INF/container.xml e estilos)
 * ou cria um pacote .mscz válido a partir de um .mscx / .xml
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

  if (ext.endsWith('.mscz')) {
    const zip = await JSZip.loadAsync(uint8);
    const entryNames = Object.keys(zip.files);
    const mscxEntryName =
      entryNames.find((n) => n.toLowerCase().endsWith('.mscx')) || 'score.mscx';
    zip.file(mscxEntryName, modifiedMscxContent);
    return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  // Se o upload original foi .mscx ou .xml, empacota em um .mscz padrão do MuseScore 3
  const zip = new JSZip();
  const internalName = 'score.mscx';
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="${internalName}"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);
  zip.file(internalName, modifiedMscxContent);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
