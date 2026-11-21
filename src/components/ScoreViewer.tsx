'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FloatingTextBox, ScoreLayoutViewMode } from '@/lib/music/mscz-engine';
import {
  Lock,
  Loader2,
  AlertTriangle,
  FileText,
  Layers,
  RefreshCw,
  Move,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  X,
  Unlock,
} from 'lucide-react';

export type CanvasThemeMode = 'parchment' | 'white';
export type ScoreLoadingReason = 'initial' | 'editing' | 'unlocking' | 'logout';

interface ScoreViewerProps {
  modifiedMscx: string;
  originalBase64: string;
  fileName: string;
  canvasTheme: CanvasThemeMode;
  onThemeChange: (theme: CanvasThemeMode) => void;
  viewMode: ScoreLayoutViewMode;
  onViewModeChange: (mode: ScoreLayoutViewMode) => void;
  floatingTexts: FloatingTextBox[];
  onUpdateFloatingTextPosition: (id: string, xPercent: number, yPercent: number) => void;
  renderVersion: number;
  hasUnrenderedChanges: boolean;
  onRequestPreview: () => void;
  onLoadingChange?: (loading: boolean) => void;
  activeActionId?: string | null;
  loadingReason?: ScoreLoadingReason;
  ctaButtonText?: string;
  onOpenPlansModal?: () => void;
  onPreviewStateChange?: (state: { isPreview: boolean; totalPages: number }) => void;
}

interface DragState {
  id: string;
  pageIdx: number;
  grabOffsetXPx: number;
  grabOffsetYPx: number;
}

export default function ScoreViewer({
  modifiedMscx,
  originalBase64,
  fileName,
  canvasTheme,
  onThemeChange,
  viewMode,
  onViewModeChange,
  floatingTexts,
  onUpdateFloatingTextPosition,
  renderVersion,
  hasUnrenderedChanges,
  onRequestPreview,
  onLoadingChange,
  activeActionId,
  loadingReason = 'editing',
  ctaButtonText,
  onOpenPlansModal,
  onPreviewStateChange,
}: ScoreViewerProps) {
  const [svgPages, setSvgPages] = useState<string[]>([]);
  const [svgLoading, setSvgLoading] = useState<boolean>(false);
  const [svgError, setSvgError] = useState<string | null>(null);
  const [pageWidthPx, setPageWidthPx] = useState<number>(860);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentVisiblePage, setCurrentVisiblePage] = useState<number>(1);
  const [isPreview, setIsPreview] = useState<boolean>(false);
  const [totalPagesCount, setTotalPagesCount] = useState<number>(1);
  const [serverCtaText, setServerCtaText] = useState<string>('');

  const [dragState, setDragState] = useState<DragState | null>(null);
  const viewerRootRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    onLoadingChange?.(svgLoading);
  }, [svgLoading, onLoadingChange]);

  useEffect(() => {
    if (!modifiedMscx || !originalBase64) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setSvgLoading(true);
    setSvgError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/render-svg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            originalBase64,
            fileName,
            modifiedMscx,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.pages || data.pages.length === 0) {
          throw new Error(
            data.error || 'Não foi possível gerar a visualização pelo MuseScore 3.'
          );
        }

        const responsivePages = (data.pages as string[]).map((rawSvg) =>
          rawSvg.replace(/<svg([^>]*)>/i, (_match, attrs) => {
            const cleaned = attrs
              .replace(/\swidth="[^"]*"/i, '')
              .replace(/\sheight="[^"]*"/i, '');
            return `<svg${cleaned} width="100%" height="auto" style="display:block;max-width:100%;height:auto;">`;
          })
        );
        setSvgPages(responsivePages);
        setCurrentVisiblePage(1);
        const nextIsPreview = Boolean(data.isPreview);
        const nextTotalPages = Number(data.totalPages) || responsivePages.length;
        setIsPreview(nextIsPreview);
        setTotalPagesCount(nextTotalPages);
        if (typeof data.ctaText === 'string' && data.ctaText) {
          setServerCtaText(data.ctaText);
        }
        onPreviewStateChange?.({ isPreview: nextIsPreview, totalPages: nextTotalPages });
      } catch (err: unknown) {
        if (cancelled || controller.signal.aborted) return;
        const msg =
          err instanceof Error ? err.message : 'Erro ao renderizar partitura via MuseScore 3.';
        setSvgError(msg);
      } finally {
        if (!cancelled) {
          setSvgLoading(false);
        }
      }
    }, 30);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderVersion, fileName]);

  // Monitora a largura exata do container SVG para escalar textos flutuantes em proporção 1:1 com A4 (595.44 pt)
  useEffect(() => {
    const el = pageRefs.current[0];
    if (!el || typeof ResizeObserver === 'undefined') return;

    const updateWidth = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 50) setPageWidthPx(w);
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [svgPages, viewMode, isFullscreen]);

  const enterFullscreen = useCallback(async () => {
    setIsFullscreen(true);
    try {
      const el = viewerRootRef.current;
      if (el && el.requestFullscreen && !document.fullscreenElement) {
        await el.requestFullscreen();
      }
    } catch {
      // Fallback CSS fixed inset-0 z-50 continua ativo normalmente (ex: iOS Safari)
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    setIsFullscreen(false);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignora erro caso já tenha saído da Fullscreen API
    }
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void exitFullscreen();
      }
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [isFullscreen, exitFullscreen]);

  const handleScrollTrackPage = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || svgPages.length <= 1) {
      setCurrentVisiblePage(1);
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    let closestPage = 1;
    let minDistance = Infinity;

    for (let i = 0; i < svgPages.length; i++) {
      const pEl = pageRefs.current[i];
      if (!pEl) continue;
      const dist = Math.abs(pEl.getBoundingClientRect().top - containerTop - 24);
      if (dist < minDistance) {
        minDistance = dist;
        closestPage = i + 1;
      }
    }
    setCurrentVisiblePage(closestPage);
  }, [svgPages.length]);

  const scrollToPage = useCallback(
    (targetPageOneBased: number) => {
      const clamped = Math.max(1, Math.min(svgPages.length || 1, targetPageOneBased));
      setCurrentVisiblePage(clamped);
      const el = pageRefs.current[clamped - 1];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [svgPages.length]
  );

  const updateDragPosition = (clientX: number, clientY: number, currentDrag: DragState) => {
    const container = pageRefs.current[currentDrag.pageIdx];
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const targetLeftPx = clientX - currentDrag.grabOffsetXPx - rect.left;
    const targetTopPx = clientY - currentDrag.grabOffsetYPx - rect.top;

    const rawX = (targetLeftPx / rect.width) * 100;
    const rawY = (targetTopPx / rect.height) * 100;
    const clampedX = Math.max(1, Math.min(92, Number(rawX.toFixed(2))));
    const clampedY = Math.max(1, Math.min(95, Number(rawY.toFixed(2))));
    onUpdateFloatingTextPosition(currentDrag.id, clampedX, clampedY);
  };

  const renderFloatingOverlayBoxes = (pageIdx: number, list: FloatingTextBox[]) => {
    return list
      .filter((ft) => ft.text.trim())
      .map((ft) => {
        const isDraggingThis = dragState?.id === ft.id;
        // 1 A4 width = 8.27 in = 595.44 pt -> garante mesma proporção tipográfica do PDF
        const scaledFontPx = Math.max(8, (ft.fontSize || 12) * (pageWidthPx / 595.44));

        return (
          <div
            key={ft.id}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const targetEl = e.currentTarget as HTMLElement;
              const boxRect = targetEl.getBoundingClientRect();
              try {
                targetEl.setPointerCapture(e.pointerId);
              } catch {
                // Ignora caso o browser não suporte pointer capture
              }
              setDragState({
                id: ft.id,
                pageIdx,
                grabOffsetXPx: e.clientX - boxRect.left,
                grabOffsetYPx: e.clientY - boxRect.top,
              });
            }}
            onPointerMove={(e) => {
              if (!dragState || dragState.id !== ft.id) return;
              e.preventDefault();
              e.stopPropagation();
              updateDragPosition(e.clientX, e.clientY, dragState);
            }}
            onPointerUp={(e) => {
              if (!dragState || dragState.id !== ft.id) return;
              e.stopPropagation();
              try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              } catch {
                // Ignore
              }
              setDragState(null);
            }}
            onPointerCancel={() => setDragState(null)}
            style={{
              touchAction: 'none',
              left: `${ft.xPercent}%`,
              top: `${ft.yPercent}%`,
              fontSize: `${scaledFontPx}px`,
              fontFamily: 'Georgia, "Times New Roman", serif',
            }}
            className={`absolute z-20 cursor-grab active:cursor-grabbing touch-none select-none px-2 py-1 min-h-[28px] rounded border transition-colors flex items-center gap-1 ${
              isDraggingThis
                ? 'border-sax-500 bg-sax-500/25 shadow-lg ring-2 ring-sax-400/60'
                : 'border-amber-700/45 hover:border-sax-500 bg-black/[0.04]'
            }`}
            title="Arraste com o mouse ou dedo para posicionar na partitura"
          >
            <Move className="w-3 h-3 opacity-60 shrink-0 pointer-events-none" />
            <span className="font-semibold whitespace-pre-wrap leading-none text-stone-950 pointer-events-none">
              {ft.text}
            </span>
          </div>
        );
      });
  };

  const bgClass =
    canvasTheme === 'parchment'
      ? 'bg-[#F4E8C1] text-stone-900 border-amber-900/20'
      : 'bg-white text-slate-900 border-slate-300';

  const isSwitchingToPortrait = svgLoading && activeActionId === 'view-portrait';
  const isSwitchingToFullScore = svgLoading && activeActionId === 'view-full-score';

  const loadingCopy =
    loadingReason === 'unlocking'
      ? {
          title: 'Plano identificado! Liberando partitura completa...',
          subtitle:
            'Seu acesso foi confirmado. Carregando todas as páginas em alta definição...',
        }
      : loadingReason === 'logout'
      ? {
          title: 'Encerrando sessão...',
          subtitle:
            'Atualizando a visualização da partitura para o modo de visitante...',
        }
      : loadingReason === 'initial'
      ? {
          title: 'Carregando Partitura...',
          subtitle:
            'O motor do MuseScore 3 está preparando a visualização vetorial da sua partitura...',
        }
      : {
          title: 'Aplicando Alterações...',
          subtitle:
            'O motor do MuseScore 3 está processando e renderizando a partitura vetorial. Aguarde alguns instantes...',
        };

  return (
    <div
      ref={viewerRootRef}
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[#0b0f19] flex flex-col w-full h-full'
          : 'flex flex-col h-full w-full relative'
      }
    >
      {/* OVERLAY CENTRALIZADO NA ÁREA DA PARTITURA */}
      {svgLoading && (
        <div
          className={`${
            isFullscreen ? 'fixed' : 'absolute'
          } inset-0 z-40 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fadeIn`}
        >
          <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-studio-900 border-2 border-sax-500/60 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-sax-500/15 border border-sax-500/40 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-sax-400 animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                {loadingCopy.title}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                {loadingCopy.subtitle}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Barra Superior Flutuante Compacta no MODO TELA CHEIA vs Barra Normal */}
      {isFullscreen ? (
        <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2.5 bg-studio-900/95 backdrop-blur-md border-b border-zinc-800 shadow-lg text-xs">
          {/* Paginação */}
          <div className="flex items-center gap-1.5 bg-zinc-800/90 rounded-lg px-2 py-1 border border-zinc-700">
            <button
              type="button"
              disabled={currentVisiblePage <= 1}
              onClick={() => scrollToPage(currentVisiblePage - 1)}
              className="p-1 rounded text-zinc-300 hover:text-sax-400 disabled:opacity-30 active:scale-95 transition-transform duration-75 touch-manipulation"
              title="Página Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-zinc-100 px-1.5 whitespace-nowrap">
              Página {Math.min(currentVisiblePage, svgPages.length || 1)} de {svgPages.length || 1}
            </span>
            <button
              type="button"
              disabled={currentVisiblePage >= (svgPages.length || 1)}
              onClick={() => scrollToPage(currentVisiblePage + 1)}
              className="p-1 rounded text-zinc-300 hover:text-sax-400 disabled:opacity-30 active:scale-95 transition-transform duration-75 touch-manipulation"
              title="Próxima Página"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Seletor Pergaminho | Branco */}
            <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
              <button
                type="button"
                onClick={() => onThemeChange('parchment')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium active:scale-95 transition-transform duration-75 touch-manipulation ${
                  canvasTheme === 'parchment'
                    ? 'bg-[#F4E8C1] text-stone-900 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Pergaminho
              </button>
              <button
                type="button"
                onClick={() => onThemeChange('white')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium active:scale-95 transition-transform duration-75 touch-manipulation ${
                  canvasTheme === 'white'
                    ? 'bg-white text-slate-900 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Branco
              </button>
            </div>

            <button
              type="button"
              onClick={() => void exitFullscreen()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white font-bold shadow-sm active:scale-95 transition-transform duration-75 touch-manipulation"
              title="Sair da Tela Cheia (ESC)"
            >
              <X className="w-3.5 h-3.5" />
              <span>Sair da Tela Cheia</span>
            </button>
          </div>
        </div>
      ) : (
        /* Barra Superior Limpa do Visualizador: Vertical (Paginado), Grade Completa, Pergaminho/Branco e Tela Cheia */
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-studio-900/95 border-b border-zinc-800 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-zinc-400 font-semibold hidden xl:inline mr-1">
              Modo de Exibição:
            </span>

            <button
              type="button"
              disabled={svgLoading}
              onClick={() => {
                if (svgLoading || viewMode === 'portrait') return;
                onViewModeChange('portrait');
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform duration-75 touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed ${
                viewMode === 'portrait'
                  ? 'bg-[#D97706] text-studio-950 shadow-sm font-bold ring-1 ring-sax-400'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              title="Visualização padrão paginada em A4 vertical"
            >
              {isSwitchingToPortrait ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>Vertical (Paginado)</span>
            </button>

            <button
              type="button"
              disabled={svgLoading}
              onClick={() => {
                if (svgLoading || viewMode === 'full-score') return;
                onViewModeChange('full-score');
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform duration-75 touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed ${
                viewMode === 'full-score'
                  ? 'bg-[#D97706] text-studio-950 shadow-sm font-bold ring-1 ring-sax-400'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              title="Exibe todas as pautas do arquivo simultaneamente empilhadas no mesmo sistema"
            >
              {isSwitchingToFullScore ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Layers className="w-3.5 h-3.5" />
              )}
              <span>Grade Completa (Pautas Empilhadas)</span>
            </button>

            {hasUnrenderedChanges && (
              <button
                type="button"
                disabled={svgLoading}
                onClick={onRequestPreview}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-studio-950 font-extrabold shadow-md active:scale-95 transition-transform duration-75 touch-manipulation"
              >
                {svgLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>Aplicar Alterações</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Seletor de Fundo: Pergaminho Clássico vs Branco Impressão */}
            <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
              <button
                type="button"
                onClick={() => onThemeChange('parchment')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium active:scale-95 transition-transform duration-75 touch-manipulation ${
                  canvasTheme === 'parchment'
                    ? 'bg-[#F4E8C1] text-stone-900 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Pergaminho
              </button>
              <button
                type="button"
                onClick={() => onThemeChange('white')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium active:scale-95 transition-transform duration-75 touch-manipulation ${
                  canvasTheme === 'white'
                    ? 'bg-white text-slate-900 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Branco
              </button>
            </div>

            {/* Botão Destacado de Tela Cheia (Expandir Visor) ou Cadeado em Modo Prévia */}
            <button
              type="button"
              onClick={() => {
                if (isPreview) {
                  onOpenPlansModal?.();
                  return;
                }
                void enterFullscreen();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sax-500/20 hover:bg-sax-500/30 border border-sax-500/50 text-sax-300 font-bold shadow-sm active:scale-95 transition-transform duration-75 touch-manipulation"
              title={
                isPreview
                  ? 'Modo Prévia: desbloqueie a partitura para usar Tela Cheia'
                  : 'Expandir Visor para Tela Cheia'
              }
            >
              {isPreview ? (
                <Lock className="w-3.5 h-3.5 text-sax-400" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-sax-400" />
              )}
              <span>Tela Cheia</span>
            </button>
          </div>
        </div>
      )}

      {/* Área Central da Partitura (Scrollable, 100% Fiel MuseScore SVG) */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScrollTrackPage}
        className={`flex-1 overflow-auto p-2 sm:p-5 flex flex-col items-center ${
          isFullscreen ? 'bg-[#0b0f19]' : 'bg-studio-950/90'
        }`}
      >
        <div
          className={`w-full flex flex-col items-center gap-5 transition-all ${
            isFullscreen ? 'max-w-[960px]' : 'max-w-[900px]'
          }`}
        >
          {svgError && (
            <div className="w-full max-w-xl p-4 rounded-xl bg-red-950/70 border border-red-500/40 text-red-100 text-xs flex flex-col gap-2.5">
              <div className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>Erro ao gerar visualização SVG: {svgError}</span>
              </div>
              <button
                type="button"
                onClick={onRequestPreview}
                className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sax-500 text-studio-950 font-bold hover:bg-sax-400 active:scale-95 transition-transform duration-75 touch-manipulation"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar Novamente</span>
              </button>
            </div>
          )}

          {/* MODO PAGINADO (Vertical Retrato ou Grade Completa) */}
          {svgPages.map((svgHtml, idx) => {
            const pageFloatingTexts = floatingTexts.filter(
              (ft) => (ft.pageIndex || 0) === idx && ft.text.trim()
            );

            return (
              <div
                key={idx}
                className={`w-full rounded-xl shadow-2xl border overflow-hidden relative transition-colors ${bgClass}`}
              >
                {/* Selo discreto de página com total real de páginas (inclusive em Modo Prévia) */}
                <div className="flex items-center justify-between px-4 py-1.5 text-[11px] border-b border-black/10 bg-black/[0.03]">
                  <span className="font-medium opacity-75">
                    Página {idx + 1} de {totalPagesCount || svgPages.length}
                    {isPreview && ' (Prévia)'}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold opacity-80">
                    <Lock className="w-3 h-3" />
                    Rubsax Partituras
                  </span>
                </div>

                {/* Superfície exata A4 sem padding para alinhamento 1:1 com coordenadas em mm do PDF */}
                <div
                  ref={(el) => {
                    pageRefs.current[idx] = el;
                  }}
                  className="w-full select-none relative"
                >
                  <div dangerouslySetInnerHTML={{ __html: svgHtml }} />

                  {renderFloatingOverlayBoxes(idx, pageFloatingTexts)}
                </div>

                {/* Paywall CTA em Modo Prévia (exibido logo abaixo do recorte da Página 1) */}
                {isPreview && idx === 0 && (
                  <div className="relative px-4 sm:px-8 py-8 sm:py-10 bg-gradient-to-t from-studio-950 via-studio-950/95 to-studio-950/75 text-zinc-100 border-t border-sax-500/30 flex flex-col items-center text-center gap-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sax-500/15 border border-sax-500/40 text-sax-300 text-[11px] font-bold">
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        Prévia gratuita • Partitura completa tem {totalPagesCount || 1}{' '}
                        {(totalPagesCount || 1) === 1 ? 'página' : 'páginas'}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-300 max-w-md">
                      Gostou da transposição e diagramação? Desbloqueie todas as páginas, Tela
                      Cheia e exportação em PDF de alta definição.
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenPlansModal?.()}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs sm:text-sm font-extrabold shadow-xl shadow-sax-500/20 active:scale-95 transition-transform duration-75 touch-manipulation"
                    >
                      <Unlock className="w-4 h-4" />
                      <span>
                        {ctaButtonText || serverCtaText || 'Visualizar partitura inteira'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Marca d'Água Obrigatória Fixa e Imutável na Tela */}
                <div className="px-4 py-2 border-t border-black/10 bg-black/[0.04] flex items-center justify-between text-[11px] select-none pointer-events-none">
                  <span className="font-semibold tracking-wide">
                    © Rubsax Partituras — Direitos Autorais Protegidos
                  </span>
                  <span className="opacity-75 font-mono text-[10px]">
                    rubsax.com.br
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
