import type { Metadata } from 'next';
import Link from 'next/link';
import EcosystemFooter from '@/components/EcosystemFooter';
import HelpAccordion, { HelpFaqItem } from '@/components/HelpAccordion';
import SmartBackButton from '@/components/SmartBackButton';
import { getAppSettings } from '@/lib/settings';
import { Check, HelpCircle, ShieldCheck, Sparkles, Crown, X } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Guia de Uso e Perguntas Frequentes (FAQ) | Rubsax Transposer',
  description:
    'Aprenda a usar o Rubsax Transposer passo a passo: formatos aceitos, transposição, oitavas, cifras para Piano vs Sib/Mib, pautas internas, Modo Gratuito e planos PRO.',
  alternates: {
    canonical: 'https://app.rubsax.com.br/ajuda',
  },
};

function formatBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function AjudaPage() {
  const settings = await getAppSettings();
  const { free_pass: freePass, pricing, support_links: supportLinks } = settings;

  const cooldownLabel = `${freePass.cooldown_days} ${
    freePass.cooldown_days === 1 ? 'dia' : 'dias'
  }`;

  const faqItems: HelpFaqItem[] = [
    {
      id: 'formats-upload',
      category: '1. Formatos & Envio',
      question: 'Quais arquivos são aceitos e como enviar uma partitura?',
      answer: [
        'O Rubsax Transposer aceita arquivos nativos do MuseScore (.mscz e .mscx) e arquivos MusicXML (.xml, .musicxml e .mxl) exportados de programas como MuseScore 3/4, Finale e Sibelius.',
        'Para enviar, marque a declaração de direitos autorais (Lei nº 9.610/98) na tela inicial e clique em "Selecionar Arquivo" — ou simplesmente arraste o arquivo para dentro da área tracejada.',
        'Suas edições e a partitura carregada ficam salvas localmente no navegador (IndexedDB). Se você recarregar a página (F5) ou abrir o login/planos, o sistema retoma exatamente de onde parou sem precisar reenviar o arquivo.',
      ],
    },
    {
      id: 'transpose-octaves-chords',
      category: '2. Tom, Oitava & Cifras',
      question:
        'Como funcionam a transposição de tom, o limite de oitavas e as cifras (Piano vs. Sib/Mib)?',
      answer: [
        'Na 1ª gaveta ("Transposição & Oitava"), você pode escolher diretamente o novo Tom Base (Piano Dó) na lista e definir a direção ("Mais Próximo", "Acima" ou "Abaixo"), ou ajustar com precisão usando os botões "-1 / +1 Semitom".',
        'O deslocamento de oitava ("-1 / +1 Oitava") é limitado entre -2 e +2 oitavas para manter a leitura musical limpa e evitar excesso de linhas suplementares.',
        'Ao abrir uma partitura em instrumento transpositor (ex.: Sax Alto Mib ou Trompete/Clarineta Sib), as cifras carregam por padrão no modo "Tom do Piano (Dó)" para facilitar o acompanhamento com teclado/violão. Caso queira ver as cifras convertidas para a leitura escrita do instrumento transpositor, clique em "Converter p/ Sib" ou "Converter p/ Mib" dentro da gaveta "Cifras, Letras & Pauta" (recurso PRO).',
      ],
    },
    {
      id: 'staves-headers-layout',
      category: '3. Pautas, Cabeçalho & Sistema',
      question:
        'Como isolar pautas internas, atualizar o cabeçalho, ajustar escala e quebra de compasso?',
      answer: [
        'Na gaveta "Pautas Internas (.MSCZ)", você pode marcar várias pautas para visualizar juntas, clicar em "Só esta" para isolar apenas uma parte (ex.: Base, Flauta ou Sax Alto) ou ativar a "Grade Completa". O filtro inteligente oculta automaticamente pautas duplicadas de variação de oitava melódica (como Sax Tenor no grupo Sib ou Violino/Flauta Doce no grupo Dó), mantendo preservados todos os instrumentos de base e contracanto (como Oboé, Piano e Baixo).',
        'Na gaveta "Cabeçalho & Textos Flutuantes", você edita Título, Subtítulo, Instrumento e o campo "Tom para Piano" — que se atualiza automaticamente ao mudar o tom tanto na pauta principal quanto em todas as pautas internas. Você também pode adicionar Textos Flutuantes arrastáveis diretamente sobre a folha.',
        'Em "Tamanho da Pauta (Escala)" você ajusta o espaçamento (<Spatium>) de 70% a 130% sem encolher os títulos, e em "Quebra de Compasso (Sistema)" escolhe modo Automático, quebra a cada X compassos ou por compasso específico. Todas as gavetas possuem o botão "Resetar" no canto superior direito para restaurar apenas aquela seção ao original.',
      ],
    },
    {
      id: 'plans-comparison',
      category: '4. Planos & Modo Gratuito',
      question: `Qual a diferença entre Visitante, Modo Gratuito (1 música / ${cooldownLabel}), Avulso e Mensal?`,
      answer: [
        'Visitante (sem login): permite enviar arquivos e testar apenas a 1ª gaveta (Transposição & Oitava) visualizando a metade superior da Página 1 (prévia). Exportação de PDF e Tela Cheia ficam bloqueadas.',
        `Modo Gratuito (Passe por Conta logada com e-mail confirmado ou Google): libera ${freePass.unlock_hours}h de acesso completo a todas as páginas e download de PDF para 1 música a cada ${cooldownLabel}. No Modo Gratuito ficam liberadas apenas as ferramentas de Transposição & Oitava, a quebra de compasso é automática, o PDF traz um rodapé discreto do app e o Modo Tela Cheia é exclusivo para pagantes.`,
        `Plano Avulso (${formatBRL(pricing.single_price_brl)}): pagamento único via Pix que libera TODAS as páginas, todas as gavetas (Cifras, Cabeçalho, Escala, Quebra Manual e Pautas Internas), Modo Tela Cheia e PDF limpo sem marca d'água para aquela música durante ${pricing.single_duration_hours} horas.`,
        `Assinatura Mensal (${formatBRL(pricing.monthly_price_brl)}/mês): desbloqueia tudo acima de forma ilimitada para qualquer partitura enviada, no Cartão ou Pix (30 dias), sem fidelidade.`,
      ],
    },
    {
      id: 'guarantee-cancel-privacy',
      category: '5. Garantia, Cancelamento & Privacidade',
      question:
        'Como funciona a garantia de 7 dias, o cancelamento em 1 clique e a privacidade dos arquivos?',
      answer: [
        'Garantia CDC (Art. 49): você tem 7 dias corridos após a contratação de qualquer plano para solicitar arrependimento e reembolso integral pelo suporte oficial.',
        'Cancelamento em 1 clique: assinantes no cartão podem cancelar a renovação automática sem burocracia diretamente em "Minha Conta" (/conta), mantendo o acesso ativo até o fim do período já pago.',
        'Privacidade e Stateless: o Rubsax Transposer não cria acervo público com suas partituras. Os arquivos enviados vão para diretório temporário apenas durante a renderização SVG/PDF no MuseScore 3 e são removidos logo após o processamento. Você pode excluir sua conta e dados pessoais a qualquer momento na área Minha Conta (LGPD).',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-studio-950 text-zinc-200 flex flex-col">
      <header className="sticky top-0 z-30 bg-studio-900/95 backdrop-blur-md border-b border-zinc-800 px-4 sm:px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SmartBackButton
              currentPath="/ajuda"
              label="Voltar"
              fallbackHref="/?view=editor"
            />
            <span className="text-zinc-700">|</span>
            <Link
              href="/?view=home"
              title="Ir para a Tela Inicial"
              className="inline-flex items-center gap-2 hover:opacity-90 transition"
            >
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-sax-400 to-sax-600 p-0.5 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icon.png"
                  alt="Rubsax Logo"
                  className="w-full h-full object-contain rounded"
                />
              </span>
              <span className="text-xs font-extrabold tracking-tight text-white hidden sm:inline">
                RUBSAX <span className="text-sax-400">TRANSPOSER</span>
              </span>
            </Link>
          </div>
          <Link
            href="/?view=editor"
            className="px-3 py-1.5 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
          >
            Abrir Editor
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <div className="space-y-3 border-b border-zinc-800 pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sax-500/15 border border-sax-500/30 text-sax-300 text-xs font-bold">
            <HelpCircle className="w-4 h-4" />
            <span>Central de Ajuda &amp; Guia Rápido</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Guia de Uso &amp; Perguntas Frequentes (FAQ)
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Tire suas dúvidas sobre formatos de partitura, transposição, cifras, pautas internas,
            Modo Gratuito e planos PRO em poucos segundos.
          </p>
        </div>

        {/* Tabela Comparativa Dinâmica: Visitante vs Modo Gratuito vs Avulso vs Mensal */}
        <section className="space-y-3">
          <h2 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
            <Crown className="w-4 h-4 text-sax-400" />
            <span>Comparativo Rápido dos Modos de Acesso</span>
          </h2>
          <div className="rounded-2xl bg-studio-900 border border-zinc-800 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-studio-950 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3 font-bold">Recurso</th>
                  <th className="px-3 py-3 font-bold">Visitante</th>
                  <th className="px-3 py-3 font-bold text-emerald-300">
                    Modo Gratuito
                    <span className="block text-[10px] font-normal text-zinc-400">
                      1 música / {cooldownLabel} ({freePass.unlock_hours}h)
                    </span>
                  </th>
                  <th className="px-3 py-3 font-bold text-sky-300">
                    Avulso ({pricing.single_duration_hours}h)
                    <span className="block text-[10px] font-normal text-zinc-400">
                      {formatBRL(pricing.single_price_brl)}
                    </span>
                  </th>
                  <th className="px-3 py-3 font-bold text-sax-400">
                    Mensal PRO
                    <span className="block text-[10px] font-normal text-zinc-400">
                      {formatBRL(pricing.monthly_price_brl)}/mês
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                <tr>
                  <td className="px-4 py-2.5 font-semibold">Transposição de Tom &amp; Oitava (±2)</td>
                  <td className="px-3 py-2.5"><Check className="w-4 h-4 text-emerald-400" /></td>
                  <td className="px-3 py-2.5"><Check className="w-4 h-4 text-emerald-400" /></td>
                  <td className="px-3 py-2.5"><Check className="w-4 h-4 text-emerald-400" /></td>
                  <td className="px-3 py-2.5"><Check className="w-4 h-4 text-emerald-400" /></td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-semibold">Todas as páginas + Exportar PDF</td>
                  <td className="px-3 py-2.5 text-zinc-500">Só 50% Pág. 1</td>
                  <td className="px-3 py-2.5 text-emerald-300 font-semibold">Com rodapé discreto</td>
                  <td className="px-3 py-2.5 text-sky-300 font-semibold">PDF limpo (1 música)</td>
                  <td className="px-3 py-2.5 text-sax-300 font-semibold">PDF limpo ilimitado</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-semibold">Cifras Sib/Mib, Cabeçalho, Escala &amp; Pautas</td>
                  <td className="px-3 py-2.5"><X className="w-4 h-4 text-zinc-600" /></td>
                  <td className="px-3 py-2.5"><X className="w-4 h-4 text-zinc-600" /></td>
                  <td className="px-3 py-2.5"><Check className="w-4 h-4 text-emerald-400" /></td>
                  <td className="px-3 py-2.5"><Check className="w-4 h-4 text-emerald-400" /></td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-semibold">Quebra de Compasso Manual</td>
                  <td className="px-3 py-2.5 text-zinc-500">—</td>
                  <td className="px-3 py-2.5 text-zinc-400">Automática</td>
                  <td className="px-3 py-2.5"><Check className="w-4 h-4 text-emerald-400" /></td>
                  <td className="px-3 py-2.5"><Check className="w-4 h-4 text-emerald-400" /></td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-semibold">Modo Tela Cheia</td>
                  <td className="px-3 py-2.5"><X className="w-4 h-4 text-zinc-600" /></td>
                  <td className="px-3 py-2.5 text-amber-300 font-semibold">Exclusivo PRO</td>
                  <td className="px-3 py-2.5"><Check className="w-4 h-4 text-emerald-400" /></td>
                  <td className="px-3 py-2.5"><Check className="w-4 h-4 text-emerald-400" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
            <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Modo Gratuito requer login com Google ou e-mail confirmado.
            </span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-sax-400" />
              Garantia de 7 dias (CDC) e cancelamento em 1 clique.
            </span>
          </div>
        </section>

        {/* Tópicos Expansíveis (Accordion) */}
        <section className="space-y-3">
          <h2 className="text-sm sm:text-base font-extrabold text-white">
            Perguntas Frequentes por Tópico
          </h2>
          <HelpAccordion items={faqItems} />
        </section>
      </main>

      <EcosystemFooter supportLinks={supportLinks} />
    </div>
  );
}
