---
name: FluxID
description: Rastreabilidade que protege. Inteligência que conecta.
colors:
  azul-profundo: "#1249B8"
  azul-royal: "#1766D9"
  azul-ciano: "#23AFE5"
  ciano-acessivel: "#08709C"
  verde-vivo: "#37D20A"
  verde-escuro: "#159B19"
  verde-acessivel: "#0F7A14"
  navy: "#163B72"
  grafite: "#26384A"
  branco: "#FFFFFF"
  cinza-gelo: "#F3F7FA"
  texto-secundario: "#5B6F84"
  borda-controle: "#6B7F94"
  borda-suave: "#D7E2EE"
  erro: "#B42318"
  erro-fundo: "#FDECEA"
  alerta-texto: "#7A4B00"
  alerta-fundo: "#FFF4D6"
  alerta-faixa: "#F5B301"
  sucesso-fundo: "#E7F6EA"
  info-fundo: "#E8F1FC"
typography:
  display:
    fontFamily: "'Montserrat Variable', Montserrat, Arial, sans-serif"
    fontSize: "64px"
    fontWeight: 800
    lineHeight: 1
  h1:
    fontFamily: "'Montserrat Variable', Montserrat, Arial, sans-serif"
    fontSize: "48px"
    fontWeight: 700
    lineHeight: 1
  h2:
    fontFamily: "'Montserrat Variable', Montserrat, Arial, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1
  h3:
    fontFamily: "'Montserrat Variable', Montserrat, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "'Montserrat Variable', Montserrat, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Montserrat Variable', Montserrat, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  controle: "8px"
  card: "12px"
  pilula: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
  "16": "64px"
  alvo: "44px"
components:
  button-primary:
    backgroundColor: "{colors.azul-profundo}"
    textColor: "{colors.branco}"
    typography: "{typography.body}"
    rounded: "{rounded.controle}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.navy}"
  button-secondary:
    backgroundColor: "{colors.branco}"
    textColor: "{colors.azul-profundo}"
    rounded: "{rounded.controle}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.info-fundo}"
  button-danger:
    backgroundColor: "{colors.erro}"
    textColor: "{colors.branco}"
    rounded: "{rounded.controle}"
    padding: "0 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.branco}"
    textColor: "{colors.grafite}"
    rounded: "{rounded.controle}"
    padding: "0 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.branco}"
    textColor: "{colors.grafite}"
    rounded: "{rounded.card}"
    padding: "24px"
  badge-ativo:
    backgroundColor: "{colors.sucesso-fundo}"
    textColor: "{colors.verde-acessivel}"
    typography: "{typography.label}"
    rounded: "{rounded.controle}"
    padding: "4px 8px"
  badge-erro:
    backgroundColor: "{colors.erro-fundo}"
    textColor: "{colors.erro}"
    typography: "{typography.label}"
    rounded: "{rounded.controle}"
    padding: "4px 8px"
---

# Design System: FluxID

## Overview

**Creative North Star: "A Sala de Controle Limpa"** *(confirmado pela pessoa responsável em 15/10/2026)*

O FluxID parece um instrumento de precisão: azul profundo e navy dão peso e confiança, o cinza-gelo deixa o fundo quieto e o verde aparece só para dizer que algo está certo ou conectado. É uma interface de operação, em que clareza de estado e rastro de quem fez o quê valem mais que enfeite. A mesma linguagem serve ao gestor no desktop e ao motorista no celular, com alvos de 44 px, texto de 16 px e contraste alto.

A identidade vem da Spec 003 e o padrão de telas vem da Spec 005. Ambos são base: o trabalho novo preserva e refina, não recomeça. O conteúdo ocupa toda a largura, o estado de conexão fica na barra superior e os dados de exemplo sempre levam o selo "Exemplo".

A landing pública (Spec 011) leva a mesma sala de controle para fora do app: conta a história de um cilindro (o C-262) em seções que alternam navy e fundo claro, e cada afirmação diz se já está na plataforma ou em validação no piloto. Ali a marca fala mais alto (abertura em tela cheia, mascote, ilustrações próprias), mas a regra continua a do app: estado escrito, evidência à vista e nada inventado.

**Key Characteristics:**
- Azul institucional como voz principal; verde como sinal de estado, nunca como decoração.
- Fundo cinza-gelo com cartões brancos de borda suave e sombra mínima.
- Montserrat variável em um único eixo de família, hierarquia feita por peso e tamanho.
- Foco visível de 3 px sempre; movimento curto e desligado com `prefers-reduced-motion`.
- Estados de carregamento, vazio, erro, offline e sincronização são parte do desenho.
- Honestidade visível: "Exemplo", "Estimativa", "Em validação no piloto" e "Agendado" são selos em texto, nunca nota de rodapé.

## Colors

Paleta de azuis com verde de estado e neutros azulados; tudo vem de tokens, sem cor literal no código.

### Primary
- **Azul Profundo** (`azul-profundo`): botão primário, links de ação e ícones de marca.
- **Azul Royal** (`azul-royal`): anel de foco, borda do cartão indicador e destaques interativos.
- **Azul Ciano** (`azul-ciano`): fim dos gradientes de marca e realces gráficos; para texto use o Ciano Acessível (`ciano-acessivel`).
- **Navy** (`navy`): hover do primário, sombras e o ponto mais escuro dos gradientes.

### Secondary
- **Verde Vivo** (`verde-vivo`) e **Verde Escuro** (`verde-escuro`): sinal de conexão segura e gradientes de marca.
- **Verde Acessível** (`verde-acessivel`): texto de sucesso e status ativo sobre fundo claro.

### Neutral
- **Grafite** (`grafite`): texto principal.
- **Texto Secundário** (`texto-secundario`): apoio, legendas e placeholder.
- **Cinza Gelo** (`cinza-gelo`): fundo da aplicação; **Branco** (`branco`): cartões e campos.
- **Borda de Controle** (`borda-controle`): borda de campos, com 3:1 de contraste; **Borda Suave** (`borda-suave`): cartões e divisores.

### Status
- **Erro** (`erro`, fundo `erro-fundo`), **Alerta** (`alerta-texto`, `alerta-fundo`, faixa `alerta-faixa`), **Sucesso** (`sucesso-fundo`) e **Info** (`info-fundo`).

### Named Rules
**The Estado Rule.** Verde, vermelho e âmbar significam estado e só isso. Nunca decoram. Exceção única, decidida pela pessoa responsável (Spec 011, T076, confirmada em 15/10/2026): na landing, a ação principal sobre fundo navy ("Assistir ao pitch" na abertura e "Quero conversar sobre um piloto" na chamada final) é um botão verde-vivo com texto navy. Fora desse botão, a landing segue a regra: textos, números e bordas não usam verde nem vermelho como enfeite.
**The Só Token Rule.** Nenhuma cor literal no código; o teste `escalas-no-codigo` reprova.
**The Texto Sempre Rule.** Status nunca se comunica só por cor: sempre texto, com ícone de apoio.
**The Superfície Sólida Rule.** Texto fica sempre sobre superfície sólida (navy, cinza-gelo ou branco). Na landing, as seções escuras são navy sólido; o gradiente de marca (navy para azul profundo) fica só na abertura, sem brilhos coloridos (direção premium editorial, 15/10/2026).

## Typography

**Display, corpo e rótulo:** Montserrat Variable (pesos 300 a 800, subconjunto latino, hospedada no app), com fallback Arial.

**Character:** geométrica, firme e legível; os pesos fazem a hierarquia e a família é uma só.

### Hierarchy
- **Display** (800, 64 px, 1): só em telas de marca; na landing, o título da abertura no computador e os números do prejuízo.
- **H1** (700, 48 px, 1): um único `h1` por tela, o da logo na coluna lateral a partir de 768 px. Na landing o `h1` é o título da abertura (a logo é só link de volta ao topo).
- **H2** (700, 36 px, 1) e **H3** (600, 24 px, 1,25): títulos de seção e de cartão.
- **Corpo** (400, 16 px, 1,5): texto e campos; mínimo no celular.
- **Legenda** (600, 12 px, 1,5): rótulos, selos e apoio.

### Named Rules
**The Título Equilibrado Rule.** Títulos usam `text-wrap: balance`, sem palavra órfã.
**The Medida Rule.** Parágrafos corridos param em 68 caracteres por linha (`landing-medida`); números de dados usam algarismos tabulares.
**The Slide Editorial Rule.** Na landing, cada slide fala alto: título em H1 (48 px) no computador, com `tracking-tight`, e a pergunta final em Display (64 px); o parágrafo de abertura do slide é um lead em H3 de peso normal (24 px). Ícone sem caixa em volta, e sequência com filete azul royal de 2 px no topo e número grande, em vez de cartões.

## Layout

Conteúdo em largura total, sem container máximo. Escala de espaçamento de 4 a 64 px (`1`, `2`, `4`, `6`, `8`, `12`, `16`) e alvo de toque de 44 px. Breakpoints: tablet 768 px e desktop 1024 px. Abaixo de 768 px o menu é um ícone de sanduíche fixado à direita, que abre uma gaveta pela direita; a partir de 768 px o menu fica fixo na coluna lateral com a logo no topo. A barra superior leva o estado de conexão, discreto quando conectado; o aviso de offline é uma faixa abaixo da barra. Telas públicas usam a moldura de marca, sem barra nem menu. O visual funciona de 360 px a desktop amplo.

**Landing.** A ordem das seções e o tema de cada uma (escuro ou claro) vêm de uma fonte só (`SECOES` em `landing-content.ts`), na sequência do pitch. A abertura ocupa a tela inteira, é sempre escura e leva o cabeçalho por cima, sem fundo. As seções seguem com respiro de 48 px (64 px no computador) e laterais de 16, 24 e 32 px; as claras alternam cinza-gelo e branco. No computador, passada a abertura, o próprio cabeçalho vira uma barra compacta fixa (navy sólido, logo menor) e o menu sublinha a seção em leitura; as âncoras têm margem de rolagem para o título não ficar sob a barra. No celular o cabeçalho rola com a página e o atalho é o sanduíche sem caixa, à direita, branco sobre seções escuras e navy sobre as claras (o tom é medido sob o ícone). Abaixo de 768 px, listas de itens com ícone ou foto viram linhas (o ícone ao lado do texto), para a página não empilhar telas inteiras; do tablet em diante, colunas.

**Apresentação em slides (15/10/2026, ajustada em 16/10/2026).** A landing é uma apresentação: cada seção é um ou mais slides de tela cheia (18 no total), com o conteúdo centrado na vertical; a seção que não cabe numa tela pode formar um slide alto, percorrido por dentro, ou usar slides adicionais no mesmo fundo, com o título só no primeiro. Em “O que já funciona”, as telas reais e as garantias de operação ficam no mesmo slide para preservar a relação entre evidência e benefício; o vídeo permanece no slide seguinte. Em “Planos e investimento”, modelo de cobrança, faixas e contato também formam um único slide, seguindo a ordem da decisão. No computador a página anda slide a slide: cada gesto da roda ou do trackpad, as setas, PageUp/PageDown e espaço levam ao slide anterior ou ao próximo (num slide mais alto que a tela, o passo anda por dentro dele antes de trocar), e um indicador navy no canto inferior direito mostra “n / 18” com o nome da seção e os botões de anterior e próximo. O encaixe é feito pela página, não por `scroll-snap` (que travava a roda). O respiro dos slides deixa espaço para a barra compacta em cima e para o indicador embaixo, e diminui em telas de até 880 px de altura. No celular cada slide ocupa a tela, mas a rolagem é a do navegador e o indicador não aparece.

**The Uma Fonte Rule.** Texto, links, ordem e tema das seções da landing saem de `landing-content.ts`; a apresentação não guarda conteúdo.

## Elevation & Depth

Quase plano: a profundidade vem da camada tonal (cinza-gelo sob cartões brancos com borda suave) e de duas sombras azuladas discretas.

### Shadow Vocabulary
- **Cartão** (`0 1px 2px rgba(22, 59, 114, 0.08), 0 1px 3px rgba(22, 59, 114, 0.06)`): cartões em repouso.
- **Diálogo** (`0 8px 24px rgba(22, 59, 114, 0.16)`): diálogos e gaveta.

### Named Rules
**The Sombra Quieta Rule.** Nada além das duas sombras; a profundidade extra vem de borda e tom, não de brilho. Na landing, a sombra de diálogo também separa do navy o que flutua sobre ele: o cartão do C-262, o palco de vídeo e a barra compacta.

## Shapes

Cantos arredondados moderados: 8 px em controles e selos, 12 px em cartões. Formas que são círculos ou pílulas por natureza (pontos de linha do tempo, LEDs, brilhos decorativos, trilhos de barra de dados e selos de situação) usam raio total (9999 px); não são controles nem cartões e não entram na escala acima. Bordas de 1 px; a borda tracejada marca estado desabilitado (inclusive o vídeo sem conexão) e, na landing, também o que é frágil por natureza: os elos da cadeia manual prancheta, planilha e memória. Gradientes só em elementos de marca: azul digital, conexão segura e profundidade. As ilustrações da landing (a rota do C-262, o anel de 12 aberturas da trava, a cadeia de custódia) são geometria própria nas cores dos tokens, decorativas e ocultas da leitura de tela; o conteúdo delas está sempre escrito ao lado.

## Components

### Buttons
- **Shape:** 8 px, altura mínima de 44 px, texto 16 px semibold.
- **Primary:** azul profundo com texto branco; hover em navy.
- **Secondary:** branco com borda e texto azul profundo; hover em info-fundo.
- **Danger:** erro com texto branco.
- **Estados:** foco de 3 px azul royal com deslocamento de 2 px; desabilitado com borda tracejada e opacidade 60%; carregando mantém o foco, ignora o clique e mostra indicador.
- **Sobre navy (landing):** a ação principal é verde-vivo com texto navy e vira branca no hover (a exceção da Estado Rule); a secundária é contorno branco, com hover em azul profundo; entrar no sistema é sempre secundário ou link. Sobre navy, o anel de foco é branco.

### Cards / Containers
- **Corner Style:** 12 px; **Padding:** 24 px; borda de 1 px.
- **Variantes:** informativo (borda suave), indicador (borda azul royal), alerta (âmbar).

### Inputs / Fields
- **Style:** fundo branco, borda de controle, 8 px, altura de 44 px.
- **Focus:** anel global de 3 px; **Error:** borda de erro; **Disabled:** borda tracejada.

### Status badge
Selo com ícone e texto: ativo, conectado, pendente, bloqueado e erro. Fundo suave e texto de alto contraste.

### Navigation
Menu fixo na coluna lateral a partir de 768 px; no celular, gaveta pela direita com logo e botão "X". Fecha por clique fora, fundo escurecido ou Escape.

### Selo Exemplo
Todo dado de demonstração leva o selo "Exemplo" e vem de fonte substituível.

### Barra compacta da landing
No computador, depois da abertura: navy sólido, logo de 112 px, cinco âncoras e "Entrar no sistema" em contorno. Desce do topo em 240 ms ao aparecer (só sem movimento reduzido). A âncora da seção em leitura ganha sublinhado verde de 2 px e `aria-current`; lendo uma seção fora do menu, nenhuma fica marcada.

### Cartão de rastreio do C-262
O fio da landing: cartão navy com sombra de diálogo, nome do cilindro, selo "Exemplo" e a lista de estados com marcador (feito em verde, atual em ciano pulsando três vezes, próximo vazado em ciano). Aparece na abertura (em trânsito) e no fim (de volta ao estoque, com a resposta completa).

### Selo de situação
Pílula em texto ao pé de cada frente e etapa: "Na plataforma" (sucesso) ou "Em validação no piloto" (alerta). O que ainda é protótipo nunca aparece como pronto.

### Palco de vídeo
Capa desenhada pelo projeto (sem imagem de terceiros) num quadro 16:9 navy; o botão inteiro é o alvo, com play verde de 64 px. O player do YouTube só carrega depois do clique, e "Fechar o vídeo" devolve a capa. Sem conexão o botão fica desativado e parece desativado: "Precisa de conexão", círculo tracejado a 60% e o ícone de sem sinal no lugar do play.

### Contato do piloto
O próximo passo de quem decide: "Quero conversar sobre um piloto" abre o e-mail da equipe com assunto pronto, e o endereço fica escrito ao lado. Verde sobre navy (chamada final), azul profundo sobre fundo claro (seção Piloto).

### Marcos do projeto
Cartões curtos com data em legenda azul e o fato em corpo semibold. O marco cumprido fica em cinza-gelo; o que ainda vai acontecer fica em branco com borda azul royal e o selo "Agendado".

### Faixa de logos institucionais
Fecha a seção da equipe sobre branco, depois de uma divisória: logos coloridas na altura de 40 px (56 px do tablet em diante), sem cartão, cada uma descrita pelo nome.

## Do's and Don'ts

### Do:
- **Do** usar só tokens do `tokens.ts` e deixar a identidade da Spec 003 intacta.
- **Do** garantir alvo de 44 px, contraste AA e foco visível de 3 px.
- **Do** tratar carregamento, vazio, erro, offline e sincronização em toda tela.
- **Do** respeitar `prefers-reduced-motion` e `forced-colors`.
- **Do** marcar "Exemplo" em qualquer dado de demonstração.
- **Do** dizer, em texto, se cada capacidade está "Na plataforma" ou "Em validação no piloto", e marcar "Agendado" o marco que ainda não aconteceu.
- **Do** guardar o movimento autoral da landing para dois momentos, um por pico da história: o caminhão que some na rota do C-262 e o pino que avança e encaixa na trava quando ela entra na tela. O resto é resposta curta a mudança de estado (texto da trava, blocos recolhíveis, gaveta), só com `transform` e `opacity`.

### Don't:
- **Don't** usar valor arbitrário do Tailwind, cor literal ou transição que atrase o anel de foco.
- **Don't** usar verde, vermelho ou âmbar como decoração ou como única pista de estado.
- **Don't** limitar o conteúdo com container máximo nem pôr o estado de conexão no corpo da página.
- **Don't** adicionar barra superior ou menu às telas públicas.
- **Don't** inventar clientes, números ou depoimentos.
- **Don't** dar como cumprido um marco antes da data, nem como pronta uma capacidade em protótipo.
- **Don't** usar animação em repetição infinita (WCAG 2.2.2): cada uma termina em até cerca de 5 s e só começa quando a cena entra na tela.
