export type InstrumentGroupId = 'C_TREBLE' | 'C_BASS' | 'BB_TREBLE' | 'EB_TREBLE';

export type ClefType = 'G' | 'F';

export interface InstrumentDefinition {
  id: string;
  name: string;
  groupId: InstrumentGroupId;
  groupLabel: string;
  tuningLabel: string;
  clef: ClefType;
  /** MuseScore <transposeChromatic> tag value (Concert - Written in semitones) */
  transposeChromatic: number;
  /** MuseScore <transposeDiatonic> tag value */
  transposeDiatonic: number;
  /** Semitones to add to Concert Pitch to obtain Written Pitch (+2 for Bb, +9/-3 for Eb, 0 for C) */
  writtenSemitoneOffset: number;
  /** Fifths to add to Concert Key Signature to obtain Written Key Signature (+2 for Bb, +3 for Eb, 0 for C) */
  fifthsOffset: number;
  /** Ideal median written MIDI pitch on the staff to avoid excessive ledger lines */
  idealMedianWrittenPitch: number;
  /** MuseScore instrumentId & MIDI program */
  musescoreInstrumentId: string;
  midiProgram: number;
  headerInstrumentText: string;
}

export interface InstrumentGroupDefinition {
  id: InstrumentGroupId;
  title: string;
  shortTitle: string;
  tuningPitch: 'C' | 'Bb' | 'Eb';
  clef: ClefType;
  description: string;
  fifthsOffset: number;
  writtenSemitoneOffset: number;
  instruments: InstrumentDefinition[];
}

export const INSTRUMENT_DEFINITIONS: InstrumentDefinition[] = [
  // GRUPO 1: Afinados em Dó (Clave de Sol)
  {
    id: 'violin',
    name: 'Violino',
    groupId: 'C_TREBLE',
    groupLabel: '1. Afinados em Dó (Clave de Sol)',
    tuningLabel: 'Dó (C)',
    clef: 'G',
    transposeChromatic: 0,
    transposeDiatonic: 0,
    writtenSemitoneOffset: 0,
    fifthsOffset: 0,
    idealMedianWrittenPitch: 69,
    musescoreInstrumentId: 'strings.violin',
    midiProgram: 40,
    headerInstrumentText: 'Violino, Flauta, Oboé e Teclado',
  },
  {
    id: 'recorder',
    name: 'Flauta Doce',
    groupId: 'C_TREBLE',
    groupLabel: '1. Afinados em Dó (Clave de Sol)',
    tuningLabel: 'Dó (C)',
    clef: 'G',
    transposeChromatic: 0,
    transposeDiatonic: 0,
    writtenSemitoneOffset: 0,
    fifthsOffset: 0,
    idealMedianWrittenPitch: 70,
    musescoreInstrumentId: 'wind.flutes.recorder.soprano',
    midiProgram: 74,
    headerInstrumentText: 'Flauta Doce, Flauta Transversal e Violino',
  },
  {
    id: 'flute',
    name: 'Flauta Transversal',
    groupId: 'C_TREBLE',
    groupLabel: '1. Afinados em Dó (Clave de Sol)',
    tuningLabel: 'Dó (C)',
    clef: 'G',
    transposeChromatic: 0,
    transposeDiatonic: 0,
    writtenSemitoneOffset: 0,
    fifthsOffset: 0,
    idealMedianWrittenPitch: 70,
    musescoreInstrumentId: 'wind.flutes.flute',
    midiProgram: 73,
    headerInstrumentText: 'Flauta Transversal, Violino e Oboé',
  },
  {
    id: 'oboe',
    name: 'Oboé',
    groupId: 'C_TREBLE',
    groupLabel: '1. Afinados em Dó (Clave de Sol)',
    tuningLabel: 'Dó (C)',
    clef: 'G',
    transposeChromatic: 0,
    transposeDiatonic: 0,
    writtenSemitoneOffset: 0,
    fifthsOffset: 0,
    idealMedianWrittenPitch: 68,
    musescoreInstrumentId: 'wind.reed.oboe',
    midiProgram: 68,
    headerInstrumentText: 'Oboé, Violino e Flauta',
  },
  {
    id: 'keyboard',
    name: 'Teclado',
    groupId: 'C_TREBLE',
    groupLabel: '1. Afinados em Dó (Clave de Sol)',
    tuningLabel: 'Dó (C)',
    clef: 'G',
    transposeChromatic: 0,
    transposeDiatonic: 0,
    writtenSemitoneOffset: 0,
    fifthsOffset: 0,
    idealMedianWrittenPitch: 67,
    musescoreInstrumentId: 'keyboard.piano',
    midiProgram: 0,
    headerInstrumentText: 'Teclado, Piano, Violino e Flauta',
  },

  // GRUPO 2: Clave de Fá (Afinados em Dó)
  {
    id: 'trombone',
    name: 'Trombone',
    groupId: 'C_BASS',
    groupLabel: '2. Clave de Fá (Afinados em Dó)',
    tuningLabel: 'Dó Grave (Clave de Fá)',
    clef: 'F',
    transposeChromatic: 0,
    transposeDiatonic: 0,
    writtenSemitoneOffset: 0,
    fifthsOffset: 0,
    idealMedianWrittenPitch: 53, // F3 in Bass Clef
    musescoreInstrumentId: 'brass.trombone',
    midiProgram: 57,
    headerInstrumentText: 'Trombone, Bombardino e Violoncelo',
  },
  {
    id: 'euphonium',
    name: 'Bombardino',
    groupId: 'C_BASS',
    groupLabel: '2. Clave de Fá (Afinados em Dó)',
    tuningLabel: 'Dó Grave (Clave de Fá)',
    clef: 'F',
    transposeChromatic: 0,
    transposeDiatonic: 0,
    writtenSemitoneOffset: 0,
    fifthsOffset: 0,
    idealMedianWrittenPitch: 53,
    musescoreInstrumentId: 'brass.euphonium',
    midiProgram: 58,
    headerInstrumentText: 'Bombardino, Trombone e Violoncelo',
  },
  {
    id: 'cello',
    name: 'Violoncelo',
    groupId: 'C_BASS',
    groupLabel: '2. Clave de Fá (Afinados em Dó)',
    tuningLabel: 'Dó Grave (Clave de Fá)',
    clef: 'F',
    transposeChromatic: 0,
    transposeDiatonic: 0,
    writtenSemitoneOffset: 0,
    fifthsOffset: 0,
    idealMedianWrittenPitch: 53,
    musescoreInstrumentId: 'strings.cello',
    midiProgram: 42,
    headerInstrumentText: 'Violoncelo, Trombone e Bombardino',
  },

  // GRUPO 3: Afinados em Si Bemol (Bb - Clave de Sol)
  {
    id: 'clarinet',
    name: 'Clarinete',
    groupId: 'BB_TREBLE',
    groupLabel: '3. Afinados em Si Bemol (Bb - Clave de Sol)',
    tuningLabel: 'Si Bemol (Bb)',
    clef: 'G',
    transposeChromatic: -2,
    transposeDiatonic: -1,
    writtenSemitoneOffset: 2,
    fifthsOffset: 2,
    idealMedianWrittenPitch: 69,
    musescoreInstrumentId: 'wind.reed.clarinet.bflat',
    midiProgram: 71,
    headerInstrumentText: 'Clarinete, Sax Tenor, Sax Soprano e Trompete',
  },
  {
    id: 'trumpet',
    name: 'Trompete',
    groupId: 'BB_TREBLE',
    groupLabel: '3. Afinados em Si Bemol (Bb - Clave de Sol)',
    tuningLabel: 'Si Bemol (Bb)',
    clef: 'G',
    transposeChromatic: -2,
    transposeDiatonic: -1,
    writtenSemitoneOffset: 2,
    fifthsOffset: 2,
    idealMedianWrittenPitch: 69,
    musescoreInstrumentId: 'brass.trumpet.bflat',
    midiProgram: 56,
    headerInstrumentText: 'Trompete, Clarinete, Sax Soprano e Sax Tenor',
  },
  {
    id: 'tenor-sax',
    name: 'Sax Tenor',
    groupId: 'BB_TREBLE',
    groupLabel: '3. Afinados em Si Bemol (Bb - Clave de Sol)',
    tuningLabel: 'Si Bemol (Bb)',
    clef: 'G',
    transposeChromatic: -2,
    transposeDiatonic: -1,
    writtenSemitoneOffset: 2,
    fifthsOffset: 2,
    idealMedianWrittenPitch: 69,
    musescoreInstrumentId: 'wind.reed.saxophone.tenor',
    midiProgram: 66,
    headerInstrumentText: 'Sax Tenor, Clarinete, Sax Soprano e Trompete',
  },
  {
    id: 'soprano-sax',
    name: 'Sax Soprano',
    groupId: 'BB_TREBLE',
    groupLabel: '3. Afinados em Si Bemol (Bb - Clave de Sol)',
    tuningLabel: 'Si Bemol (Bb)',
    clef: 'G',
    transposeChromatic: -2,
    transposeDiatonic: -1,
    writtenSemitoneOffset: 2,
    fifthsOffset: 2,
    idealMedianWrittenPitch: 69,
    musescoreInstrumentId: 'wind.reed.saxophone.soprano',
    midiProgram: 64,
    headerInstrumentText: 'Sax Soprano, Clarinete, Sax Tenor e Trompete',
  },

  // GRUPO 4: Afinados em Mi Bemol (Eb - Clave de Sol)
  {
    id: 'alto-sax',
    name: 'Sax Alto',
    groupId: 'EB_TREBLE',
    groupLabel: '4. Afinados em Mi Bemol (Eb - Clave de Sol)',
    tuningLabel: 'Mi Bemol (Eb)',
    clef: 'G',
    transposeChromatic: -9,
    transposeDiatonic: -5,
    writtenSemitoneOffset: 9,
    fifthsOffset: 3,
    idealMedianWrittenPitch: 69,
    musescoreInstrumentId: 'wind.reed.saxophone.alto',
    midiProgram: 65,
    headerInstrumentText: 'Sax Alto, Sax Barítono',
  },
  {
    id: 'baritone-sax',
    name: 'Sax Barítono',
    groupId: 'EB_TREBLE',
    groupLabel: '4. Afinados em Mi Bemol (Eb - Clave de Sol)',
    tuningLabel: 'Mi Bemol (Eb)',
    clef: 'G',
    transposeChromatic: -9,
    transposeDiatonic: -5,
    writtenSemitoneOffset: 9,
    fifthsOffset: 3,
    idealMedianWrittenPitch: 69,
    musescoreInstrumentId: 'wind.reed.saxophone.baritone',
    midiProgram: 67,
    headerInstrumentText: 'Sax Barítono, Sax Alto',
  },
];

export const INSTRUMENT_GROUPS: InstrumentGroupDefinition[] = [
  {
    id: 'C_TREBLE',
    title: '1. Afinados em Dó (Clave de Sol)',
    shortTitle: 'Dó (Clave de Sol)',
    tuningPitch: 'C',
    clef: 'G',
    description: 'Violino, Flauta Doce, Flauta Transversal, Oboé, Teclado',
    fifthsOffset: 0,
    writtenSemitoneOffset: 0,
    instruments: INSTRUMENT_DEFINITIONS.filter((i) => i.groupId === 'C_TREBLE'),
  },
  {
    id: 'C_BASS',
    title: '2. Clave de Fá (Afinados em Dó)',
    shortTitle: 'Clave de Fá (Dó)',
    tuningPitch: 'C',
    clef: 'F',
    description: 'Trombone, Bombardino, Violoncelo (converte pauta para Clave de Fá)',
    fifthsOffset: 0,
    writtenSemitoneOffset: 0,
    instruments: INSTRUMENT_DEFINITIONS.filter((i) => i.groupId === 'C_BASS'),
  },
  {
    id: 'BB_TREBLE',
    title: '3. Afinados em Si Bemol (Bb - Clave de Sol)',
    shortTitle: 'Si Bemol (Bb)',
    tuningPitch: 'Bb',
    clef: 'G',
    description: 'Clarinete, Trompete, Sax Tenor, Sax Soprano (+2 semitons na escrita)',
    fifthsOffset: 2,
    writtenSemitoneOffset: 2,
    instruments: INSTRUMENT_DEFINITIONS.filter((i) => i.groupId === 'BB_TREBLE'),
  },
  {
    id: 'EB_TREBLE',
    title: '4. Afinados em Mi Bemol (Eb - Clave de Sol)',
    shortTitle: 'Mi Bemol (Eb)',
    tuningPitch: 'Eb',
    clef: 'G',
    description: 'Sax Alto, Sax Barítono (-3 / +9 semitons na escrita)',
    fifthsOffset: 3,
    writtenSemitoneOffset: 9,
    instruments: INSTRUMENT_DEFINITIONS.filter((i) => i.groupId === 'EB_TREBLE'),
  },
];

export interface TonalityDefinition {
  /** Chromatic pitch class 0..11 (0 = C, 1 = Db, 2 = D, ..., 11 = B) */
  pitchClass: number;
  /** Standard MuseScore KeySig <accidental> value (-5 to +6) */
  fifths: number;
  majorName: string;
  minorName: string;
  fullLabel: string;
  accidentalSummary: string;
  accidentalKind: 'sharp' | 'flat' | 'natural';
}

/**
 * As 12 tonalidades maiores/menores relativas (ordenadas pelo ciclo de quintas ou cromático)
 */
export const TONALITIES: TonalityDefinition[] = [
  {
    pitchClass: 0,
    fifths: 0,
    majorName: 'Dó Maior',
    minorName: 'Lá menor',
    fullLabel: 'Dó Maior / Lá menor',
    accidentalSummary: '0 acidentes',
    accidentalKind: 'natural',
  },
  {
    pitchClass: 7,
    fifths: 1,
    majorName: 'Sol Maior',
    minorName: 'Mi menor',
    fullLabel: 'Sol Maior / Mi menor',
    accidentalSummary: '1 sustenido (1♯)',
    accidentalKind: 'sharp',
  },
  {
    pitchClass: 2,
    fifths: 2,
    majorName: 'Ré Maior',
    minorName: 'Si menor',
    fullLabel: 'Ré Maior / Si menor',
    accidentalSummary: '2 sustenidos (2♯)',
    accidentalKind: 'sharp',
  },
  {
    pitchClass: 9,
    fifths: 3,
    majorName: 'Lá Maior',
    minorName: 'Fá# menor',
    fullLabel: 'Lá Maior / Fá# menor',
    accidentalSummary: '3 sustenidos (3♯)',
    accidentalKind: 'sharp',
  },
  {
    pitchClass: 4,
    fifths: 4,
    majorName: 'Mi Maior',
    minorName: 'Dó# menor',
    fullLabel: 'Mi Maior / Dó# menor',
    accidentalSummary: '4 sustenidos (4♯)',
    accidentalKind: 'sharp',
  },
  {
    pitchClass: 11,
    fifths: 5,
    majorName: 'Si Maior',
    minorName: 'Sol# menor',
    fullLabel: 'Si Maior / Sol# menor',
    accidentalSummary: '5 sustenidos (5♯)',
    accidentalKind: 'sharp',
  },
  {
    pitchClass: 6,
    fifths: 6,
    majorName: 'Fá# Maior',
    minorName: 'Ré# menor',
    fullLabel: 'Fá# Maior / Ré# menor',
    accidentalSummary: '6 sustenidos (6♯)',
    accidentalKind: 'sharp',
  },
  {
    pitchClass: 1,
    fifths: -5,
    majorName: 'Réb Maior',
    minorName: 'Sib menor',
    fullLabel: 'Réb Maior / Sib menor',
    accidentalSummary: '5 bemóis (5♭)',
    accidentalKind: 'flat',
  },
  {
    pitchClass: 8,
    fifths: -4,
    majorName: 'Láb Maior',
    minorName: 'Fá menor',
    fullLabel: 'Láb Maior / Fá menor',
    accidentalSummary: '4 bemóis (4♭)',
    accidentalKind: 'flat',
  },
  {
    pitchClass: 3,
    fifths: -3,
    majorName: 'Mib Maior',
    minorName: 'Dó menor',
    fullLabel: 'Mib Maior / Dó menor',
    accidentalSummary: '3 bemóis (3♭)',
    accidentalKind: 'flat',
  },
  {
    pitchClass: 10,
    fifths: -2,
    majorName: 'Sib Maior',
    minorName: 'Sol menor',
    fullLabel: 'Sib Maior / Sol menor',
    accidentalSummary: '2 bemóis (2♭)',
    accidentalKind: 'flat',
  },
  {
    pitchClass: 5,
    fifths: -1,
    majorName: 'Fá Maior',
    minorName: 'Ré menor',
    fullLabel: 'Fá Maior / Ré menor',
    accidentalSummary: '1 bemol (1♭)',
    accidentalKind: 'flat',
  },
];

/**
 * Mapeamento estrito de Pitch Class (0..11) -> TPC (Tonal Pitch Class do MuseScore)
 * usando EXCLUSIVAMENTE acidentes simples (# ou bequadro) para armaduras de sustenido.
 * Nunca gera dobrado sustenido (x), dobrado bemol (bb), Cb, Fb, E#, B#.
 */
export const SHARP_KEY_PC_TO_TPC: Record<number, number> = {
  0: 14,  // C
  1: 21,  // C#
  2: 16,  // D
  3: 23,  // D#
  4: 18,  // E
  5: 13,  // F
  6: 20,  // F#
  7: 15,  // G
  8: 22,  // G#
  9: 17,  // A
  10: 24, // A#
  11: 19, // B
};

/**
 * Mapeamento estrito de Pitch Class (0..11) -> TPC (Tonal Pitch Class do MuseScore)
 * usando EXCLUSIVAMENTE acidentes simples (b ou bequadro) para armaduras de bemol.
 * Nunca gera dobrado bemol (bb), dobrado sustenido (x), Cb, Fb, E#, B#.
 */
export const FLAT_KEY_PC_TO_TPC: Record<number, number> = {
  0: 14,  // C
  1: 9,   // Db
  2: 16,  // D
  3: 11,  // Eb
  4: 18,  // E
  5: 13,  // F
  6: 8,   // Gb
  7: 15,  // G
  8: 10,  // Ab
  9: 17,  // A
  10: 12, // Bb
  11: 19, // B
};

/**
 * Converte qualquer valor de quintas (KeySig accidental) para o intervalo simples [-5, +6],
 * evitando armaduras com 7 acidentes ou acidentes dobrados.
 */
export function normalizeKeySigFifths(rawFifths: number): number {
  let f = rawFifths;
  while (f > 6) f -= 12;
  while (f < -5) f += 12;
  return f;
}

/**
 * Obtém a definição de tonalidade a partir do valor de quintas (KeySig accidental)
 */
export function getTonalityByFifths(rawFifths: number): TonalityDefinition {
  const norm = normalizeKeySigFifths(rawFifths);
  return TONALITIES.find((t) => t.fifths === norm) || TONALITIES[0];
}

/**
 * Obtém a definição de tonalidade a partir da classe de altura cromática (0..11)
 */
export function getTonalityByPitchClass(pc: number): TonalityDefinition {
  const normPc = ((pc % 12) + 12) % 12;
  return TONALITIES.find((t) => t.pitchClass === normPc) || TONALITIES[0];
}

/**
 * Converte um TPC do MuseScore (-1..33) para Pitch Class cromática (0..11, onde 0 = Dó)
 */
export function tpcToPitchClass(tpc: number): number {
  return (((tpc - 14) * 7) % 12 + 12) % 12;
}

/**
 * Converte uma Pitch Class (0..11) para TPC simples respeitando estritamente a armadura de clave:
 * - Armadura de sustenidos (keySigFifths > 0): usa apenas sustenidos (#) e naturais (tpc 13..24)
 * - Armadura de bemóis (keySigFifths < 0): usa apenas bemóis (b) e naturais (tpc 8..19)
 * - Armadura neutra (keySigFifths === 0): preserva preferência original (bemol se origTpc <= 12, senão sustenido)
 */
export function pitchClassToSimpleTpc(
  pitchClass: number,
  keySigFifths: number,
  preferFlatOnNeutralKey = false
): number {
  const pc = ((pitchClass % 12) + 12) % 12;
  if (keySigFifths > 0) {
    return SHARP_KEY_PC_TO_TPC[pc];
  }
  if (keySigFifths < 0) {
    return FLAT_KEY_PC_TO_TPC[pc];
  }
  return preferFlatOnNeutralKey ? FLAT_KEY_PC_TO_TPC[pc] : SHARP_KEY_PC_TO_TPC[pc];
}

/**
 * Converte TPC do MuseScore para nome legível de cifra (C, F#, Bb, etc.)
 */
export function tpcToNoteName(tpc: number): string {
  const names: Record<number, string> = {
    6: 'Fb',
    7: 'Cb',
    8: 'Gb',
    9: 'Db',
    10: 'Ab',
    11: 'Eb',
    12: 'Bb',
    13: 'F',
    14: 'C',
    15: 'G',
    16: 'D',
    17: 'A',
    18: 'E',
    19: 'B',
    20: 'F#',
    21: 'C#',
    22: 'G#',
    23: 'D#',
    24: 'A#',
    25: 'E#',
    26: 'B#',
  };
  if (names[tpc]) return names[tpc];
  const pc = tpcToPitchClass(tpc);
  return names[SHARP_KEY_PC_TO_TPC[pc]] || 'C';
}

export function getInstrumentById(id: string): InstrumentDefinition {
  return (
    INSTRUMENT_DEFINITIONS.find((i) => i.id === id) || INSTRUMENT_DEFINITIONS[0]
  );
}
