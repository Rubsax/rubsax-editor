'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface HelpFaqItem {
  id: string;
  category: string;
  question: string;
  answer: string[];
}

export default function HelpAccordion({ items }: { items: HelpFaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id || null);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className={`rounded-2xl border transition-colors overflow-hidden ${
              isOpen
                ? 'bg-studio-900 border-sax-500/50 shadow-lg'
                : 'bg-studio-900/70 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              className="w-full px-4 sm:px-5 py-4 text-left flex items-center justify-between gap-3 active:scale-[0.99] active:brightness-95 transition-all duration-75 touch-manipulation"
            >
              <div className="space-y-1 min-w-0">
                <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-sax-500/15 text-sax-300 border border-sax-500/30">
                  {item.category}
                </span>
                <h2 className="text-sm sm:text-base font-extrabold text-white leading-snug">
                  {item.question}
                </h2>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-sax-400 shrink-0 transition-transform duration-150 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isOpen && (
              <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-zinc-800/80 space-y-2.5 text-xs sm:text-sm text-zinc-300 leading-relaxed animate-fadeIn">
                {item.answer.map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
