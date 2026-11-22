import type { Metadata } from 'next';
import SmartBackButton from '@/components/SmartBackButton';
import { ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Política de Privacidade e Cookies | Rubsax Transposer',
  description:
    'Política de Privacidade, Cookies e tratamento de dados pessoais em conformidade com a LGPD (Lei nº 13.709/2018) no Rubsax Transposer.',
  alternates: {
    canonical: 'https://app.rubsax.com.br/privacidade',
  },
};

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-studio-950 text-zinc-200 flex flex-col">
      <header className="bg-studio-900 border-b border-zinc-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <SmartBackButton
            currentPath="/privacidade"
            label="Voltar"
            fallbackHref="/?view=editor"
          />
          <span className="text-[11px] font-semibold text-zinc-400">
            Rubsax Partituras • LGPD
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <div className="space-y-3 border-b border-zinc-800 pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sax-500/15 border border-sax-500/30 text-sax-300 text-xs font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>Transparência e Privacidade (LGPD — Lei nº 13.709/2018)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Política de Privacidade e Cookies
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Última atualização: Novembro de 2026 • Aplicável ao domínio{' '}
            <strong className="text-zinc-200">app.rubsax.com.br</strong>
          </p>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-bold text-sax-400">
            1. Quais Dados Pessoais Coletamos e Por Quê
          </h2>
          <p>
            Você pode testar o envio, transposição e ajuste de partituras sem criar conta. Quando
            opta por entrar na plataforma (via Login com Google ou E-mail/Senha) ou adquirir um
            plano, coletamos apenas os dados estritamente necessários:
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-zinc-400">
            <li>
              <strong className="text-zinc-200">Identificação da Conta:</strong> nome completo,
              endereço de e-mail e URL de foto de perfil fornecida pelo Google OAuth ou no cadastro.
            </li>
            <li>
              <strong className="text-zinc-200">Registros de Acesso, Planos e Anti-Abuso:</strong>{' '}
              identificador de assinatura/pagamento, hash criptográfico SHA-256 dos arquivos avulsos
              ou gratuitos desbloqueados (para reconhecer seu desbloqueio mesmo trocando de
              dispositivo), registros de consentimento legal, contagem técnica de uso e{' '}
              <strong className="text-white">
                hash anônimo irreversível de IP (<code className="text-sax-300">ip_hash = SHA-256(IP + salt do servidor)</code>)
              </strong>{' '}
              utilizado estritamente para prevenção de fraude e criação abusiva de múltiplas contas
              no Modo Gratuito, sem jamais armazenar o endereço IP em texto puro no banco de dados.
            </li>
          </ul>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-bold text-sax-400">
            2. Arquivos Musicais Temporários e Zero Retenção de Acervo
          </h2>
          <p>
            Os arquivos <code className="text-sax-300">.mscz</code>,{' '}
            <code className="text-sax-300">.mscx</code>,{' '}
            <code className="text-sax-300">.xml</code> e{' '}
            <code className="text-sax-300">.mxl</code> enviados ao servidor são gravados apenas em
            diretório temporário (<code className="text-sax-300">/tmp</code>) durante os segundos
            necessários para o motor MuseScore 3 renderizar as páginas SVG ou o PDF final, sendo{' '}
            <strong className="text-white">excluídos imediatamente após a resposta</strong> (com
            varredura automática complementar de limpeza). O Rubsax Transposer atua estritamente
            como ferramenta técnica de edição sob demanda e nunca cria repositório público com seus
            arquivos.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-bold text-sax-400">
            3. Operadores Terceiros de Infraestrutura
          </h2>
          <p>Para operar com segurança e estabilidade, utilizamos operadores confiáveis:</p>
          <ul className="list-disc pl-6 space-y-1.5 text-zinc-400">
            <li>
              <strong className="text-zinc-200">Supabase:</strong> autenticação de usuários (incluindo
              Google OAuth 2.0) e armazenamento seguro do banco de dados PostgreSQL com políticas de
              Row Level Security (RLS).
            </li>
            <li>
              <strong className="text-zinc-200">Mercado Pago:</strong> processamento seguro de
              pagamentos via Pix e Cartão de Crédito. Nosso servidor jamais armazena dados ou números
              de cartão de crédito.
            </li>
            <li>
              <strong className="text-zinc-200">Hetzner Cloud / Cloudflare:</strong> infraestrutura de
              hospedagem, criptografia TLS/HTTPS e proteção contra ataques.
            </li>
          </ul>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-bold text-sax-400">
            4. Uso de Cookies e Armazenamento Local no Navegador
          </h2>
          <p>
            Utilizamos cookies essenciais <code className="text-sax-300">HttpOnly</code> para manter
            sua sessão autenticada com segurança, além de mecanismos locais do próprio navegador:
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-zinc-400">
            <li>
              <strong className="text-zinc-200">IndexedDB:</strong> guarda temporariamente apenas no
              seu aparelho o arquivo de partitura aberto e suas alterações (tom, oitava, cifras,
              cabeçalho e escala) para que você não perca seu trabalho ao recarregar a página (F5),
              fazer login ou voltar de outra tela.
            </li>
            <li>
              <strong className="text-zinc-200">sessionStorage / localStorage:</strong> preserva a
              rota anterior para o botão &ldquo;Voltar&rdquo; e registra preferências de interface,
              como o aceite do Termo de Direitos Autorais.
            </li>
          </ul>
          <p>
            Esses dados locais permanecem exclusivamente no dispositivo do usuário. Não utilizamos
            cookies para venda de dados ou rastreamento publicitário invasivo.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-lg font-bold text-sax-400">
            5. Seus Direitos (LGPD) e Exclusão de Conta
          </h2>
          <p>
            Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar a
            confirmação, correção ou exclusão definitiva dos seus dados pessoais a qualquer momento
            diretamente na área <strong className="text-white">Minha Conta</strong> (botão{' '}
            <em>&ldquo;Excluir Minha Conta e Dados (LGPD)&rdquo;</em>) ou enviando um e-mail para{' '}
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
