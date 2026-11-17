'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FloatingTextBox, ScoreLayoutViewMode } from '@/lib/music/mscz-engine';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Lock,
  Loader2,
  AlertTriangle,
  FileText,
  Monitor,
  Layers,
  RefreshCw,
  Move,
} from 'lucide-react';

export type CanvasThemeMode = 'parchment' | 'white';

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
}: ScoreViewerProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [svgPages, setSvgPages] = useState<string[]>([]);
  const [svgLoading, setSvgLoading] = useState<boolean>(false);
  const [svgError, setSvgError] = useState<string | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!modifiedMscx || !originalBase64) {
      return;
    }

    let cancelled = false;
    setSvgLoading(true);
    setSvgError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/render-svg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalBase64,
            fileName,
            modifiedMscx,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.pages || data.pages.length === 0) {
          throw new Error(data.error || 'Não foi possível gerar a visualização pelo MuseScore 3.');
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
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Erro ao renderizar partitura via MuseScore 3.';
        setSvgError(msg);
      } finally {
        if (!cancelled) {
          setSvgLoading(false);
        }
      }
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderVersion, fileName]);

  const handlePointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
    pageIdx: number
  ) => {
    if (!draggingId) return;
    const container = pageRefs.current[pageIdx];
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;
    const clampedX = Math.max(2, Math.min(92, rawX));
    const clampedY = Math.max(2, Math.min(94, rawY));
    onUpdateFloatingTextPosition(draggingId, clampedX, clampedY);
  };

  const bgClass =
    canvasTheme === 'parchment'
      ? 'bg-[#F4E8C1] text-stone-900 border-amber-900/20'
      : 'bg-white text-slate-900 border-slate-300';

  const baseMaxWidth = viewMode === 'landscape' ? 1180 : 900;

  return (
    <div className="flex flex-col h-full w-full">
      {/* Barra Superior do Visualizador: 3 Modos de Visualização + Tema + Zoom */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-studio-900/95 border-b border-zinc-800 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-zinc-400 font-semibold hidden xl:inline mr-1">
            Modo de Exibição:
          </span>

          <button
            type="button"
            onClick={() => onViewModeChange('portrait')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition ${
              viewMode === 'portrait'
                ? 'bg-sax-500 text-studio-950 shadow-sm font-bold'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Visualização padrão de página A4 vertical (Retrato)"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Vertical (Retrato)</span>
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange('landscape')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition ${
              viewMode === 'landscape'
                ? 'bg-sax-500 text-studio-950 shadow-sm font-bold'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Visualização em orientação horizontal (Paisagem)"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Horizontal (Paisagem)</span>
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange('full-score')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition ${
              viewMode === 'full-score'
                ? 'bg-sax-500 text-studio-950 shadow-sm font-bold'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Exibe todas as pautas do arquivo simultaneamente empilhadas no mesmo sistema"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Grade Completa (Pautas Empilhadas)</span>
          </button>

          {hasUnrenderedChanges && (
            <button
              type="button"
              onClick={onRequestPreview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-studio-950 font-extrabold shadow-md animate-pulse transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Pré-visualizar Partitura</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de Fundo: Pergaminho Clássico vs Branco Impressão */}
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
            <button
              type="button"
              onClick={() => onThemeChange('parchment')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
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
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                canvasTheme === 'white'
                  ? 'bg-white text-slate-900 font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Branco
            </button>
          </div>

          {/* Controles de Zoom */}
          <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-1.5 py-0.5 border border-zinc-700">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(50, z - 15))}
              className="p-1 text-zinc-300 hover:text-sax-400 transition"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-zinc-200 font-mono min-w-[40px] text-center">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(200, z + 15))}
              className="p-1 text-zinc-300 hover:text-sax-400 transition"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(100)}
              className="p-1 text-zinc-400 hover:text-zinc-200 transition"
              title="Resetar Zoom (100%)"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Área Central da Partitura (Scrollable, 100% Fiel MuseScore SVG) */}
      <div className="flex-1 overflow-auto p-2 sm:p-5 bg-studio-950/90 flex flex-col items-center">
        <div
          className="w-full flex flex-col items-center gap-5 transition-all"
          style={{
            maxWidth: `${Math.round((baseMaxWidth * zoom) / 100)}px`,
          }}
        >
          {svgLoading && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-zinc-900/95 border border-sax-500/40 text-sax-400 text-xs font-semibold shadow-lg sticky top-2 z-20">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Renderizando partitura vetorial (MuseScore 3)...</span>
            </div>
          )}

          {svgError && (
            <div className="w-full max-w-xl p-4 rounded-xl bg-red-950/70 border border-red-500/40 text-red-100 text-xs flex flex-col gap-2.5">
              <div className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>Erro ao gerar visualização SVG: {svgError}</span>
              </div>
              <button
                type="button"
                onClick={onRequestPreview}
                className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sax-500 text-studio-950 font-bold hover:bg-sax-400 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar Novamente</span>
              </button>
            </div>
          )}

          {svgPages.map((svgHtml, idx) => {
            const pageFloatingTexts = floatingTexts.filter(
              (ft) => (ft.pageIndex || 0) === idx && ft.text.trim()
            );

            return (
              <div
                key={idx}
                className={`w-full rounded-xl shadow-2xl border overflow-hidden relative transition-colors ${bgClass}`}
              >
                {/* Selo discreto de página */}
                <div className="flex items-center justify-between px-4 py-1.5 text-[11px] border-b border-black/10 bg-black/[0.03]">
                  <span className="font-medium opacity-75">
                    Página {idx + 1} de {svgPages.length}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold opacity-80">
                    <Lock className="w-3 h-3" />
                    Rubsax Partituras
                  </span>
                </div>

                {/* Superfície da Página com SVG Nativo do MuseScore 3 + Caixas de Texto Flutuantes Arrastáveis */}
                <div
                  ref={(el) => {
                    pageRefs.current[idx] = el;
                  }}
                  onPointerMove={(e) => handlePointerMove(e, idx)}
                  onPointerUp={() => setDraggingId(null)}
                  onPointerLeave={() => setDraggingId(null)}
                  className="w-full p-2 sm:p-4 select-none relative"
                >
                  <div dangerouslySetInnerHTML={{ __html: svgHtml }} />

                  {/* Caixas de Texto Flutuantes Interativas (Arrastáveis na folha) */}
                  {pageFloatingTexts.map((ft) => (
                    <div
                      key={ft.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setDraggingId(ft.id);
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                        setDraggingId(null);
                      }}
                      style={{
                        left: `${ft.xPercent}%`,
                        top: `${ft.yPercent}%`,
                        fontSize: `${ft.fontSize}px`,
                        fontFamily: 'Georgia, "Times New Roman", serif',
                      }}
                      className={`absolute z-10 cursor-move px-2 py-0.5 rounded border transition select-none flex items-center gap-1 ${
                        draggingId === ft.id
                          ? 'border-sax-500 bg-sax-500/20 shadow-lg ring-2 ring-sax-400/50'
                          : 'border-amber-700/40 hover:border-sax-500 bg-black/[0.03]'
                      }`}
                      title="Arraste para posicionar livremente sobre a partitura"
                    >
                      <Move className="w-3 h-3 opacity-50 shrink-0" />
                      <span className="font-semibold whitespace-pre-wrap leading-tight text-stone-950">
                        {ft.text}
                      </span>
                    </div>
                  ))}
                </div>

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
