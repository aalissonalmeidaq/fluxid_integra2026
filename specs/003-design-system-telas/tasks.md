---
description: "Tarefas executáveis da Spec 003 — Telas e design system do FluxID"
---

# Tarefas: Telas e design system do FluxID

**Entrada**: artefatos em `specs/003-design-system-telas/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD. Em cada incremento, escrever o teste, confirmar a falha esperada (RED), implementar (GREEN), refatorar e rodar a regressão antes de avançar.

**Escopo protegido**: esta Spec é só de apresentação (RN-001). Nenhum arquivo de `src/domain/`, `src/application/`, `src/infrastructure/`, `supabase/` ou de rotas, `requireAal2` e `TenantGate` muda de comportamento. Os testes da Spec 002 só podem mudar em seletores e textos de apoio (CA-007).

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode rodar em paralelo, porque não modifica os mesmos arquivos nem depende de tarefa incompleta.
- `[USN]`: história de usuário da spec (US1 a US7).
- Referências entre colchetes ligam a tarefa aos requisitos.

---

## Fase 1 — Preparação e linha de base

**Objetivo**: medir o estado atual antes de qualquer mudança visual e provar as premissas técnicas do plano.

- [X] T001A Abrir a issue da Spec 003 no GitHub (título, link da spec e escopo) e registrar o número em `specs/003-design-system-telas/plan.md`, na seção Rastreabilidade, antes de qualquer commit da implementação [constituição VI]. Concluída: issue #6.
- [X] T001 Rodar `npx playwright test tests/e2e/performance.spec.ts` e a suíte E2E atual e gravar em `specs/003-design-system-telas/baseline-desempenho.md` tamanho de JS, CSS e fontes, tempo de carregamento do shell e tempos de entrada e de confirmação de recuperação, com data, ambiente e comando [RNF-003, RNF-004, MS-007].
- [X] T002 Rodar `npm run lint`, `npm run typecheck`, `npm run test` e `npm run test:e2e` na branch atual e registrar no mesmo `baseline-desempenho.md` que a suíte da Spec 002 está verde antes do redesenho [CA-007, MS-005].
- [X] T003 Prova de conceito do Tailwind 4.3.3: em um arquivo temporário `src/design-system/poc.css`, zerar os namespaces `--color-*`, `--spacing-*`, `--text-*`, `--font-weight-*` e `--radius-*` com `initial` e confirmar por teste Vitest (`tests/contract/tailwind-theme-poc.test.ts`) que uma classe fora da escala (ex.: `p-3`, `text-sm`, `bg-slate-900`) não gera CSS. Registrar o resultado em `research.md` (D-007); se algum namespace não puder ser zerado, o teste `escalas-no-codigo` (T017) passa a ser o único bloqueio. Remover o arquivo temporário ao concluir [RNF-006].
- [X] T004 Instalar `@fontsource-variable/montserrat` com versão exata (`npm install --save-exact @fontsource-variable/montserrat`), rodar `npm audit` e registrar em `docs/ferramentas-e-skills-vendorizadas.md` pacote, versão, licença OFL-1.1 e motivo [RF-003, RF-030].
- [X] T005 Depois de T004 (ambos editam `package.json`). Criar os scripts `tokens:gerar`, `catalogo:dev`, `catalogo:build` e `test:visual` em `package.json` (apontando para os arquivos criados nas fases seguintes) e registrar o grupo em `docs/governanca-ia/scripts-package-json.json` somente se o validador de governança exigir.
- [X] T005A Em `playwright.config.ts`, adicionar os projetos Chromium `tablet-768` (viewport 768 por 1024) e `desktop-1920` (viewport 1920 por 1080), mantendo `mobile-360-chromium`; o projeto `tablet-webkit` (iPad gen 7) permanece para os testes existentes, mas não é usado nas verificações de largura de referência, pois o viewport dele não é 768 px e o WebKit não encaminha Tab no Windows [CA-001, CA-005]. Fica na Fase 1 porque as verificações de largura das Fases 4 a 10 dependem desses projetos.

---

## Fase 2 — Fundação (bloqueia todas as histórias)

**Objetivo**: tokens, contraste, escalas, utilitários de acessibilidade e componentes de estado, que todas as telas usam.

### Testes primeiro (RED)

- [X] T006 [P] Escrever `src/design-system/contrast.test.ts`: razões esperadas da spec (ex.: `#1249B8` sobre `#FFFFFF` = 7,86; `#23AFE5` sobre `#FFFFFF` = 2,52; verde vivo sobre navy = 5,46; ciano sobre navy = 4,38) com tolerância de 0,01, e função `contrastRatio(a, b)` aceitando hexadecimal [RF-004, CA-002].
- [X] T007 [P] Escrever `src/design-system/tokens.test.ts`: o teste `contraste-dos-tokens` percorre todo par `{cor, fundo, finalidade}` e exige 4,5 para `texto-normal` e 3 para `texto-grande` e `componente`; um par reprovado injetado deve fazer a verificação falhar; `decorativo` usado como texto deve falhar; texto sobre gradiente é verificado contra o ponto mais claro [CA-002, RF-005, RF-006, MS-002].
- [X] T008 [P] Escrever `src/design-system/tokens-sincronizados.test.ts`: `tokens.css` é igual à saída de `scripts/design-system/gerar-tokens-css.mjs` [RF-001].
- [X] T009 [P] Escrever `src/design-system/escalas.test.ts`: espaçamento só 4, 8, 16, 24, 32, 48 e 64; fonte só 12, 16, 24, 36, 48 e 64; peso só 300, 400, 500, 600, 700 e 800; entrelinha 100%, 125% e 150%; grade 12, 8 e 4 colunas com margens 32, 24 e 16 e calha de 16; containers 720, 960 e 1200 [RF-002, RF-003].
- [X] T010 [P] Escrever `tests/contract/escalas-no-codigo.test.ts`: varre `src/**/*.{ts,tsx,css}` (exceto testes, `src/design-system/tokens.ts` e o `src/design-system/tokens.css` gerado) e falha com hexadecimal, `rgb()`, `hsl()`, valor arbitrário do Tailwind (`[#...]`, `[Npx]`, `[Nrem]`) ou classe de cor, espaçamento e fonte fora das escalas. `brand/` e `icons/` também são varridos: neles, cores só por `currentColor` ou `var(--cor-...)` [CA-013, RNF-006].
- [X] T011 [P] Escrever `tests/contract/catalogo-fora-do-pacote.test.ts`: nenhum arquivo de `src/` nem `index.html` importa `catalogo/`, e o `vite.config.ts` não o inclui [RF-011].
- [X] T012 [P] Atualizar `tests/contract/no-external-assets.test.ts` para varrer também `catalogo/` e `src/design-system/` e confirmar que a fonte vem de `node_modules` empacotado, sem URL externa [RF-030].

### Implementação (GREEN)

- [X] T013 Implementar `src/design-system/contrast.ts` (luminância e razão WCAG) até T006 passar.
- [X] T014 Implementar `src/design-system/tokens.ts` com todos os tokens de [contracts/tokens-e-escalas.md](./contracts/tokens-e-escalas.md): cores (incluindo `#1249B8`, `ciano-acessivel` `#08709C`, `verde-acessivel` `#0F7A14`, `erro` `#B42318`, alerta, texto secundário `#5B6F84` e borda de controle `#6B7F94`), usos permitidos por cor, tipografia, espaçamento, raios, sombras, gradientes, grade e containers, até T007 e T009 passarem.
- [X] T015 Implementar `scripts/design-system/gerar-tokens-css.mjs` e gerar `src/design-system/tokens.css` (tema estrito) e `tokens-transicao.css` com o `@theme` do Tailwind (namespaces zerados conforme T003) e o `@font-face` por `@fontsource-variable/montserrat` (subconjunto latino, `font-display: swap`), até T008 passar [RF-001, RF-003].
- [X] T016 Reescrever `src/styles/globals.css` para importar `tokens-transicao.css` (só as definições, sem zerar a escala padrão do Tailwind, para as telas anteriores continuarem funcionando; a T074 troca por `tokens.css`), declarar o `@font-face` da Montserrat só com o arquivo latino, aplicar fonte, cor e fundo pelos tokens, foco de 3 px em `azul-royal` com deslocamento de 2 px, `prefers-reduced-motion: reduce` desativando toda animação e transição contínuas, e `forced-colors: active` mantendo bordas visíveis; `globals.css` não contém hexadecimal, todas as cores vêm de `var(--cor-...)` [RF-023, CA-009, CA-011].
- [X] T017 Rodar `tests/contract/escalas-no-codigo.test.ts` e registrar em lista de pendências temporária (no próprio teste, como `allowlist` por arquivo com data) as telas que ainda usam cores e medidas antigas; a lista deve chegar a vazia na Fase 10 (T074) [CA-013].
- [X] T018 [P] Atualizar `index.html` (remover `bg-slate-900 text-slate-100`, `theme-color` `#1249B8`) e `vite.config.ts` (`theme_color` `#1249B8`, `background_color` `#F3F7FA`, `woff2` em `globPatterns`), com teste em `src/app/pwa-config.test.ts` cobrindo as quatro mudanças [RNF-001, RF-015].

### Ícones necessários aos estados e aos componentes (RED → GREEN)

Os estados, o campo com erro e o alerta usam ícones; por isso o componente `Icon` e os ícones de alerta, verificado, sincronizar e sem sinal nascem na fundação.

- [X] T027 [P] Escrever `src/design-system/icons/icons.test.tsx`: existem exatamente os 30 ícones dos cinco grupos (o teste só passa por inteiro quando T035A, T035D e T035E, da Fase 3, estiverem prontas; até lá, os grupos de T035B e T035C e o componente `Icon` devem passar); todos com `viewBox="0 0 24 24"`, traço de 2, terminais arredondados e conteúdo dentro da área segura de 2 px; `Icon` aceita os tamanhos 16, 24, 32 e 48, os estados padrão, ativo, desabilitado e erro, e as variantes contorno, duotone, monocromática e negativa; sem `label` o SVG é `aria-hidden`, com `label` tem `role="img"`; cada estado atende 3:1 sobre branco e cinza-gelo; o `stroke-width` efetivo é 2 px a 16 px (3 unidades da grade) e proporcional nos demais tamanhos [RF-027, RF-028, RF-029, CA-012].
- [X] T035 Implementar o componente `Icon` com registro, tamanhos (16, 24, 32 e 48), estados, variantes e nome acessível em `src/design-system/icons/icon.tsx` e `src/design-system/icons/index.ts`, até a parte do componente de T027 passar, antes de T020, T031 e T033; os grupos de ícones (T035A a T035E) se registram nele. Cores por `currentColor` ou `var(--cor-...)`, sem hexadecimal no SVG.
- [X] T035B [P] Redesenhar os 6 ícones de segurança (escudo, lacre, bloqueio, alerta, rompimento e verificado) em `src/design-system/icons/seguranca.tsx` a partir de `specs/003-design-system-telas/referencias/03-sistema-de-iconografia.png`. Cores por `currentColor` ou `var(--cor-...)`, sem hexadecimal no SVG.
- [X] T035C [P] Redesenhar os 6 ícones de conectividade (antena, GPS, rede, nuvem, sincronizar e sem sinal) em `src/design-system/icons/conectividade.tsx` a partir de `specs/003-design-system-telas/referencias/03-sistema-de-iconografia.png`. Cores por `currentColor` ou `var(--cor-...)`, sem hexadecimal no SVG.

### Componentes de estado e utilitários (RED → GREEN)

- [X] T019 [P] Escrever `src/design-system/components/estados.test.tsx` (RED; depois de T035, T035B e T035C, pois usa o `Icon`): `Loading` com `role="status"` anunciando uma vez; `EmptyState` com título, orientação e ação; `ErrorState` com `role="alert"` e ação de tentar de novo; `SyncStatus` com os estados sincronizado, sincronizando, offline e conflito, com texto e ícone; nenhum usa só cor [RF-021, RA-003, RA-005].
- [X] T020 [P] Implementar `src/design-system/components/{loading,empty-state,error-state,sync-status,visually-hidden,skip-link}.tsx` até T019 passar; `Loading` sem animação sob movimento reduzido. Depende de T035, T035B e T035C (ícones) [RF-021, RF-023].
- [X] T021 [P] Documentar cada utilitário e estado em `src/design-system/docs/estados.ts` (descrição, variantes, estados, orientação de uso e acessibilidade) [RF-011].

**Checkpoint**: tokens, contraste e escalas verdes; estados e utilitários prontos; telas ainda no visual antigo.

---

## Fase 3 — História 1: padrão visual único e verificável (P1)

**Objetivo**: componentes base, ativos de marca, ícones e catálogo.

**Teste independente**: abrir o catálogo, conferir variantes e estados de cada componente, os 30 ícones e as versões do logotipo, e rodar a verificação de contraste.

### Testes primeiro (RED)

- [X] T022 [P] [US1] Escrever `src/design-system/components/button.test.tsx`: variantes primário, secundário e perigoso; estados normal, foco, desabilitado e carregando (`aria-busy`, clique ignorado, nome mantido); alvo mínimo de 44 px; contraste do rótulo [RF-007, RF-008].
- [X] T023 [P] [US1] Escrever `src/design-system/components/text-field.test.tsx` e `select.test.tsx`: rótulo visível por `label`, ajuda e erro ligados por `aria-describedby`, `aria-invalid`, erro com texto e ícone (não só cor), campo de arquivo, foco e desabilitado [RF-007, RF-010].
- [X] T024 [P] [US1] Escrever `src/design-system/components/dialog.test.tsx`: `role="dialog"`, `aria-modal`, `aria-labelledby` anunciando o título, foco preso, Escape fecha, foco volta ao acionador, conteúdo longo rola dentro do diálogo e as ações ficam alcançáveis [RF-009].
- [X] T025 [P] [US1] Escrever `src/design-system/components/{card,alert,status-badge,list,form-section}.test.tsx`: card com raio 12 px, padding 24 px, borda de 1 px e sombra suave nas variantes informativa, de indicador e de alerta; `Alert` com `role="alert"` (erro) ou `role="status"`; `StatusBadge` sempre com texto; `FormSection` com `fieldset` e `legend` [RF-007, RF-020].
- [X] T026 [P] [US1] Escrever `src/design-system/components/data-table.test.tsx`: `table` com `th scope`, `data-label` em cada célula, uma única árvore DOM (consulta por papel retorna cada linha uma vez), ações de 44 px, nomes longos quebram sem estourar [RF-007, RF-020, D-010].
- [X] T028 [P] [US1] Escrever `src/design-system/brand/logo.test.tsx`: versões horizontal, vertical, símbolo (256, 64, 32 e 16 px), negativa branca, principal com slogan, wordmark, monocromática azul, monocromática preta e escala de cinza; recusa largura abaixo de 120 px; nome acessível "FluxID" quando é o único identificador e decorativo ao lado do texto [RF-024, RF-025, RF-026].
- [X] T028A [US1] Depende de T036 e T038. Escrever `tests/e2e/simbolo-16px.spec.ts` no catálogo (Chromium, escala de dispositivo 1): renderizar `Symbol` a 16 px e a 64 px; exigir que (a) o número de formas conectadas (regiões com opacidade de 50% ou mais) a 16 px seja igual ao de 64 px reduzido a 16 px, (b) a cobertura de pixels opacos fique entre 20% e 80% da área e (c) nenhuma forma tenha menos de 2 px de largura. Os limites ficam em constantes do teste, calibradas com o símbolo real e revisadas por Alisson Almeida no catálogo [CA-012, RF-025].
- [X] T029 [P] [US1] Escrever `src/design-system/docs/catalogo-completo.test.ts`: todo componente exportado por `src/design-system/components/index.ts` tem documentação com `descricao`, `variantes`, `estados`, `orientacaoDeUso` e `acessibilidade`; ícones e logotipo documentados [RF-011, CA-010, MS-006, MS-009].

### Implementação (GREEN)

- [X] T030 [P] [US1] Implementar `src/design-system/components/button.tsx` até T022 passar.
- [X] T031 [P] [US1] Implementar `src/design-system/components/text-field.tsx` e `select.tsx` até T023 passar (usa o `Icon` de T035 no erro); migrar a API de `src/components/identity/form-field.tsx` para um componente compatível e manter o arquivo antigo reexportando, para os testes atuais continuarem válidos [RF-010].
- [X] T032 [P] [US1] Implementar `src/design-system/components/dialog.tsx` até T024 passar; migrar `src/components/identity/confirmation-dialog.tsx` para usá-lo, preservando suas propriedades públicas e a justificativa obrigatória da Spec 002 [RF-009].
- [X] T033 [P] [US1] Implementar `src/design-system/components/{card,alert,status-badge,list,form-section}.tsx` até T025 passar (usa o `Icon` de T035 e os ícones de T035B).
- [X] T034 [P] [US1] Implementar `src/design-system/components/data-table.tsx` até T026 passar, com a apresentação em cartões abaixo de 768 px por CSS (sem segunda árvore DOM).
- [X] T035A [P] [US1] Redesenhar os 6 ícones de rastreabilidade (localização, rota, histórico, geocerca, mapa e última leitura) em `src/design-system/icons/rastreabilidade.tsx` a partir de `specs/003-design-system-telas/referencias/03-sistema-de-iconografia.png`, na grade de 24 por 24 px, traço de 2 px e área segura de 2 px. Cores por `currentColor` ou `var(--cor-...)`, sem hexadecimal no SVG.
- [X] T035D [P] [US1] Redesenhar os 6 ícones de ativos e logística (cilindro, sensor, caminhão, armazém, entrega e inventário) em `src/design-system/icons/ativos-logistica.tsx` a partir de `specs/003-design-system-telas/referencias/03-sistema-de-iconografia.png`. Cores por `currentColor` ou `var(--cor-...)`, sem hexadecimal no SVG.
- [X] T035E [P] [US1] Redesenhar os 6 ícones de sistema (dashboard, usuário, configurações, relatórios, filtros e notificações) em `src/design-system/icons/sistema.tsx` a partir de `specs/003-design-system-telas/referencias/03-sistema-de-iconografia.png`; T027 passa por inteiro quando T035 e T035A a T035E estiverem prontas. Cores por `currentColor` ou `var(--cor-...)`, sem hexadecimal no SVG.
- [X] T036 [P] [US1] Símbolo (256, 64, 32 e 16 px) em `src/design-system/brand/symbol.tsx`, agora com o arquivo oficial `icone.svg`, idêntico em todos os tamanhos e sem versão reduzida (substituiu o redesenho em 01/10/2026). Texto original: redesenhar o símbolo em `src/design-system/brand/symbol.tsx` a partir de `specs/003-design-system-telas/referencias/02-variacoes-da-marca.png`, até T028 (parte do símbolo) e T028A passarem. Cores por variáveis dos tokens (`var(--cor-...)`), sem hexadecimal; o gradiente usa `azul-profundo`, `azul-ciano` e `verde-vivo`.
- [X] T036A [P] [US1] Assinaturas usadas no aplicativo em `src/design-system/brand/logo.tsx`: horizontal sem slogan (cabeçalho), vertical (entrada) e negativa branca (fundos azul e navy), com largura mínima de 120 px. Concluída com os arquivos oficiais da marca (`brand/oficial/`), que substituíram o redesenho em 01/10/2026; a horizontal sem slogan é derivada do arquivo principal por `scripts/design-system/gerar-variacoes-da-marca.mjs`.
- [X] T036B [P] [US1] Variações exclusivas do catálogo em `src/design-system/brand/logo-variacoes.ts` (principal com slogan, wordmark, monocromática azul, monocromática preta e escala de cinza). Concluída com os arquivos oficiais (principal e preta) e versões derivadas deles, sem redesenho (wordmark, azul e cinza).
- [X] T037 [US1] Criar `src/design-system/components/index.ts` e `src/design-system/docs/*.ts` com a documentação de cada componente, variante, estado, ícone e versão do logotipo (inclui usos incorretos e fundos aprovados), até T029 passar [RF-006A, RF-011, RF-026].
- [X] T038 [US1] Criar o catálogo: `catalogo/index.html`, `catalogo/main.tsx`, `catalogo/paginas/*.tsx` (cores com contraste e proporção de uso, tipografia, espaçamento e grade, componentes com todas as variantes e estados, ícones em todos os tamanhos, estados e variantes, logotipo, exceções) e `vite.catalogo.config.ts` com saída em `dist-catalogo/` (fora de `dist/`); incluir `catalogo/` em `tsconfig.app.json` e `vite.catalogo.config.ts` em `tsconfig.node.json`, e confirmar que `npm run typecheck` e `npm run lint` os cobrem [RF-011, RF-006A].
- [X] T039 [US1] Depende de T038. Escrever `tests/e2e/catalogo.spec.ts` e configurar em `playwright.config.ts` um segundo `webServer` para o catálogo (porta 4174): axe sem violações críticas ou graves, navegação por teclado, 30 ícones em quatro tamanhos e quatro estados visíveis, e zero requisições externas [CA-001, CA-004, CA-010].
- [X] T040 [US1] Depende de T036. Criar `scripts/design-system/gerar-icones-pwa.mjs` (rasteriza o símbolo com o Chromium do Playwright) e gerar `public/favicon.svg`, `public/icons/icon-192.png`, `icon-512.png` e `maskable-512.png`; teste em `tests/contract/icones-pwa.test.ts` conferindo dimensões e que o manifesto os referencia [RF-025].
- [X] T041 [US1] Reescrever `design-system/fluxid/MASTER.md` para apontar para `src/design-system/tokens.ts`, o catálogo e os ativos desta Spec, removendo a instrução de "reutilizar como fornecido" e a escala com 12 px, mantendo identidade e checklist de entrega [VIII documentação viva].

**Checkpoint**: catálogo completo e testado; componentes prontos para as telas.

---

## Fase 4 — História 2: shell consistente e acessível (P1)

**Objetivo**: um shell único para toda tela, autenticada ou não.

**Teste independente**: abrir a aplicação deslogada e logada em 360 px e em largura ampla e navegar só pelo teclado.

- [X] T042 [P] [US2] Escrever `src/app/shell/app-shell.test.tsx` (RED): link "Pular para o conteúdo principal" é o primeiro item de Tab e leva o foco ao `main`; um único landmark `main` com `id="main-content"`; cabeçalho com logotipo horizontal; barra de conexão com `role="status"` e botão de reconectar quando offline, inclusive deslogado; deslogado sem dado de tenant; autenticado com organização ativa, perfil e sair; `document.documentElement.lang` igual a `pt-BR` [RF-012, RF-013, RF-014, RA-002, RA-004].
- [X] T043 [P] [US2] Escrever `tests/e2e/app-shell.spec.ts` (atualizar o existente, só seletores) cobrindo as três larguras (360, 768 e 1920 px), ausência de rolagem horizontal, organização ativa, perfil e sair acessíveis em 360 px, botão de instalar PWA com alvo de 44 px e contraste, e reflow a 320 px [CA-005, RF-015].
- [X] T044 [US2] Implementar `src/app/shell/{app-shell,header,connection-bar,footer}.tsx` com os componentes do design system, migrando `src/components/system/ConnectivityStatus.tsx` e `src/app/tenant/tenant-indicator.tsx` para o novo visual sem mudar propriedades públicas, até T042 passar.
- [X] T045 [US2] Refatorar `src/app/App.tsx` para compor `AppShell` e as rotas, preservando `ADMIN_ROUTES`, `requireAal2`, `tenantScoped`, `ProtectedRoute` e `TenantGate`; rodar `src/app/App.test.tsx` e `tests/e2e/app-shell.spec.ts` sem mudar verificações de comportamento [RF-012, RN-001, CA-007].
- [X] T046 [P] [US2] Documentar o shell (anatomia, estados online, offline e sincronizando) em `src/design-system/docs/shell.ts`, sem alterar arquivos de `src/app/shell/` [RF-011].

**Checkpoint**: shell aplicado a todas as rotas; suíte da Spec 002 ainda verde.

---

## Fase 5 — História 3: entrar, recuperar o acesso e confirmar o segundo fator (P1)

**Objetivo**: telas `login-page`, `recovery-request-page`, `recovery-confirm-page`, `mfa-page` e `active-sessions-dialog` no padrão.

**Teste independente**: percorrer cada fluxo da Spec 002 e confirmar resultado idêntico.

- [X] T047 [P] [US3] Atualizar `src/pages/auth/login-page.test.tsx`, `recovery-pages.test.tsx` e `mfa-page.test.tsx` só em seletores e textos de apoio e acrescentar os testes de apresentação (RED): somente e-mail, senha, entrar e recuperar acesso (nenhum login social, SSO, "lembrar de mim" ou cadastro); mensagem genérica idêntica para credencial inválida, anunciada e com foco no campo correto; mesma mensagem na recuperação exista ou não a conta; diálogo de sessões prende o foco, fecha com Escape e devolve o foco [RF-016, RF-018, RF-019].
- [X] T048 [US3] Refazer `src/pages/auth/login-page.tsx` com `Logo` vertical, `TextField`, `Button` e `Alert`, sem alterar chamadas à camada `application/`, campos, validações nem mensagens de segurança [RF-017, RF-018, RN-002].
- [X] T049 [P] [US3] Refazer `src/pages/auth/recovery-request-page.tsx` e `recovery-confirm-page.tsx` com os componentes do padrão e estados de carregamento, erro e sucesso confirmado pelo servidor [RF-016, RF-022].
- [X] T050 [P] [US3] Refazer `src/pages/auth/mfa-page.tsx` (verificação e configuração do segundo fator) com os componentes do padrão [RF-016].
- [X] T051 [P] [US3] Refazer `src/pages/auth/active-sessions-dialog.tsx` com `Dialog` e `List`, mantendo a exigência de encerrar uma sessão explícita [RF-009].
- [X] T052 [US3] Atualizar `tests/e2e/auth-session.spec.ts` e `tests/e2e/password-recovery.spec.ts` (só seletores e textos de apoio) e adicionar o percurso só por teclado do fluxo de entrada e recuperação nas três larguras [CA-006, MS-004].
- [X] T053 [US3] Executar `src/pages/auth/*.test.tsx`, `tests/integration/session-limit.live.test.ts` e `mfa.live.test.ts` e confirmar que nenhuma verificação de comportamento foi alterada (revisar `git diff` dos testes) [CA-007].

---

## Fase 6 — História 4: escolher a organização e manter o perfil (P2)

**Teste independente**: com dois vínculos, escolher cada organização e confirmar que os dados pertencem só à escolhida; atualizar o nome e enviar uma foto válida e uma inválida.

- [X] T057 [P] [US4] Atualizar `src/pages/auth/tenant-selection-page.test.tsx` e `src/pages/profile/profile-page.test.tsx` (só seletores) e acrescentar (RED): o foco inicia no título; cada opção é operável só pelo teclado; arquivo inválido gera erro anunciado e nada é enviado; troca de organização remove o conteúdo anterior [RF-016, RA-006].
- [X] T058 [US4] Refazer `src/pages/auth/tenant-selection-page.tsx` com `List`, `Card` e `Button`, mantendo o `TenantGate` e a limpeza do contexto anterior [RF-016, RN-001].
- [X] T059 [US4] Refazer `src/pages/profile/profile-page.tsx` (nome, foto e envio de arquivo) com `TextField`, `FormSection` e `Alert`, sem mudar validações nem o fluxo de envio do avatar [RF-016, RF-017].
- [X] T060 [US4] Atualizar `tests/e2e/tenant-selection.spec.ts` e `tests/e2e/profile.spec.ts` (só seletores) e adicionar a verificação de que nenhum dado da organização anterior permanece visível após a troca [CA-007].

---

## Fase 7 — História 5: administrar organizações, membros e papéis (P2)

**Teste independente**: em 360 px e em largura ampla, executar convidar, bloquear e reativar um vínculo, criar e desativar um papel e criar uma organização.

- [X] T061 [P] [US5] Atualizar `tenants-dashboard-page.test.tsx`, `tenant-members-page.test.tsx` e `tenant-roles-page.test.tsx` (só seletores) e acrescentar (RED): lista vira cartão em 360 px sem perda de informação nem de ação; diálogo de confirmação exige a justificativa já prevista, prende o foco e o devolve; área restrita mostra a mensagem de acesso negado existente no padrão [RF-016, RF-020].
- [X] T062 [US5] Refazer `src/pages/admin/tenants-dashboard-page.tsx` com `DataTable`, `FormSection`, `Dialog` e `StatusBadge`, sem mudar permissões nem ações [RF-016, RF-017].
- [X] T063 [US5] Refazer `src/pages/admin/tenant-members-page.tsx` (membros, convite, bloqueio e reativação) com os componentes do padrão, mantendo a justificativa obrigatória [RF-016, RF-017].
- [X] T064 [US5] Refazer `src/pages/admin/tenant-roles-page.tsx` (papéis e permissões, 324 linhas) dividindo o formulário longo em seções na mesma página com um único envio, sem etapas [RF-020, RN-001].
- [X] T065 [US5] Atualizar `tests/e2e/organizations.spec.ts`, `tenant-members.spec.ts` e `rbac.spec.ts` (só seletores) e acrescentar verificação em 360 px de cartões, nomes longos sem estouro e ações de 44 px [CA-003, CA-005, CA-007].

---

## Fase 8 — História 6: consultar a auditoria (P3)

**Teste independente**: aplicar filtros válidos e inválidos e carregar mais eventos, em 360 px e em largura ampla.

- [X] T066 [P] [US6] Atualizar `src/pages/admin/tenant-audit-log-page.test.tsx` (só seletores) e acrescentar (RED): filtros inválidos geram erro associado ao campo, anunciado e sem consulta; consulta sem eventos mostra `EmptyState` com orientação [RF-016, RF-021].
- [X] T067 [US6] Refazer `src/pages/admin/tenant-audit-log-page.tsx` (auditoria do tenant e da plataforma, 265 linhas) com `DataTable`, `TextField`, `Select`, `EmptyState` e carregar mais, sem alterar filtros, paginação nem consultas [RF-016, RF-017].
- [X] T068 [US6] Atualizar `tests/e2e/audit-log.spec.ts` (só seletores) e conferir tabela na largura ampla e lista em 360 px [CA-007].

---

## Fase 9 — História 7: feedback de carregamento, vazio, erro, offline e sincronização (P2)

**Objetivo**: garantir o vocabulário único em todo fluxo já migrado e tratar o offline e a sincronização de ponta a ponta.

**Teste independente**: forçar cada estado em cada tela migrada e conferir aparência, texto e anúncio.

- [X] T054 [P] [US7] Escrever `tests/e2e/estados.spec.ts` (verificação; deve passar ao fim da fase): operação sensível sem rede mostra erro de conexão e nenhuma confirmação de sucesso; carregamento anunciado uma vez e sem bloquear o teclado; com `prefers-reduced-motion: reduce`, `document.getAnimations()` não retorna animação em execução; na volta da rede o indicador volta ao normal sem apagar o texto digitado [RF-021, RF-022, RF-023, CA-009].
- [X] T055 [US7] Verificar que todas as telas migradas nas Fases 5 a 8 usam `Loading`, `EmptyState`, `ErrorState` e `SyncStatus`; corrigir as que ainda não usam, até T054 passar com todas as telas [RF-021].
- [X] T056 [P] [US7] Escrever o teste de diálogo aberto com sessão expirada ou rede perdida (estado informado, sem confirmação falsa e sem perda desorientadora de foco) em `tests/e2e/estados.spec.ts` [casos de borda].

---

## Fase 10 — Verificações transversais

**Objetivo**: provar os critérios que valem para todas as telas.

- [X] T070 [P] Escrever `tests/e2e/telas-transversais.spec.ts` que, para cada tela, executado nos projetos `mobile-360-chromium`, `tablet-768` e `desktop-1920` de T005A (largura conferida por asserção no início de cada teste), confere: axe sem violações críticas ou graves (moderadas e leves listadas no relatório sem bloquear); zero requisições a domínio diferente de `localhost` e `127.0.0.1`; `scrollWidth` igual a `clientWidth` e com zoom de 200% (viewport equivalente a 320 px); alvo de 44 por 44 px em todo controle (exceto link em linha) [CA-001, CA-003, CA-004, CA-005, MS-001, MS-003].
- [X] T071 [P] Escrever `tests/e2e/teclado-e-contraste-de-foco.spec.ts`: todas as funções das histórias 1 a 6 operáveis só pelo teclado, anel de foco com 3:1 ou mais, sem armadilha de foco [CA-006, MS-004].
- [X] T072 [P] Escrever `tests/e2e/cores-forcadas.spec.ts` com `forced-colors: active`: controles, bordas e estados visíveis e distinguíveis [CA-011].
- [X] T073 [P] Escrever `tests/e2e/escalas-no-navegador.spec.ts`: lê estilos computados de cada tela e confere tamanhos e pesos de fonte, margens, calhas, containers e espaçamentos nas escalas dos tokens [CA-013].
- [X] T074 Trocar o import de `src/styles/globals.css` para `tokens.css` (tema estrito) e remover `tokens-transicao.css` do gerador e dos testes. Esvaziar a `allowlist` de `tests/contract/escalas-no-codigo.test.ts` (T017) corrigindo toda cor, medida ou fonte fora dos tokens restante em `src/`, e confirmar que a cor `#1249BB` não existe mais no código [CA-013, RNF-006, D-001].
- [X] T075 Executar a validação em dispositivos: com a rede lenta ou offline no primeiro acesso a fonte cai na reserva sem quebrar o layout, teclado virtual aberto em tela pequena mantém campo e erro visíveis, e diálogo com conteúdo longo em 360 por 640 px (retrato e paisagem) rola por dentro; registrar o resultado em `specs/003-design-system-telas/validation.md` [RNF-002, RNF-005, casos de borda].
- [X] T075A Acrescentar em `tests/e2e/pwa.spec.ts` o cenário offline: depois da primeira visita com o service worker ativo, recarregar sem rede e confirmar que o shell abre, que a Montserrat vem do precache (`document.fonts.check` verdadeiro) e que nenhuma requisição externa é tentada [RNF-001, RF-030].

---

## Fase 11 — Linha de base visual

- [X] T076 [P] Escrever `tests/e2e/visual/telas.visual.spec.ts` e `tests/e2e/visual/catalogo.visual.spec.ts` com `toHaveScreenshot` (`maxDiffPixelRatio: 0.001`, animações desativadas, fonte aguardada) para cada tela e página do catálogo em 360, 768 e 1920 px e nos estados principais (principal, erro, vazio, carregando e offline), somente Chromium [CA-008].
- [X] T077 Gerar as capturas de referência no Linux (contêiner oficial do Playwright ou job do CI) e documentar o comando de atualização em `specs/003-design-system-telas/quickstart.md` [CA-008, D-006].
- [X] T078 Obter a aprovação de Alisson Almeida da linha de base visual e registrá-la na revisão do PR; sem a aprovação, as capturas não passam a bloquear regressões [CA-008, MS-008].
- [X] T079 [P] Atualizar `.github/workflows/quality.yml` com os passos de build do catálogo, `test:visual` e `test:e2e` nos projetos novos, instalando só Chromium para o visual [VII qualidade verificável].

---

## Fase 12 — Acabamento, desempenho e encerramento

- [X] T080 Medir novamente o carregamento do shell, o tempo de entrada e o de recuperação e registrar em `baseline-desempenho.md` a comparação com T001; falhar o ciclo se o shell piorar mais de 20% ou se entrada e recuperação piorarem [RNF-003, RNF-004, MS-007].
- [X] T081 Rodar `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:coverage` (mantendo os limites de `vitest.config.ts`), `npm run test:e2e`, `npm run test:visual`, `npm run test:live` com o Supabase local e `npm run build`, e confirmar que `dist/` não contém o catálogo [CA-007, MS-005].
- [ ] T082 Rodar `/speckit-converge` e `/speckit-analyze` e resolver as divergências entre spec, plano, tarefas e código.
- [X] T083 Conduzir a validação humana de Alisson Almeida (MS-008): fidelidade das telas, do logotipo e dos ícones às pranchas, legibilidade do símbolo de 16 px, leitura das tabelas em cartão com leitor de tela, ausência de elemento que pisque mais de três vezes por segundo em qualquer tela (RA-007) e aprovação da linha de base, registrando amostra, ambiente, duração e resultado em `specs/003-design-system-telas/validation.md`, sem inventar informação. Concluída em 01/10/2026: aprovação declarada por Alisson Almeida; a duração da validação não foi informada, e o registro está em `validation.md` e no RIA-018.
- [X] T084 Atualizar `docs/prd.md` e `docs/documento-visao.md` onde mencionarem a identidade visual ou o design system, para refletir os ativos e o catálogo desta Spec [VIII documentação viva]. Concluída: só o `docs/prd.md` precisou mudar (seção 13: identidade visual, formulários em seções e catálogo próprio no lugar do Storybook); o `docs/documento-visao.md` não menciona identidade visual nem design system, então ficou sem alteração.
- [X] T085 Encerrar o ciclo pelo gate do `AGENTS.md`: `git add` de código e testes sem commit; `npm run ia:registro -- --spec 003 --ciclo NN --titulo "Telas e design system do FluxID"`; preencher a validação humana de T083 sem inventar dados; `git add docs/governanca-ia`; `npm run ia:validar`; commit único. O RIA usa o link da branch até existir o PR, com a troca pelo link do PR registrada como pendência obrigatória antes do merge. Concluída: RIA-018 e commit 059afa7; link trocado pelo do PR #7.

---

## Dependências e ordem

- Fase 1 antes de tudo (T001 e T002 medem o estado antes de mudar qualquer arquivo).
- Fase 2 bloqueia as demais; T003 antecede T014 e T015.
- Fase 3 (US1) bloqueia as fases 4 a 9, porque as telas usam os componentes, os ícones e os estados (estes vêm da Fase 2).
- Fase 4 (US2, shell) antes das telas, pois todas são exibidas dentro dele.
- Fases 5, 6, 7 e 8 (telas) são independentes entre si após a Fase 4 e podem seguir em paralelo.
- Fase 9 (US7) depende das Fases 5 a 8, pois verifica os estados em todas as telas migradas.
- Fase 10 depende da Fase 9; Fase 11 depende da Fase 10; Fase 12 por último.

## Oportunidades de paralelismo

- Fase 2: T006 a T012 (testes) e T019 a T021 em paralelo entre si, estes depois de T035, T035B e T035C.
- Fase 3: T022 a T026, T028, T028A e T029 (testes) em paralelo; T030 a T036B (implementações em arquivos distintos, com T035A, T035D e T035E depois do `Icon` de T035, que já está na Fase 2) em paralelo; T039 e T040 em paralelo entre si, depois de T038 e T036 respectivamente.
- Fases 5, 6, 7 e 8: cada tela é independente após a Fase 4.
- Fase 10: T070 a T073 em paralelo.

## Estratégia de implementação

1. **MVP**: Fases 1 a 3 (história 1) entregam tokens, contraste, componentes, ativos e catálogo, já verificáveis.
2. **Incremento 2**: Fases 4 e 5 (histórias 2 e 3) entregam o shell e a porta de entrada, a tela mais exposta.
3. **Incremento 3**: Fases 6 a 8 (histórias 4, 5 e 6) migram as demais telas, uma por vez, com a suíte da Spec 002 verde a cada migração; a Fase 9 (história 7) fecha os estados em todas elas.
4. **Fechamento**: Fases 10 a 12 provam os critérios transversais, aprovam a linha de base e encerram o ciclo com o RIA.

Regra de segurança da migração: nenhuma tela é migrada sem a suíte da Spec 002 correspondente verde antes e depois, e nenhum arquivo de domínio, aplicação ou infraestrutura é tocado.
