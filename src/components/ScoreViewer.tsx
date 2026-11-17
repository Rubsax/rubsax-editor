'use client';

import React, { useEffect, useRef, useState } from 'react';
import { convertMscxToMusicXml } from '@/lib/music/mscx-to-musicxml';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileCheck2,
  Smartphone,
  Lock,
  Loader2,
  Sparkles,
} from 'lucide-react';

export type ViewerEngineMode = 'musescore-svg' | 'osmd';
export type CanvasThemeMode = 'parchment' | 'white';

interface ScoreViewerProps {
  modifiedMscx: string;
  originalBase64: string;
  fileName: string;
  canvasTheme: CanvasThemeMode;
  onThemeChange: (theme: CanvasThemeMode) => void;
  engineMode: ViewerEngineMode;
  onEngineModeChange: (mode: ViewerEngineMode) => void;
}

export default function ScoreViewer({
  modifiedMscx,
  originalBase64,
  fileName,
  canvasTheme,
  onThemeChange,
  engineMode,
  onEngineModeChange,
}: ScoreViewerProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [svgPages, setSvgPages] = useState<string[]>([]);
  const [svgLoading, setSvgLoading] = useState<boolean>(false);
  const [svgError, setSvgError] = useState<string | null>(null);

  const osmdContainerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osmdInstanceRef = useRef<any>(null);
  const [osmdLoading, setOsmdLoading] = useState<boolean>(false);
  const [osmdError, setOsmdError] = useState<string | null>(null);

  // Render via MuseScore Headless SVG API when in 'musescore-svg' mode
  useEffect(() => {
    if (engineMode !== 'musescore-svg' || !modifiedMscx || !originalBase64) {
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
          throw new Error(data.error || 'Não foi possível gerar SVG via MuseScore CLI.');
        }
        // Ajustar SVGs para escalarem de forma responsiva dentro do container
        const responsivePages = (data.pages as string[]).map((rawSvg) =>
          rawSvg.replace(
            /<svg([^>]*)>/i,
            (match, attrs) => {
              const cleaned = attrs
                .replace(/\swidth="[^"]*"/i, '')
                .replace(/\sheight="[^"]*"/i, '');
              return `<svg${cleaned} width="100%" height="auto" style="display:block;max-width:100%;height:auto;">`;
            }
          )
        );
        setSvgPages(responsivePages);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Erro ao renderizar SVG pelo MuseScore CLI.';
        setSvgError(msg);
      } finally {
        if (!cancelled) {
          setSvgLoading(false);
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [engineMode, modifiedMscx, originalBase64, fileName]);

  // Render via OpenSheetMusicDisplay (OSMD) when in 'osmd' mode
  useEffect(() => {
    if (engineMode !== 'osmd' || !modifiedMscx || !osmdContainerRef.current) {
      return;
    }

    let cancelled = false;
    setOsmdLoading(true);
    setOsmdError(null);

    const renderOsmd = async () => {
      try {
        const musicXml = convertMscxToMusicXml(modifiedMscx);
        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        if (cancelled || !osmdContainerRef.current) return;

        if (!osmdInstanceRef.current) {
          osmdInstanceRef.current = new OpenSheetMusicDisplay(osmdContainerRef.current, {
            autoResize: true,
            backend: 'svg',
            drawTitle: true,
            drawSubtitle: true,
            drawComposer: true,
            drawLyricist: true,
            drawPartNames: false,
            drawMeasureNumbers: true,
          });
        }

        await osmdInstanceRef.current.load(musicXml);
        if (cancelled) return;
        osmdInstanceRef.current.zoom = zoom / 100;
        osmdInstanceRef.current.render();
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Erro ao renderizar partitura via OSMD.';
        setOsmdError(msg);
      } finally {
        if (!cancelled) {
          setOsmdLoading(false);
        }
      }
    };

    renderOsmd();

    return () => {
      cancelled = true;
    };
  }, [engineMode, modifiedMscx, zoom]);

  const bgClass =
    canvasTheme === 'parchment'
      ? 'bg-[#F4E8C1] text-stone-900 border-amber-900/20'
      : 'bg-white text-slate-900 border-slate-300';

  return (
    <div className="flex flex-col h-full w-full">
      {/* Sub-barra de Controles do Visualizador (Tema Pergaminho/Branco, Motor SVG/OSMD e Zoom) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-studio-900/90 border-b border-zinc-800 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-zinc-400 font-medium hidden sm:inline">Motor Visual:</span>
          <button
            type="button"
            onClick={() => onEngineModeChange('musescore-svg')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
              engineMode === 'musescore-svg'
                ? 'bg-sax-500 text-studio-950 shadow-sm font-semibold'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Renderização vetorial 100% idêntica ao layout original do MuseScore 3 e ao PDF exportado"
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Fiel MuseScore (SVG)</span>
          </button>
          <button
            type="button"
            onClick={() => onEngineModeChange('osmd')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition ${
              engineMode === 'osmd'
                ? 'bg-sax-500 text-studio-950 shadow-sm font-semibold'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Renderização responsiva via OpenSheetMusicDisplay (OSMD) que reajusta compassos à largura da tela"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Responsivo (OSMD)</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de Fundo: Pergaminho Clássico vs Branco Impressão */}
          <div className="flex items-center bg-zinc-800 rounded-md p-0.5 border border-zinc-700">
            <button
              type="button"
              onClick={() => onThemeChange('parchment')}
              className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                canvasTheme === 'parchment'
                  ? 'bg-[#F4E8C1] text-stone-900 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Pergaminho
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('white')}
              className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                canvasTheme === 'white'
                  ? 'bg-white text-slate-900 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Branco
            </button>
          </div>

          {/* Controles de Zoom */}
          <div className="flex items-center gap-1 bg-zinc-800 rounded-md px-1.5 py-0.5 border border-zinc-700">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(50, z - 15))}
              className="p-1 text-zinc-300 hover:text-sax-400 transition"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-zinc-200 font-mono min-w-[38px] text-center">{zoom}%</span>
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

      {/* Área Central da Partitura (Scrollable) */}
      <div className="flex-1 overflow-auto p-2 sm:p-5 bg-studio-950/90 flex flex-col items-center">
        {engineMode === 'musescore-svg' ? (
          <div
            className="w-full flex flex-col items-center gap-5 transition-all"
            style={{
              maxWidth: `${Math.round((920 * zoom) / 100)}px`,
            }}
          >
            {svgLoading && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-zinc-900/95 border border-sax-500/40 text-sax-400 text-xs font-medium shadow-lg sticky top-2 z-20">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Atualizando diagramação nativa do MuseScore 3...</span>
              </div>
            )}

            {svgError && (
              <div className="w-full max-w-xl p-4 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex flex-col gap-2">
                <div className="font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sax-400" />
                  <span>Aviso do Motor SVG: {svgError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onEngineModeChange('osmd')}
                  className="self-start px-3 py-1.5 rounded-lg bg-sax-500 text-studio-950 font-semibold hover:bg-sax-400 transition"
                >
                  Alternar para Visualizador OSMD no Navegador
                </button>
              </div>
            )}

            {svgPages.map((svgHtml, idx) => (
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

                {/* Conteúdo Vetorial SVG do MuseScore */}
                <div
                  className="w-full p-2 sm:p-4 select-none"
                  dangerouslySetInnerHTML={{ __html: svgHtml }}
                />

                {/* Marca d'Água Obrigatória Fixa e Imutável na Tela */}
                <div className="px-4 py-2 border-t border-black/10 bg-black/[0.04] flex items-center justify-between text-[11px] select-none pointer-events-none">
                  <span className="font-semibold tracking-wide">
                    © Rubsax Partituras — Todos os direitos reservados
                  </span>
                  <span className="opacity-75 font-mono text-[10px]">
                    rubsax.com.br • Marca d&apos;água protegida
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`w-full rounded-xl shadow-2xl border overflow-hidden relative transition-colors ${bgClass}`}
            style={{
              maxWidth: `${Math.round((980 * zoom) / 100)}px`,
            }}
          >
            {osmdLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm font-medium opacity-80">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Renderizando partitura responsiva (OpenSheetMusicDisplay)...</span>
              </div>
            )}
            {osmdError && (
              <div className="p-4 text-xs text-red-700 bg-red-100 border-b border-red-200">
                {osmdError}
              </div>
            )}
            <div ref={osmdContainerRef} className="w-full p-3 sm:p-6 overflow-x-auto" />

            {/* Marca d'Água Obrigatória Fixa e Imutável na Tela */}
            <div className="px-4 py-2.5 border-t border-black/15 bg-black/[0.05] flex items-center justify-between text-xs select-none pointer-events-none">
              <span className="font-bold tracking-wide flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />© Rubsax Partituras — Direitos Autorais Protegidos
              </span>
              <span className="opacity-75 font-mono text-[11px]">rubsax.com.br</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
