import { DOMParser } from '@xmldom/xmldom';

interface TpcSpelling {
  step: string;
  alter: number;
}

const TPC_SPELLING_MAP: Record<number, TpcSpelling> = {
  8: { step: 'G', alter: -1 },
  9: { step: 'D', alter: -1 },
  10: { step: 'A', alter: -1 },
  11: { step: 'E', alter: -1 },
  12: { step: 'B', alter: -1 },
  13: { step: 'F', alter: 0 },
  14: { step: 'C', alter: 0 },
  15: { step: 'G', alter: 0 },
  16: { step: 'D', alter: 0 },
  17: { step: 'A', alter: 0 },
  18: { step: 'E', alter: 0 },
  19: { step: 'B', alter: 0 },
  20: { step: 'F', alter: 1 },
  21: { step: 'C', alter: 1 },
  22: { step: 'G', alter: 1 },
  23: { step: 'D', alter: 1 },
  24: { step: 'A', alter: 1 },
};

function escapeXml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getChildText(parent: Element, tagName: string, fallback = ''): string {
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const n = children.item(i);
    if (n && n.nodeType === 1 && (n as Element).tagName === tagName) {
      return (n.textContent || '').trim();
    }
  }
  return fallback;
}

function getDirectChildren(parent: Element, tagName?: string): Element[] {
  const out: Element[] = [];
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const n = children.item(i);
    if (n && n.nodeType === 1) {
      const el = n as Element;
      if (!tagName || el.tagName === tagName) {
        out.push(el);
      }
    }
  }
  return out;
}

function mapChordQualityToMusicXmlKind(rawName: string): { kind: string; text: string } {
  const n = (rawName || '').trim();
  if (!n) return { kind: 'major', text: '' };
  const lower = n.toLowerCase();
  if (lower === 'm' || lower === 'min' || lower === '-') return { kind: 'minor', text: 'm' };
  if (lower === '7') return { kind: 'dominant', text: '7' };
  if (lower === 'm7' || lower === 'min7') return { kind: 'minor-seventh', text: 'm7' };
  if (lower === 'maj7' || lower === '7m' || lower === '7+')
    return { kind: 'major-seventh', text: n };
  if (lower === 'sus4' || lower === '4') return { kind: 'suspended-fourth', text: 'sus4' };
  if (lower === 'sus2' || lower === '2') return { kind: 'suspended-second', text: 'sus2' };
  if (lower === 'dim' || lower === 'o') return { kind: 'diminished', text: 'dim' };
  if (lower === 'm7b5' || lower === 'm7(b5)')
    return { kind: 'half-diminished', text: 'm7(b5)' };
  if (lower === 'aug' || lower === '+') return { kind: 'augmented', text: '+' };
  if (lower === '6') return { kind: 'major-sixth', text: '6' };
  if (lower === 'm6') return { kind: 'minor-sixth', text: 'm6' };
  if (lower === '9') return { kind: 'dominant-ninth', text: '9' };
  if (lower === 'add9') return { kind: 'major', text: 'add9' };
  return { kind: 'other', text: n };
}

/**
 * Converte a pauta principal visível de um XML .mscx do MuseScore 3 em um documento MusicXML 3.1
 * completo para renderização interativa no navegador via OpenSheetMusicDisplay (OSMD).
 */
export function convertMscxToMusicXml(mscxContent: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(mscxContent, 'text/xml');
  const scoreEl = doc.getElementsByTagName('Score').item(0);
  if (!scoreEl) {
    throw new Error('Estrutura <Score> não encontrada para conversão MusicXML.');
  }

  const parts = getDirectChildren(scoreEl, 'Part');
  const firstPart = parts[0];
  let trackName = 'Instrumento Solo';
  let transposeChromatic = 0;
  let clefSign: 'G' | 'F' = 'G';

  if (firstPart) {
    trackName = getChildText(firstPart, 'trackName', 'Instrumento Solo');
    const pStaff = getDirectChildren(firstPart, 'Staff')[0];
    if (pStaff) {
      const defClef = getChildText(pStaff, 'defaultClef', 'G').toUpperCase();
      if (defClef.startsWith('F')) clefSign = 'F';
    }
    const instrEl = getDirectChildren(firstPart, 'Instrument')[0];
    if (instrEl) {
      transposeChromatic = parseInt(getChildText(instrEl, 'transposeChromatic', '0'), 10) || 0;
    }
  }

  const staves = getDirectChildren(scoreEl, 'Staff');
  const mainStaff = staves[0];
  if (!mainStaff) {
    throw new Error('Pauta principal não encontrada no arquivo.');
  }

  // Extract header texts from VBox
  let title = '';
  let subtitle = '';
  let composer = '';
  let lyricist = '';

  const vboxes = getDirectChildren(mainStaff, 'VBox');
  for (const vbox of vboxes) {
    const texts = getDirectChildren(vbox, 'Text');
    for (const tb of texts) {
      const style = (getChildText(tb, 'style') || getChildText(tb, 'tid')).toLowerCase();
      const textNode = getDirectChildren(tb, 'text')[0];
      const val = (textNode?.textContent || '').trim();
      if (!val) continue;
      if (style === 'title' && !title) title = val;
      else if (style === 'subtitle' && !subtitle) subtitle = val;
      else if (style === 'composer' && !composer) composer = val;
      else if ((style === 'lyricist' || style === 'poet') && !lyricist) lyricist = val;
    }
  }

  const durationUnitsMap: Record<string, { type: string; baseDivs: number }> = {
    measure: { type: 'whole', baseDivs: 16 },
    whole: { type: 'whole', baseDivs: 16 },
    half: { type: 'half', baseDivs: 8 },
    quarter: { type: 'quarter', baseDivs: 4 },
    eighth: { type: 'eighth', baseDivs: 2 },
    '16th': { type: '16th', baseDivs: 1 },
    '32nd': { type: '32nd', baseDivs: 1 },
  };

  const measures = getDirectChildren(mainStaff, 'Measure');
  let currentFifths = 0;
  let currentSigN = 4;
  let currentSigD = 4;

  const measuresXml: string[] = [];

  measures.forEach((mEl, mIdx) => {
    const voices = getDirectChildren(mEl, 'voice');
    const primaryVoice = voices[0];
    if (!primaryVoice) return;

    const items = getDirectChildren(primaryVoice);
    let keyFifthsInMeasure: number | null = null;
    let timeSigInMeasure: { n: number; d: number } | null = null;
    let clefInMeasure: 'G' | 'F' | null = null;

    const bodyNodesXml: string[] = [];

    for (const item of items) {
      if (item.tagName === 'KeySig') {
        const acc = parseInt(getChildText(item, 'accidental', '0'), 10) || 0;
        currentFifths = acc;
        keyFifthsInMeasure = acc;
      } else if (item.tagName === 'TimeSig') {
        const n = parseInt(getChildText(item, 'sigN', '4'), 10) || 4;
        const d = parseInt(getChildText(item, 'sigD', '4'), 10) || 4;
        currentSigN = n;
        currentSigD = d;
        timeSigInMeasure = { n, d };
      } else if (item.tagName === 'Clef') {
        const cType = (
          getChildText(item, 'transposingClefType') ||
          getChildText(item, 'concertClefType') ||
          'G'
        ).toUpperCase();
        clefInMeasure = cType.startsWith('F') ? 'F' : 'G';
        clefSign = clefInMeasure;
      } else if (item.tagName === 'Harmony') {
        const rootTpc = parseInt(getChildText(item, 'root', '14'), 10);
        if (!Number.isNaN(rootTpc)) {
          const rootSp = TPC_SPELLING_MAP[rootTpc] || { step: 'C', alter: 0 };
          const rawKind = getChildText(item, 'name', '');
          const { kind, text } = mapChordQualityToMusicXmlKind(rawKind);

          let bassXml = '';
          const baseText = getChildText(item, 'base', '');
          if (baseText) {
            const baseTpc = parseInt(baseText, 10);
            if (!Number.isNaN(baseTpc)) {
              const bassSp = TPC_SPELLING_MAP[baseTpc] || { step: 'C', alter: 0 };
              bassXml = `<bass><bass-step>${bassSp.step}</bass-step>${
                bassSp.alter !== 0 ? `<bass-alter>${bassSp.alter}</bass-alter>` : ''
              }</bass>`;
            }
          }

          bodyNodesXml.push(
            `<harmony><root><root-step>${rootSp.step}</root-step>${
              rootSp.alter !== 0 ? `<root-alter>${rootSp.alter}</root-alter>` : ''
            }</root><kind text="${escapeXml(text)}">${kind}</kind>${bassXml}</harmony>`
          );
        }
      } else if (item.tagName === 'Rest') {
        const durTypeRaw = getChildText(item, 'durationType', 'quarter');
        const dots = parseInt(getChildText(item, 'dots', '0'), 10) || 0;
        const mapped = durationUnitsMap[durTypeRaw] || durationUnitsMap.quarter;
        let durVal =
          durTypeRaw === 'measure'
            ? Math.max(4, Math.round((currentSigN * 16) / currentSigD))
            : mapped.baseDivs;
        if (dots === 1) durVal = Math.round(durVal * 1.5);

        const lyricEl = getDirectChildren(item, 'Lyrics')[0];
        let lyricXml = '';
        if (lyricEl) {
          const lTxt = getChildText(lyricEl, 'text', '');
          if (lTxt) {
            lyricXml = `<lyric number="1"><syllabic>single</syllabic><text>${escapeXml(
              lTxt
            )}</text></lyric>`;
          }
        }

        bodyNodesXml.push(
          `<note><rest/><duration>${durVal}</duration><voice>1</voice><type>${
            mapped.type
          }</type>${dots > 0 ? '<dot/>' : ''}${lyricXml}</note>`
        );
      } else if (item.tagName === 'Chord') {
        const durTypeRaw = getChildText(item, 'durationType', 'quarter');
        const dots = parseInt(getChildText(item, 'dots', '0'), 10) || 0;
        const mapped = durationUnitsMap[durTypeRaw] || durationUnitsMap.quarter;
        let durVal = mapped.baseDivs;
        if (dots === 1) durVal = Math.round(durVal * 1.5);

        const lyricEl = getDirectChildren(item, 'Lyrics')[0];
        let lyricXml = '';
        if (lyricEl) {
          const lTxt = getChildText(lyricEl, 'text', '');
          const syll = getChildText(lyricEl, 'syllabic', 'single') || 'single';
          if (lTxt) {
            lyricXml = `<lyric number="1"><syllabic>${escapeXml(
              syll
            )}</syllabic><text>${escapeXml(lTxt)}</text></lyric>`;
          }
        }

        const notes = getDirectChildren(item, 'Note');
        notes.forEach((nEl, nIdx) => {
          const concertPitch = parseInt(getChildText(nEl, 'pitch', '60'), 10) || 60;
          const writtenPitch = concertPitch - transposeChromatic;
          const tpc1 = parseInt(getChildText(nEl, 'tpc', '14'), 10) || 14;
          const tpc2Text = getChildText(nEl, 'tpc2', '');
          const writtenTpc = tpc2Text ? parseInt(tpc2Text, 10) || tpc1 : tpc1;

          const sp = TPC_SPELLING_MAP[writtenTpc] || { step: 'C', alter: 0 };
          const octave = Math.floor((writtenPitch - sp.alter) / 12) - 1;

          bodyNodesXml.push(
            `<note>${
              nIdx > 0 ? '<chord/>' : ''
            }<pitch><step>${sp.step}</step>${
              sp.alter !== 0 ? `<alter>${sp.alter}</alter>` : ''
            }<octave>${octave}</octave></pitch><duration>${durVal}</duration><voice>1</voice><type>${
              mapped.type
            }</type>${dots > 0 ? '<dot/>' : ''}${nIdx === 0 ? lyricXml : ''}</note>`
          );
        });
      }
    }

    let attributesXml = '';
    if (mIdx === 0 || keyFifthsInMeasure !== null || timeSigInMeasure !== null || clefInMeasure !== null) {
      const divsTag = mIdx === 0 ? '<divisions>4</divisions>' : '';
      const keyTag =
        mIdx === 0 || keyFifthsInMeasure !== null
          ? `<key><fifths>${keyFifthsInMeasure ?? currentFifths}</fifths></key>`
          : '';
      const timeTag =
        mIdx === 0 || timeSigInMeasure !== null
          ? `<time><beats>${timeSigInMeasure?.n ?? currentSigN}</beats><beat-type>${
              timeSigInMeasure?.d ?? currentSigD
            }</beat-type></time>`
          : '';
      const chosenClef = clefInMeasure ?? clefSign;
      const clefTag =
        mIdx === 0 || clefInMeasure !== null
          ? `<clef><sign>${chosenClef}</sign><line>${chosenClef === 'F' ? 4 : 2}</line></clef>`
          : '';

      attributesXml = `<attributes>${divsTag}${keyTag}${timeTag}${clefTag}</attributes>`;
    }

    measuresXml.push(
      `<measure number="${mIdx + 1}">${attributesXml}${bodyNodesXml.join('')}</measure>`
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>${escapeXml(title)}</work-title>
    ${subtitle ? `<work-number>${escapeXml(subtitle)}</work-number>` : ''}
  </work>
  <identification>
    ${composer ? `<creator type="composer">${escapeXml(composer)}</creator>` : ''}
    ${lyricist ? `<creator type="lyricist">${escapeXml(lyricist.replace(/\n/g, ' '))}</creator>` : ''}
    <rights>Rubsax Partituras</rights>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>${escapeXml(trackName)}</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    ${measuresXml.join('\n    ')}
  </part>
</score-partwise>`;
}
