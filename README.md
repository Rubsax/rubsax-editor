# RUBSAX TRANSPOSER v1.0

**Transposição precisa com fidelidade original • Formatos aceitos: `.mscz`, `.mscx`, `.xml`, `.mxl`**

Aplicação Full-Stack construída em **Next.js 14 (App Router + TypeScript + Tailwind CSS)** integrada ao motor nativo do **MuseScore 3 (`mscore3` / `MuseScore3.exe`)** para transposição matemática com acidentes simples estritos, edição de cabeçalhos e cifras existentes, caixas de texto flutuantes, extração de partes internas (pautas ocultas), modos de visualização (Vertical, Horizontal e Grade Completa) e exportação em PDF 100% fiel.

---

## Principais Recursos (v1.0)

1. **Motor Vetorial Fiel MuseScore 3 (SVG & PDF)**:
   - Renderização vetorial nativa via MuseScore 3 CLI no Desktop e Mobile (com colcheias conectadas, quiálteras, ligaduras e fontes originais).
   - Suporte a `.mscz`, `.mscx`, `.xml` e `.mxl` (MusicXML padrão Finale/Sibelius).
   - Diretórios de runtime e cache de fontes pré-configurados no `Dockerfile` e no backend (`/tmp/runtime-rubsax`, `/tmp/fontconfig-cache`, `/tmp/musescore-home`, `QT_QPA_PLATFORM=offscreen`).

2. **Fluxo "Upload First"**:
   - Tela inicial dedicada e limpa para envio de partitura (arrastar e soltar ou selecionar arquivo).
   - Dupla ação rápida após o upload: **Baixar PDF Direto** ou **Pré-visualizar Partitura** na tela.

3. **Transposição Matemática e Enarmonia**:
   - Referência central no topo: `Tom Base (Piano): [Tom Maior] ([Relativa menor]) | Na pauta ([Instrumento]): [Tom Maior]`.
   - Escolha direta das 12 tonalidades (*Mais Próximo*, *Acima*, *Abaixo*), salto rápido `-1 Semitom` / `+1 Semitom` e `-1 Oitava` / `+1 Oitava`.
   - Regra estrita de acidentes simples (`#`, `b`, `♮`) ativa no motor XML sem gerar dobrado sustenido (`x`) ou dobrado bemol (`bb`).

4. **Edição de Cifras Existentes e Caixa de Texto Flutuante**:
   - Clique em qualquer cifra existente em **Cifras na tela** para editar sua escrita (ex: `Dm` → `Dm7(9)` ou `A7/C#`) mantendo a posição rítmica original.
   - Botão **+ Adicionar Texto Flutuante** permitindo criar anotações personalizadas, escolher tamanho de fonte e arrastar livremente sobre a página da partitura.

5. **Pautas Internas (Extração de Partes) e 3 Modos de Exibição**:
   - Clique em qualquer pauta interna (ex: *Pauta 1: Instrumento Solo*, *Pauta 2: Piano*, *Pauta 3: Piano*, *Pauta 4: Bateria*) para visualizá-la individualmente (atualizando automaticamente o nome do instrumento no cabeçalho superior direito) e exportar seu PDF.
   - Alternância no topo do visualizador entre **Vertical (Retrato)**, **Horizontal (Paisagem)** e **Grade Completa (Pautas Empilhadas)**.
