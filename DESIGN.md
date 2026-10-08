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

**Creative North Star: "A Sala de Controle Limpa"** *(proposta a confirmar)*

O FluxID parece um instrumento de precisão: azul profundo e navy dão peso e confiança, o cinza-gelo deixa o fundo quieto e o verde aparece só para dizer que algo está certo ou conectado. É uma interface de operação, em que clareza de estado e rastro de quem fez o quê valem mais que enfeite. A mesma linguagem serve ao gestor no desktop e ao motorista no celular, com alvos de 44 px, texto de 16 px e contraste alto.

A identidade vem da Spec 003 e o padrão de telas vem da Spec 005. Ambos são base: o trabalho novo preserva e refina, não recomeça. O conteúdo ocupa toda a largura, o estado de conexão fica na barra superior e os dados de exemplo sempre levam o selo "Exemplo".

**Key Characteristics:**
- Azul institucional como voz principal; verde como sinal de estado, nunca como decoração.
- Fundo cinza-gelo com cartões brancos de borda suave e sombra mínima.
- Montserrat variável em um único eixo de família, hierarquia feita por peso e tamanho.
- Foco visível de 3 px sempre; movimento curto e desligado com `prefers-reduced-motion`.
- Estados de carregamento, vazio, erro, offline e sincronização são parte do desenho.

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
**The Estado Rule.** Verde, vermelho e âmbar significam estado e só isso. Nunca decoram.
**The Só Token Rule.** Nenhuma cor literal no código; o teste `escalas-no-codigo` reprova.
**The Texto Sempre Rule.** Status nunca se comunica só por cor: sempre texto, com ícone de apoio.

## Typography

**Display, corpo e rótulo:** Montserrat Variable (pesos 300 a 800, subconjunto latino, hospedada no app), com fallback Arial.

**Character:** geométrica, firme e legível; os pesos fazem a hierarquia e a família é uma só.

### Hierarchy
- **Display** (800, 64 px, 1): só em telas de marca.
- **H1** (700, 48 px, 1): um único `h1` por tela, o da logo na coluna lateral a partir de 768 px.
- **H2** (700, 36 px, 1) e **H3** (600, 24 px, 1,25): títulos de seção e de cartão.
- **Corpo** (400, 16 px, 1,5): texto e campos; mínimo no celular.
- **Legenda** (600, 12 px, 1,5): rótulos, selos e apoio.

### Named Rules
**The Título Equilibrado Rule.** Títulos usam `text-wrap: balance`, sem palavra órfã.

## Layout

Conteúdo em largura total, sem container máximo. Escala de espaçamento de 4 a 64 px (`1`, `2`, `4`, `6`, `8`, `12`, `16`) e alvo de toque de 44 px. Breakpoints: tablet 768 px e desktop 1024 px. Abaixo de 768 px o menu é um ícone de sanduíche fixado à direita, que abre uma gaveta pela direita; a partir de 768 px o menu fica fixo na coluna lateral com a logo no topo. A barra superior leva o estado de conexão, discreto quando conectado; o aviso de offline é uma faixa abaixo da barra. Telas públicas usam a moldura de marca, sem barra nem menu. O visual funciona de 360 px a desktop amplo.

## Elevation & Depth

Quase plano: a profundidade vem da camada tonal (cinza-gelo sob cartões brancos com borda suave) e de duas sombras azuladas discretas.

### Shadow Vocabulary
- **Cartão** (`0 1px 2px rgba(22, 59, 114, 0.08), 0 1px 3px rgba(22, 59, 114, 0.06)`): cartões em repouso.
- **Diálogo** (`0 8px 24px rgba(22, 59, 114, 0.16)`): diálogos e gaveta.

### Named Rules
**The Sombra Quieta Rule.** Nada além das duas sombras; a profundidade extra vem de borda e tom, não de brilho.

## Shapes

Cantos arredondados moderados: 8 px em controles e selos, 12 px em cartões. Bordas de 1 px; a borda tracejada marca estado desabilitado. Gradientes só em elementos de marca: azul digital, conexão segura e profundidade.

## Components

### Buttons
- **Shape:** 8 px, altura mínima de 44 px, texto 16 px semibold.
- **Primary:** azul profundo com texto branco; hover em navy.
- **Secondary:** branco com borda e texto azul profundo; hover em info-fundo.
- **Danger:** erro com texto branco.
- **Estados:** foco de 3 px azul royal com deslocamento de 2 px; desabilitado com borda tracejada e opacidade 60%; carregando mantém o foco, ignora o clique e mostra indicador.

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

## Do's and Don'ts

### Do:
- **Do** usar só tokens do `tokens.ts` e deixar a identidade da Spec 003 intacta.
- **Do** garantir alvo de 44 px, contraste AA e foco visível de 3 px.
- **Do** tratar carregamento, vazio, erro, offline e sincronização em toda tela.
- **Do** respeitar `prefers-reduced-motion` e `forced-colors`.
- **Do** marcar "Exemplo" em qualquer dado de demonstração.

### Don't:
- **Don't** usar valor arbitrário do Tailwind, cor literal ou transição que atrase o anel de foco.
- **Don't** usar verde, vermelho ou âmbar como decoração ou como única pista de estado.
- **Don't** limitar o conteúdo com container máximo nem pôr o estado de conexão no corpo da página.
- **Don't** adicionar barra superior ou menu às telas públicas.
- **Don't** inventar clientes, números ou depoimentos.
