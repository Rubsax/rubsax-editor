import type { Metadata } from 'next';
import Link from 'next/link';
import EcosystemFooter from '@/components/EcosystemFooter';
import HelpAccordion, { HelpFaqItem } from '@/components/HelpAccordion';
import SmartBackButton from '@/components/SmartBackButton';
import { getAppSettings } from '@/lib/settings';
import {
  CreditCard,
  Eye,
  HelpCircle,
  Layers,
  LayoutGrid,
  ShieldCheck,
  Sliders,
  SplitSquareVertical,
  Type,
  ExternalLink,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Guia de Uso & Perguntas Frequentes | Rubsax Transposer',
  description:
    'Guia completo da versão v1.4: menu superior, transposição pelo menor caminho, cifras para qualquer instrumento transpositor, edição dupla com Aplicar, quebras de compasso/página e pautas duplas.',
  alternates: {
    canonical: 'https://app.rubsax.com.br/ajuda',
  },
};

export default async function AjudaPage() {
  const settings = await getAppSettings();
  const { free_pass: freePass, support_links: supportLinks } = settings;

  const cooldownDays = freePass.cooldown_days || 7;
  const cooldownLabel = `${cooldownDays} ${cooldownDays === 1 ? 'dia' : 'dias'}`;
  const freeHours = freePass.unlock_hours || 24;

  const faqItems: HelpFaqItem[] = [
    {
      id: 'formats-recent',
      category: '1. Formatos & Projetos Recentes',
      question: 'Quais arquivos são aceitos e como funciona a lista de Projetos Recentes?',
      answer: [
        'O Rubsax Transposer aceita arquivos nativos do MuseScore (.mscz e .mscx) e arquivos MusicXML (.xml, .musicxml e .mxl) exportados do MuseScore 3/4, Finale ou Sibelius.',
        'Ao abrir o site em uma nova aba, a tela de upload inicia limpa para economizar memória no celular. Logo abaixo, a seção "Projetos Recentes (neste dispositivo)" guarda até 5 arquivos salvos no navegador (IndexedDB) com botões "Abrir" e "Excluir" para você retomar sob demanda.',
        'Se você recarregar a aba (F5) durante uma edição ativa ou fizer login pelo Google no meio do trabalho, sua partitura aberta é restaurada automaticamente sem perder suas edições.',
      ],
    },
    {
      id: 'transpose-octave-multi',
      category: '2. Gaveta 1 — Tom & Oitava',
      question:
        'Como funciona o seletor "Mudar tonalidade" e por que a Oitava pede 1 instrumento por vez?',
      answer: [
        'No seletor "Mudar tonalidade", escolha o novo tom desejado e o motor calcula automaticamente a transposição pelo menor caminho (menor distância em semitons). Você também pode ajustar de 1 em 1 semitom usando "-1 Semitom" e "+1 Semitom".',
        'O deslocamento de oitava (-2 a +2 oitavas) afeta exclusivamente a parte ativa e só é aplicado quando há apenas 1 instrumento visível na tela (um instrumento de Pauta Dupla, como Piano Clave de Sol + Fá, conta como 1 único instrumento). Em Grade Completa ou com 2+ instrumentos marcados, o botão exibe o aviso "Só é possível alterar a oitava com um instrumento por vez.".',
        'Quando há múltiplos instrumentos ou Grade Completa na tela, o Tom de Referência no topo sempre permanece no Tom Original (Piano / Dó) para evitar ambiguidades entre afinações.',
      ],
    },
    {
      id: 'chords-universal',
      category: '3. Gaveta 2 — Cifras & Transpositores',
      question:
        'Quais instrumentos transpositores são reconhecidos e como editar cifras com as duas caixas?',
      answer: [
        'A detecção agora é universal: o motor lê diretamente os parâmetros reais (<transpose>, transposeChromatic e transposeDiatonic) do arquivo .mscz/.mscx/.xml/.mxl para reconhecer Sib, Mib, Fá, Lá, Ré, Sol e qualquer outra afinação.',
        'Quando há instrumento transpositor isolado na tela, você pode alternar entre "Tom Original (Piano)" e "Tom Escrito (<Afinação>)". Se houver mistura de instrumentos de afinações diferentes na Grade, a troca global é bloqueada com aviso e a referência permanece no Tom Original (Piano).',
        'Ao clicar em qualquer cifra da lista (recurso PRO), abrem-se as duas caixas simultaneamente: em cima "Editar todas iguais" (altera todas as ocorrências da cifra) e embaixo "Editar por compasso" (escolhe o compasso exato). Nenhuma edição altera a partitura até você clicar em "Aplicar".',
      ],
    },
    {
      id: 'headers-pending',
      category: '4. Gaveta 3 — Cabeçalho & Confirmação antes do PDF',
      question: 'Por que os campos de cabeçalho agora têm botão "Aplicar"?',
      answer: [
        'Na versão v1.4, digitar nos campos de Título, Subtítulo, Instrumento ou Tom para Piano não dispara renderizações pesadas a cada tecla. Enquanto houver texto não aplicado, o campo exibe a marcação "Não aplicado". Basta clicar em "Aplicar" (ou pressionar Enter) para enviar ao MuseScore.',
        'Se você clicar em "Exportar PDF" com alterações digitadas e ainda não aplicadas (em Textos ou Cifras), o Rubsax exibe uma janela listando exatamente onde há alteração pendente, permitindo clicar em "Aplicar tudo e Exportar PDF" ou "Voltar para revisar".',
      ],
    },
    {
      id: 'system-breaks-staves',
      category: '5. Sistema & Pautas Duplas',
      question:
        'O que mudou nas Quebras de Compasso/Página e no agrupamento de Pautas Duplas (Piano)?',
      answer: [
        'Na gaveta Sistema, "Quebra de Compasso" e a nova "Quebra de Página" estão organizadas em subgavetas retráteis (accordion) e agora são liberadas também para Visitante e Modo Gratuito (iniciando em modo Automático, enquanto o Tamanho da Pauta/Escala continua exclusivo PRO).',
        'Na gaveta Pautas Internas (PRO), descontinuamos o filtro que ocultava a 2ª pauta semelhante, garantindo 100% das partes orquestrais disponíveis. Além disso, pautas entrelaçadas de um mesmo instrumento — como Piano (Clave de Sol + Clave de Fá) — agora aparecem agrupadas como uma única opção ("Piano (Pauta Dupla)") e nunca são separadas.',
      ],
    },
    {
      id: 'free-pass-plans-support',
      category: '6. Modo Gratuito, Pautas Ocultas & Suporte',
      question: `Como funciona o limite do Modo Gratuito (${cooldownLabel}) e o aviso de múltiplos instrumentos?`,
      answer: [
        `Com uma conta gratuita conectada, você tem 1 música grátis a cada ${cooldownLabel} com ${freeHours}h para editar e baixar o PDF completo (com rodapé discreto do modo gratuito). Nos modos Visitante e Gratuito, é exibida apenas a 1ª parte (ou o Piano Pauta Dupla completo) e, se o arquivo tiver mais instrumentos, um aviso discreto informa o total de partes disponíveis nos planos PRO.`,
        `Após usar o passe gratuito, um contador regressivo mostra no painel (/conta) e no topo do editor "Sua partitura volta a ficar grátis em X dias" — mudando automaticamente para horas e minutos nas últimas 24 horas.`,
        `Confira todos os valores, comparativo detalhado e contratação na página Nossos Planos (/planos). Todos os pagamentos são processados via Mercado Pago com garantia legal de 7 dias.`,
      ],
    },
  ];

  const drawerGuides = [
    {
      number: 'Gaveta 1',
      title: 'Transposição & Oitava',
      icon: <Sliders className="w-4 h-4 text-sax-400" />,
      badge: 'Todos os planos',
      badgeTone: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      summary:
        'Use "Mudar tonalidade" para ir direto ao novo tom pela menor distância sem precisar configurar direção, ou ajuste passo a passo em -1 / +1 Semitom. O botão -1 / +1 Oitava (±2) funciona quando apenas 1 instrumento está ativo (Piano Pauta Dupla conta como 1) e altera somente aquela parte.',
    },
    {
      number: 'Gaveta 2',
      title: 'Cifras, Letras & Pauta',
      icon: <Eye className="w-4 h-4 text-sax-400" />,
      badge: 'Recurso PRO',
      badgeTone: 'bg-sax-500/15 text-sax-300 border-sax-500/35',
      summary:
        'Oculte ou exiba a pauta, cifras ou letras/textos internos. Quando houver instrumento transpositor isolado (Sib, Mib, Fá, Lá, Ré, Sol etc.), alterne as cifras entre "Tom Original (Piano)" e "Tom Escrito". Clique em qualquer cifra para editar simultaneamente todas iguais ou por compasso específico e confirme com "Aplicar".',
    },
    {
      number: 'Gaveta 3',
      title: 'Cabeçalho & Textos Flutuantes',
      icon: <Type className="w-4 h-4 text-sax-400" />,
      badge: 'Recurso PRO',
      badgeTone: 'bg-sax-500/15 text-sax-300 border-sax-500/35',
      summary:
        'Crie textos flutuantes arrastáveis sobre a folha ou edite Título, Subtítulo, Instrumento e Tom para Piano. Campos modificados ficam sinalizados como "Não aplicado" até você clicar em "Aplicar" ao lado do campo — evitando lentidão enquanto digita. Caso esqueça, o botão Exportar PDF avisa e permite aplicar tudo de uma vez.',
    },
    {
      number: 'Gaveta 4',
      title: 'Sistema (Quebras & Escala)',
      icon: <SplitSquareVertical className="w-4 h-4 text-sky-400" />,
      badge: 'Quebras liberadas • Escala PRO',
      badgeTone: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
      summary:
        'Expanda "Quebra de Compasso" (automático, a cada X compassos ou grade por compasso) e "Quebra de Página" (selecione ou clique no compasso para forçar nova página), ambas liberadas inclusive no Visitante e Modo Gratuito. Acima delas, "Tamanho da Pauta (Escala)" redimensiona apenas os pentagramas nos planos PRO.',
    },
    {
      number: 'Gaveta 5',
      title: 'Pautas Internas & Pautas Duplas',
      icon: <Layers className="w-4 h-4 text-sax-400" />,
      badge: 'Recurso PRO',
      badgeTone: 'bg-sax-500/15 text-sax-300 border-sax-500/35',
      summary:
        'Todas as partes do arranjo ficam listadas para combinar na tela ou isolar com "Só esta" ou empilhar na "Grade Completa". Instrumentos de pauta dupla como Piano (Clave de Sol + Clave de Fá) já aparecem agrupados em uma única parte para manter mão direita e esquerda sempre juntas.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-studio-950 text-zinc-100">
      {/* Cabeçalho */}
      <header className="border-b border-zinc-800 bg-studio-900/95 backdrop-blur-md px-4 sm:px-6 py-4 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SmartBackButton
              currentPath="/ajuda"
              label="Voltar ao Editor"
              fallbackHref="/?view=editor"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs sm:text-sm font-bold border border-zinc-700 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
            />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sax-500/15 border border-sax-500/40 flex items-center justify-center">
                <HelpCircle className="w-4 h-4 text-sax-400" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-extrabold text-white">
                  Guia de Uso &amp; Perguntas Frequentes
                </h1>
                <p className="text-[11px] text-zinc-400">
                  Rubsax Transposer v1.4 — Manual rápido do estúdio e FAQ
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/planos"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700"
            >
              <CreditCard className="w-3.5 h-3.5 text-sax-400" />
              <span>Nossos Planos</span>
            </Link>
            <Link
              href="/conta"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sax-500/15 hover:bg-sax-500/25 text-sax-300 text-xs font-extrabold border border-sax-500/40"
            >
              <span>Minha Conta</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        {/* Banner Hero */}
        <section className="rounded-3xl bg-gradient-to-br from-studio-900 via-studio-900 to-sax-500/10 border border-zinc-800 p-6 sm:p-8 shadow-2xl space-y-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sax-500/15 border border-sax-500/35 text-sax-300 text-[10px] font-bold uppercase tracking-wider">
            Documentação Oficial v1.4
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Domine o Rubsax Transposer em poucos minutos
          </h2>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-3xl">
            Consulte o funcionamento do menu superior, de cada uma das 5 gavetas de edição e as
            respostas para as dúvidas mais comuns sobre transposição, cifras, pautas duplas e
            exportação em PDF fiel ao MuseScore 3.
          </p>
        </section>

        {/* Guia do Menu Superior */}
        <section className="rounded-3xl bg-studio-900/90 border border-zinc-800 p-5 sm:p-7 space-y-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-sax-400" />
            <h2 className="text-base sm:text-lg font-extrabold text-white">
              Guia do Menu Superior
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-zinc-300">
            <div className="p-3.5 rounded-2xl bg-studio-950/80 border border-zinc-800 space-y-1">
              <p className="font-bold text-white">Logo &amp; Navegação Rápida</p>
              <p className="text-zinc-400 leading-relaxed">
                Clique na marca <strong>Rubsax Transposer</strong> para ir ao início sem perder sua
                partitura em edição. Ao lado ficam os atalhos para <strong>Tutorial</strong>,{' '}
                <strong>Planos</strong>, <strong>Ajuda / FAQ</strong>, <strong>Catálogo</strong> e{' '}
                <strong>Loja Oficial</strong>.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-studio-950/80 border border-zinc-800 space-y-1">
              <p className="font-bold text-white">Visor Central de Tonalidade</p>
              <p className="text-zinc-400 leading-relaxed">
                Mostra em tempo real o <strong>Tom Base (Piano)</strong> e o tom da pauta ativa. Com
                vários instrumentos ou Grade Completa na tela, o visor mantém o{' '}
                <strong>Tom Original (Piano / Dó)</strong> como referência fixa.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-studio-950/80 border border-zinc-800 space-y-1">
              <p className="font-bold text-white">Enviar Arquivo &amp; Fechar Partitura</p>
              <p className="text-zinc-400 leading-relaxed">
                Envie novos arquivos <code className="text-sax-300">.mscz</code>,{' '}
                <code className="text-sax-300">.mscx</code>,{' '}
                <code className="text-sax-300">.xml</code> ou{' '}
                <code className="text-sax-300">.mxl</code> a qualquer momento ou feche a partitura
                atual na barra lateral para acessar os Projetos Recentes.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-studio-950/80 border border-zinc-800 space-y-1">
              <p className="font-bold text-white">Exportar PDF &amp; Minha Conta</p>
              <p className="text-zinc-400 leading-relaxed">
                Gera o PDF final via MuseScore 3 e alerta automaticamente se existir alguma edição
                digitada em Textos ou Cifras sem clicar em <strong>Aplicar</strong>. Em{' '}
                <strong>Minha Conta</strong> você gerencia seu acesso e plano PRO.
              </p>
            </div>
          </div>
        </section>

        {/* 1 Guia Objetivo por Gaveta */}
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-extrabold text-white">
            Guia Objetivo das 5 Gavetas do Editor
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {drawerGuides.map((g) => (
              <article
                key={g.number}
                className="rounded-2xl bg-studio-900/90 border border-zinc-800 p-4 sm:p-5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {g.icon}
                    <h3 className="text-sm font-extrabold text-white">
                      {g.number}: {g.title}
                    </h3>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${g.badgeTone}`}
                  >
                    {g.badge}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">{g.summary}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Atalho dedicado para a página /planos */}
        <section className="rounded-3xl bg-gradient-to-r from-studio-900 to-sax-500/10 border border-sax-500/35 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-wider text-sax-400">
              Valores, Modo Gratuito &amp; Mensal PRO
            </p>
            <h2 className="text-base sm:text-lg font-extrabold text-white">
              Quer comparar todos os planos e benefícios?
            </h2>
            <p className="text-xs text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-sax-400 shrink-0" />
              <span>
                Veja a tabela comparativa completa entre Visitante, Modo Gratuito, Avulso e Mensal
                PRO.
              </span>
            </p>
          </div>
          <Link
            href="/planos"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs font-extrabold shadow-lg shrink-0"
          >
            <CreditCard className="w-4 h-4" />
            <span>Ver Nossos Planos</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </section>

        {/* Tópicos Expansíveis (Accordion) */}
        <section className="space-y-3">
          <h2 className="text-sm sm:text-base font-extrabold text-white">
            Perguntas Frequentes por Tópico (FAQ)
          </h2>
          <HelpAccordion items={faqItems} />
        </section>
      </main>

      <EcosystemFooter supportLinks={supportLinks} />
    </div>
  );
}
