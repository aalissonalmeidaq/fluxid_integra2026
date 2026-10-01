# Pesquisa: Telas e design system do FluxID

**Spec**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md) | **Data**: 30/09/2026

Todas as incertezas que a spec delegou ao plano estão resolvidas abaixo.

## D-001 Valor oficial do azul profundo

- **Decisão**: `#1249B8`.
- **Justificativa**: é o valor da paleta (prancha de cores) e o usado nas medições de contraste da spec (7,86:1 sobre branco). O `#1249BB` aparece só no início de um gradiente e no código atual; a diferença é de três unidades no canal azul.
- **Alternativas**: manter `#1249BB` (7,79:1, também atende) e ter dois azuis quase iguais, o que contraria a regra de um token por papel.

## D-002 Variantes acessíveis do ciano e do verde

- **Decisão**: ciano acessível `#08709C` (5,51:1 sobre branco, 5,12:1 sobre cinza-gelo) e verde acessível `#0F7A14` (5,51:1 e 5,11:1). O ciano e o verde vivo originais ficam restritos a decoração, gradientes, logotipo e elementos de grande dimensão. O verde escuro `#159B19` permanece para ícones e para o estado ativo dos ícones (3,66:1, acima de 3:1).
- **Justificativa**: escurecer o matiz mantém a identidade e atinge 4,5:1 nos dois fundos claros. Valores obtidos por busca em passos pequenos e conferidos pela fórmula da WCAG.
- **Alternativas**: usar o azul royal no lugar do ciano (perde a semântica de conectividade); `#0B7BA8` (4,42:1 sobre cinza-gelo, reprovado).

## D-003 Cores semânticas de erro, alerta e sucesso

- **Decisão**: erro `#B42318` (fundo suave `#FDECEA`); alerta com texto `#7A4B00` sobre `#FFF4D6` e faixa `#F5B301` com texto grafite (6,49:1); sucesso reaproveita o verde acessível `#0F7A14`. Todo estado vem com texto e ícone.
- **Justificativa**: a prancha mostra o vermelho e o âmbar sem nomeá-los. Os valores atendem 4,5:1 nos fundos em que são usados e não dependem só da cor (RF-003A, RA-005).
- **Alternativas**: vermelho mais saturado (`#E02424`, 4,4:1 sobre branco, reprovado).

## D-004 Hospedagem da fonte Montserrat

- **Decisão**: pacote `@fontsource-variable/montserrat` (OFL-1.1, permite hospedagem e redistribuição), importando só o subconjunto latino (cobre o português). O Vite copia o `woff2` para o pacote final; `font-display: swap`; fontes de reserva Arial e sans-serif do sistema.
- **Justificativa**: uma fonte variável cobre os pesos 300 a 800 em um arquivo; o pacote evita versionar binário à mão e fixa a versão. Atende RF-003, RNF-001 e RNF-002 sem requisição a terceiros.
- **Alternativas**: versionar `woff2` baixados à mão (sem rastreio de versão e de licença); seis arquivos estáticos (mais requisições e bytes).

## D-005 Ferramenta do catálogo

- **Decisão**: segundo ponto de entrada Vite, em `catalogo/`, com configuração própria e páginas React que leem `src/design-system/docs/`. Nenhuma dependência nova.
- **Justificativa**: o catálogo usa os mesmos componentes e tokens, é testável com o Playwright e o axe já instalados e fica fora do pacote de produção (decisão da clarificação). Um teste confirma que `src/` e `index.html` não importam `catalogo/`.
- **Alternativas**: Storybook (dezenas de dependências transitivas, mais superfície de auditoria, sem ganho para 15 componentes); páginas Markdown estáticas (não mostram os componentes reais nem permitem testar estados).

## D-006 Regressão visual

- **Decisão**: `toHaveScreenshot` do Playwright, Chromium, 360, 768 e 1920 px, `maxDiffPixelRatio: 0.001`, animações desativadas, fonte local aguardada antes da captura. Capturas de referência geradas e comparadas no Linux do CI; para atualizar, um comando que roda no contêiner oficial do Playwright.
- **Justificativa**: nenhuma dependência nova; a tolerância de 0,1% foi decidida na clarificação. Fixar o sistema operacional elimina diferenças de suavização de fonte.
- **Alternativas**: serviço externo de comparação visual (envia capturas a terceiros, contra a política da spec); comparar em Windows e Linux com duas linhas de base (dobra a manutenção).

## D-007 Escalas de espaçamento e tipografia verificáveis

- **Decisão**: `@theme` com `--spacing-*`, `--text-*`, `--font-weight-*`, `--color-*` e `--radius-*` reiniciados e redefinidos só com os valores da prancha. A escala é 4, 8, 16, 24, 32, 48 e 64 px (sem o 12 do `MASTER.md` atual). Um teste varre o código-fonte por valores arbitrários e hexadecimais fora do arquivo de tokens, e um teste de navegador confere os estilos computados.
- **Justificativa**: impedir a classe fora da escala na origem é mais barato que detectá-la depois; os dois testes cobrem o que o Tailwind não bloquear (RNF-006, CA-013).
- **Alternativas**: apenas regra de ESLint (não enxerga CSS gerado nem estilos computados).
- **Verificação inicial (T003, concluída em 01/10/2026)**: no Tailwind 4.3.3, `--color-*: initial`, `--spacing: initial`, `--spacing-*: initial`, `--text-*: initial`, `--font-weight-*: initial` e `--radius-*: initial` fazem com que `p-3`, `m-2`, `text-sm`, `bg-slate-900`, `font-bold` e `rounded-lg` não gerem CSS, enquanto as classes definidas no tema (`p-4`, `text-corpo`, `rounded-card`) continuam sendo geradas. Valores arbitrários (`text-[#123456]`) continuam possíveis e ficam a cargo do teste de varredura `escalas-no-codigo`. Prova em `tests/contract/tailwind-theme-poc.test.ts`.

## D-008 Ícones: construção, estados e variantes

- **Decisão**: 30 componentes SVG com `viewBox="0 0 24 24"`, `stroke-width` 2, `stroke-linecap` e `stroke-linejoin` redondos e área segura de 2 px. O componente `Icon` recebe `size` (16, 24, 32 ou 48), `state` (padrão, ativo, desabilitado ou erro) e `variant` (contorno, duotone, monocromática ou negativa), que apenas definem variáveis CSS. O traço de 2 px vale na grade de 24 px e escala junto com o tamanho (2,67 px a 32 px e 4 px a 48 px). A 16 px o componente usa `stroke-width` de 3 unidades da grade, o que dá 2 px efetivos e mantém as formas legíveis.
- **Justificativa**: um único desenho por ícone evita 480 arquivos e garante consistência. O estado ativo usa `#159B19` sobre fundo claro; o desabilitado usa `#6B7F94` (3:1 ou mais) e é acompanhado de `aria-disabled` no controle; o erro usa `#B42318`.
- **Ponto de atenção**: Alisson Almeida confirma a legibilidade a 16 px no catálogo (MS-008); ajustes mudam só o componente `Icon`. O símbolo da marca a 16 px tem verificação automática própria (`tests/e2e/simbolo-16px.spec.ts`, CA-012).
- **Alternativas**: arquivos SVG por ícone e estado (duplicação sem ganho); fonte de ícones (acessibilidade pior, risco de terceiros).

## D-009 Logotipo e ícones da PWA

- **Decisão (atualizada em 01/10/2026)**: a equipe de marca enviou os arquivos oficiais, que substituem o redesenho: `logo-principal`, `logo-vertical`, `logo-negativa-branca`, `logo-negativa-navy`, `logo-monocromatica-preta` e `icone`, guardados sem alteração em `src/design-system/brand/oficial/`. As versões que faltavam são derivadas por `scripts/design-system/gerar-variacoes-da-marca.mjs`, só removendo elementos ou trocando a cor: horizontal sem slogan (principal sem o slogan), wordmark (só o lettering), monocromática azul e escala de cinza (a preta recolorida). O símbolo e o favicon são exatamente o `icone.svg` oficial, em todos os tamanhos, sem versão reduzida. Os componentes `Logo` e `Simbolo` usam `<img>` com esses arquivos; as versões usadas no aplicativo são horizontal (cabeçalho), vertical (entrada), negativa branca e símbolo, e as demais só entram no catálogo. O favicon é uma cópia byte a byte do `icone.svg` e os PNG de 192 px, 512 px e maskable são gerados do ícone oficial pelo Chromium do Playwright.
- **Justificativa**: usar o arquivo da marca elimina o risco de infidelidade do redesenho; as cores oficiais do logotipo (#0138B3 e companheiras) são isentas do contraste de texto e ficam fora dos tokens. Sem dependência nova de rasterização e resultado reprodutível.
- **Alternativas**: biblioteca de imagem (dependência nova); exportar PNG em ferramenta de design (não reprodutível).

## D-010 Tabela que vira cartão no mobile

- **Decisão**: uma única árvore DOM com `table`, `thead`, `tbody`, `tr`, `th` e `td`; em larguras abaixo de 768 px o CSS exibe cada `tr` como cartão e cada `td` com seu rótulo (atributo `data-label`), mantendo `role` explícito para preservar a semântica. Ações têm 44 px.
- **Justificativa**: dois conjuntos de DOM (tabela e lista) duplicariam textos e quebrariam os seletores por papel dos testes da Spec 002 (CA-007) e a leitura por tecnologia assistiva.
- **Alternativas**: renderizar lista e tabela com `hidden` por CSS (conteúdo duplicado, ruído para leitores); rolagem horizontal (proibida por RF-020).

## D-011 Linha de base de desempenho

- **Decisão**: antes de qualquer mudança visual, rodar `tests/e2e/performance.spec.ts` (já existente) e gravar tamanho de JS, CSS e fontes e o tempo de carregamento do shell em `specs/003-design-system-telas/baseline-desempenho.md`. O limite é 20% de piora (RNF-004); os tempos de entrada e recuperação da Spec 002 são comparados com a medição anterior (RNF-003).
- **Justificativa**: a spec exige a medição antes e depois, e a linha de base só é válida se for registrada antes do redesenho.

## D-012 Atualizações de configuração da PWA e de documentos

- **Decisão**: incluir `woff2` em `globPatterns`; trocar `theme_color` e `background_color` do manifesto e a meta `theme-color` para `#1249B8` e `#F3F7FA`; remover as classes escuras do `<body>`; reescrever `design-system/fluxid/MASTER.md` para apontar para `tokens.ts`, `contrast.ts`, os ativos e o catálogo.
- **Justificativa**: o manifesto atual (`#0f172a`) pertence a um tema escuro que a spec exclui; sem a fonte no precache a primeira abertura offline cai na fonte de reserva (RNF-001).
