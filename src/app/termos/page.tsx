import type { Metadata } from 'next';
import SmartBackButton from '@/components/SmartBackButton';
import { getAppSettings } from '@/lib/settings';
import { FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Termos de Uso | Rubsax Transposer',
  description:
    'Termos de Uso, Direitos Autorais (Lei nº 9.610/98), Modo Gratuito, planos Avulso 24h e Mensal, política de reembolso (Art. 49 CDC) e suporte técnico do Rubsax Transposer.',
  alternates: {
    canonical: 'https://app.rubsax.com.br/termos',
  },
};

export default async function TermosPage() {
  const settings = await getAppSettings();
  const { cooldown_days: cooldownDays, unlock_hours: unlockHours } = settings.free_pass;
  const cooldownLabel = `${cooldownDays} ${cooldownDays === 1 ? 'dia' : 'dias'}`;

  return (
    <div className="min-h-screen bg-studio-950 text-zinc-200 flex flex-col">
      <header className="bg-studio-900 border-b border-zinc-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <SmartBackButton
            currentPath="/termos"
            label="Voltar"
            fallbackHref="/?view=editor"
          />
          <span className="text-[11px] font-semibold text-zinc-400">
            Rubsax Partituras • Termos
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <div className="space-y-3 border-b border-zinc-800 pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sax-500/15 border border-sax-500/30 text-sax-300 text-xs font-bold">
            <FileText className="w-4 h-4" />
            <span>Condições de Uso do Serviço</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Termos de Uso — Rubsax Transposer
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Última atualização: Novembro de 2026 • Serviço operado por Rubsax Partituras
          </p>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-bold text-sax-400">
            1. Objeto e Funcionamento da Ferramenta
          </h2>
          <p>
            O <strong className="text-white">Rubsax Transposer</strong> é uma aplicação online
            voltada para transposição de tonalidades, seleção de pautas internas, ajuste de
            cifras/cabeçalhos, quebra de compassos e escala vetorial de partituras nos formatos
            MuseScore (<code className="text-sax-300">.mscz</code>,{' '}
            <code className="text-sax-300">.mscx</code>) e MusicXML (
            <code className="text-sax-300">.xml</code>, <code className="text-sax-300">.mxl</code>).
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-bold text-sax-400">
            2. Responsabilidade sobre Direitos Autorais (Lei nº 9.610/98)
          </h2>
          <p>
            Ao enviar qualquer arquivo para processamento no Rubsax Transposer, o usuário declara
            possuir a titularidade dos direitos autorais, licença de uso ou autorização legal para
            editar e transpor a obra musical enviada, assumindo integral responsabilidade civil e
            criminal pelo material submetido nos termos da Lei nº 9.610/98. Os arquivos enviados são
            processados temporariamente sob demanda e removidos logo após a geração da visualização
            ou PDF.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-bold text-sax-400">
            3. Visitante, Modo Gratuito (Passe), Plano Avulso e Assinatura Mensal
          </h2>
          <ul className="list-disc pl-6 space-y-2.5 text-zinc-400">
            <li>
              <strong className="text-zinc-200">Modo Visitante (Sem Login):</strong> permite testar
              o upload e os controles de Transposição &amp; Oitava com visualização parcial da
              primeira página. A visualização completa, demais gavetas de edição, Modo Tela Cheia e
              exportação em PDF ficam bloqueados até ativar o Passe Gratuito ou contratar um plano.
            </li>
            <li>
              <strong className="text-emerald-300">
                Modo Gratuito (Passe Gratuito Logado — 1 música a cada {cooldownLabel}):
              </strong>{' '}
              usuários autenticados com e-mail devidamente confirmado (incluindo login Google) podem
              ativar manualmente 1 (um) Passe Gratuito a cada{' '}
              <strong className="text-white">{cooldownLabel}</strong>, com janela de edição e
              download em PDF válida por{' '}
              <strong className="text-white">{unlockHours} horas</strong> exclusivamente para o
              arquivo selecionado (identificado pelo hash SHA-256). O Modo Gratuito é restrito às
              seguintes condições técnicas:
              <ul className="list-disc pl-5 mt-1.5 space-y-1 text-zinc-400">
                <li>
                  Apenas a gaveta <strong className="text-zinc-200">Transposição &amp; Oitava</strong>{' '}
                  fica habilitada (as gavetas de Cifras, Cabeçalho/Textos, Escala, Quebra Manual e
                  Pautas Internas são exclusivas dos planos pagos);
                </li>
                <li>
                  A <strong className="text-zinc-200">quebra de compasso é automática</strong> na
                  visualização e no PDF gerado;
                </li>
                <li>
                  Os PDFs gerados pelo Passe Gratuito incluem um{' '}
                  <strong className="text-zinc-200">rodapé discreto informativo</strong> na margem
                  inferior das páginas;
                </li>
                <li>
                  O <strong className="text-zinc-200">Modo Tela Cheia é exclusivo</strong> para
                  usuários com Plano Avulso ativo ou Assinatura Mensal;
                </li>
                <li>
                  É estritamente proibido tentar burlar a periodicidade por meio de múltiplas contas,
                  aliases de e-mail (<code className="text-sax-300">+tag</code> ou variação de
                  pontos) ou serviços de e-mail temporário/descartável, estando sujeito a bloqueio
                  automático da concessão gratuita.
                </li>
              </ul>
            </li>
            <li>
              <strong className="text-zinc-200">Desbloqueio Avulso (24 horas):</strong> libera todas
              as gavetas de edição, visualização completa, Modo Tela Cheia, quebra manual,
              reedições e exportação ilimitada em PDF sem rodapé promocional exclusivamente para o
              arquivo identificado por seu Hash SHA-256 original durante 24 horas a contar da
              confirmação do pagamento, vinculado à conta do usuário.
            </li>
            <li>
              <strong className="text-zinc-200">Assinatura Mensal Completa:</strong> libera acesso
              irrestrito a todas as ferramentas, Modo Tela Cheia e todas as partituras enviadas pelo
              usuário durante o ciclo mensal vigente,{' '}
              <strong className="text-white">sem fidelidade ou multa de cancelamento</strong>. A
              assinatura pode ser cancelada em 1 clique diretamente na área Minha Conta, mantendo o
              acesso até o último dia já pago. Conta individual sujeita a limite silencioso de uso
              justo para coibir compartilhamento abusivo de credenciais.
            </li>
          </ul>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-bold text-sax-400">
            4. Direito de Arrependimento e Reembolso (Art. 49 do CDC)
          </h2>
          <p>
            Garantimos o direito de arrependimento e reembolso integral dentro do prazo de{' '}
            <strong className="text-white">7 (sete) dias</strong> a contar da contratação, nos
            termos do Art. 49 do Código de Defesa do Consumidor. Ao confirmar um estorno, o acesso
            correspondente é encerrado automaticamente.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-bold text-sax-400">5. Escopo do Suporte Técnico</h2>
          <p>
            Os planos oferecem suporte <strong className="text-white">estritamente técnico</strong>{' '}
            relacionado ao funcionamento da plataforma, login, pagamentos e geração automática de
            arquivos. Não está incluído serviço manual ou personalizado de transcrição, revisão ou
            edição musical sob medida por parte da equipe Rubsax. Para atendimento técnico, entre em
            contato pelo e-mail{' '}
            <a
              href="mailto:contato@rubsax.com.br"
              className="text-sax-400 hover:underline font-semibold"
            >
              contato@rubsax.com.br
            </a>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
