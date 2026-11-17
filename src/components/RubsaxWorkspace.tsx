'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  TONALITIES,
  getInstrumentById,
  getTonalityByPitchClass,
} from '@/lib/music/constants';
import {
  FloatingTextBox,
  ScoreAnalysis,
  ScoreHeadersState,
  ScoreLayoutViewMode,
  ScoreTransformOptions,
  UNSUPPORTED_FORMAT_MESSAGE,
  analyzeScoreXml,
  transformScoreXml,
  unpackScoreBuffer,
  validateUploadFileName,
} from '@/lib/music/mscz-engine';
import ScoreViewer, { CanvasThemeMode } from './ScoreViewer';
import BbEbChordModal from './BbEbChordModal';
import {
  Upload,
  FileDown,
  Plus,
  Minus,
  Eye,
  EyeOff,
  Type,
  Sliders,
  AlertCircle,
  Check,
  RotateCcw,
  Layers,
  Lock,
  Trash2,
  RefreshCw,
  Loader2,
  FolderOpen,
  Edit3,
  Move,
  FileText,
} from 'lucide-react';

type TransposeDirectionMode = 'closest' | 'up' | 'down';
type MobileTabId = 'transpose' | 'display' | 'headers' | 'staves';

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

  // Raw file state (Upload First: starts empty with no sample loaded)
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
  const [selectedStaffId, setSelectedStaffId] = useState<string>('1');
  const [viewMode, setViewMode] = useState<ScoreLayoutViewMode>('portrait');
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

  // Edição de Cifras Existentes & Caixas de Texto Flutuantes
  const [chordOverrides, setChordOverrides] = useState<Record<string, string>>({});
  const [editingChordKey, setEditingChordKey] = useState<string | null>(null);
  const [editingChordValue, setEditingChordValue] = useState<string>('');
  const [chordEditMode, setChordEditMode] = useState<'symbol' | 'occurrence'>('symbol');
  const [floatingTexts, setFloatingTexts] = useState<FloatingTextBox[]>([]);

  // Viewer & Preview trigger state
  const [canvasTheme, setCanvasTheme] = useState<CanvasThemeMode>('parchment');
  const [showBbEbModal, setShowBbEbModal] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<MobileTabId>('transpose');
  const [showHeaderEditorModal, setShowHeaderEditorModal] = useState<boolean>(false);
  const [renderVersion, setRenderVersion] = useState<number>(0);
  const [renderedSnapshotMscx, setRenderedSnapshotMscx] = useState<string>('');

  const loadScoreFromBuffer = useCallback(
    async (arrayBuf: ArrayBuffer, fileName: string) => {
      setUploadError(null);
      const validation = validateUploadFileName(fileName);
      if (!validation.valid) {
        setUploadError(validation.error || UNSUPPORTED_FORMAT_MESSAGE);
        return;
      }

      setIsLoadingFile(true);
      try {
        const b64 = arrayBufferToBase64(arrayBuf);
        let serverConvertedMscx: string | undefined;

        // Se for .xml, .musicxml ou .mxl (Finale/Sibelius), tenta conversão nativa via MuseScore 3 no servidor
        if (
          validation.extension === '.xml' ||
          validation.extension === '.musicxml' ||
          validation.extension === '.mxl'
        ) {
          try {
            const convRes = await fetch('/api/convert-xml', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                originalBase64: b64,
                fileName,
              }),
            });
            if (convRes.ok) {
              const convData = await convRes.json();
              if (convData.mscxContent) {
                serverConvertedMscx = convData.mscxContent;
              }
            }
          } catch {
            // Fallback automático para o conversor interno caso falhe
          }
        }

        const unpacked = await unpackScoreBuffer(
          arrayBuf,
          fileName,
          serverConvertedMscx
        );
        const scoreAnalysis = analyzeScoreXml(
          unpacked.mscxContent,
          fileName,
          unpacked.fileFormat
        );

        const firstStaffId = scoreAnalysis.staves[0]?.staffId || '1';
        const initialOptions: ScoreTransformOptions = {
          semitoneShift: 0,
          octaveShift: 0,
          targetInstrumentId: scoreAnalysis.detectedInstrumentId,
          selectedStaffId: firstStaffId,
          viewMode: 'portrait',
          convertBbEbChordsToWritten: false,
          showChords: true,
          showLyrics: true,
          headers: scoreAnalysis.headers,
          chordOverrides: {},
          floatingTexts: [],
        };

        const initialTransform = transformScoreXml(
          unpacked.mscxContent,
          scoreAnalysis,
          initialOptions
        );

        setOriginalBase64(b64);
        setOriginalMscx(unpacked.mscxContent);
        setAnalysis(scoreAnalysis);

        setSemitoneShift(0);
        setOctaveShift(0);
        setTargetInstrumentId(scoreAnalysis.detectedInstrumentId);
        setSelectedStaffId(firstStaffId);
        setViewMode('portrait');
        setConvertBbEbChordsToWritten(false);
        setShowChords(true);
        setShowLyrics(true);
        setHeaders(scoreAnalysis.headers);
        setChordOverrides({});
        setEditingChordKey(null);
        setFloatingTexts([]);

        setRenderedSnapshotMscx(initialTransform.modifiedMscx);
        setRenderVersion((v) => v + 1);

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

  // Opções para a visualização em tela (sem duplicar textos flutuantes que já são arrastáveis na tela)
  const screenTransformOptions: ScoreTransformOptions = useMemo(
    () => ({
      semitoneShift,
      octaveShift,
      targetInstrumentId,
      selectedStaffId,
      viewMode,
      convertBbEbChordsToWritten,
      showChords,
      showLyrics,
      headers,
      chordOverrides,
      floatingTexts: [],
    }),
    [
      semitoneShift,
      octaveShift,
      targetInstrumentId,
      selectedStaffId,
      viewMode,
      convertBbEbChordsToWritten,
      showChords,
      showLyrics,
      headers,
      chordOverrides,
    ]
  );

  // Opções completas para exportação do PDF (injetando os textos flutuantes dentro do XML .mscx)
  const pdfTransformOptions: ScoreTransformOptions = useMemo(
    () => ({
      ...screenTransformOptions,
      floatingTexts,
    }),
    [screenTransformOptions, floatingTexts]
  );

  const transformResult = useMemo(() => {
    if (!analysis || !originalMscx) return null;
    try {
      return transformScoreXml(originalMscx, analysis, screenTransformOptions);
    } catch (err) {
      console.error('Erro ao transformar XML:', err);
      return null;
    }
  }, [analysis, originalMscx, screenTransformOptions]);

  const activeInstrument = useMemo(
    () => getInstrumentById(targetInstrumentId),
    [targetInstrumentId]
  );

  const activeStaffSummary = useMemo(() => {
    if (!analysis) return null;
    return (
      analysis.staves.find((s) => s.staffId === selectedStaffId) ||
      analysis.staves[0] ||
      null
    );
  }, [analysis, selectedStaffId]);

  const currentConcertTonality =
    transformResult?.concertTonality ||
    analysis?.originalConcertTonality ||
    getTonalityByPitchClass(0);

  const currentWrittenTonality =
    transformResult?.writtenTonality ||
    analysis?.originalWrittenTonality ||
    getTonalityByPitchClass(0);

  const hasUnrenderedChanges = Boolean(
    transformResult &&
      renderedSnapshotMscx &&
      transformResult.modifiedMscx !== renderedSnapshotMscx
  );

  const handleTriggerPreview = useCallback(() => {
    if (!transformResult) return;
    setRenderedSnapshotMscx(transformResult.modifiedMscx);
    setRenderVersion((v) => v + 1);
  }, [transformResult]);

  const handleChangeViewMode = (mode: ScoreLayoutViewMode) => {
    setViewMode(mode);
    if (analysis && originalMscx) {
      const nextOpts: ScoreTransformOptions = {
        ...screenTransformOptions,
        viewMode: mode,
      };
      const res = transformScoreXml(originalMscx, analysis, nextOpts);
      setRenderedSnapshotMscx(res.modifiedMscx);
      setRenderVersion((v) => v + 1);
    }
  };

  const handleSelectStaffPart = (staffId: string) => {
    setSelectedStaffId(staffId);
    const nextMode: ScoreLayoutViewMode =
      viewMode === 'full-score' ? 'portrait' : viewMode;
    setViewMode(nextMode);

    if (analysis && originalMscx) {
      const nextOpts: ScoreTransformOptions = {
        ...screenTransformOptions,
        selectedStaffId: staffId,
        viewMode: nextMode,
      };
      const res = transformScoreXml(originalMscx, analysis, nextOpts);
      setRenderedSnapshotMscx(res.modifiedMscx);
      setRenderVersion((v) => v + 1);
    }
  };

  const handleAddFloatingText = () => {
    const newBox: FloatingTextBox = {
      id: `ft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: 'Texto personalizado',
      xPercent: 35,
      yPercent: 14,
      fontSize: 14,
      pageIndex: 0,
    };
    setFloatingTexts((prev) => [...prev, newBox]);
  };

  const handleUpdateFloatingTextPosition = useCallback(
    (id: string, xPercent: number, yPercent: number) => {
      setFloatingTexts((prev) =>
        prev.map((ft) =>
          ft.id === id ? { ...ft, xPercent, yPercent } : ft
        )
      );
    },
    []
  );

  const handleExportPdf = async () => {
    if (!analysis || !originalMscx || !originalBase64) return;
    setIsExportingPdf(true);
    setUploadError(null);
    try {
      const pdfTransform = transformScoreXml(
        originalMscx,
        analysis,
        pdfTransformOptions
      );

      const cleanTitle = (
        headers.title.text ||
        analysis.headers.title.text ||
        'Partitura'
      )
        .replace(/[<>:"/\\|?*]+/g, '')
        .trim();

      const partLabel =
        viewMode === 'full-score'
          ? 'Grade Completa'
          : pdfTransform.activeStaff.displayName;

      const customPdfName = `${cleanTitle} - ${partLabel} (${pdfTransform.writtenTonality.majorName}) - Rubsax.pdf`;

      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalBase64,
          fileName: analysis.fileName,
          modifiedMscx: pdfTransform.modifiedMscx,
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
    (activeStaffSummary?.writtenSemitoneOffset ?? 0) !== 0 ||
    activeInstrument.groupId === 'BB_TREBLE' ||
    activeInstrument.groupId === 'EB_TREBLE';

  const transposingShortLabel =
    activeStaffSummary?.fifthsOffset === 2 || activeInstrument.groupId === 'BB_TREBLE'
      ? 'Sib'
      : 'Mib';

  const activePartLabelInTopBar =
    viewMode === 'full-score'
      ? 'Grade Completa'
      : activeStaffSummary?.displayName || analysis?.detectedInstrumentName || activeInstrument.name;

  return (
    <div className="min-h-screen flex flex-col bg-studio-950 text-zinc-100 selection:bg-sax-500 selection:text-studio-950">
      {/* Input oculto global de Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mscz,.mscx,.xml,.musicxml,.mxl"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileUpload(f);
          e.target.value = '';
        }}
      />

      {/* BARRA SUPERIOR PRINCIPAL: Identidade RUBSAX TRANSPOSER v1.0 + Resumo de Tonalidade Limpo + Ações */}
      <header className="sticky top-0 z-30 bg-studio-900/95 backdrop-blur-md border-b border-zinc-800 px-3 sm:px-5 py-2.5 shadow-lg">
        <div className="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Marca Oficial */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sax-400 to-sax-600 p-1 flex items-center justify-center shadow-md shadow-sax-500/20 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon.png"
                alt="Rubsax Logo"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                  RUBSAX <span className="text-sax-400">TRANSPOSER</span>
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sax-500/15 text-sax-300 border border-sax-500/30">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Transposição precisa com fidelidade original • Formatos aceitos: .mscz, .mscx, .xml
              </p>
            </div>
          </div>

          {/* VISOR CENTRAL DE TONALIDADE (Sem badge de contagem de acidentes) */}
          {analysis && (
            <div className="flex-1 max-w-2xl mx-auto px-3.5 py-1.5 rounded-xl bg-studio-950/90 border border-zinc-700/80 shadow-inner flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 font-medium">Tom Base (Piano):</span>
                <span className="font-extrabold text-sky-300">
                  {currentConcertTonality.majorName}
                </span>
                <span className="text-xs text-zinc-400">
                  ({currentConcertTonality.minorName})
                </span>
              </div>

              <span className="text-zinc-600 font-bold">|</span>

              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 font-medium">
                  Na pauta ({activePartLabelInTopBar}):
                </span>
                <span className="font-extrabold text-sax-400">
                  {currentWrittenTonality.majorName}
                </span>
              </div>
            </div>
          )}

          {/* Ações Rápidas no Topo */}
          {analysis && (
            <div className="flex items-center gap-2">
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
                onClick={handleTriggerPreview}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                  hasUnrenderedChanges
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-studio-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Pré-visualizar Partitura</span>
                <span className="md:hidden">Prévia</span>
              </button>

              <button
                type="button"
                disabled={isExportingPdf}
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
          )}
        </div>
      </header>

      {/* ALERTA DE ERRO OU FORMATO NÃO SUPORTADO */}
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

      {/* TELA INICIAL "UPLOAD FIRST" (Exibida quando nenhuma partitura foi enviada ainda) */}
      {!analysis ? (
        <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
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
            onClick={() => !isLoadingFile && fileInputRef.current?.click()}
            className={`w-full max-w-2xl rounded-3xl border-2 border-dashed p-8 sm:p-14 text-center cursor-pointer transition-all shadow-2xl ${
              isDragging
                ? 'border-sax-400 bg-sax-500/10 scale-[1.01]'
                : 'border-zinc-700/80 bg-studio-900/80 hover:border-sax-500/60 hover:bg-studio-900'
            }`}
          >
            {isLoadingFile ? (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <Loader2 className="w-12 h-12 text-sax-400 animate-spin" />
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-extrabold text-white">
                    Processando sua partitura...
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400">
                    Extraindo estrutura musical, pautas internas e diagramação original do MuseScore 3.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sax-400/20 to-sax-600/20 border border-sax-500/40 flex items-center justify-center shadow-inner">
                  <Upload className="w-10 h-10 text-sax-400" />
                </div>

                <div className="space-y-2 max-w-lg">
                  <span className="inline-block text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-sax-500/15 text-sax-300 border border-sax-500/30">
                    RUBSAX TRANSPOSER v1.0
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                    Envie sua Partitura para Começar
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    Arraste e solte o arquivo aqui ou clique para selecionar do seu celular ou
                    computador. Transponha o tom, edite cifras/cabeçalhos, extraia partes ocultas
                    e exporte o PDF 100% fiel ao MuseScore 3.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-sax-500 to-sax-600 hover:from-sax-400 hover:to-sax-500 text-studio-950 font-extrabold text-sm shadow-xl shadow-sax-500/20 transition"
                >
                  <Upload className="w-4 h-4" />
                  <span>Selecionar Arquivo (.mscz, .mscx, .xml)</span>
                </button>

                <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-zinc-400">
                  <span className="px-2.5 py-1 rounded-lg bg-studio-950 border border-zinc-800 font-mono text-zinc-300">
                    .mscz (MuseScore 3/4)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-studio-950 border border-zinc-800 font-mono text-zinc-300">
                    .mscx
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-studio-950 border border-zinc-800 font-mono text-zinc-300">
                    .xml / .mxl (MusicXML)
                  </span>
                </div>
              </div>
            )}
          </div>
        </main>
      ) : (
        /* INTERFACE COMPLETA DE EDIÇÃO, TRANSPOSIÇÃO E VISUALIZAÇÃO (Após o Upload) */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden max-w-[1800px] w-full mx-auto">
          {/* PAINEL LATERAL DE CONTROLES */}
          <aside className="w-full lg:w-[400px] xl:w-[430px] shrink-0 bg-studio-900 border-b lg:border-b-0 lg:border-r border-zinc-800 flex flex-col overflow-y-auto order-2 lg:order-1 max-h-[48vh] lg:max-h-none">
            {/* Abas Mobile no Rodapé */}
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
                <span>Textos</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('staves')}
                className={`py-2.5 flex flex-col items-center gap-1 border-b-2 transition ${
                  mobileTab === 'staves'
                    ? 'border-sax-500 text-sax-400 bg-sax-500/5'
                    : 'border-transparent text-zinc-400'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Pautas</span>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* 1. ARQUIVO DA PARTITURA (Sem botões de amostras) */}
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
                } rounded-2xl border border-zinc-800 bg-studio-950/70 p-3.5 transition`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                    <FolderOpen className="w-4 h-4 text-sax-400" />
                    <span>Arquivo da Partitura</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono truncate max-w-[190px]">
                    {analysis.fileName}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 flex items-center justify-center gap-2 font-semibold transition"
                >
                  <Upload className="w-4 h-4 text-sax-400" />
                  <span>Enviar outro arquivo (.mscz, .mscx, .xml)</span>
                </button>
              </div>

              {/* 2. TRANSPOSIÇÃO & OITAVA (Sem caixa verde técnica inferior) */}
              <section
                className={`${
                  mobileTab === 'transpose' ? 'block' : 'hidden lg:block'
                } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-3.5`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4" />
                    <span>Transposição & Oitava</span>
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

                {/* Seletor Direto de Tonalidade */}
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
                        {t.fullLabel}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Botões Rápidos de Semitom */}
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

                {/* Botões de Oitava */}
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

                {/* Dupla Ação Direta: Pré-visualizar Partitura ou Exportar PDF Direto */}
                <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleTriggerPreview}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
                      hasUnrenderedChanges
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-studio-950 border-emerald-400 shadow-md'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Pré-visualizar</span>
                  </button>

                  <button
                    type="button"
                    disabled={isExportingPdf}
                    onClick={handleExportPdf}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-sax-500 hover:bg-sax-400 disabled:opacity-50 text-studio-950 text-xs font-extrabold shadow-md transition"
                  >
                    {isExportingPdf ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileDown className="w-3.5 h-3.5" />
                    )}
                    <span>Baixar PDF</span>
                  </button>
                </div>
              </section>

              {/* 3. CIFRAS, LETRAS, EDIÇÃO DE CIFRAS E CAIXA DE TEXTO FLUTUANTE */}
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
                    <span>Cifras, Letras & Textos</span>
                  </h2>
                </div>

                {/* Toggles de Visibilidade de Cifras e Letras */}
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

                {/* Afinação das Cifras Visíveis e Edição de Cifras Existentes */}
                {analysis.hasChords && (
                  <div className="p-3 rounded-xl bg-zinc-900/90 border border-sax-500/30 space-y-2.5">
                    {isBbOrEbActive && (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-sax-300">
                            Afinação das Cifras Visíveis ({activePartLabelInTopBar}):
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
                            Converter p/ {transposingShortLabel}
                          </button>
                        </div>
                      </>
                    )}

                    {/* Cifras na tela (Clicáveis para Editar escrita de cifras existentes) */}
                    {transformResult && transformResult.previewChords.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-300 font-semibold flex items-center gap-1">
                            <Edit3 className="w-3 h-3 text-sax-400" />
                            Cifras na tela (clique para editar):
                          </span>
                          {Object.keys(chordOverrides).length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setChordOverrides({});
                                setEditingChordKey(null);
                              }}
                              className="text-[10px] text-sax-400 hover:underline"
                            >
                              Restaurar cifras
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {transformResult.chordOccurrences
                            .reduce<Array<{ key: string; current: string; original: string }>>(
                              (acc, occ) => {
                                if (!acc.some((item) => item.original === occ.originalSymbol)) {
                                  acc.push({
                                    key: occ.originalSymbol,
                                    current: occ.currentSymbol,
                                    original: occ.originalSymbol,
                                  });
                                }
                                return acc;
                              },
                              []
                            )
                            .map((item) => {
                              const isSelected =
                                chordEditMode === 'symbol' && editingChordKey === item.original;
                              const isModified = item.current !== item.original;
                              return (
                                <button
                                  key={item.original}
                                  type="button"
                                  onClick={() => {
                                    setChordEditMode('symbol');
                                    setEditingChordKey(item.original);
                                    setEditingChordValue(item.current);
                                  }}
                                  className={`px-2 py-1 rounded-lg font-mono text-xs font-bold border transition ${
                                    isSelected
                                      ? 'bg-sax-500 text-studio-950 border-sax-300 shadow-sm'
                                      : isModified
                                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                                      : 'bg-studio-950 hover:bg-zinc-800 border-zinc-700 text-sax-300'
                                  }`}
                                  title="Clique para alterar a escrita desta cifra na partitura"
                                >
                                  {item.current}
                                </button>
                              );
                            })}
                        </div>

                        {/* Caixa de edição da cifra selecionada */}
                        {editingChordKey !== null && (
                          <div className="p-2.5 rounded-xl bg-studio-950 border border-sax-500/40 space-y-2 animate-fadeIn">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-zinc-300 font-semibold">
                                Editar cifra{' '}
                                <strong className="text-sax-400 font-mono">
                                  {editingChordKey}
                                </strong>
                                :
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setChordEditMode((m) =>
                                    m === 'symbol' ? 'occurrence' : 'symbol'
                                  )
                                }
                                className="text-[10px] text-sky-400 hover:underline"
                              >
                                {chordEditMode === 'symbol'
                                  ? 'Editar por compasso'
                                  : 'Editar todas iguais'}
                              </button>
                            </div>

                            {chordEditMode === 'occurrence' && (
                              <select
                                value={editingChordKey}
                                onChange={(e) => {
                                  const k = e.target.value;
                                  setEditingChordKey(k);
                                  const found = transformResult.chordOccurrences.find(
                                    (o) => `#${o.occurrenceIndex}` === k
                                  );
                                  if (found) setEditingChordValue(found.currentSymbol);
                                }}
                                className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200"
                              >
                                {transformResult.chordOccurrences.map((occ) => (
                                  <option
                                    key={occ.occurrenceIndex}
                                    value={`#${occ.occurrenceIndex}`}
                                  >
                                    Compasso {occ.measureNumber}: {occ.currentSymbol} (orig:{' '}
                                    {occ.originalSymbol})
                                  </option>
                                ))}
                              </select>
                            )}

                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingChordValue}
                                onChange={(e) => setEditingChordValue(e.target.value)}
                                placeholder="Ex: Dm7(9), A7/C#, Bb9"
                                className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-sax-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (!editingChordValue.trim()) return;
                                  setChordOverrides((prev) => ({
                                    ...prev,
                                    [editingChordKey]: editingChordValue.trim(),
                                  }));
                                  setEditingChordKey(null);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-sax-500 hover:bg-sax-400 text-studio-950 text-xs font-bold"
                              >
                                Aplicar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingChordKey(null)}
                                className="px-2 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Controles de Cabeçalho & Caixa de Texto Flutuante */}
                <div className="pt-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
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

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowHeaderEditorModal((v) => !v)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-sax-300 border border-zinc-700 transition"
                      >
                        <Type className="w-3.5 h-3.5" />
                        <span>{showHeaderEditorModal ? 'Fechar Editor' : 'Editar Cabeçalho'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Botão + Adicionar Texto Flutuante */}
                  <button
                    type="button"
                    onClick={handleAddFloatingText}
                    className="w-full py-2 px-3 rounded-xl bg-sax-500/15 hover:bg-sax-500/25 border border-sax-500/40 text-sax-300 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Adicionar Texto Flutuante</span>
                  </button>

                  {/* Lista de Caixas de Texto Flutuantes Criadas */}
                  {floatingTexts.length > 0 && (
                    <div className="space-y-2 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-700 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1 font-semibold text-zinc-300">
                          <Move className="w-3 h-3 text-sax-400" />
                          Textos Flutuantes (arraste na folha):
                        </span>
                      </div>
                      {floatingTexts.map((ft, idx) => (
                        <div
                          key={ft.id}
                          className="p-2 rounded-lg bg-studio-950 border border-zinc-800 space-y-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={ft.text}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFloatingTexts((prev) =>
                                  prev.map((item) =>
                                    item.id === ft.id ? { ...item, text: val } : item
                                  )
                                );
                              }}
                              placeholder={`Texto flutuante #${idx + 1}`}
                              className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-xs text-white"
                            />
                            <select
                              value={ft.fontSize}
                              onChange={(e) => {
                                const size = parseInt(e.target.value, 10) || 14;
                                setFloatingTexts((prev) =>
                                  prev.map((item) =>
                                    item.id === ft.id ? { ...item, fontSize: size } : item
                                  )
                                );
                              }}
                              className="px-1.5 py-1 rounded bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200"
                              title="Tamanho da fonte"
                            >
                              {[10, 12, 14, 16, 18, 20, 24, 28].map((sz) => (
                                <option key={sz} value={sz}>
                                  {sz}pt
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                setFloatingTexts((prev) =>
                                  prev.filter((item) => item.id !== ft.id)
                                )
                              }
                              className="p-1 rounded bg-red-950/60 text-red-300 hover:bg-red-900"
                              title="Remover texto flutuante"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

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
                                  title: {
                                    ...h.title,
                                    visible: !h.title.visible,
                                    removed: false,
                                  },
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
                            Instrumento (Canto Sup. Direito):
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
                              Auto Pauta
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
                              ? viewMode === 'full-score'
                                ? 'Grade Completa'
                                : activeStaffSummary?.headerInstrumentLabel ||
                                  headers.composer.text
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

                      {/* Letrista / Indicador Tom para Piano */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-zinc-300">
                            Tom para Piano (Canto Sup. Esquerdo):
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

              {/* 4. PAUTAS INTERNAS (.MSCZ) — SELEÇÃO E EXTRAÇÃO DE PARTES OCULTAS */}
              <section
                className={`${
                  mobileTab === 'staves' ? 'block' : 'hidden lg:block'
                } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-2.5 text-xs`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Pautas Internas (.MSCZ)</span>
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {analysis.measureCount} compassos
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400">
                  Clique em qualquer pauta para visualizá-la individualmente (atualizando o
                  instrumento no cabeçalho) e exportar seu PDF:
                </p>

                <div className="space-y-1.5">
                  {analysis.staves.map((st) => {
                    const isSelectedPart =
                      viewMode !== 'full-score' && selectedStaffId === st.staffId;
                    return (
                      <button
                        key={st.staffId}
                        type="button"
                        onClick={() => handleSelectStaffPart(st.staffId)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition ${
                          isSelectedPart
                            ? 'bg-sax-500/15 border-sax-500/60 text-white shadow-sm'
                            : 'bg-zinc-900/80 hover:bg-zinc-800/80 border-zinc-800 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              isSelectedPart
                                ? 'bg-sax-400 ring-2 ring-sax-400/30'
                                : 'bg-zinc-600'
                            }`}
                          />
                          <span className="font-semibold text-xs truncate">
                            Pauta {st.staffId}: {st.displayName}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold shrink-0 ${
                            isSelectedPart
                              ? 'bg-sax-500 text-studio-950'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {isSelectedPart
                            ? 'Ativa na Tela'
                            : st.isPercussion
                            ? 'Ver Parte (Percussão)'
                            : 'Ver Parte'}
                        </span>
                      </button>
                    );
                  })}

                  {analysis.staves.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleChangeViewMode('full-score')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition ${
                        viewMode === 'full-score'
                          ? 'bg-sax-500/15 border-sax-500/60 text-white shadow-sm'
                          : 'bg-zinc-900/80 hover:bg-zinc-800/80 border-zinc-800 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-sax-400" />
                        <span className="font-semibold text-xs">
                          Grade Completa ({analysis.staves.length} pautas empilhadas)
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          viewMode === 'full-score'
                            ? 'bg-sax-500 text-studio-950'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {viewMode === 'full-score' ? 'Ativa' : 'Empilhar'}
                      </span>
                    </button>
                  )}
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
            </div>
          </aside>

          {/* ÁREA PRINCIPAL DE VISUALIZAÇÃO DA PARTITURA (Exclusivamente Motor Vetorial Fiel MuseScore SVG) */}
          <main className="flex-1 flex flex-col overflow-hidden order-1 lg:order-2 min-h-[52vh]">
            {isLoadingFile ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-zinc-400">
                <Loader2 className="w-8 h-8 text-sax-400 animate-spin" />
                <p className="text-sm font-semibold text-zinc-200">
                  Processando pacote .mscz e diagramação original...
                </p>
              </div>
            ) : (
              <ScoreViewer
                modifiedMscx={
                  renderedSnapshotMscx || transformResult?.modifiedMscx || ''
                }
                originalBase64={originalBase64}
                fileName={analysis.fileName}
                canvasTheme={canvasTheme}
                onThemeChange={setCanvasTheme}
                viewMode={viewMode}
                onViewModeChange={handleChangeViewMode}
                floatingTexts={floatingTexts}
                onUpdateFloatingTextPosition={handleUpdateFloatingTextPosition}
                renderVersion={renderVersion}
                hasUnrenderedChanges={hasUnrenderedChanges}
                onRequestPreview={handleTriggerPreview}
              />
            )}
          </main>
        </div>
      )}

      {/* MODAL OBRIGATÓRIO DE AVISO DE CIFRAS PARA INSTRUMENTOS EM SIB (Bb) E MIB (Eb) */}
      <BbEbChordModal
        open={showBbEbModal}
        instrument={activeInstrument}
        instrumentDisplayName={activePartLabelInTopBar}
        concertTonality={currentConcertTonality}
        writtenTonality={currentWrittenTonality}
        sampleChords={analysis?.sampleChords || []}
        onConfirmConvertToInstrument={() => {
          setConvertBbEbChordsToWritten(true);
          setShowBbEbModal(false);
          if (analysis && originalMscx) {
            const nextOpts: ScoreTransformOptions = {
              ...screenTransformOptions,
              convertBbEbChordsToWritten: true,
            };
            const res = transformScoreXml(originalMscx, analysis, nextOpts);
            setRenderedSnapshotMscx(res.modifiedMscx);
            setRenderVersion((v) => v + 1);
          }
        }}
        onKeepPianoConcertPitch={() => {
          setConvertBbEbChordsToWritten(false);
          setShowBbEbModal(false);
        }}
      />
    </div>
  );
}
