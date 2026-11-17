'use client';

import React from 'react';
import { InstrumentDefinition, TonalityDefinition } from '@/lib/music/constants';
import { AlertTriangle, CheckCircle2, Piano, Music2 } from 'lucide-react';

interface BbEbChordModalProps {
  open: boolean;
  instrument: InstrumentDefinition;
  instrumentDisplayName: string;
  concertTonality: TonalityDefinition;
  writtenTonality: TonalityDefinition;
  sampleChords: string[];
  onConfirmConvertToInstrument: () => void;
  onKeepPianoConcertPitch: () => void;
}

export default function BbEbChordModal({
  open,
  instrument,
  instrumentDisplayName,
  concertTonality,
  writtenTonality,
  sampleChords,
  onConfirmConvertToInstrument,
  onKeepPianoConcertPitch,
}: BbEbChordModalProps) {
  if (!open) return null;

  const isBb = instrument.groupId === 'BB_TREBLE' || instrument.fifthsOffset === 2;
  const tuningShort = isBb ? 'Sib' : 'Mib';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg rounded-2xl bg-studio-900 border border-sax-500/40 shadow-2xl overflow-hidden text-zinc-100">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-sax-600/25 via-sax-500/15 to-transparent border-b border-zinc-800">
          <div className="p-2.5 rounded-xl bg-sax-500/20 border border-sax-500/40 text-sax-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sax-500/20 text-sax-300 border border-sax-500/30 mb-0.5">
              Instrumento Transpositor • {tuningShort}
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white">
              Sincronização de Cifras ({instrumentDisplayName})
            </h3>
          </div>
        </div>

        {/* Corpo com a Mensagem Oficial */}
        <div className="p-5 space-y-4 text-sm text-zinc-300 leading-relaxed">
          <p className="p-3.5 rounded-xl bg-zinc-800/90 border border-zinc-700 text-zinc-100 font-medium">
            &ldquo;As cifras atuais correspondem à afinação em Dó (Piano). Deseja converter as
            cifras visíveis para acompanhar a armadura de clave deste instrumento (Sib/Mib)?&rdquo;
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-studio-950/80 border border-zinc-800">
              <div className="flex items-center gap-1.5 text-zinc-400 font-semibold mb-1">
                <Piano className="w-4 h-4 text-sky-400" />
                <span>Opção 1: Manter em Dó (Piano)</span>
              </div>
              <p className="text-zinc-400">
                Tom Base:{' '}
                <strong className="text-sky-300">{concertTonality.majorName}</strong>. Ideal
                para quando um tecladista ou violonista lê as cifras acima da sua pauta.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-sax-500/10 border border-sax-500/30">
              <div className="flex items-center gap-1.5 text-sax-300 font-semibold mb-1">
                <Music2 className="w-4 h-4 text-sax-400" />
                <span>Opção 2: Converter p/ {tuningShort}</span>
              </div>
              <p className="text-zinc-300">
                Na Pauta:{' '}
                <strong className="text-sax-400">{writtenTonality.majorName}</strong>. Converte
                as cifras visíveis para acompanhar a armadura de clave da pauta.
              </p>
            </div>
          </div>

          {sampleChords.length > 0 && (
            <div className="text-xs text-zinc-400 flex items-center gap-2 flex-wrap">
              <span>Cifras detectadas na pauta:</span>
              {sampleChords.slice(0, 6).map((ch, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-sax-300 font-mono font-semibold"
                >
                  {ch}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="px-5 py-4 bg-studio-950 border-t border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onKeepPianoConcertPitch}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs sm:text-sm font-semibold transition border border-zinc-700"
          >
            Manter em Dó (Piano)
          </button>
          <button
            type="button"
            onClick={onConfirmConvertToInstrument}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sax-500 hover:bg-sax-400 text-studio-950 text-xs sm:text-sm font-bold shadow-lg shadow-sax-500/20 transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Converter p/ {tuningShort}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
