'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AccessLevel, FreePassStatus } from '@/lib/access';
import { FloatingTextBox, ScoreLayoutViewMode } from '@/lib/music/mscz-engine';
import type { FreePassSettings } from '@/lib/settings';
import FreePassCountdown from './FreePassCountdown';
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
  Sparkles,
  LogIn,
  Crown,
  Upload,
} from 'lucide-react';

export type CanvasThemeMode = 'parchment' | 'white';
export type ScoreLoadingReason = 'initial' | 'editing' | 'unlocking' | 'logout';

interface ScoreViewerProps {
  modifiedMscx: string;
  originalBase64: string;
  fileName: string;
  semitoneShift: number;
  octaveShift: number;
  lineBreakMeasures?: number[];
  pageBreakMeasures?: number[];
  totalPartsCount?: number;
  firstPartNoticeLabel?: string;
  canvasTheme: CanvasThemeMode;
  onThemeChange: (theme: CanvasThemeMode) => void;
  viewMode: ScoreLayoutViewMode;
  onViewModeChange: (mode: ScoreLayoutViewMode) => void;
  floatingTexts: FloatingTextBox[];
  onUpdateFloatingTextPosition: (id: string, xPercent: number, yPercent: number) => void;
  renderVersion: number;
  onRequestPreview: () => void;
  onLoadingChange?: (loading: boolean) => void;
  activeActionId?: string | null;
  loadingReason?: ScoreLoadingReason;
  ctaButtonText?: string;
  accessLevel: AccessLevel;
  freePassSettings: FreePassSettings;
  freePassStatus: FreePassStatus | null;
  isAuthenticated: boolean;
  isClaimingFreePass?: boolean;
  freePassError?: string | null;
  onRequireLoginForFreePass?: () => void;
  onClaimFreePass?: () => void;
  onFreePassExpired?: () => void;
  onOpenPlansModal?: (reason?: 'fullscreen' | 'pro' | 'default') => void;
  onPreviewStateChange?: (state: { isPreview: boolean; totalPages: number }) => void;
  isDemoScore?: boolean;
  onUploadOwnScore?: () => void;
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
  semitoneShift,
  octaveShift,
  lineBreakMeasures,
  pageBreakMeasures,
  totalPartsCount = 1,
  firstPartNoticeLabel = '',
  canvasTheme,
  onThemeChange,
  viewMode,
  onViewModeChange,
  floatingTexts,
  onUpdateFloatingTextPosition,
  renderVersion,
  onRequestPreview,
  onLoadingChange,
  activeActionId,
  loadingReason = 'editing',
  ctaButtonText,
  accessLevel,
  freePassSettings,
  freePassStatus,
  isAuthenticated,
  isClaimingFreePass = false,
  freePassError = null,
  onRequireLoginForFreePass,
  onClaimFreePass,
  onFreePassExpired,
  onOpenPlansModal,
  onPreviewStateChange,
  isDemoScore = false,
  onUploadOwnScore,
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
        const requestRender = async () => {
          const res = await fetch('/api/render-svg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              originalBase64,
              fileName,
              modifiedMscx,
              semitoneShift,
              octaveShift,
              lineBreakMeasures,
              pageBreakMeasures,
            }),
          });
          const data = await res.json().catch(() => ({}));
          return { res, data };
        };

        let attempt = await requestRender().catch((firstErr) => {
          if (controller.signal.aborted || cancelled) throw firstErr;
          console.error('[ScoreViewer] Falha ao renderizar SVG (tentativa 1):', firstErr);
          return null;
        });

        if (
          !cancelled &&
          !controller.signal.aborted &&
          (!attempt || (!attempt.res.ok && attempt.res.status >= 500))
        ) {
          if (attempt) {
            console.error('[ScoreViewer] Resposta 5xx ao renderizar SVG (tentativa 1):', {
              status: attempt.res.status,
              error: attempt.data?.error,
            });
          }
          await new Promise((r) => setTimeout(r, 600));
          if (!cancelled && !controller.signal.aborted) {
            attempt = await requestRender();
          }
        }

        if (cancelled || !attempt) return;
        const { res, data } = attempt;
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
        console.error('[ScoreViewer] Erro final ao renderizar SVG:', err);
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
  const isFullscreenLocked =
    !isDemoScore && (isPreview || accessLevel === 'preview' || accessLevel === 'free_pass');
  const isProToolbarLocked =
    !isDemoScore && (accessLevel === 'preview' || accessLevel === 'free_pass');

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
              className="p-1 rounded text-zinc-300 hover:text-sax-400 disabled:opacity-30 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
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
              className="p-1 rounded text-zinc-300 hover:text-sax-400 disabled:opacity-30 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
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
                className={`px-2.5 py-1 rounded-md text-xs font-medium active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
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
                className={`px-2.5 py-1 rounded-md text-xs font-medium active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white font-bold shadow-sm active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
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
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed ${
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
                if (isProToolbarLocked) {
                  onOpenPlansModal?.('pro');
                  return;
                }
                if (svgLoading || viewMode === 'full-score') return;
                onViewModeChange('full-score');
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-60 disabled:cursor-not-allowed ${
                isProToolbarLocked
                  ? 'bg-zinc-800/70 text-zinc-400 border border-zinc-700/80 hover:border-sax-500/40'
                  : viewMode === 'full-score'
                  ? 'bg-[#D97706] text-studio-950 shadow-sm font-bold ring-1 ring-sax-400'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              title={
                isProToolbarLocked
                  ? 'Grade Completa disponível nos planos Avulso e Mensal (PRO)'
                  : 'Exibe todas as pautas do arquivo simultaneamente empilhadas no mesmo sistema'
              }
            >
              {isSwitchingToFullScore ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isProToolbarLocked ? (
                <Lock className="w-3.5 h-3.5 text-sax-400" />
              ) : (
                <Layers className="w-3.5 h-3.5" />
              )}
              <span>Grade Completa</span>
              {isProToolbarLocked && (
                <span className="px-1.5 py-0.5 rounded bg-sax-500/20 text-sax-300 text-[9px] font-extrabold uppercase tracking-wider">
                  PRO
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Seletor de Fundo: Pergaminho Clássico vs Branco Impressão */}
            <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
              <button
                type="button"
                onClick={() => onThemeChange('parchment')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
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
                className={`px-2.5 py-1 rounded-md text-xs font-medium active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                  canvasTheme === 'white'
                    ? 'bg-white text-slate-900 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Branco
              </button>
            </div>

            {/* Botão de Tela Cheia (Exclusivo PRO: Avulso, Mensal e Dev) */}
            <button
              type="button"
              onClick={() => {
                if (isFullscreenLocked) {
                  onOpenPlansModal?.('fullscreen');
                  return;
                }
                void enterFullscreen();
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold shadow-sm active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                isFullscreenLocked
                  ? 'bg-zinc-800/80 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                  : 'bg-sax-500/20 hover:bg-sax-500/30 border-sax-500/50 text-sax-300'
              }`}
              title={
                isFullscreenLocked
                  ? 'Tela Cheia exclusiva dos planos Avulso e Mensal (PRO)'
                  : 'Expandir Visor para Tela Cheia'
              }
            >
              {isFullscreenLocked ? (
                <Lock className="w-3.5 h-3.5 text-sax-400" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-sax-400" />
              )}
              <span>Tela Cheia</span>
              {isFullscreenLocked && (
                <span className="px-1.5 py-0.5 rounded bg-sax-500/20 text-sax-300 text-[9px] font-extrabold uppercase tracking-wider">
                  PRO
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tarja do Modo Demo Interativo ("Parabéns pra Você") */}
      {!isFullscreen && isDemoScore && (
        <div className="px-3 sm:px-4 py-2 bg-emerald-950/60 border-b border-emerald-500/35 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-emerald-100">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              <strong>Modo Teste (&ldquo;Parabéns pra Você&rdquo;)</strong> — Todas as 5 gavetas,
              10 partes e Tela Cheia liberadas na tela!{' '}
              <span className="text-amber-300 font-semibold">(Exportar PDF bloqueado no teste)</span>
            </span>
          </div>
          {onUploadOwnScore && (
            <button
              type="button"
              onClick={onUploadOwnScore}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#D97706] hover:bg-sax-400 text-studio-950 text-[11px] font-extrabold shrink-0 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
            >
              <Upload className="w-3 h-3" />
              <span>Enviar Minha Partitura</span>
            </button>
          )}
        </div>
      )}

      {/* Tarja de Passe Gratuito Ativo no Topo do Visor */}
      {!isFullscreen &&
        !isDemoScore &&
        accessLevel === 'free_pass' &&
        freePassStatus?.activeUnlock?.expiresAt && (
          <div className="px-3 sm:px-4 py-2 bg-emerald-950/65 border-b border-emerald-500/35 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-emerald-200">
              <FreePassCountdown
                targetIso={freePassStatus.activeUnlock.expiresAt}
                mode="active"
                onExpire={onFreePassExpired}
                className="text-emerald-300"
              />
              <span className="text-[11px] text-emerald-200/85">
                • Tom/Oitava e Quebras na 1ª parte (PDF com rodapé)
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenPlansModal?.('pro')}
              className="px-2.5 py-1 rounded-lg bg-[#D97706] hover:bg-sax-400 text-studio-950 text-[11px] font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
            >
              Liberar Completo (PRO)
            </button>
          </div>
        )}

      {/* Visor discreto de Aviso de Pautas Ocultas (exclusivo Visitante e Modo Gratuito) */}
      {!isFullscreen &&
        !isDemoScore &&
        (accessLevel === 'preview' || accessLevel === 'free_pass') &&
        totalPartsCount > 1 && (
          <div className="px-3 sm:px-4 py-2 bg-amber-950/45 border-b border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-100">
            <span className="flex items-center gap-1.5 leading-snug">
              <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                Este arquivo possui <strong>{totalPartsCount} instrumentos</strong>. Você está
                visualizando apenas a <strong>1ª parte</strong>
                {firstPartNoticeLabel ? ` (${firstPartNoticeLabel})` : ''} no modo atual.
              </span>
            </span>
            <button
              type="button"
              onClick={() => onOpenPlansModal?.('pro')}
              className="text-[11px] font-extrabold text-sax-300 hover:text-sax-200 underline underline-offset-2 shrink-0 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
            >
              Ver planos PRO
            </button>
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
                className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sax-500 text-studio-950 font-bold hover:bg-sax-400 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
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
                  <div className="relative px-4 sm:px-8 py-7 sm:py-9 bg-gradient-to-t from-studio-950 via-studio-950/95 to-studio-950/80 text-zinc-100 border-t border-sax-500/30 flex flex-col items-center text-center gap-4">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sax-500/15 border border-sax-500/40 text-sax-300 text-[11px] font-bold">
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        Prévia gratuita • Partitura completa tem {totalPagesCount || 1}{' '}
                        {(totalPagesCount || 1) === 1 ? 'página' : 'páginas'}
                      </span>
                    </div>

                    <div
                      className={`grid gap-3.5 w-full ${
                        freePassSettings.enabled
                          ? 'grid-cols-1 md:grid-cols-2 max-w-3xl'
                          : 'grid-cols-1 max-w-md'
                      }`}
                    >
                      {/* Opção 1: Modo Gratuito (1 música a cada X dias) */}
                      {freePassSettings.enabled && (
                        <div className="p-4 sm:p-5 rounded-2xl bg-studio-900/95 border border-emerald-500/40 text-left flex flex-col justify-between gap-3.5 shadow-lg">
                          <div className="space-y-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
                              <Sparkles className="w-3 h-3" />
                              Passe Gratuito
                            </span>
                            <h4 className="text-sm sm:text-base font-extrabold text-white">
                              1 música grátis a cada {freePassSettings.cooldown_days}{' '}
                              {freePassSettings.cooldown_days === 1 ? 'dia' : 'dias'}
                            </h4>
                            <p className="text-[11px] text-zinc-300 leading-relaxed">
                              {freePassSettings.unlock_hours}h para editar e baixar • Tom, Oitava e
                              Quebras (1ª parte) • exige login
                            </p>
                          </div>

                          {freePassError && (
                            <p className="p-2 rounded-lg bg-red-950/70 border border-red-500/40 text-[11px] text-red-200 font-semibold">
                              {freePassError}
                            </p>
                          )}

                          {!isAuthenticated ? (
                            <button
                              type="button"
                              onClick={() => onRequireLoginForFreePass?.()}
                              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-studio-950 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-md active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              <span>Entrar para Liberar Grátis</span>
                            </button>
                          ) : freePassStatus?.state === 'email_unconfirmed' ? (
                            <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-[11px] text-amber-200 font-semibold leading-snug">
                              Confirme seu endereço de e-mail para ativar o Passe Gratuito (ou entre
                              com o Google).
                            </div>
                          ) : freePassStatus?.state === 'cooldown' &&
                            freePassStatus.cooldownUntil ? (
                            <div className="p-2.5 rounded-xl bg-zinc-900 border border-amber-500/30 space-y-1">
                              <FreePassCountdown
                                targetIso={freePassStatus.cooldownUntil}
                                mode="cooldown"
                                onExpire={onFreePassExpired}
                                className="text-amber-300 text-xs"
                              />
                              <p className="text-[11px] text-zinc-400">
                                Deseja liberar agora sem esperar? Escolha o plano PRO ao lado.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <button
                                type="button"
                                disabled={isClaimingFreePass}
                                onClick={() => onClaimFreePass?.()}
                                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-studio-950 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-md active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                              >
                                {isClaimingFreePass ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {isClaimingFreePass
                                    ? 'Liberando partitura...'
                                    : 'Usar meu Passe Gratuito nesta música'}
                                </span>
                              </button>
                              <p className="text-[10px] text-zinc-400 text-center">
                                Confirmação em 1 clique: libera esta música por{' '}
                                {freePassSettings.unlock_hours}h.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Opção 2: Desbloquear Completo (PRO) */}
                      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-sax-500/15 to-studio-900 border-2 border-sax-500/60 text-left flex flex-col justify-between gap-3.5 shadow-lg">
                        <div className="space-y-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sax-500/20 border border-sax-500/40 text-sax-300 text-[10px] font-extrabold uppercase tracking-wider">
                            <Crown className="w-3 h-3" />
                            Planos PRO
                          </span>
                          <h4 className="text-sm sm:text-base font-extrabold text-white">
                            Desbloquear Completo (PRO)
                          </h4>
                          <p className="text-[11px] text-zinc-300 leading-relaxed">
                            Todas as gavetas, Pautas Internas, Tela Cheia, quebras manuais e PDF
                            limpo em alta definição.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenPlansModal?.('pro')}
                          className="w-full py-2.5 px-5 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 shadow-xl shadow-sax-500/20 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                        >
                          <Unlock className="w-4 h-4" />
                          <span>
                            {ctaButtonText || serverCtaText || 'Visualizar partitura inteira'}
                          </span>
                        </button>
                      </div>
                    </div>
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
