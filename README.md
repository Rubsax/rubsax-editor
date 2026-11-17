# Rubsax Editor & Transposer — Etapa 1 (Core Musical & Exportação PDF Fiel)

Monolito Modular construído em **Next.js 14 (App Router + TypeScript + Tailwind CSS)** para leitura, transposição matemática com acidentes simples estritos, adaptação entre claves/instrumentos e exportação em PDF 100% fiel ao layout do **MuseScore 3**.

---

## Como Iniciar Localmente

1. Dê dois cliques em `run_rubsax_editor.bat` (ou execute `npm run dev` no terminal).
2. Acesse `http://localhost:3000` no navegador.

---

## Funcionalidades Implementadas na Etapa 1

### 1. Arquitetura e Regras de Upload
- **Interface Dark Studio + Dourado Saxofone** (`#0F172A`, `#27272A`, `#F59E0B`), responsiva para Mobile (Vertical com abas deslizantes no rodapé e Horizontal estilo DAW) e Desktop.
- **Filtro Estrito de Formatos**:
  - **Permitidos**: `.mscz`, `.mscx` (MuseScore 3 e 4) e `.xml` / `.musicxml` (MusicXML).
  - **Bloqueados**: `.mus`, `.musx` (Finale), `.sib` (Sibelius), `.mid` / `.midi`, exibindo o alerta padronizado:
    > *"Formato não suportado. Envie apenas arquivos do MuseScore (.mscz, .mscx) ou MusicXML (.xml)."*
- Descompactação, leitura e manipulação completa do `.mscx` interno via `jszip` e `@xmldom/xmldom` sem perder a diagramação original.

### 2. Os 4 Grupos de Instrumentos e Afinações Suportadas (13 Instrumentos)
1. **Afinados em Dó (Clave de Sol)**: Violino, Flauta Doce, Flauta Transversal, Oboé, Teclado.
2. **Clave de Fá (Afinados em Dó)**: Trombone, Bombardino, Violoncelo (converte automaticamente a clave da pauta principal para Clave de Fá e ajusta a oitava para a tessitura média grave do instrumento).
3. **Afinados em Si Bemol (Bb - Clave de Sol)**: Clarinete, Trompete, Sax Tenor, Sax Soprano (`+2 semitons` / `+2 quintas` na escrita).
4. **Afinados em Mi Bemol (Eb - Clave de Sol)**: Sax Alto, Sax Barítono (`-3 / +9 semitons` / `+3 quintas` na escrita).

### 3. Motor de Transposição Matemática e Enarmonia
- **Visor Central de Tonalidade**: Exibe sempre o **Tom Base (Piano / Dó - Concert Pitch)** como referência central e, ao lado, o **Tom Escrito na Pauta** do instrumento selecionado.
- **Modos de Transposição**:
  - Escolha direta para qualquer uma das 12 tonalidades maiores/menores relativas (com direção *Mais Próximo*, *Acima* ou *Abaixo*).
  - Botões rápidos de `-1 Semitom` e `+1 Semitom`.
  - Botões de Oitava `-1 Oitava` (`-12 semitons`) e `+1 Oitava` (`+12 semitons`).
- **Regra Estrita de Acidentes Simples**: Proibição total de dobrado sustenido (`x`) ou dobrado bemol (`bb`). Conversão matemática de `<tpc>` e `<tpc2>` restrita a acidentes simples (`#` ou `b`).
- **Fidelidade à Armadura de Clave**: Armaduras de sustenido grafam acidentes ocorrentes em `#` ou `♮`; armaduras de bemol grafam acidentes ocorrentes em `b` ou `♮`.
- **Pautas Ocultas (Acompanhamento)**: Renderiza na tela e no PDF apenas a pauta principal visível, mas transpõe simultaneamente as pautas ocultas harmônicas (Piano e Baixo), ignorando Percussão/Bateria.

### 4. Regras de Cifras (`<Harmony>`), Letras (`<Lyrics>`) e Textos de Cabeçalho
- **Edição Musical Bloqueada**: Notas, barras de compasso, cifras e sílabas da letra são protegidas contra edição manual.
- **Toggles Visuais**: Botões para Mostrar/Ocultar Cifras, Mostrar/Ocultar Letras e Editar/Ocultar/Remover textos de cabeçalho (Título, Subtítulo, Compositor e Letrista) mantendo fonte e tamanho originais travados.
- **Regra de Mute de Cifras**: Garante `<play>0</play>` em todas as cifras (`<Harmony>`) da pauta principal visível e mantém desmutadas as cifras das pautas ocultas de acompanhamento.
- **Caixa de Aviso para Instrumentos em Sib (Bb) e Mib (Eb)**: Modal interativo permitindo manter as cifras visíveis no tom do Piano (Dó) ou transpô-las (`<root>` e `<base>`) para o campo harmônico da pauta (`+2 semitons` para Sib, `-3/+9 semitons` para Mib).
- **Marca d'Água Obrigatória**: Rodapé `"Rubsax Partituras"` blindado e imutável na tela e no PDF exportado.

### 5. Visualização na Tela e Exportação de PDF 100% Fiel
- **Visualização Dupla na Tela**:
  - **Modo Fiel MuseScore (SVG)**: Renderiza as páginas vetoriais geradas pelo MuseScore CLI (`POST /api/render-svg`) com opção de fundo **Pergaminho Clássico (`#F4E8C1`)** ou **Branco (`#FFFFFF`)**.
  - **Modo Responsivo (OSMD)**: Renderiza via `opensheetmusicdisplay` reajustando os compassos à largura da tela.
- **Exportação em PDF Fiel (`POST /api/export-pdf`)**: Executa o binário local do MuseScore 3 em modo headless (`MUSESCORE_BIN_PATH`).
