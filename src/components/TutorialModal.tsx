'use client';

import React, { useEffect } from 'react';
import { getYouTubeEmbedUrl, getYouTubeWatchUrl } from '@/lib/youtube';
import { ExternalLink, PlayCircle, X } from 'lucide-react';

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  videoId: string | null;
}

export default function TutorialModal({
  open,
  onClose,
  title,
  videoId,
}: TutorialModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !videoId) return null;

  const embedUrl = getYouTubeEmbedUrl(videoId);
  const watchUrl = getYouTubeWatchUrl(videoId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl bg-studio-900 border-2 border-sax-500/50 shadow-2xl overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-sax-600/20 via-sax-500/10 to-transparent border-b border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-sax-500/20 border border-sax-500/40 text-sax-400 shrink-0">
              <PlayCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-sax-300">
                Vídeo Tutorial
              </span>
              <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                {title || 'Como usar o Rubsax Transposer'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition shrink-0"
            aria-label="Fechar tutorial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Player responsivo 16:9 */}
        <div className="p-4 sm:p-5 bg-black">
          <div className="aspect-video w-full rounded-xl overflow-hidden border border-zinc-800 bg-studio-950">
            <iframe
              src={embedUrl}
              title={title || 'Tutorial Rubsax Transposer'}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-5 py-3.5 bg-studio-950 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-200 text-xs font-extrabold transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Ver no YouTube</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold border border-zinc-700 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
