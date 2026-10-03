---
description: "Tarefas executáveis da Spec 005 — Entrada renovada e Visão geral"
---

# Tarefas: Entrada renovada e Visão geral

**Entrada**: artefatos em `specs/005-login-e-visao-geral/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD. Em cada incremento, escrever o teste, confirmar a falha esperada (RED), implementar (GREEN), refatorar e rodar a regressão antes de avançar.

**Escopo protegido**: esta Spec é só de interface. Não cria migração, função, política RLS, permissão, papel nem regra de acesso (RN-002, RF-031) e não acrescenta dependência ao `package.json` (RNF-002). Os testes das Specs 001 a 004 só podem mudar em seletores e textos de apoio: o rótulo "Início" para "Visão geral", o título da página inicial e a posição de "Meu perfil" e "Sair" (CA-001). A lógica de `LoginPage` não muda (RF-003, RN-003).

**Convenção de títulos**: o logotipo continua sendo o único `h1`; "Visão geral" e "Bem-vindo de volta" (entrada) são `h2`; cada bloco é `h3` (plan.md, decisões de arquitetura).

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode rodar em paralelo, porque não modifica os mesmos arquivos nem depende de tarefa incompleta.
- `[USN]`: história de usuário da spec (US1 a US5).
- Referências entre colchetes ligam a tarefa aos requisitos.

## Mapa das histórias

| História | Prioridade | Entrega |
|---|---|---|
| US1 Entrar por uma tela com a identidade da marca | P1 | `AuthLayout`, painel de marca, campo de senha e telas públicas com a mesma moldura |
| US2 Chegar à Visão geral depois de entrar | P1 | página, blocos, gráficos, shell com barra superior e "Início" renomeado |
| US3 Usar a Visão geral em qualquer largura, só com teclado | P1 | grade responsiva, alvos, foco, tabelas dos gráficos, escalas e cores forçadas |
| US4 Estados de carregamento, vazio, erro e offline | P2 | estados por bloco, "Tentar de novo" e abertura offline |
| US5 Menu da pessoa e saída pela barra superior | P2 | `UserMenu` com nome, organização, "Meu perfil" e "Sair" |

---

## Fase 1 — Preparação

**Objetivo**: registrar a rastreabilidade e a linha de base antes de qualquer mudança.

- [X] T001 Registrar em `specs/005-login-e-visao-geral/plan.md` (seção Rastreabilidade) a issue [#13](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/13) e confirmar que ela aparece na descrição do PR e no RIA de encerramento [constituição VI]. A issue já existe; esta tarefa só confere o registro.
- [X] T002 Rodar `npm run lint`, `npm run typecheck`, `npm test` e `npm run test:e2e` na branch `feat/005-login-e-visao-geral` e registrar em `specs/005-login-e-visao-geral/baseline.md` que as suítes das Specs 001 a 004 estão verdes antes da mudança, com data, ambiente e comando [CA-001].
- [X] T003 [P] Rodar `npx playwright test tests/e2e/medicao-shell.spec.ts --project=desktop-chromium` e `npm run build` e registrar em `specs/005-login-e-visao-geral/baseline.md` as medianas do shell (referência da Spec 004: 89 ms autenticado e 127 ms na entrada; limites de 107 ms e 152 ms) e o tamanho do pacote de produção (limite de +5%) [RNF-001, RNF-003, MS-006].

---

## Fase 2 — Fundação (bloqueia as histórias)

**Objetivo**: tipos, fonte de exemplo, estados por bloco e a moldura de bloco com a marca "Exemplo". Sem isso nenhum bloco da Visão geral pode ser montado.

### Testes primeiro (RED)

- [X] T004 [P] Escrever `src/infrastructure/overview/sample-overview-source.test.ts` para `sampleOverviewSource.load(blockId)` de cada um dos 7 blocos (`indicadores`, `mapa`, `movimentacao`, `situacao`, `alertas`, `cilindros`, `desempenho`): números e datas no padrão pt-BR (RNF-004); a soma dos percentuais da rosca fecha 100% e a soma dos valores bate com o total; cada série tem rótulo; nenhum texto contém termos que afirmem estado físico ("entregue", "travado", "comando executado"); identificadores fictícios e sem identificador de tenant, de pessoa ou e-mail; a chamada não usa `fetch`, cliente Supabase nem armazenamento. Confirmar a falha (módulo inexistente) [RF-017, RF-032, RN-001, RN-004, CA-009].
- [X] T005 [P] Escrever `src/pages/overview/use-overview-block.test.ts` com uma fonte falsa: `loading` enquanto pendente, `ready` com dados, `empty` sem itens, `error` na rejeição, `retry` volta a `loading` e resolve; a falha de um bloco não altera os demais; descarta resposta de uma tentativa antiga (corrida); desmonta sem aviso de estado. Confirmar a falha [RF-028, história 4, CA-006].
- [X] T006 [P] Escrever `src/design-system/components/example-badge.test.tsx` e `src/pages/overview/overview-block.test.tsx`: `ExampleBadge` mostra o texto "Exemplo" visível (nunca só cor ou ícone); `OverviewBlock` exige `title`, renderiza `<section>` com nome acessível pelo título (`h3`), exibe a marca "Exemplo", um `role="status"` único por bloco que anuncia o estado uma vez e **não** move o foco, e mostra `Loading`, `EmptyState` com texto, `ErrorState`/`Alert` com a ação "Tentar de novo" ou o conteúdo conforme o estado [RF-016, RF-028, RA-002, RA-004].

### Implementação (GREEN)

- [X] T007 Criar `src/domain/overview/overview-types.ts` com os tipos dos 7 blocos e do estado discriminado `loading | ready | empty | error`, sem números nem textos de exemplo, conforme [data-model.md](./data-model.md). Criar `src/application/overview/overview-source.ts` com a porta `OverviewSource { load(blockId) }` [RF-017].
- [X] T008 Criar `src/infrastructure/overview/sample-overview-source.ts` com `sampleOverviewSource`: única origem dos números e textos de exemplo, em português, formatados com `Intl.NumberFormat('pt-BR')`, vocabulário do PRD (cilindro, lacre, geocerca, teste hidrostático, custódia) e redigidos como indicadores e eventos. Medidas do bloco `desempenho`: "cilindros com teste hidrostático em dia", "tempo médio de retorno de cilindros" e "alertas tratados". T004 passa a verde [RF-010 a RF-015a, RF-017, RN-004].
- [X] T009 Criar `src/app/overview/overview-source-context.tsx` com `OverviewSourceProvider` e `useOverviewSource()` (padrão: `sampleOverviewSource`) e `src/pages/overview/use-overview-block.ts` com `useOverviewBlock(blockId)` e `retry`. T005 passa a verde [RF-017, RF-028].
- [X] T010 [P] Criar `src/design-system/components/example-badge.tsx` (reaproveita `StatusBadge`, texto "Exemplo") e exportar em `src/design-system/components/index.ts`; criar `src/pages/overview/overview-block.tsx` com `OverviewBlock({ title, id, state, onRetry, children })`, único meio de criar um bloco. T006 passa a verde [RF-016, RF-028].

**Ponto de verificação**: `npm run typecheck` e `npm test -- src/infrastructure/overview src/pages/overview src/design-system/components/example-badge.test.tsx` verdes.

---

## Fase 3 — US1: Entrar por uma tela com a identidade da marca (P1)

**Objetivo**: a entrada tem painel de marca, mostrar/ocultar senha e a mesma moldura nas telas públicas, sem mudar o comportamento de autenticação.

**Teste independente**: abrir a entrada em 360, 768 e 1920 px e entrar com credenciais válidas, inválidas e de perfil com segundo fator; cada resultado se comporta como na Spec 002.

### Testes primeiro (RED)

- [X] T011 [P] [US1] Escrever `src/pages/auth/brand-panel.test.tsx`: logotipo oficial como `h1` com nome acessível "FluxID"; assinatura exata "Rastreabilidade que protege. Inteligência que conecta."; três destaques de texto (identificação individual de cilindros; custódia e rastreabilidade; auditoria e alertas) com ícones `aria-hidden`; nenhuma imagem de terceiros nem `img` fotográfica [RF-002, RA-007].
- [X] T012 [P] [US1] Escrever `src/components/identity/password-field.test.tsx`: oculta por padrão; botão com nome "Mostrar senha"/"Ocultar senha" e `aria-pressed` que reflete o estado; alternar mantém o foco e o valor; alvo de 44 por 44 px (classe de alvo do design system); o valor da senha não é copiado para nenhum atributo além de `value` e não é registrado (espiar `console`) [RF-005, RF-033, RA-005].
- [X] T013 [P] [US1] Escrever `src/pages/auth/auth-layout.test.tsx`: duas colunas a partir de 1024 px e uma coluna abaixo (classes de ponto de quebra `desktop`); o painel vem antes do formulário no DOM; sem barra superior nem menu; instalar PWA aparece só quando instalável; usado pela entrada, pelas duas telas de recuperação e pela verificação em duas etapas em `mfa_required` [RF-001, RF-007].
- [X] T014 [US1] Estender `src/pages/auth/login-page.test.tsx`: todos os cenários existentes continuam como estão (inválida, conta indisponível, bloqueio, rede lenta, limite de sessões, expiração, segundo fator) dentro da nova moldura; adicionar que não há botão de login social, "Lembrar de mim", cadastro público nem canal de suporte; que o link "Esqueci minha senha" continua; que a ordem de Tab começa no link de pular e segue pelo formulário. Estender `src/pages/auth/recovery-pages.test.tsx` e `src/pages/auth/mfa-page.test.tsx` para a moldura nova: com a sessão em `mfa_required`, a tela de verificação tem o painel de marca, um só `h1` (o logotipo) e nenhum menu nem barra superior [RF-007, RF-027, caso de borda de verificação em duas etapas]. Confirmar a falha só nos pontos novos [RF-003, RF-004, RN-003, CA-002].

### Implementação (GREEN)

- [X] T015 [P] [US1] Criar `src/pages/auth/brand-panel.tsx` com `BrandPanel` (`Logo` oficial, assinatura, título e três destaques com ícones `cilindro`, `rota` e `escudo` do catálogo) usando só tokens. T011 passa a verde [RF-002, RF-024, RF-025].
- [X] T016 [P] [US1] Criar `src/components/identity/password-field.tsx` com `PasswordField` sobre `TextField` (acrescentar a `src/design-system/components/text-field.tsx` o suporte a um controle ao final do campo, sem mudar o uso atual, e estender o teste existente do `TextField` para o novo controle e para a ausência de mudança sem ele) e o botão mostrar/ocultar. T012 passa a verde [RF-005].
- [X] T017 [US1] Criar `src/pages/auth/auth-layout.tsx` com `AuthLayout` (painel + conteúdo; em menos de 1024 px, a faixa de marca no alto) e o botão "Instalar App" no rodapé quando instalável. Trocar a moldura de `src/pages/auth/login-page.tsx`, `recovery-request-page.tsx`, `recovery-confirm-page.tsx` e `mfa-page.tsx` (quando exibida em `mfa_required`, por `src/app/routing/protected-route.tsx`) por `AuthLayout` e usar `PasswordField` no campo de senha da entrada, **sem alterar** estados, mensagens, foco, limite de sessões, expiração, bloqueio nem segundo fator. T013 e T014 passam a verde [RF-001, RF-003, RF-007].
- [X] T018 [US1] Ajustar `src/app/shell/app-shell.tsx` para o shell público: sem sessão plena (`signed_out` e `mfa_required`), não renderizar `Header`, barra superior nem menu; manter o link de pular, a barra de conexão, o `main` e o rodapé. Ajustar `src/app/shell/app-shell.test.tsx` só no que depende do cabeçalho do shell público [RF-006, RF-007].
- [X] T019 [P] [US1] Criar `tests/e2e/entrada-renovada.spec.ts` (backend simulado, projetos de 360, 768 e 1920 px): painel ao lado do formulário em 1920 px e faixa no alto em 360 px; entrada válida, inválida e com segundo fator como na Spec 002; sem login social nem "Lembrar de mim"; mostrar/ocultar senha por teclado; verificação em duas etapas com a mesma moldura, um só `h1` e sem menu; entrada aberta offline com o estado de conexão existente e o envio ainda possível ao reconectar; axe sem violação crítica ou grave; sem rolagem horizontal de 320 a 1920 px e com zoom de 200% [CA-002, CA-004, CA-005, MS-001].

**Ponto de verificação**: US1 entregue e testável sozinha; `npm test -- src/pages/auth src/components/identity` e `npx playwright test tests/e2e/entrada-renovada.spec.ts` verdes.

---

## Fase 4 — US2: Chegar à Visão geral depois de entrar (P1)

**Objetivo**: a rota `/` autenticada mostra a Visão geral com os blocos do domínio do FluxID, o menu da Spec 004 com "Visão geral" e a barra superior.

**Teste independente**: entrar como administrador de tenant, operador técnico e Master e conferir a estrutura e o menu de cada um.

### Testes primeiro (RED)

- [X] T020 [P] [US2] Escrever `src/design-system/charts/line-chart.test.tsx` e `src/design-system/charts/donut-chart.test.tsx`: `role="img"` com título e descrição; `<table>` com os mesmos dados do desenho; legenda da rosca com valor e percentual em texto; traçados ou marcadores distintos por série (informação nunca só por cor); só cores de tokens (`navy`, `azul-royal`, `ciano-acessivel`, `verde-acessivel`) com 3:1 ou mais contra `branco`, calculado com `src/design-system/contrast.ts`; nenhuma animação nem `transition`; sem dependência de gráficos no `package.json` [RF-012, RF-013, RF-018, RA-003, CA-004].
- [X] T021 [P] [US2] Escrever `src/pages/overview/overview-page.test.tsx`: título "Visão geral" como `h2`, subtítulo e a identificação "Dados de exemplo"; os 4 cartões (Cilindros cadastrados, Em viagem, Alertas críticos, Lacres conectados) com ícone, valor, rótulo e nota; blocos "Cilindros e viagens no mapa" (espaço reservado, texto de fase futura, sem imagem nem marcador), "Movimentação de cilindros", "Cilindros por situação", "Alertas recentes", "Cilindros recentes" e "Desempenho operacional"; **toda** região tem a marca "Exemplo" e nome acessível; sem "Ver todos", busca, ajuda nem notificações; sem o texto "Fundação Técnica Ativa"; a página não chama `fetch`, `ProfileService` nem cliente Supabase e produz conteúdo idêntico para duas pessoas e dois tenants [RF-008 a RF-016, RF-023, RF-032, CA-003, CA-009].
- [X] T022 [P] [US2] Escrever `src/app/shell/top-bar.test.tsx`: abaixo de 768 px, botão do menu e logotipo (`h1`); a partir de 768 px, o logotipo vai ao topo do menu lateral e a barra não o repete (um só `h1` por largura, via `use-min-width`); organização ativa com "Trocar organização" quando há mais de um vínculo; instalar PWA quando instalável; estado de conexão existente preservado; perfil global sem tenant ativo mostra só o que existe [RF-021, RF-027, casos de borda].
- [X] T023 [US2] Atualizar os testes que dependem dos nomes antigos: `src/domain/navigation/screens.test.ts`, `src/domain/navigation/visible-screens.test.ts`, `src/app/shell/navigation-menu.test.tsx` e `src/app/shell/app-shell.test.tsx` passam a esperar "Visão geral" no lugar de "Início" (id interno `inicio` e caminho `/` iguais), "Meu perfil" e "Sair" nas novas posições e a página inicial sem "Fundação Técnica Ativa". Confirmar a falha pelo novo rótulo [RF-020, CA-001].

### Implementação (GREEN)

- [X] T024 [P] [US2] Criar `src/design-system/charts/{line-chart.tsx,donut-chart.tsx,chart-table.tsx,index.ts}` em SVG próprio, sem biblioteca, com títulos, descrições, tabela equivalente, legenda em texto e traçados distintos. T020 passa a verde [RF-012, RF-013, RF-018, RNF-002].
- [X] T025 [P] [US2] Criar `src/pages/overview/blocks/{indicators-block.tsx,map-block.tsx,movement-block.tsx,status-block.tsx,alerts-block.tsx,cylinders-block.tsx,performance-block.tsx}`, cada um dentro de `OverviewBlock`, consumindo `useOverviewBlock` e os componentes do design system (`Card`, `List`, `EmptyState`, ícones do catálogo), sem valor literal [RF-010 a RF-015, RF-024].
- [X] T026 [US2] Criar `src/pages/overview/overview-page.tsx` com o título `h2`, o subtítulo, a identificação de dados de exemplo e a composição dos blocos na ordem visual, e fazer `src/app/App.tsx` renderizar `OverviewPage` na rota `/` (dentro de `ProtectedRoute`) no lugar do cartão "Fundação Técnica Ativa"; sem sessão, `/` continua mostrando a entrada. T021 passa a verde [RF-008, RF-009].
- [X] T027 [US2] Renomear o `label` do item `inicio` para "Visão geral" em `src/domain/navigation/screens.ts`, mantendo id, caminho e escopo, e conferir `src/app/shell/navigation-menu.tsx` (nome acessível e marca de página atual com o novo texto). T023 passa a verde [RF-019, RF-020].
- [X] T028 [US2] Criar `src/app/shell/top-bar.tsx` (`TopBar`: botão do menu e logotipo abaixo de 768 px, `TenantIndicator`, instalar PWA e espaço do menu da pessoa) e reestruturar `src/app/shell/app-shell.tsx` para sessão autenticada: a partir de 768 px, grade de duas colunas (lateral com logotipo `h1` e `NavigationMenu` da Spec 004; coluna principal com barra superior, barra de conexão e `main`); abaixo, barra superior e painel do menu da Spec 004. Remover `src/app/shell/header.tsx`. Ajustar `src/app/shell/navigation-menu.tsx` somente na largura da coluna, sem mudar regras, estados, cache nem foco. T022 passa a verde e os testes da Spec 004 seguem verdes [RF-019, RF-021, RF-027].
- [X] T029 [P] [US2] Atualizar os E2E que usam seletores do cabeçalho antigo, do rótulo "Início" ou do título da página inicial: `tests/e2e/app-shell.spec.ts`, `tests/e2e/navegacao-menu.spec.ts`, `tests/e2e/medicao-shell.spec.ts`, `tests/e2e/profile.spec.ts`, `tests/e2e/auth-session.spec.ts`, `tests/e2e/tenant-selection.spec.ts`, `tests/e2e/rbac.spec.ts`, `tests/e2e/audit-log.spec.ts`, `tests/e2e/pwa.spec.ts`, `tests/e2e/accessibility.spec.ts` e `tests/e2e/support/telas.ts` (acrescentar a Visão geral à lista de telas das specs transversais, com o nome novo). Mudar só seletores e textos de apoio [CA-001].
- [X] T030 [US2] Criar `tests/e2e/visao-geral.spec.ts` (backend simulado): com administrador de tenant, operador técnico e Master, a Visão geral é a mesma e o menu mostra os itens da Spec 004 de cada um; todos os blocos de RF-010 a RF-015 presentes, cada um com "Exemplo"; sem "Fundação Técnica Ativa"; barra superior com organização, estado de conexão e menu da pessoa; nenhuma requisição a dados de domínio feita pela página; sessão expirada na Visão geral devolve à entrada com o aviso da Spec 002; ao abrir a Visão geral pelo item do menu, o foco vai ao título "Visão geral" (`h2`) uma única vez pelo mecanismo da Spec 004 [RF-008 a RF-016, RF-019, RA-006, CA-003, MS-002].

**Ponto de verificação**: US2 entregue; `npm test` e `npx playwright test tests/e2e/visao-geral.spec.ts tests/e2e/navegacao-menu.spec.ts` verdes.

---

## Fase 5 — US3: Usar a Visão geral em qualquer largura, só com teclado (P1)

**Objetivo**: disposição responsiva de 360 px a desktop amplo, alvos de 44 px, foco visível e alternativas textuais comprovadas.

**Teste independente**: percorrer a página com Tab em 360, 768 e 1920 px, sem rolagem horizontal, e conferir as tabelas dos gráficos.

### Testes primeiro (RED)

- [X] T031 [US3] Estender `tests/e2e/visao-geral.spec.ts` com: 360 px em uma coluna e menu recolhido; 768 px com cartões em duas colunas e menu fixo; 1920 px com os quatro cartões na mesma linha e conteúdo limitado a `containers.largo`; 320 a 1920 px e zoom de 200% sem rolagem horizontal (padrão de `tests/e2e/escalas-no-navegador.spec.ts`); axe sem violação crítica ou grave em cada largura; retrato e paisagem (740 por 360); gráficos com tabela e descrição acessíveis [RF-026, RF-027, CA-004, CA-005, MS-003, MS-005].
- [X] T032 [P] [US3] Estender `tests/e2e/teclado-e-contraste-de-foco.spec.ts` e `tests/e2e/cores-forcadas.spec.ts` para a entrada e a Visão geral: ordem de Tab coerente (link de pular, menu, barra superior, conteúdo), foco visível de 3:1 ou mais e não obscurecido, alvos de 44 por 44 px, bordas, ícones e gráficos visíveis em cores forçadas com a tabela equivalente; com `reducedMotion: 'reduce'` nenhum elemento tem `animation` ou `transition` em curso e nada pisca mais de três vezes por segundo [RF-027, RF-029, CA-004, CA-007, MS-004].
- [X] T033 [P] [US3] Estender `tests/e2e/escalas-no-navegador.spec.ts` (e os testes de escalas da Spec 003 que varrem classes) para as telas novas: nenhuma cor, tamanho ou espaçamento fora dos tokens [RF-024, CA-010].

### Implementação (GREEN)

- [X] T034 [US3] Ajustar a grade de `src/pages/overview/overview-page.tsx` e dos blocos para os pontos de quebra `tablet` (768) e `desktop` (1024): uma coluna em 360 px; dois cartões por linha em 768 px; quatro cartões, mapa e movimentação lado a lado, depois situação, alertas, cilindros e medidas em 1920 px, com `min-w-0`, quebra de texto, tabelas rolando dentro do bloco e largura máxima do shell; no máximo duas ênfases de cor por bloco, sem sombra pesada e sem animação (`prefers-reduced-motion` respeitado). T031 a T033 passam a verde [RF-025, RF-026, RF-029].
- [X] T035 [P] [US3] Garantir alvo mínimo de 44 por 44 px e anel de foco do design system nos controles novos (cartões interativos, botão do menu da barra superior, botão de senha, "Tentar de novo"), sem mudar o comportamento dos componentes existentes [RF-027, RA-001].

**Ponto de verificação**: US3 entregue; `npx playwright test tests/e2e/visao-geral.spec.ts tests/e2e/teclado-e-contraste-de-foco.spec.ts tests/e2e/escalas-no-navegador.spec.ts tests/e2e/cores-forcadas.spec.ts` verdes nos projetos de 360, 768 e 1920 px.

---

## Fase 6 — US4: Estados de carregamento, vazio, erro e offline (P2)

**Objetivo**: cada bloco trata os quatro estados do vocabulário da Spec 003, sem quebrar a página nem mover o foco.

**Teste independente**: forçar atraso, falha, vazio e perda de rede e observar cada bloco e o anúncio.

### Testes primeiro (RED)

- [X] T036 [US4] Estender `src/pages/overview/overview-page.test.tsx` e escrever `src/pages/overview/blocks/blocks-states.test.tsx` com fontes falsas por bloco: `loading` com indicador anunciado uma vez e estrutura que não muda de lugar depois; `error` em um bloco com mensagem em texto e "Tentar de novo" enquanto os demais seguem funcionando; `empty` com texto explicativo, nunca área em branco; texto longo em um cartão de 360 px quebra dentro do cartão sem estourar a largura; o foco não se move em nenhum estado; "Tentar de novo" volta a `loading` e resolve [RF-028, CA-006, RA-004, história 4].
- [X] T037 [P] [US4] Estender `tests/e2e/visao-geral.spec.ts` e `tests/e2e/estados.spec.ts` com o aparelho offline e o aplicativo instalado: a estrutura da Visão geral abre com o aviso de offline da Spec 003, sem pedir rede e sem guardar dado da página no cache do service worker; reconectar mantém a página (padrão de `tests/e2e/pwa.spec.ts`) [RF-030, história 4].

### Implementação (GREEN)

- [X] T038 [US4] Garantir em `src/pages/overview/overview-block.tsx` e nos blocos de `src/pages/overview/blocks/` os quatro estados com `Loading`, `EmptyState`, `ErrorState`/`Alert` e "Tentar de novo" do design system, `role="status"` anunciado uma vez, reserva de altura para a estrutura não saltar e nenhum movimento de foco. Conferir que `src/app/pwa-config.test.ts` continua reprovando `runtimeCaching` de dados e que nada da Visão geral entra no cache. T036 e T037 passam a verde [RF-028, RF-030, RA-004].

**Ponto de verificação**: US4 entregue; `npm test -- src/pages/overview` e `npx playwright test tests/e2e/estados.spec.ts tests/e2e/visao-geral.spec.ts` verdes.

---

## Fase 7 — US5: Menu da pessoa e saída pela barra superior (P2)

**Objetivo**: a barra superior reúne o que é da pessoa: organização ativa, "Meu perfil" e "Sair".

**Teste independente**: abrir o menu da pessoa por mouse e teclado e acionar cada item.

### Testes primeiro (RED)

- [X] T039 [US5] Escrever `src/app/shell/user-menu.test.tsx`: botão com `aria-expanded` e `aria-controls`; o painel mostra nome de exibição, organização ativa, "Meu perfil" (âncora para `/perfil`) e "Sair" (chama o `logout` existente); o nome é lido com `ProfileService.load()` **somente ao abrir**, e falha ou demora mostram "Minha conta" sem bloquear as ações; Escape e clique fora fecham e devolvem o foco ao botão; Tab percorre os itens na ordem; nome longo trunca com reticências sem estourar a largura e sem perder o nome acessível; perfil global sem tenant ativo não mostra organização; "Trocar organização" continua no fluxo da Spec 002 [RF-022, RA-005, RA-006, casos de borda].
- [X] T040 [P] [US5] Estender `tests/e2e/visao-geral.spec.ts` e `tests/e2e/teclado-e-contraste-de-foco.spec.ts` com o menu da pessoa: abrir por Enter e por clique, percorrer por Tab, fechar por Escape e por clique fora com o foco de volta, acionar "Meu perfil" e "Sair", e a troca de organização por uma pessoa de dois tenants [RF-022, CA-007, história 5].

### Implementação (GREEN)

- [X] T041 [US5] Criar `src/app/shell/user-menu.tsx` (botão de divulgação, sem `role="menu"`) e encaixá-lo em `src/app/shell/top-bar.tsx`; remover do cabeçalho antigo os botões "Meu perfil" e "Sair" soltos, agora no menu da pessoa. T039 e T040 passam a verde [RF-021, RF-022].

**Ponto de verificação**: US5 entregue; `npm test -- src/app/shell` e `npx playwright test tests/e2e/visao-geral.spec.ts` verdes.

---

## Fase 7a — Refinamentos de interface (02/10/2026)

**Objetivo**: ajustes pedidos depois da primeira implementação, incorporados ao mesmo ciclo (RF-034 a RF-038, RF-003, RF-004, RF-006).

- [X] T048 [US1] Recriar a entrada a partir da nova referência: título "Bem-vindo de volta" com subtítulo, cartão com logotipo decorativo, selo "Ambiente seguro", ícones e texto-guia nos campos, seta em Entrar, "Esqueci minha senha" à direita antes de Entrar, painel com chamada, frase de apoio e três cartões, sem Google, "Lembrar de mim" nem suporte. `src/pages/auth/{auth-layout,brand-panel,login-page,login-icons}.tsx`, `src/design-system/components/text-field.tsx` (propriedade `leading`) e testes. [RF-002, RF-003, RF-004, RF-035, RF-036]
- [X] T049 [US2] Logotipo do shell como link para a Visão geral e maior: `src/app/shell/logo-link.tsx`, usado em `app-shell.tsx` e `top-bar.tsx`, com testes em `app-shell.test.tsx`. [RF-021, RF-034]
- [X] T050 [US3] Ajustar a coluna lateral (um quarto da largura, até 256 px) e as grades da Visão geral para não apertar tabelas e rótulos, sem rolagem horizontal nem com zoom de 200%. `app-shell.tsx`, `overview-page.tsx`, `indicators-block.tsx`, `performance-block.tsx`. [RF-026, RF-037]
- [X] T051 [US1] No celular, mover o estado de conexão das telas públicas para o fim da página, discreto; o aviso de offline permanece no alto. `app-shell.tsx`; atualizar o E2E de teclado em `tests/e2e/accessibility.spec.ts` para a nova ordem de Tab. [RF-006]
- [X] T052 Micro-interações e tipografia: transição de 150 ms só em fundo e borda (sem atrasar o anel de foco), cursor de ponteiro, estado pressionado, `text-wrap: balance` nos títulos, contraste do texto-guia e atributos do campo de e-mail. `button.tsx`, `classes-do-controle.ts`, `src/styles/base.css`, `login-page.tsx`. [RF-038]
- [ ] T053 Regenerar no Linux as capturas visuais de referência da entrada e da Visão geral, que divergem de propósito por causa de T048 a T052 (veja `specs/003-design-system-telas/quickstart.md`). [CA-008]

## Fase 8 — Acabamento e encerramento

**Objetivo**: regressão visual, documentação viva, medição, validação humana e o gate de registro de IA.

- [X] T042 [P] Criar `tests/e2e/visual/entrada.visual.spec.ts` (principal, erro e offline) e `tests/e2e/visual/visao-geral.visual.spec.ts` (principal) em 360, 768 e 1920 px, no padrão de `tests/e2e/visual/menu.visual.spec.ts`; gerar as capturas **só no Linux** com `npm run test:visual:atualizar` e conferir com `npm run test:visual`. Não versionar capturas `*-win32.png` e revisar as capturas existentes que mudam por causa do novo shell [CA-008].
- [X] T043 [P] Documentar no catálogo da Spec 003: `src/design-system/docs/shell.ts` (barra superior, menu da pessoa, grade com lateral) e novo `src/design-system/docs/graficos.ts` (gráficos de linha e rosca, tabela equivalente, regras de cor e de acessibilidade), registrado em `src/design-system/docs/index.ts`; `src/design-system/docs/catalogo-completo.test.ts` continua verde [constituição VIII].
- [X] T044 [P] Atualizar `README.md` e `docs/prd.md` com a entrada renovada, a Visão geral com dados de exemplo no domínio de cilindros e o menu da pessoa, e marcar em `specs/005-login-e-visao-geral/spec.md` o status do ciclo [constituição VIII].
- [X] T045 Rodar `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run test:e2e`, `npm run build` e, se o Supabase local estiver ativo, `npm run test:live`; conferir que `package.json` e `package-lock.json` não mudaram (RNF-002). Registrar em `specs/005-login-e-visao-geral/validation.md` o resultado e as medições: medianas do shell contra 107 ms e 152 ms e o tamanho do pacote contra +5% (se passar do limite, aplicar `React.lazy` à Visão geral e medir de novo) [RNF-001 a RNF-003, MS-006].
- [X] T046 Preparar a validação humana com o roteiro 6 de [quickstart.md](./quickstart.md) e registrar em `specs/005-login-e-visao-geral/validation.md` o que Alisson Almeida validou (amostra, ambiente, duração e resultado) sem inventar informação; se não houver validação ou resultado de testes, interromper e solicitar [MS-007, `AGENTS.md`].
- [X] T047 Cumprir o gate de registro de IA do `AGENTS.md`: `git add` seletivo de código, testes e especificações (sem capturas `win32` e sem outras specs) e sem criar o commit; `npm run ia:registro -- --spec 005 --ciclo 01 --titulo "Entrada renovada e Visão geral"`; preencher o RIA em linguagem natural, com o link da branch e a pendência obrigatória de trocá-lo pelo link do PR antes do merge; `git add docs/governanca-ia`; `npm run ia:validar`; um único commit com código, testes, `docs/governanca-ia/indice.md` e o novo RIA, **sem** `Co-Authored-By` do Claude e sem `--no-verify`. Depois do merge do PR, entregar o DOCX do RIA em PR de documentação [constituição VI, `AGENTS.md`].

---

## Dependências e ordem

- **Fase 1** não depende de nada. **Fase 2** bloqueia as fases 4, 6 e 7 (fonte, estados e bloco); a Fase 3 (US1) só depende da Fase 1 e pode andar em paralelo com a Fase 2.
- **US1** não depende das outras histórias. **US2** depende da Fase 2. **US3** depende de US2 (a grade e os blocos existem). **US4** depende de US2 e da Fase 2. **US5** depende de T028 (barra superior de US2).
- **T018** (shell público) e **T028** (shell autenticado) editam o mesmo `app-shell.tsx`: T018 vem antes, T028 depois, sem paralelo.
- **T023** e **T029** só ficam verdes depois de T027 e T028.
- **Fase 8** vem por último; **T046** precede **T047**.

## Oportunidades de paralelismo

- Fase 2: T004, T005 e T006 em paralelo; depois T010 em paralelo com T008 e T009.
- Fase 3: T011, T012 e T013 em paralelo; T015 e T016 em paralelo.
- Fase 4: T020, T021 e T022 em paralelo; T024 e T025 em paralelo.
- Fase 5: T032, T033 e T035 em paralelo depois de T031.
- Fase 8: T042, T043 e T044 em paralelo.

## Estratégia de implementação

1. **MVP**: Fases 1 e 2, depois US1 (entrada) e US2 (Visão geral). Já entregam as duas telas com a identidade do produto, com dados de exemplo rotulados.
2. **Incremental**: US3 garante responsividade e acessibilidade; US4 fecha os estados e o offline; US5 completa a barra superior.
3. **Convergência**: ao fim, `/speckit-converge` compara a spec com o código antes da Fase 8.
4. **Encerramento**: T045 a T047, com a validação humana antes do RIA.
