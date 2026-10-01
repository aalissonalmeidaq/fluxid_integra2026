# Plano de implementação: Telas e design system do FluxID

**Feature**: `003-design-system-telas` | **Data**: 30/09/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/003-design-system-telas/spec.md`

## Resumo

Criar o design system versionado do FluxID (tokens, componentes base, ativos de marca, ícones e shell) em `src/design-system/` e refazer as onze telas de identidade da Spec 002 com ele, sem alterar rota, campo, validação, permissão, mensagem de segurança nem resultado de ação. Os tokens têm uma única fonte tipada; o CSS do Tailwind é gerado dela e testes automáticos garantem contraste, escalas, ausência de recursos de terceiros, acessibilidade, reflow e regressão visual. Um catálogo navegável (build separado, só desenvolvimento e CI) documenta cada componente, ícone e versão do logotipo. A fonte Montserrat, o logotipo e os ícones são hospedados no próprio aplicativo.

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; CSS com Tailwind CSS 4.3.3

**Dependências principais**: as já existentes (React 19.3.0, Vite 8.3.1, Tailwind 4.3.3, `vite-plugin-pwa`, Playwright 1.63.0, `@axe-core/playwright`) mais **uma** nova: `@fontsource-variable/montserrat` (licença OFL-1.1, fonte variável com os pesos 300 a 800, versão exata registrada no lockfile, auditada com `npm audit`). Nenhuma biblioteca de componentes, de ícones ou de catálogo (Storybook) é adicionada

**Armazenamento**: N/A. Nenhuma tabela, política RLS, função ou migração muda. Preferências visuais não são persistidas

**Testes**: Vitest 5.0.2 (tokens, contraste, escalas, ícones, componentes), React Testing Library, Playwright com axe (acessibilidade, reflow, teclado, cores forçadas, movimento reduzido, requisições de rede) e comparação de capturas (`toHaveScreenshot`, `maxDiffPixelRatio: 0.001`)

**Plataforma alvo**: navegadores modernos, PWA responsiva de 360 px a desktop amplo, retrato e paisagem

**Tipo de projeto**: aplicação web cliente única; o catálogo é um segundo ponto de entrada Vite fora do pacote de produção

**Metas de desempenho**: carregamento inicial do shell no máximo 20% pior que a linha de base medida antes da mudança (RNF-004); tempo percebido de entrada e de recuperação sem piora (RNF-003)

**Restrições**: WCAG 2.2 AA; zero recursos de terceiros; funcionamento offline com fonte, logotipo e ícones locais; nenhuma mudança de comportamento da Spec 002 (RN-001); sem tema escuro; Supabase local basta para validar

**Escala/escopo**: 11 itens de tela do RF-016 (12 páginas, pois a auditoria do tenant e a da plataforma são páginas distintas), 30 ícones, 9 versões de logotipo, cerca de 15 componentes base, 3 larguras de referência (360, 768 e 1920 px)

## Verificação da constituição

*GATE inicial: aprovado. Reavaliado após o desenho da Fase 1: aprovado.*

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| I Especificação antes do código | Spec esclarecida, com critérios testáveis, antes deste plano | Aprovado |
| II TDD obrigatório | Testes de tokens, contraste, escalas e componentes nascem antes do código; as telas migram com os testes da Spec 002 como rede de segurança | Aprovado |
| III Multitenancy e segurança | Nenhuma regra, política ou credencial muda; o shell deslogado não mostra dado de tenant; a troca de organização continua limpando o conteúdo anterior | Aprovado |
| IV Estados explícitos | Sem estados de domínio novos; os estados de interface (carregando, vazio, erro, offline, sincronizando) ganham um vocabulário único | Aprovado |
| V Experiência e acessibilidade | É o objetivo da spec: design system FluxID, Tailwind, WCAG 2.2 AA, 360 px a desktop amplo, PWA | Aprovado |
| VI Rastreabilidade | Branch `feat/003-design-system-telas`, spec 003, issue a ser aberta e registrada no plano e no PR, e RIA de encerramento; PR com a troca do link do RIA | Aprovado |
| VII Qualidade verificável | Lint, tipagem, testes, cobertura, axe, E2E, build PWA e revisão humana (Alisson Almeida) | Aprovado |
| VIII Documentação viva | `design-system/fluxid/MASTER.md` é atualizado nesta spec (ver a nota abaixo) | Aprovado |

Nota de conflito resolvida: o `MASTER.md` atual diz que logotipo e ícones devem ser "reutilizados como fornecidos" e lista o espaçamento 4, 8, 12, 16, 24, 32, 48 e 64. A Spec 003 decide redesenhar os ativos a partir das pranchas e usa a escala sem o 12 (a prancha de layout). O `MASTER.md` é reescrito para apontar para os tokens, os ativos e o catálogo desta spec, sem contradição. Não há violação constitucional aceita.

## Decisões de arquitetura

- **Fonte única dos tokens**: `src/design-system/tokens.ts` guarda cores (com usos permitidos), tipografia, espaçamento, raios, sombras, gradientes, grid e containers. `scripts/design-system/gerar-tokens-css.mjs` gera `src/design-system/tokens.css` (bloco `@theme` do Tailwind). Um teste confirma que o CSS gerado está sincronizado. O `@theme` zera as paletas, escalas de fonte e espaçamentos padrão do Tailwind, de modo que uma classe fora da escala não gera estilo.
- **Contraste como dado**: cada token de cor lista as combinações permitidas com o fundo e a finalidade (texto normal, texto grande, componente, decorativo). `src/design-system/contrast.ts` calcula a razão WCAG; o teste percorre 100% das combinações (CA-002, MS-002).
- **Componentes sem regra de negócio**: ficam em `src/design-system/components/`, recebem dados e callbacks por props e não conhecem Supabase, tenant nem permissão. As páginas continuam chamando a camada `application/` e `domain/` sem alteração.
- **Shell único**: `src/app/shell/` envolve todas as telas; `App.tsx` passa a compor o shell e as rotas, sem mudar a tabela de rotas, os `requireAal2` nem o `TenantGate`.
- **Tabela que vira cartão**: uma única árvore DOM com elementos `table` e rótulos por célula; em largura estreita o CSS apresenta cada linha como cartão, sem duplicar conteúdo (os seletores por papel dos testes da Spec 002 continuam únicos).
- **Estados de interface**: componentes `Loading`, `EmptyState`, `ErrorState` e `SyncStatus` (o aviso offline é o estado `offline` do `SyncStatus`, sem componente próprio) com região de anúncio única (`role="status"`), anunciando uma vez.
- **Ativos de marca**: componentes React com SVG inline (logotipo e 30 ícones), sem arquivos de terceiros. Os PNG da PWA e o favicon derivam do símbolo por `scripts/design-system/gerar-icones-pwa.mjs`, que usa o Chromium do Playwright para rasterizar, sem nova dependência.
- **Ícones**: construção em grade de 24 por 24 px com traço de 2 px e terminais arredondados; tamanhos e estados são propriedades do componente (não arquivos separados); `duotone`, `monocromática` e `negativa` trocam variáveis CSS. O estado "ativo" sobre fundo claro usa o verde escuro `#159B19` (3,66:1, aceito para ícones).
- **Catálogo**: segundo ponto de entrada Vite em `catalogo/` com `vite.catalogo.config.ts` próprio, lendo a documentação de `src/design-system/docs/`. Scripts `catalogo:dev` e `catalogo:build`. O CI o constrói, serve em outra porta e roda axe e a comparação de capturas nele. O build de produção não importa nada de `catalogo/`, e um teste confirma isso.
- **Regressão visual**: Playwright, somente Chromium, três larguras e os estados principais, `maxDiffPixelRatio: 0.001`. As capturas de referência são geradas no Linux do CI (ou no contêiner oficial do Playwright), porque a renderização de fonte difere por sistema. A aprovação humana acontece na revisão do PR.
- **Impacto na PWA**: o `workbox.globPatterns` passa a incluir `woff2`; `theme_color` e `background_color` do manifesto e `<meta name="theme-color">` adotam o azul profundo oficial; o `index.html` perde as classes escuras (`bg-slate-900 text-slate-100`) que conflitam com o tema claro.

### Valores definidos neste plano (a spec delegou ao plano)

Todos medidos pela fórmula de luminância da WCAG em 30/09/2026 e reconferidos pelos testes.

| Token | Valor | Sobre branco | Sobre cinza-gelo | Uso |
|---|---|---:|---:|---|
| Azul profundo (oficial) | `#1249B8` | 7,86:1 | 7,30:1 | marca, ação principal, início do gradiente profundidade |
| Ciano acessível | `#08709C` | 5,51:1 | 5,12:1 | texto, ícone e link sobre fundo claro |
| Verde acessível | `#0F7A14` | 5,51:1 | 5,11:1 | texto de sucesso e botão de confirmação (branco sobre ele: 5,51:1) |
| Erro | `#B42318` | 6,57:1 | 6,10:1 | texto, borda e ícone de erro; fundo suave `#FDECEA` |
| Alerta (texto) | `#7A4B00` | 7,41:1 | 6,88:1 | texto de alerta sobre o fundo suave `#FFF4D6` |
| Alerta (preenchimento) | `#F5B301` | 1,85:1 | 1,72:1 | só preenchimento de faixa, sempre com texto grafite (6,49:1) |
| Texto secundário | `#5B6F84` | maior que 4,81:1 | 4,81:1 | legendas e ajudas |
| Borda de controle | `#6B7F94` | maior que 3,83:1 | 3,83:1 | borda de campo e de seletor (componente, 3:1) |

Valor oficial do azul profundo: **`#1249B8`**, o da paleta (os 7,86:1 medidos usam esse valor). O `#1249BB` do início do gradiente azul digital e do código atual é substituído pelo token, e a diferença entre os dois é imperceptível. A cor `#1249BB` deixa de existir no código.

Proporção de uso (60% neutros, 25% azuis, 10% verdes, 5% ciano) é orientação do catálogo, sem teste automático.

## Estrutura do projeto

### Documentação (esta funcionalidade)

```text
specs/003-design-system-telas/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── tokens-e-escalas.md
│   ├── componentes.md
│   ├── shell-e-estados.md
│   ├── ativos-de-marca.md
│   └── verificacoes-automaticas.md
├── referencias/         # seis pranchas normativas
├── checklists/
└── tasks.md             # gerado por /speckit-tasks
```

### Código-fonte (raiz do repositório)

```text
src/
├── design-system/
│   ├── tokens.ts                # fonte única dos tokens
│   ├── tokens.css               # gerado a partir de tokens.ts
│   ├── contrast.ts              # razão de contraste WCAG
│   ├── components/              # Button, TextField, Select, StatusBadge, Alert, Dialog, Card,
│   │                            # DataTable, List, Loading, EmptyState, ErrorState, SyncStatus, ...
│   ├── brand/                   # Logo (variações) e Symbol
│   ├── icons/                   # 30 ícones, Icon, registro e tamanhos/estados
│   └── docs/                    # documentação por componente, ícone e logotipo
├── app/
│   └── shell/                   # AppShell, Header, SkipLink, ConnectionBar, Footer
├── components/                  # form-field, confirmation-dialog e ConnectivityStatus migram para design-system
├── pages/                       # as mesmas telas, refeitas com o design system
└── styles/globals.css           # importa tokens.css e a fonte; regras globais

catalogo/                        # index.html e entrada do catálogo (fora do pacote de produção)
vite.catalogo.config.ts
scripts/design-system/           # gerar-tokens-css.mjs, gerar-icones-pwa.mjs
tests/
├── contract/                    # tokens sincronizados, contraste, escalas, sem terceiros, catálogo fora do pacote
├── e2e/                         # acessibilidade, reflow, teclado, cores forçadas, movimento reduzido, rede
└── e2e/visual/                  # comparação de capturas e capturas de referência
public/                          # favicon.svg e icons/ regenerados a partir do símbolo
```

**Decisão de estrutura**: manter o projeto único existente. O design system é um módulo interno (`src/design-system/`) e não um pacote separado, porque hoje há um só consumidor. O catálogo é um build à parte para não entrar na PWA.

## Estratégia de testes (TDD)

1. **Tokens e contraste (RED primeiro)**: testes de `tokens.ts` e `contrast.ts` com as razões da spec como valores esperados; o teste de sincronia do CSS; o teste que falha ao inserir um par que não atende.
2. **Escalas**: teste que varre `src/**/*.tsx` e `*.css` e falha com cor hexadecimal fora de `tokens.ts`, valor arbitrário do Tailwind (`[#...]`, `[Npx]`) ou espaçamento e fonte fora das escalas (CA-013, RNF-006). No navegador, um teste lê os estilos computados de cada tela e confere tamanhos, pesos, margens e calhas.
3. **Componentes**: testes de unidade por componente (variantes, estados, foco, desabilitado, carregando, erro, alvo de 44 px, nome acessível). O diálogo cobre prender foco, Escape e devolução do foco.
4. **Ativos**: teste de que existem 30 ícones, quatro tamanhos, quatro estados e as quatro variantes; que todo ícone usa a grade e o traço da prancha; que o estado de cada ícone atende 3:1 sobre branco e cinza-gelo; e que o símbolo a 16 px passa na verificação de formas relevantes (de duas a quatro, escudo e pino distintos), cobertura e largura mínima de `tests/e2e/simbolo-16px.spec.ts`, com aprovação humana da legibilidade.
5. **Telas**: os testes da Spec 002 (unitários, E2E, live) continuam como estão; só seletores e textos de apoio mudam (CA-007). Novos E2E cobrem as três larguras, reflow a 320 px, teclado, cores forçadas (`forced-colors`), movimento reduzido e requisições de rede.
6. **Visual**: capturas por tela, largura e estado, depois de a linha de base ser aprovada.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| O `@theme` do Tailwind 4 pode não remover todas as escalas padrão como esperado | A primeira tarefa é uma prova de conceito com teste (classe fora da escala não gera CSS); o teste de varredura de código cobre o restante |
| Ícones redesenhados sem arquivos oficiais da marca | Aprovação de fidelidade por Alisson Almeida (MS-008); arquivos oficiais posteriores substituem os redesenhados sem mudar a spec. O logotipo e o símbolo já são os arquivos oficiais (01/10/2026) |
| Versões do logotipo que a marca não enviou (horizontal sem slogan, wordmark, monocromática azul, escala de cinza) | Derivadas dos oficiais por `scripts/design-system/gerar-variacoes-da-marca.mjs`, só removendo elementos ou trocando a cor, e aprovadas por Alisson Almeida; a marca pode substituí-las por arquivos oficiais |
| Capturas de referência dependem do sistema operacional | Geradas e comparadas no Linux do CI; atualização por comando documentado no quickstart |
| Tabela que vira cartão pode quebrar a leitura por tecnologia assistiva | Papéis de tabela preservados por atributos explícitos; teste com axe e verificação manual com leitor de tela registrada na validação humana |
| Refatorar 3.131 linhas de páginas pode alterar comportamento | Migração tela a tela, cada uma com a suíte da Spec 002 verde antes de seguir; nenhum arquivo em `domain/` ou `application/` é alterado |
| Fonte variável aumenta o carregamento inicial | Somente o subconjunto latino, `font-display: swap`, pré-carga da fonte, precache offline e medição contra a linha de base (RNF-004) |

## Rastreabilidade

**Issue**: [#6](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/6), aberta em 01/10/2026 (princípio VI). O número entra também na descrição do PR e no RIA.

| Requisito | Onde é atendido |
|---|---|
| RF-001 a RF-006A | `tokens.ts`, `contrast.ts`, contrato de tokens, catálogo |
| RF-007 a RF-011 | componentes, contrato de componentes, catálogo |
| RF-012 a RF-015 | `src/app/shell/`, contrato de shell e estados |
| RF-016 a RF-020 | páginas refeitas, `DataTable`, seções de formulário |
| RF-021 a RF-023 | componentes de estado, `prefers-reduced-motion` global |
| RF-024 a RF-030 | `brand/`, `icons/`, script de ícones PWA, teste de terceiros |
| CA-001 a CA-013 | contrato de verificações automáticas |
| MS-008 | validação humana de Alisson Almeida registrada em `validation.md` (seção 3) e repetida no RIA de encerramento |

## Encerramento do ciclo

Ao concluir implementação e convergência, seguir o gate de registro de IA do `AGENTS.md`: testes, `git add`, `npm run ia:registro -- --spec 003 --ciclo NN --titulo "..."`, validação humana, `npm run ia:validar` e commit único. O link do RIA aponta para a branch até o PR existir; a troca pelo link do PR é pendência obrigatória antes do merge.

## Acompanhamento de complexidade

Sem violações da constituição a justificar. A única dependência nova (`@fontsource-variable/montserrat`) é necessária para hospedar a fonte exigida pela spec sem requisição a terceiros.
