'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  INSTRUMENT_GROUPS,
  TONALITIES,
  getInstrumentById,
  getTonalityByPitchClass,
} from '@/lib/music/constants';
import {
  ScoreAnalysis,
  ScoreHeadersState,
  ScoreTransformOptions,
  UNSUPPORTED_FORMAT_MESSAGE,
  analyzeScoreXml,
  transformScoreXml,
  unpackScoreBuffer,
  validateUploadFileName,
} from '@/lib/music/mscz-engine';
import ScoreViewer, { CanvasThemeMode, ViewerEngineMode } from './ScoreViewer';
import BbEbChordModal from './BbEbChordModal';
import {
  Upload,
  Music,
  FileDown,
  Plus,
  Minus,
  Eye,
  EyeOff,
  Type,
  Sliders,
  ShieldCheck,
  AlertCircle,
  Check,
  RotateCcw,
  Sparkles,
  Layers,
  Lock,
  Trash2,
  RefreshCw,
  Loader2,
  FolderOpen,
} from 'lucide-react';

type TransposeDirectionMode = 'closest' | 'up' | 'down';
type MobileTabId = 'transpose' | 'instrument' | 'display' | 'headers';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

export default function RubsaxWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Raw file state
  const [originalBase64, setOriginalBase64] = useState<string>('');
  const [originalMscx, setOriginalMscx] = useState<string>('');
  const [analysis, setAnalysis] = useState<ScoreAnalysis | null>(null);

  // Upload & Error feedback
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Transform controls state
  const [semitoneShift, setSemitoneShift] = useState<number>(0);
  const [transposeDirection, setTransposeDirection] =
    useState<TransposeDirectionMode>('closest');
  const [octaveShift, setOctaveShift] = useState<number>(0);
  const [targetInstrumentId, setTargetInstrumentId] = useState<string>('alto-sax');
  const [convertBbEbChordsToWritten, setConvertBbEbChordsToWritten] =
    useState<boolean>(false);
  const [showChords, setShowChords] = useState<boolean>(true);
  const [showLyrics, setShowLyrics] = useState<boolean>(true);
  const [headers, setHeaders] = useState<ScoreHeadersState>({
    showAllHeaders: true,
    title: { text: '', visible: true, removed: false },
    subtitle: { text: '', visible: true, removed: false },
    composer: { text: '', visible: true, removed: false, autoSyncInstrument: true },
    lyricist: { text: '', visible: true, removed: false, autoSyncPianoKey: true },
  });

  // Viewer & Modal UI state
  const [canvasTheme, setCanvasTheme] = useState<CanvasThemeMode>('parchment');
  const [engineMode, setEngineMode] = useState<ViewerEngineMode>('musescore-svg');
  const [showBbEbModal, setShowBbEbModal] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<MobileTabId>('transpose');
  const [showHeaderEditorModal, setShowHeaderEditorModal] = useState<boolean>(false);

  const loadScoreFromBuffer = useCallback(
    async (arrayBuf: ArrayBuffer, fileName: string, base64Override?: string) => {
      setUploadError(null);
      const validation = validateUploadFileName(fileName);
      if (!validation.valid) {
        setUploadError(validation.error || UNSUPPORTED_FORMAT_MESSAGE);
        return;
      }

      setIsLoadingFile(true);
      try {
        const unpacked = await unpackScoreBuffer(arrayBuf, fileName);
        const scoreAnalysis = analyzeScoreXml(
          unpacked.mscxContent,
          fileName,
          unpacked.fileFormat
        );

        const b64 = base64Override || arrayBufferToBase64(arrayBuf);
        setOriginalBase64(b64);
        setOriginalMscx(unpacked.mscxContent);
        setAnalysis(scoreAnalysis);

        // Reset transform state to match loaded score
        setSemitoneShift(0);
        setOctaveShift(0);
        setTargetInstrumentId(scoreAnalysis.detectedInstrumentId);
        setConvertBbEbChordsToWritten(false);
        setShowChords(true);
        setShowLyrics(true);
        setHeaders(scoreAnalysis.headers);

        // Trigger mandatory Sib/Mib chord warning modal if the loaded instrument is in Bb or Eb and has chords
        if (scoreAnalysis.needsBbEbChordPrompt) {
          setShowBbEbModal(true);
        } else {
          setShowBbEbModal(false);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : UNSUPPORTED_FORMAT_MESSAGE;
        setUploadError(msg);
      } finally {
        setIsLoadingFile(false);
      }
    },
    []
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      const validation = validateUploadFileName(file.name);
      if (!validation.valid) {
        setUploadError(validation.error || UNSUPPORTED_FORMAT_MESSAGE);
        return;
      }
      const buf = await file.arrayBuffer();
      await loadScoreFromBuffer(buf, file.name);
    },
    [loadScoreFromBuffer]
  );

  const handleLoadSample = useCallback(
    async (sampleId: string) => {
      setUploadError(null);
      setIsLoadingFile(true);
      try {
        const res = await fetch(`/api/samples?id=${encodeURIComponent(sampleId)}`);
        const data = await res.json();
        if (!res.ok || !data.base64) {
          throw new Error(data.error || 'Falha ao carregar partitura de exemplo.');
        }
        const binaryStr = atob(data.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        await loadScoreFromBuffer(bytes.buffer, data.fileName, data.base64);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Erro ao carregar arquivo de exemplo.';
        setUploadError(msg);
      } finally {
        setIsLoadingFile(false);
      }
    },
    [loadScoreFromBuffer]
  );

  // Load default sample on initial visit so the user sees the full studio immediately
  useEffect(() => {
    handleLoadSample('aleluia');
  }, [handleLoadSample]);

  // Select instrument & trigger Bb/Eb chord modal when switching to a Bb or Eb instrument
  const handleSelectInstrument = (newInstrumentId: string) => {
    const prevInstr = getInstrumentById(targetInstrumentId);
    const nextInstr = getInstrumentById(newInstrumentId);
    setTargetInstrumentId(newInstrumentId);

    const isNextTransposing =
      nextInstr.groupId === 'BB_TREBLE' || nextInstr.groupId === 'EB_TREBLE';
    if (
      analysis?.hasChords &&
      isNextTransposing &&
      prevInstr.groupId !== nextInstr.groupId
    ) {
      setShowBbEbModal(true);
    } else if (!isNextTransposing) {
      setConvertBbEbChordsToWritten(false);
    }
  };

  // Direct target Concert Tonality selection
  const handleSelectTargetConcertPitchClass = (targetPc: number) => {
    if (!analysis) return;
    const origPc = analysis.originalConcertPitchClass;
    const rawDiff = (((targetPc - origPc) % 12) + 12) % 12;

    let shift = rawDiff;
    if (transposeDirection === 'closest') {
      if (rawDiff > 6) shift = rawDiff - 12;
    } else if (transposeDirection === 'up') {
      shift = rawDiff;
    } else if (transposeDirection === 'down') {
      shift = rawDiff === 0 ? 0 : rawDiff - 12;
    }
    setSemitoneShift(shift);
  };

  // Compute live transformed XML & metadata
  const transformOptions: ScoreTransformOptions = useMemo(
    () => ({
      semitoneShift,
      octaveShift,
      targetInstrumentId,
      convertBbEbChordsToWritten,
      showChords,
      showLyrics,
      headers,
    }),
    [
      semitoneShift,
      octaveShift,
      targetInstrumentId,
      convertBbEbChordsToWritten,
      showChords,
      showLyrics,
      headers,
    ]
  );

  const transformResult = useMemo(() => {
    if (!analysis || !originalMscx) return null;
    try {
      return transformScoreXml(originalMscx, analysis, transformOptions);
    } catch (err) {
      console.error('Erro ao transformar XML:', err);
      return null;
    }
  }, [analysis, originalMscx, transformOptions]);

  const activeInstrument = useMemo(
    () => getInstrumentById(targetInstrumentId),
    [targetInstrumentId]
  );

  const currentConcertTonality =
    transformResult?.concertTonality ||
    analysis?.originalConcertTonality ||
    getTonalityByPitchClass(0);

  const currentWrittenTonality =
    transformResult?.writtenTonality ||
    analysis?.originalWrittenTonality ||
    getTonalityByPitchClass(0);

  const handleExportPdf = async () => {
    if (!analysis || !transformResult || !originalBase64) return;
    setIsExportingPdf(true);
    setUploadError(null);
    try {
      const cleanTitle = (
        headers.title.text ||
        analysis.headers.title.text ||
        'Partitura'
      )
        .replace(/[<>:"/\\|?*]+/g, '')
        .trim();
      const customPdfName = `${cleanTitle} - ${activeInstrument.name} (${currentWrittenTonality.majorName}) - Rubsax.pdf`;

      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalBase64,
          fileName: analysis.fileName,
          modifiedMscx: transformResult.modifiedMscx,
          customPdfName,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao exportar PDF no servidor.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = customPdfName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Falha ao exportar o PDF.';
      setUploadError(msg);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const isBbOrEbActive =
    activeInstrument.groupId === 'BB_TREBLE' ||
    activeInstrument.groupId === 'EB_TREBLE';

  return (
    <div className="min-h-screen flex flex-col bg-studio-950 text-zinc-100 selection:bg-sax-500 selection:text-studio-950">
      {/* BARRA SUPERIOR PRINCIPAL: Identidade Rubsax + Visor Central de Tonalidade + Botão Exportar PDF */}
      <header className="sticky top-0 z-30 bg-studio-900/95 backdrop-blur-md border-b border-zinc-800 px-3 sm:px-5 py-2.5 shadow-lg">
        <div className="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Marca */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sax-400 to-sax-600 flex items-center justify-center text-studio-950 font-black shadow-md shadow-sax-500/20">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                  RUBSAX <span className="text-sax-400">EDITOR</span>
                </h1>
                <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sax-500/15 text-sax-300 border border-sax-500/30">
                  Etapa 1 • Studio & Transposer
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Motor Matemático MuseScore 3 (.mscz / .mscx / .xml) • Acidentes Simples Estritos
              </p>
            </div>
          </div>

          {/* VISOR CENTRAL DE TONALIDADE: Tom Base (Piano/Dó) | Na Pauta (Instrumento Ativo) */}
          {analysis && (
            <div className="flex-1 max-w-2xl mx-auto px-3 py-1.5 rounded-xl bg-studio-950/90 border border-zinc-700/80 shadow-inner flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 font-medium">Tom Base (Piano):</span>
                <span className="font-extrabold text-sky-300">
                  {currentConcertTonality.majorName}
                </span>
                <span className="text-[11px] text-zinc-400 hidden md:inline">
                  ({currentConcertTonality.minorName} • {currentConcertTonality.accidentalSummary})
                </span>
              </div>

              <span className="text-zinc-600 font-bold">|</span>

              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 font-medium">
                  Na pauta ({activeInstrument.name}{' '}
                  {activeInstrument.groupId === 'BB_TREBLE'
                    ? 'Bb'
                    : activeInstrument.groupId === 'EB_TREBLE'
                    ? 'Eb'
                    : activeInstrument.clef === 'F'
                    ? 'Clave de Fá'
                    : 'Dó'}
                  ):
                </span>
                <span className="font-extrabold text-sax-400">
                  {currentWrittenTonality.majorName}
                </span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-sax-500/15 text-sax-300 border border-sax-500/30 font-mono">
                  {currentWrittenTonality.accidentalSummary}
                </span>
              </div>
            </div>
          )}

          {/* Ações Rápidas: Upload Novo Arquivo & Exportar PDF Fiel */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".mscz,.mscx,.xml,.musicxml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
            >
              <Upload className="w-3.5 h-3.5 text-sax-400" />
              <span className="hidden sm:inline">Enviar .mscz / .xml</span>
              <span className="sm:hidden">Upload</span>
            </button>

            <button
              type="button"
              disabled={!analysis || isExportingPdf}
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sax-500 to-sax-600 hover:from-sax-400 hover:to-sax-500 disabled:opacity-50 text-studio-950 text-xs sm:text-sm font-extrabold shadow-lg shadow-sax-500/20 transition"
            >
              {isExportingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gerando PDF...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" />
                  <span>Exportar PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ALERTA DE FORMATO BLOQUEADO (.musx, .sib, .mid) OU ERRO */}
      {uploadError && (
        <div className="bg-red-950/90 border-b border-red-500/50 px-4 py-3 text-red-100 text-xs sm:text-sm flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2.5 max-w-4xl">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="font-semibold">{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="px-2.5 py-1 rounded-lg bg-red-900/60 hover:bg-red-800 text-xs font-semibold"
          >
            Fechar
          </button>
        </div>
      )}

      {/* LAYOUT PRINCIPAL RESPONSIVO (Sidebar de Controle no PC/Landscape + Visualizador Central + Abas Mobile no Rodapé) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden max-w-[1800px] w-full mx-auto">
        {/* PAINEL DE CONTROLES (Lateral no Desktop / Abas inferiores no Mobile) */}
        <aside className="w-full lg:w-[400px] xl:w-[430px] shrink-0 bg-studio-900 border-b lg:border-b-0 lg:border-r border-zinc-800 flex flex-col overflow-y-auto order-2 lg:order-1 max-h-[46vh] lg:max-h-none">
          {/* Navegação por Abas para Mobile Vertical */}
          <div className="grid grid-cols-4 lg:hidden bg-studio-950 border-b border-zinc-800 text-[11px] font-semibold sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setMobileTab('transpose')}
              className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
                mobileTab === 'transpose'
                  ? 'border-sax-500 text-sax-400 bg-sax-500/5'
                  : 'border-transparent text-zinc-400'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Tom & 8va</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('instrument')}
              className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
                mobileTab === 'instrument'
                  ? 'border-sax-500 text-sax-400 bg-sax-500/5'
                  : 'border-transparent text-zinc-400'
              }`}
            >
              <Music className="w-4 h-4" />
              <span>Instrumento</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('display')}
              className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
                mobileTab === 'display'
                  ? 'border-sax-500 text-sax-400 bg-sax-500/5'
                  : 'border-transparent text-zinc-400'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>Cifras/Letra</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('headers')}
              className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
                mobileTab === 'headers'
                  ? 'border-sax-500 text-sax-400 bg-sax-500/5'
                  : 'border-transparent text-zinc-400'
              }`}
            >
              <Type className="w-4 h-4" />
              <span>Títulos/Arq</span>
            </button>
          </div>

          <div className="p-4 space-y-5">
            {/* 1. ZONA DE UPLOAD DRAG & DROP + EXEMPLOS REAIS DO ACERVO */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFileUpload(f);
              }}
              className={`${
                mobileTab === 'headers' ? 'block' : 'hidden lg:block'
              } rounded-2xl border-2 border-dashed p-3.5 transition ${
                isDragging
                  ? 'border-sax-400 bg-sax-500/10'
                  : 'border-zinc-700/80 bg-studio-950/60 hover:border-sax-500/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                  <FolderOpen className="w-4 h-4 text-sax-400" />
                  <span>Arquivo da Partitura</span>
                </div>
                {analysis && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono truncate max-w-[180px]">
                    {analysis.fileName}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 flex items-center justify-center gap-2 font-semibold transition"
              >
                <Upload className="w-4 h-4 text-sax-400" />
                <span>Arraste ou clique (.mscz, .mscx, .xml)</span>
              </button>

              <div className="mt-2.5 pt-2.5 border-t border-zinc-800/80">
                <span className="block text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mb-1.5">
                  Ou carregue uma partitura real do acervo Rubsax:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleLoadSample('aleluia')}
                    className="px-2 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-sax-500/20 hover:border-sax-500/40 border border-zinc-700/80 text-[11px] font-medium text-zinc-200 truncate transition"
                    title="Aleluia (Hallelujah) - Fá Maior"
                  >
                    🎵 Aleluia
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('sorriso')}
                    className="px-2 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-sax-500/20 hover:border-sax-500/40 border border-zinc-700/80 text-[11px] font-medium text-zinc-200 truncate transition"
                    title="Sorriso Resplandecente (Dragon Ball GT)"
                  >
                    🎵 Sorriso
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSample('marcha')}
                    className="px-2 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-sax-500/20 hover:border-sax-500/40 border border-zinc-700/80 text-[11px] font-medium text-zinc-200 truncate transition"
                    title="Marcha Nupcial (Mendelssohn)"
                  >
                    🎵 Marcha
                  </button>
                </div>
              </div>
            </div>

            {/* 2. SELETOR DOS 4 GRUPOS DE INSTRUMENTOS E AFINAÇÕES */}
            <section
              className={`${
                mobileTab === 'instrument' ? 'block' : 'hidden lg:block'
              } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-3`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                  <Music className="w-4 h-4" />
                  <span>2. Grupo de Instrumento e Afinação</span>
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold">
                  Clave de {activeInstrument.clef === 'F' ? 'Fá (𝄢)' : 'Sol (𝄞)'}
                </span>
              </div>

              <div className="space-y-2.5">
                {INSTRUMENT_GROUPS.map((group) => {
                  const isGroupSelected = activeInstrument.groupId === group.id;
                  return (
                    <div
                      key={group.id}
                      className={`rounded-xl border p-2.5 transition ${
                        isGroupSelected
                          ? 'bg-sax-500/10 border-sax-500/50'
                          : 'bg-zinc-900/60 border-zinc-800/90'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`text-xs font-bold ${
                            isGroupSelected ? 'text-sax-300' : 'text-zinc-300'
                          }`}
                        >
                          {group.title}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.instruments.map((instr) => {
                          const active = instr.id === targetInstrumentId;
                          return (
                            <button
                              key={instr.id}
                              type="button"
                              onClick={() => handleSelectInstrument(instr.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                                active
                                  ? 'bg-sax-500 text-studio-950 shadow-sm font-bold'
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                              }`}
                            >
                              {instr.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {activeInstrument.groupId === 'C_BASS' && (
                <div className="p-2.5 rounded-xl bg-sky-950/50 border border-sky-500/30 text-[11px] text-sky-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>
                    <strong>Clave de Fá Ativa:</strong> Pauta principal convertida para Clave
                    de Fá com ajuste automático de oitava ({transformResult?.appliedAutoOctaveSemitones || 0} st) para a tessitura média do {activeInstrument.name}.
                  </span>
                </div>
              )}
            </section>

            {/* 3. MOTOR DE TRANSPOSIÇÃO MATEMÁTICA E ENARMONIA */}
            <section
              className={`${
                mobileTab === 'transpose' ? 'block' : 'hidden lg:block'
              } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-3.5`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4" />
                  <span>3. Transposição & Oitava</span>
                </h2>
                {semitoneShift !== 0 || octaveShift !== 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSemitoneShift(0);
                      setOctaveShift(0);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-sax-400 hover:text-sax-300 font-semibold"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Resetar Original</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-emerald-400 font-medium">
                    Tom Original
                  </span>
                )}
              </div>

              {/* a) Escolha Direta de Tonalidade (12 Tonalidades Maiores/Menores Relativas) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-zinc-300 font-semibold">
                    Ir para Tonalidade (Ref. Piano Dó):
                  </label>
                  <div className="flex items-center gap-1 text-[10px]">
                    {(
                      [
                        { id: 'closest', label: 'Mais Próximo' },
                        { id: 'up', label: 'Acima' },
                        { id: 'down', label: 'Abaixo' },
                      ] as const
                    ).map((dir) => (
                      <button
                        key={dir.id}
                        type="button"
                        onClick={() => setTransposeDirection(dir.id)}
                        className={`px-1.5 py-0.5 rounded transition ${
                          transposeDirection === dir.id
                            ? 'bg-sax-500/20 text-sax-300 border border-sax-500/40 font-bold'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {dir.label}
                      </button>
                    ))}
                  </div>
                </div>

                <select
                  value={currentConcertTonality.pitchClass}
                  onChange={(e) =>
                    handleSelectTargetConcertPitchClass(parseInt(e.target.value, 10))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs sm:text-sm font-semibold text-white focus:outline-none focus:border-sax-500"
                >
                  {TONALITIES.map((t) => (
                    <option key={t.pitchClass} value={t.pitchClass}>
                      {t.fullLabel} ({t.accidentalSummary})
                    </option>
                  ))}
                </select>
              </div>

              {/* b) Botões Rápidos de Semitom (-1 Semitom / +1 Semitom) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-semibold">Salto por Semitom:</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-sax-300">
                    {semitoneShift > 0 ? `+${semitoneShift}` : semitoneShift} semitons
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSemitoneShift((s) => Math.max(-12, s - 1))}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.99] text-zinc-100 text-xs font-bold border border-zinc-700 transition"
                  >
                    <Minus className="w-4 h-4 text-sax-400" />
                    <span>-1 Semitom</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSemitoneShift((s) => Math.min(12, s + 1))}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.99] text-zinc-100 text-xs font-bold border border-zinc-700 transition"
                  >
                    <Plus className="w-4 h-4 text-sax-400" />
                    <span>+1 Semitom</span>
                  </button>
                </div>
              </div>

              {/* c) Botões de Oitava (-1 Oitava / +1 Oitava) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-semibold">
                    Deslocamento de Oitava (±12 st):
                  </span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-sky-300">
                    {octaveShift > 0 ? `+${octaveShift}` : octaveShift} 8va (
                    {octaveShift * 12 > 0 ? `+${octaveShift * 12}` : octaveShift * 12} st)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOctaveShift((o) => Math.max(-2, o - 1))}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700 transition"
                  >
                    <Minus className="w-4 h-4 text-sky-400" />
                    <span>-1 Oitava</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOctaveShift((o) => Math.min(2, o + 1))}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700 transition"
                  >
                    <Plus className="w-4 h-4 text-sky-400" />
                    <span>+1 Oitava</span>
                  </button>
                </div>
              </div>

              {/* Selo de Regra Estrita de Acidentes Simples & Fidelidade à Armadura */}
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-200 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Acidentes Simples Estritos Ativo:</span> Zero
                  dobrado sustenido (x) ou dobrado bemol (bb). Armadura atual em{' '}
                  <strong>{currentWrittenTonality.majorName}</strong> usa exclusivamente{' '}
                  {currentWrittenTonality.fifths > 0
                    ? 'sustenidos (♯) e bequadros (♮)'
                    : currentWrittenTonality.fifths < 0
                    ? 'bemóis (♭) e bequadros (♮)'
                    : 'acidentes simples e naturais'}
                  .
                </div>
              </div>
            </section>

            {/* 4. CONTROLES VISUAIS: CIFRAS (HARMONY), LETRAS E TEXTOS DE CABEÇALHO */}
            <section
              className={`${
                mobileTab === 'display' || mobileTab === 'headers'
                  ? 'block'
                  : 'hidden lg:block'
              } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-3`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                  <Eye className="w-4 h-4" />
                  <span>4. Cifras, Letras & Cabeçalho</span>
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  <Lock className="w-3 h-3 text-sax-400" />
                  Notas/Fontes Travadas
                </span>
              </div>

              {/* Toggles de Cifras e Letras */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowChords((v) => !v)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold border transition ${
                    showChords
                      ? 'bg-sax-500/15 border-sax-500/50 text-sax-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {showChords ? (
                      <Eye className="w-4 h-4 text-sax-400" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-zinc-500" />
                    )}
                    Cifras
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30">
                    {showChords ? 'Visíveis' : 'Ocultas'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowLyrics((v) => !v)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold border transition ${
                    showLyrics
                      ? 'bg-sax-500/15 border-sax-500/50 text-sax-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {showLyrics ? (
                      <Eye className="w-4 h-4 text-sax-400" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-zinc-500" />
                    )}
                    Letras
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30">
                    {showLyrics ? 'Visíveis' : 'Ocultas'}
                  </span>
                </button>
              </div>

              {/* Controle de Conversão de Cifras para Instrumentos em Sib e Mib */}
              {isBbOrEbActive && analysis?.hasChords && (
                <div className="p-3 rounded-xl bg-zinc-900/90 border border-sax-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-sax-300">
                      Afinação das Cifras Visíveis ({activeInstrument.name}):
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowBbEbModal(true)}
                      className="text-[11px] underline text-zinc-400 hover:text-zinc-200"
                    >
                      Abrir Aviso
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setConvertBbEbChordsToWritten(false)}
                      className={`py-1.5 px-2 rounded-lg font-semibold border transition ${
                        !convertBbEbChordsToWritten
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                      }`}
                    >
                      Tom do Piano (Dó)
                    </button>
                    <button
                      type="button"
                      onClick={() => setConvertBbEbChordsToWritten(true)}
                      className={`py-1.5 px-2 rounded-lg font-semibold border transition ${
                        convertBbEbChordsToWritten
                          ? 'bg-sax-500 text-studio-950 border-sax-400 font-bold'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                      }`}
                    >
                      Converter p/ {activeInstrument.groupId === 'BB_TREBLE' ? 'Sib (+2)' : 'Mib (-3/+9)'}
                    </button>
                  </div>
                  {transformResult && transformResult.previewChords.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] text-zinc-400">Cifras na tela:</span>
                      {transformResult.previewChords.slice(0, 6).map((ch, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded bg-studio-950 border border-zinc-700 text-sax-300 font-mono text-[10px] font-bold"
                        >
                          {ch}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Controle de Textos de Cabeçalho (Título, Subtítulo, Compositor e Letrista) */}
              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      setHeaders((h) => ({ ...h, showAllHeaders: !h.showAllHeaders }))
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-200 hover:text-sax-300"
                  >
                    {headers.showAllHeaders ? (
                      <Eye className="w-3.5 h-3.5 text-sax-400" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                    <span>
                      Cabeçalho ({headers.showAllHeaders ? 'Visível' : 'Oculto'})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowHeaderEditorModal((v) => !v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-sax-300 border border-zinc-700 transition"
                  >
                    <Type className="w-3.5 h-3.5" />
                    <span>{showHeaderEditorModal ? 'Fechar Editor' : 'Editar Cabeçalho'}</span>
                  </button>
                </div>

                {showHeaderEditorModal && (
                  <div className="p-3 rounded-xl bg-zinc-900/95 border border-zinc-700 space-y-2.5 text-xs">
                    <p className="text-[11px] text-zinc-400">
                      Edite, oculte ou remova os textos de cabeçalho (fonte e tamanho originais
                      permanecem travados):
                    </p>

                    {/* Título */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-zinc-300">Título:</label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setHeaders((h) => ({
                                ...h,
                                title: { ...h.title, visible: !h.title.visible, removed: false },
                              }))
                            }
                            className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300"
                          >
                            {headers.title.visible && !headers.title.removed
                              ? 'Ocultar'
                              : 'Mostrar'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setHeaders((h) => ({
                                ...h,
                                title: { ...h.title, removed: !h.title.removed },
                              }))
                            }
                            className="p-1 rounded bg-red-950/60 text-red-300 hover:bg-red-900/60"
                            title="Remover Título"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        disabled={headers.title.removed}
                        value={headers.title.text}
                        onChange={(e) =>
                          setHeaders((h) => ({
                            ...h,
                            title: { ...h.title, text: e.target.value },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-zinc-100 disabled:opacity-40"
                      />
                    </div>

                    {/* Subtítulo */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-zinc-300">Subtítulo:</label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setHeaders((h) => ({
                                ...h,
                                subtitle: {
                                  ...h.subtitle,
                                  visible: !h.subtitle.visible,
                                  removed: false,
                                },
                              }))
                            }
                            className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300"
                          >
                            {headers.subtitle.visible && !headers.subtitle.removed
                              ? 'Ocultar'
                              : 'Mostrar'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setHeaders((h) => ({
                                ...h,
                                subtitle: { ...h.subtitle, removed: !h.subtitle.removed },
                              }))
                            }
                            className="p-1 rounded bg-red-950/60 text-red-300 hover:bg-red-900/60"
                            title="Remover Subtítulo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        disabled={headers.subtitle.removed}
                        placeholder="Ex: Artista / Cantor"
                        value={headers.subtitle.text}
                        onChange={(e) =>
                          setHeaders((h) => ({
                            ...h,
                            subtitle: {
                              ...h.subtitle,
                              text: e.target.value,
                              visible: true,
                              removed: false,
                            },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-zinc-100 disabled:opacity-40"
                      />
                    </div>

                    {/* Compositor / Instrumento (Canto Superior Direito) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-zinc-300">
                          Compositor / Instrumento:
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setHeaders((h) => ({
                                ...h,
                                composer: {
                                  ...h.composer,
                                  autoSyncInstrument: !h.composer.autoSyncInstrument,
                                },
                              }))
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 ${
                              headers.composer.autoSyncInstrument
                                ? 'bg-sax-500/20 text-sax-300 border border-sax-500/40'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            Auto
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setHeaders((h) => ({
                                ...h,
                                composer: {
                                  ...h.composer,
                                  visible: !h.composer.visible,
                                  removed: false,
                                },
                              }))
                            }
                            className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300"
                          >
                            {headers.composer.visible && !headers.composer.removed
                              ? 'Ocultar'
                              : 'Mostrar'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setHeaders((h) => ({
                                ...h,
                                composer: { ...h.composer, removed: !h.composer.removed },
                              }))
                            }
                            className="p-1 rounded bg-red-950/60 text-red-300"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        disabled={headers.composer.removed}
                        value={
                          headers.composer.autoSyncInstrument
                            ? activeInstrument.headerInstrumentText
                            : headers.composer.text
                        }
                        onChange={(e) =>
                          setHeaders((h) => ({
                            ...h,
                            composer: {
                              ...h.composer,
                              text: e.target.value,
                              autoSyncInstrument: false,
                            },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-zinc-100 disabled:opacity-40"
                      />
                    </div>

                    {/* Letrista / Indicador Tom para Piano (Canto Superior Esquerdo) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-zinc-300">
                          Letrista / Tom para Piano:
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setHeaders((h) => ({
                                ...h,
                                lyricist: {
                                  ...h.lyricist,
                                  autoSyncPianoKey: !h.lyricist.autoSyncPianoKey,
                                },
                              }))
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 ${
                              headers.lyricist.autoSyncPianoKey
                                ? 'bg-sax-500/20 text-sax-300 border border-sax-500/40'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            Auto Tom
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setHeaders((h) => ({
                                ...h,
                                lyricist: {
                                  ...h.lyricist,
                                  visible: !h.lyricist.visible,
                                  removed: false,
                                },
                              }))
                            }
                            className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300"
                          >
                            {headers.lyricist.visible && !headers.lyricist.removed
                              ? 'Ocultar'
                              : 'Mostrar'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setHeaders((h) => ({
                                ...h,
                                lyricist: { ...h.lyricist, removed: !h.lyricist.removed },
                              }))
                            }
                            className="p-1 rounded bg-red-950/60 text-red-300"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        disabled={headers.lyricist.removed}
                        value={
                          headers.lyricist.autoSyncPianoKey
                            ? `Tom para Piano: ${currentConcertTonality.majorName}`
                            : headers.lyricist.text
                        }
                        onChange={(e) =>
                          setHeaders((h) => ({
                            ...h,
                            lyricist: {
                              ...h.lyricist,
                              text: e.target.value,
                              autoSyncPianoKey: false,
                            },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-zinc-100 disabled:opacity-40"
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* 5. STATUS DE PAUTAS OCULTAS (ACOMPANHAMENTO) & MARCA D'ÁGUA IMUTÁVEL */}
            {analysis && (
              <section className="hidden lg:block rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-sax-400" />
                    <span>Pautas Internas (.mscz)</span>
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {analysis.measureCount} compassos
                  </span>
                </div>

                <div className="space-y-1.5">
                  {analysis.staves.map((st) => (
                    <div
                      key={st.staffId}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800/80 text-[11px]"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            st.isVisibleSolo ? 'bg-sax-400' : 'bg-zinc-600'
                          }`}
                        />
                        <span className="font-semibold text-zinc-200 truncate">
                          Pauta {st.staffId}:{' '}
                          {st.isVisibleSolo ? activeInstrument.name : st.trackName}
                        </span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 shrink-0">
                        {st.isVisibleSolo
                          ? 'Visível • Cifras Mutadas'
                          : st.isPercussion
                          ? 'Oculta • Percussão (Fixa)'
                          : 'Oculta • Transposta c/ Base'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Marca d'água obrigatória fixa */}
                <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between text-[11px] text-zinc-300">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Lock className="w-3.5 h-3.5 text-sax-400" />
                    Rodapé: &ldquo;Rubsax Partituras&rdquo;
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                    <Check className="w-3.5 h-3.5" />
                    Blindado
                  </span>
                </div>
              </section>
            )}
          </div>
        </aside>

        {/* ÁREA PRINCIPAL DE VISUALIZAÇÃO DA PARTITURA */}
        <main className="flex-1 flex flex-col overflow-hidden order-1 lg:order-2 min-h-[54vh]">
          {isLoadingFile ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-zinc-400">
              <Loader2 className="w-8 h-8 text-sax-400 animate-spin" />
              <p className="text-sm font-semibold text-zinc-200">
                Descompactando pacote .mscz e processando estrutura XML...
              </p>
            </div>
          ) : transformResult && analysis ? (
            <ScoreViewer
              modifiedMscx={transformResult.modifiedMscx}
              originalBase64={originalBase64}
              fileName={analysis.fileName}
              canvasTheme={canvasTheme}
              onThemeChange={setCanvasTheme}
              engineMode={engineMode}
              onEngineModeChange={setEngineMode}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Music className="w-12 h-12 text-sax-500/50 mb-3" />
              <h2 className="text-lg font-bold text-white mb-1">
                Envie uma partitura (.mscz, .mscx ou .xml)
              </h2>
              <p className="text-xs text-zinc-400 max-w-md mb-4">
                Transponha notas e cifras com acidentes simples estritos, adapte para os 4
                grupos de instrumentos e exporte o PDF 100% fiel ao MuseScore 3.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-sax-500 text-studio-950 font-bold text-xs sm:text-sm"
              >
                Selecionar Arquivo
              </button>
            </div>
          )}
        </main>
      </div>

      {/* MODAL OBRIGATÓRIO DE AVISO DE CIFRAS PARA INSTRUMENTOS EM SIB (Bb) E MIB (Eb) */}
      <BbEbChordModal
        open={showBbEbModal}
        instrument={activeInstrument}
        concertTonality={currentConcertTonality}
        writtenTonality={currentWrittenTonality}
        sampleChords={analysis?.sampleChords || []}
        onConfirmConvertToInstrument={() => {
          setConvertBbEbChordsToWritten(true);
          setShowBbEbModal(false);
        }}
        onKeepPianoConcertPitch={() => {
          setConvertBbEbChordsToWritten(false);
          setShowBbEbModal(false);
        }}
      />
    </div>
  );
}
