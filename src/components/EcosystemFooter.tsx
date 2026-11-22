'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SupportLinksSettings } from '@/lib/settings';
import {
  BookOpen,
  ShoppingCart,
  Info,
  ShieldCheck,
  MessageCircle,
  Mail,
  ExternalLink,
  X,
  FileText,
  HelpCircle,
} from 'lucide-react';

interface EcosystemFooterProps {
  supportLinks?: SupportLinksSettings;
}

const DEFAULT_LINKS: SupportLinksSettings = {
  whatsapp_url: 'https://wa.me/5513997452922',
  support_email: 'contato@rubsax.com.br',
  store_url: 'https://www.rubsax.com.br/',
  catalog_url: 'https://catalogo.rubsax.com.br/',
};

export default function EcosystemFooter({ supportLinks }: EcosystemFooterProps) {
  const [aboutModalOpen, setAboutModalOpen] = useState<boolean>(false);
  const links = supportLinks || DEFAULT_LINKS;

  useEffect(() => {
    if (!aboutModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAboutModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aboutModalOpen]);

  return (
    <>
      <footer className="bg-studio-900/95 border-t border-zinc-800 text-zinc-300 mt-auto">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Coluna 1: Marca */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sax-400 to-sax-600 p-1 flex items-center justify-center shadow-md shadow-sax-500/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/icon.png"
                    alt="Rubsax Partituras"
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                    Rubsax <span className="text-sax-400">Partituras</span>
                  </h3>
                  <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">
                    RUBSAX TRANSPOSER
                  </span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-sm">
                Encontre as melhores partituras e ferramentas de precisão para o seu instrumento na
                Rubsax Partituras. Variedade e qualidade para músicos de todos os níveis.
              </p>
            </div>

            {/* Coluna 2: Informações & Links */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                Informações &amp; Links
              </h4>
              <ul className="space-y-2 text-xs sm:text-sm">
                <li>
                  <button
                    type="button"
                    onClick={() => setAboutModalOpen(true)}
                    className="inline-flex items-center gap-2 text-zinc-300 hover:text-sax-300 text-left active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <Info className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                    <span>Sobre Nós (Nossa Missão)</span>
                  </button>
                </li>
                <li>
                  <Link
                    href="/ajuda"
                    className="inline-flex items-center gap-2 text-zinc-300 hover:text-sax-300 transition"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                    <span>Guia de Uso &amp; Ajuda (FAQ)</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacidade"
                    className="inline-flex items-center gap-2 text-zinc-300 hover:text-sax-300 transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                    <span>Política de Privacidade e Cookies</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/termos"
                    className="inline-flex items-center gap-2 text-zinc-300 hover:text-sax-300 transition"
                  >
                    <FileText className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                    <span>Termos de Uso</span>
                  </Link>
                </li>
                <li>
                  <a
                    href={links.catalog_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-zinc-300 hover:text-sax-300 transition"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                    <span>Catálogo Oficial</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                </li>
                <li>
                  <a
                    href={links.store_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-zinc-300 hover:text-sax-300 transition"
                  >
                    <ShoppingCart className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                    <span>Loja Oficial</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                </li>
              </ul>
            </div>

            {/* Coluna 3: Atendimento & Redes Sociais */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
                Atendimento &amp; Redes Sociais
              </h4>
              <ul className="space-y-2 text-xs sm:text-sm">
                <li>
                  <a
                    href={links.whatsapp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-zinc-300 hover:text-emerald-400 transition"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>WhatsApp / Suporte: (13) 99745-2922</span>
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:${links.support_email}`}
                    className="inline-flex items-center gap-2 text-zinc-300 hover:text-sax-300 transition"
                  >
                    <Mail className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                    <span>{links.support_email}</span>
                  </a>
                </li>
                <li className="pt-1 flex flex-wrap items-center gap-2">
                  <a
                    href="https://www.instagram.com/rubsax_partituras"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200 hover:text-sax-300 transition"
                  >
                    <span>Instagram: @rubsax_partituras</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </a>
                  <a
                    href="https://www.youtube.com/@Rubsax"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200 hover:text-red-400 transition"
                  >
                    <span>YouTube: youtube.com/@Rubsax</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-5 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span>
              © {new Date().getFullYear()} Rubsax Partituras. Todos os direitos reservados.
            </span>
            <span>Processamento Stateless &amp; Seguro • LGPD (Lei nº 13.709/2018)</span>
          </div>
        </div>
      </footer>

      {/* MODAL: SOBRE NÓS (NOSSA MISSÃO) */}
      {aboutModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
          onClick={() => setAboutModalOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-studio-900 border-2 border-sax-500/50 shadow-2xl overflow-hidden text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-sax-600/20 via-sax-500/10 to-transparent border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sax-500/20 border border-sax-500/40 text-sax-400">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sax-300">
                    Institucional
                  </span>
                  <h3 className="text-base sm:text-lg font-extrabold text-white">
                    Sobre Nós — Nossa Missão
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-3.5 text-xs sm:text-sm text-zinc-300 leading-relaxed max-h-[70vh] overflow-y-auto">
              <p>
                A <strong className="text-sax-400">Rubsax Partituras</strong> nasceu com a missão de
                democratizar o acesso a partituras digitais de alta fidelidade e ferramentas
                inteligentes de transposição e estudo, unindo precisão musical e tecnologia de ponta
                para músicos em todo o Brasil.
              </p>
              <p>
                Nosso ecossistema — composto pelo <strong className="text-white">Rubsax Transposer</strong>,
                pelo Catálogo Oficial e pela Loja Oficial — atende saxofonistas, instrumentistas de
                sopro (trompete, clarinete, flauta, trombone), cordas (violino, violoncelo),
                tecladistas, bandas e ministérios de música que precisam adaptar tonalidades, extrair
                pautas específicas, ajustar quebras de compasso e imprimir PDFs limpos em segundos.
              </p>
              <p>
                Valorizamos a fidelidade gráfica da escrita musical, o respeito aos acidentes e
                cifras de cada instrumento transpositor (Dó, Sib, Mib e Clave de Fá) e a agilidade
                para ensaios, cultos e apresentações ao vivo.
              </p>
            </div>

            <div className="px-5 py-3.5 bg-studio-950 border-t border-zinc-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <a
                  href={links.catalog_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition"
                >
                  Catálogo Oficial
                </a>
                <a
                  href={links.store_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-sax-500/20 hover:bg-sax-500/30 border border-sax-500/40 text-xs font-bold text-sax-300 transition"
                >
                  Loja Oficial
                </a>
              </div>
              <button
                type="button"
                onClick={() => setAboutModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-sax-500 hover:bg-sax-400 text-studio-950 text-xs font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
