---
description: "Tarefas executáveis da Spec 011 — Landing page institucional do FluxID"
---

# Tarefas: Landing page institucional do FluxID

**Entrada**: artefatos em `specs/011-landing-page-institucional/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD. Em cada incremento, escrever o teste, confirmar a falha esperada (RED), implementar (GREEN), refatorar e rodar a regressão antes de avançar.

**Escopo protegido**:
- Fora desta spec: formulário de contato, newsletter, analytics, cookies, blog, outro idioma, área de preços e qualquer mudança no aplicativo de campo ou no servidor [spec.md, Premissas].
- **Nenhuma dependência nova** em `package.json` [plan.md]. Movimento só com CSS e `IntersectionObserver`. A otimização das imagens usa ferramenta já disponível; se faltar ferramenta de conversão, as imagens são convertidas uma única vez fora do repositório e as saídas são versionadas, sem dependência nova [research.md §6].
- **Nenhuma mudança no servidor**: sem migration, Edge Function, RLS nem chamada de rede para renderizar a landing [RF-002, RF-014].
- **Nenhum recurso de terceiros na abertura**: sem `iframe`, script, fonte ou imagem remota; links externos só são acessados quando ativados [RNF-007].
- **Nenhum segredo, token ou credencial** no repositório ou na página [RNF-009]; os links são públicos.
- Conteúdo **sem dado inventado**: cada funcionalidade cita a spec de origem (002 a 010) [spec.md, História 2].
- Arquivos alheios à spec (`.gitignore` local e outros modificados fora desta spec) **não** entram nos commits; usar `git add` explícito.

**Convenções de interface** (AGENTS.md, Spec 005): usar as skills `ui-ux-pro-max` e `impeccable` ao criar a página; só tokens (nenhum valor arbitrário do Tailwind, cor literal ou transição que atrase o anel de foco; o teste `tests/contract/escalas-no-codigo.test.ts` reprova); movimento respeita `prefers-reduced-motion`; o conteúdo ocupa toda a largura, sem container máximo; capturas visuais regeneradas no Linux (`npm run test:visual:atualizar`), nunca `*-win32.png`; antes de rodar E2E, `npm run build`.

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode rodar em paralelo, porque não modifica os mesmos arquivos nem depende de tarefa incompleta.
- `[USN]`: história de usuário da spec (US1 a US6, na ordem das histórias 1 a 6).
- Referências entre colchetes ligam a tarefa aos requisitos e critérios da spec.

## Mapa das histórias

| História | Prioridade | Entrega |
|---|---|---|
| US1 | P1 | Entender o projeto e entrar no sistema: rota `/`, abertura, botão por sessão |
| US2 | P1 | Conhecer o que o sistema faz: seções de conteúdo fiel às Specs 002 a 010 |
| US3 | P1 | Acessar documentos e materiais: 8 links, cartões de vídeo sem player de terceiros |
| US4 | P2 | Mascote e marca: imagens otimizadas, usos, movimento e reduzir movimento |
| US5 | P1 | Qualquer aparelho, teclado e leitor de tela: AA, responsividade, metadados |
| US6 | P1 | Não prejudicar o aplicativo: pacote de entrada, PWA e offline |

---

## Fase 1: Preparação

- [X] T001 Medir e registrar a linha de base em `specs/011-landing-page-institucional/baseline.md`: `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run build` e o tamanho de `dist/assets/index-*.js` (medido em 14/10/2026: 597.791 bytes; limite desta spec **609.747 bytes**, +2%) [RNF-003]. Rodar fora da janela das 00:00 às 03:00 UTC.
- [ ] T002 [P] Conferir a abertura da issue desta spec e a branch `feat/011-landing-page-institucional` (Constituição VI); registrar o número da issue em `baseline.md`. Se não houver issue, perguntar à pessoa responsável antes de seguir.
- [X] T003 [P] Rodar as skills de design (`ui-ux-pro-max` para sistema de design e `impeccable` para direção) com o briefing da spec (abertura escura e vibrante, mascote, B2B logístico, tokens da Spec 005) e gravar as decisões de layout, hierarquia e movimento em `specs/011-landing-page-institucional/design.md` (paleta só com tokens existentes, pares de contraste, grade de seções, ritmo claro/escuro).

## Fase 2: Fundação (bloqueia todas as histórias)

**Objetivo**: liberar `/` para a landing sem quebrar nada do que já existe, e criar a fonte de conteúdo.

### Testes primeiro (RED)

- [X] T004 [P] Teste de contrato `tests/contract/rota-raiz.test.ts`: `screenByPath('/visao-geral')` devolve a tela `inicio`; `screenByPath('/')` devolve `undefined`; nenhum arquivo de `src/` usa `href="/"`, `window.location.assign('/')` ou `'/?` como Visão geral; o manifesto do PWA tem `start_url: '/visao-geral'` [contracts/rotas-e-pwa.md].
- [X] T005 [P] Teste unitário `src/app/App.landing.test.tsx`: em `/`, renderiza a landing (lazy) **sem** `ProtectedRoute`, `TenantGate` nem `AppShell`; em `/visao-geral` renderiza a Visão geral protegida; em `/login` e em rota desconhecida o desvio final continua mostrando o login a quem não tem sessão; com sessão autenticada em `/login`, a URL passa a `/visao-geral` sem recarregar e o item "Visão geral" do menu fica marcado como atual [RF-001, RF-003, RF-004, RF-015].
- [X] T006 [P] Teste de contrato `tests/contract/landing-links.test.ts` com as regras 1 a 7 de [contracts/conteudo-e-links.md]: exatamente 8 materiais, `id` e `url` únicos, `https` e domínios permitidos, `origem` de funcionalidade entre `002` e `010`, sem número de clientes, depoimento, preço nem "em breve", sem padrão de segredo [RF-006, RF-007, RNF-009].

### Implementação (GREEN)

- [X] T007 Criar a constante `VISAO_GERAL = '/visao-geral'` em `src/domain/navigation/screens.ts` e trocar a tela `inicio` (`path: '/'` para `VISAO_GERAL`); exportar a constante para uso em código e testes [RF-004].
- [X] T008 [P] Atualizar `src/app/shell/logo-link.tsx` (`href` e `title`) e os testes do shell para apontar à Visão geral em `/visao-geral` [RF-004].
- [X] T009 [P] Trocar `window.location.href = '/?recovery=1'` por `/login?recovery=1` em `src/pages/auth/recovery-confirm-page.tsx` e ajustar `src/pages/auth/recovery-pages.test.tsx` (o login já lê `recovery=1`) [RF-004].
- [X] T010 Em `src/app/App.tsx`, adicionar o caso `pathname === '/'` antes dos `ProtectedRoute`, com `LandingPage` em `lazy` + `Suspense` com `RouteFallback`; mover o caso final da Visão geral para `pathname === VISAO_GERAL`, mantendo o desvio final para rotas desconhecidas; **quando a página abre em modo instalado (`window.matchMedia('(display-mode: standalone)').matches`), `/` redireciona para `VISAO_GERAL` com `replace`**, cobrindo as instalações feitas com o `start_url` antigo [RF-001, RNF-008, História 6 cenário 2, plan.md decisões 1 e 9].
- [X] T011 Alterar `start_url` para `/visao-geral` em `vite.config.ts` e ajustar `src/app/pwa-config.test.ts` e `tests/e2e/pwa.spec.ts` [RNF-008, contracts/rotas-e-pwa.md].
- [X] T012 Criar `src/pages/landing/landing-content.ts` com os tipos e os dados de [data-model.md]: `MATERIAIS` (os 8 links de [contracts/conteudo-e-links.md], `tipo`, `descricao` com aviso de permissão nas pastas), `FUNCIONALIDADES` (cada uma com `origem`), `ETAPAS` (5), `SECOES` (âncora, título, tema). Textos em português do Brasil, no presente, sem número inventado [RF-005, RF-007].
- [X] T013 Troca mecânica dos testes que assumem a Visão geral em `/`: nos 15 pontos de `src/**/*.test.ts*` e nos 89 `goto('/')` de `tests/e2e/**` (53 arquivos), usar `VISAO_GERAL` (ou `paginaInicial()` em `tests/e2e/support/`); conferir por busca que não sobrou `goto('/')` nem `'/?`; rodar `npx vitest run` e `npx playwright test --project=desktop-chromium` sem regressão [RF-004].
- [X] T014 Confirmar RED→GREEN de T004 a T006 e a regressão `npx vitest run`.

**Ponto de verificação**: `/` renderiza uma landing mínima, `/visao-geral` é a Visão geral, todo o resto continua igual.

---

## Fase 3: História 1 (P1) — Entender o projeto e entrar no sistema

**Meta**: abertura forte, botão por sessão, atalhos do cabeçalho.

**Teste independente**: abrir `/` sem sessão em 360 e 1440 px, ler a chamada sem rolar e tocar em "Entrar no sistema" até `/login`; com sessão, "Abrir o sistema" leva a `/visao-geral`.

### Testes primeiro (RED)

- [X] T015 [P] [US1] `src/pages/landing/landing-cta.test.tsx`: `authenticated` mostra "Abrir o sistema" (`href="/visao-geral"`); `signed_out`, `mfa_required` e verificação mostram "Entrar no sistema" (`href="/login"`); a largura mínima do botão não muda na troca (sem deslocar o layout); o botão é um link acessível por Enter e Espaço [RF-003, História 1].
- [X] T016 [P] [US1] `src/pages/landing/sections/hero.test.tsx`: um único `h1`; chamada, subtítulo e botão principal presentes; botão secundário "Conhecer os materiais" para `#materiais`; mascote com `alt` (T041) [RF-005, RF-010].
- [X] T017 [P] [US1] `src/pages/landing/landing-header.test.tsx`: logotipo, âncoras (`#funcionalidades`, `#offline`, `#seguranca`, `#materiais`) e botão por sessão; "Pular para o conteúdo" é o primeiro elemento focável; no celular o cabeçalho cabe em 360 px sem rolagem horizontal [RF-010].
- [X] T018 [P] [US1] `tests/e2e/landing.spec.ts` (esqueleto, cenários 1 a 3 da História 1) com `mock` de sessão em `tests/e2e/support/`: visitante entra no sistema; usuário autenticado abre o sistema; rota interna sem sessão continua indo ao login [História 1, cenário 4].

### Implementação (GREEN)

- [X] T019 [US1] `src/pages/landing/landing-cta.tsx`: lê `useAuth().state.status` e devolve o link correto, com largura mínima fixa [RF-003, plan.md decisão 3].
- [X] T020 [US1] `src/pages/landing/landing-header.tsx` e `landing-footer.tsx` (logotipo do design system, âncoras, `SkipLink`, links legais mínimos sem coleta de dados) [RF-005, RF-010].
- [X] T021 [US1] `src/pages/landing/sections/hero.tsx` (abertura escura e vibrante com brilhos em camada decorativa `aria-hidden`, chamada principal, subtítulo, botões, espaço reservado para o mascote com `width`/`height`) usando o `design.md` de T003 [RF-005, plan.md decisão 8].
- [X] T022 [US1] `src/pages/landing/landing-page.tsx` (monta cabeçalho, seções por `SECOES`, rodapé; `main` com `id="main-content"`; atualiza `document.title`) e `src/pages/landing/landing.css` (só classes com tokens) [RF-001, RF-010].
- [X] T022a [US1] Em `src/app/App.tsx`, quando a sessão estiver `authenticated` e `pathname === '/login'`, trocar a URL para `VISAO_GERAL` com `window.history.replaceState` (sem recarregar a página), para o endereço, o destaque do menu e o recarregamento refletirem a Visão geral [RF-003, RF-004, História 1].
- [X] T023 [US1] Rodar T015 a T018 e a regressão (GREEN).

---

## Fase 4: História 2 (P1) — Conhecer o que o sistema faz

**Meta**: seções empolgantes e fiéis ao produto, com prévias ilustradas "Exemplo".

**Teste independente**: percorrer a página e conferir que cada bloco corresponde a uma capacidade das Specs 002 a 010.

### Testes primeiro (RED)

- [X] T024 [P] [US2] `src/pages/landing/sections/sections.test.tsx`: ordem das seções (proposta, problema, solução em etapas, funcionalidades, offline, segurança, materiais, chamada final); um `h2` por seção e sem salto de nível; cada funcionalidade e etapa vem de `landing-content.ts` [RF-005, História 2 cenário 1].
- [X] T025 [P] [US2] `src/pages/landing/previews.test.tsx`: toda prévia ilustrada tem o selo "Exemplo", `role="img"` com descrição textual equivalente, nenhum dado real de cliente, e vem de uma fonte substituível (`landing-content.ts`) [RF-013, História 2 cenário 3].

### Implementação (GREEN)

- [X] T026 [P] [US2] `sections/proposta.tsx` e `sections/problema.tsx` (o que é o FluxID, para quem, por que importa), com os textos de `landing-content.ts`.
- [X] T027 [P] [US2] `sections/solucao.tsx` (5 etapas do caminho do cilindro) e `sections/funcionalidades.tsx` (cartões por funcionalidade com ícone do design system, sem imagem de terceiros).
- [X] T028 [P] [US2] `sections/offline.tsx` (fila offline, sincronização, fotos e assinatura, Spec 010) e `sections/seguranca.tsx` (isolamento por organização, perfis, auditoria; sem prometer o que não existe).
- [X] T029 [P] [US2] `src/pages/landing/previews/` com 3 prévias ilustradas montadas com componentes e tokens do sistema (viagem com paradas, leitura de cilindros, fila offline), dados "Exemplo" vindos de `landing-content.ts` [RF-013].
- [X] T030 [US2] Revisar todos os textos contra as Specs 002 a 010 (tabela texto → spec em `design.md`) e corrigir qualquer afirmação sem base; conferir também que todo o texto está em português do Brasil, em linguagem clara e sem jargão desnecessário [RNF-010]; rodar T024 e T025 (GREEN).

---

## Fase 5: História 3 (P1) — Acessar documentos e materiais

**Meta**: 8 links claros, seguros e leves.

**Teste independente**: ativar cada link e conferir destino correto em nova aba, com indicação de link externo.

### Testes primeiro (RED)

- [X] T031 [P] [US3] `src/pages/landing/sections/materiais.test.tsx`: renderiza exatamente os 8 destinos com nome, descrição e ícone; todo link tem `target="_blank"`, `rel="noopener noreferrer"` e texto acessível "abre em nova aba"; vídeos são cartões com miniatura desenhada em CSS/SVG; **nenhum `iframe` nem `script` de terceiros**; offline, links externos exibem "precisa de conexão" [RF-006, RF-008, História 3].
- [X] T032 [P] [US3] `tests/contract/landing-sem-terceiros.test.ts`: o HTML e o CSS gerados em `dist/` para a landing não referenciam hosts de terceiros além dos links de `<a>`; `index.html` não tem rastreador [RNF-007].

### Implementação (GREEN)

- [X] T033 [P] [US3] `sections/materiais.tsx` com destaque para "Documentos do projeto", grade de repositórios e evidências, e cartões de vídeo (`video-card.tsx`) com a miniatura desenhada em CSS/SVG e rótulo "abre no YouTube" [RF-006, RF-008].
- [X] T034 [P] [US3] `src/pages/landing/use-online.ts` (hook leve sobre `navigator.onLine` e eventos) para o aviso offline dos links externos [RNF-008].
- [X] T035 [P] [US3] Montar a miniatura dos 3 vídeos como cartões de marca desenhados em CSS/SVG com tokens (símbolo do FluxID, ícone de vídeo e título), sem imagem de terceiros e sem arquivo binário; registrar o `tipo: 'video'` em `landing-content.ts` [plan.md decisão 5].
- [X] T036 [US3] Rodar T031 e T032 (GREEN); abrir cada link manualmente e anotar o resultado em `validation.md`.
- [X] T036a [US3] Crítica de design de 14/10/2026 (P1): faixa "Veja o FluxID em ação" logo depois da abertura, com os vídeos do pitch e do protótipo do sistema como palco grande (`sections/em-acao.tsx`, `video-destaque.tsx`, `DESTAQUES_EM_ACAO` em `landing-content.ts`); a segunda ação da abertura passa a levar a ela. Testes: `em-acao.test.tsx`, `landing-page.test.tsx`, `landing-links.test.ts`, E2E em `landing.spec.ts`.
- [X] T036b [US2] Pedido de 14/10/2026: telas reais do sistema no lugar das prévias ilustradas de viagem e de leitura. Gerador sob demanda `tests/e2e/landing-telas.gerar.spec.ts` (`GERAR_TELAS_LANDING=1`) grava `public/landing/telas/tela-viagem-desktop.webp` e `tela-campo-celular.webp` a partir do aplicativo com o backend simulado (dados fictícios); `TELAS` em `landing-content.ts`, `sections/tela-do-sistema.tsx` e o palco de `sections/funcionalidades.tsx`; saem `previa-de-viagem` e `previa-de-leitura` (a fila offline segue ilustrada). Testes: `tela-do-sistema.test.tsx`, `sections.test.tsx` e `landing-links.test.ts`.

---

## Fase 6: História 4 (P2) — Mascote e marca

**Meta**: o mascote como personagem, leve e sem atrapalhar a leitura.

**Teste independente**: ver o mascote na abertura e em, no máximo, dois outros momentos, com texto alternativo; ligar "reduzir movimento" e confirmar que nada se move.

### Testes primeiro (RED)

- [X] T037 [P] [US4] `src/pages/landing/mascote.test.tsx`: `<picture>` com AVIF, WebP e PNG de reserva, `width`/`height` definidos, `alt` descritivo quando informativo e `alt=""` quando decorativo; `fetchpriority="high"` só na abertura e `loading="lazy"` nos demais; no evento `error` mostra o logotipo sem quebrar o layout; no máximo 3 usos na página [RF-009, casos de borda].
- [X] T038 [P] [US4] `src/pages/landing/use-reveal.test.ts`: com `prefers-reduced-motion: reduce` as seções nascem visíveis e nenhum observador é criado; sem a preferência, revela ao entrar na tela; sem `IntersectionObserver`, tudo visível [RF-012].
- [X] T039 [P] [US4] `tests/contract/landing-movimento.test.ts`: `landing.css` só anima `transform` e `opacity`, toda animação está dentro de `@media (prefers-reduced-motion: no-preference)` e nenhuma transição atrasa o anel de foco [RF-012, RNF-006].

### Implementação (GREEN)

- [X] T040 [US4] `scripts/landing/otimizar-imagens.mjs` + gerar `public/landing/mascote-{480,768,1200}.{avif,webp,png}` a partir de `specs/011-landing-page-institucional/assets/mascote-original.png`; integrar o fundo escuro ao degradê da abertura; conferir imagens da primeira dobra ≤ **250 KB** [RNF-005, plan.md decisão 6]. Usar ferramenta já disponível no ambiente (sem dependência nova); se não houver, converter uma única vez fora do repositório, versionar as saídas e documentar o procedimento no cabeçalho do script.
- [X] T041 [US4] `src/pages/landing/mascote.tsx` (componente `<picture>`) usado na abertura, em uma seção do meio (offline ou segurança) e na chamada final [RF-009].
- [X] T042 [US4] `src/pages/landing/use-reveal.ts` e as classes de revelação e flutuação do mascote em `landing.css`, tudo atrás de `prefers-reduced-motion: no-preference` [RF-012].
- [X] T043 [US4] Rodar T037 a T039 (GREEN).

---

## Fase 7: História 5 (P1) — Qualquer aparelho, teclado e leitor de tela

**Meta**: AA comprovada, responsividade de 360 px a desktop amplo, metadados de compartilhamento.

**Teste independente**: teclado do topo ao rodapé, contraste medido, 360/768/1440/1920 px sem rolagem horizontal, axe sem violação séria ou crítica.

### Testes primeiro (RED)

- [X] T044 [P] [US5] `tests/e2e/landing-acessibilidade.spec.ts`: axe sem violação séria ou crítica em 360, 768, 1440 e 1920 px, nos temas claro e escuro; ordem de foco e foco visível do início ao fim; "Pular para o conteúdo"; âncoras movem o foco; sem rolagem horizontal; alvos de toque de ao menos 24 px; `reducedMotion: 'reduce'` sem animação [RNF-001, RNF-002, História 5].
- [X] T045 [P] [US5] `tests/contract/landing-contraste.test.ts`: todos os pares texto/fundo declarados em `design.md` passam por `src/design-system/contrast.ts` com razão mínima AA (4,5:1; 3:1 para texto grande e controles), inclusive sobre a abertura escura [RNF-001, plan.md decisão 8].
- [X] T046 [P] [US5] `tests/contract/landing-metadados.test.ts`: `index.html` tem `title`, `description`, `og:title`, `og:description`, `og:image` (arquivo existe e mede 1200x630), `og:locale=pt_BR` e `twitter:card` [RF-011].
- [X] T047 [P] [US5] Teste de `tests/contract/escalas-no-codigo.test.ts` cobrindo `src/pages/landing/**` e `landing.css` (nenhum valor arbitrário, cor literal ou transição que atrase o foco) [RNF-006].

### Implementação (GREEN)

- [X] T048 [US5] Ajustar `landing.css` e as seções até T044 a T047 passarem: grade responsiva de 360 px a 1920 px com conteúdo em toda a largura, contraste dos pares, estados de foco do design system; se faltar um token, criá-lo em `src/design-system/tokens.ts` e regenerar `tokens.css` (sem cor literal) [RNF-001, RNF-002, RNF-006].
- [X] T049 [US5] Metadados e `og:image` 1200x630 (`public/landing/og-fluxid.png`) em `index.html`, em português do Brasil, sem rastreador [RF-011, plan.md decisão 11].
- [ ] T050 [US5] Validar com leitor de tela (NVDA no Windows ou VoiceOver) a leitura da abertura, das seções, dos links externos e do botão por sessão; anotar em `validation.md` [RNF-001].

---

## Fase 8: História 6 (P1) — Não prejudicar o aplicativo

**Meta**: pacote de entrada +2% no máximo, PWA e offline preservados.

**Teste independente**: comparar o pacote de entrada com a linha de base e instalar o PWA abrindo sem conexão.

### Testes primeiro (RED)

- [X] T051 [P] [US6] `tests/e2e/landing-pwa.spec.ts`: o manifesto serve `start_url: '/visao-geral'`; o app instalado abre no sistema; com o service worker ativo e sem conexão, `/` abre a landing em modo reduzido e os links externos mostram "precisa de conexão"; com `display-mode: standalone` emulado, abrir `/` leva a `/visao-geral` (sem passar pela landing), e no navegador comum `/` mostra a landing [RNF-008, História 6].
- [X] T052 [P] [US6] `tests/e2e/medicao-landing.spec.ts` e `scripts/landing/medir-desempenho-4g.mjs` (padrão dos scripts das Specs 006 a 010): LCP ≤ 2,5 s e CLS < 0,1 em "Slow 4G" para `/`; tamanho de `dist/assets/index-*.js` ≤ **609.747 bytes**; imagens da primeira dobra ≤ 250 KB [RNF-003, RNF-004, RNF-005].

### Implementação (GREEN)

- [X] T053 [US6] Garantir que `LandingPage` e suas imagens ficam em chunk próprio (`lazy`) e que os chunks entram no precache do service worker; conferir `dist/` e ajustar `vite.config.ts` apenas se preciso [RNF-003, RNF-008].
- [X] T054 [US6] Rodar T051 e T052, registrar as medidas reais em `validation.md` e ajustar (imagens, CSS, divisão em chunks) até cumprir as metas.

---

## Fase 9: Acabamento e transversais

- [X] T055 [P] Capturas visuais da landing (360, 768 e 1440 px; tema claro e escuro) em `tests/e2e/visual/` e regeneração no Linux com `npm run test:visual:atualizar`; nunca versionar `*-win32.png` [critérios transversais].
- [X] T056 [P] Atualizar `docs/publicacao-em-nuvem.md` (a página inicial pública em `fluxid.tec.br`, início do PWA em `/visao-geral`) e o `README` se citar `/` como Visão geral [Constituição VIII].
- [X] T057 [P] Atualizar `docs/arquitetura` ou `docs/prd.md` onde a Visão geral for citada em `/` (busca por `"/"`), mantendo a documentação viva.
- [X] T058 Rodar tudo e registrar o resultado em `validation.md`: `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run build`, `npm run test:e2e` (Chromium e WebKit), `npm run test:visual`, axe e as medições de 4G.
- [X] T059 Revisão de segurança e privacidade: nenhum segredo, nenhum rastreador, nenhuma chamada de rede para renderizar, links com `noopener noreferrer`; anotar em `validation.md`.

## Fase 9b: Adaptação ao pitch (pedido de 14/10/2026)

**Objetivo**: a landing segue o roteiro do pitch "O cilindro que desapareceu" e preserva a essência (RF-016 a RF-020).

- [X] T066 [P] Recortar o mascote sem fundo e gerar as poses (corpo inteiro, espiando e rosto): `scripts/landing/poses-do-mascote.py` e `scripts/landing/otimizar-imagens.mjs`; WebP com transparência em `public/landing/`; sem máscara nem mistura que desfoquem o mascote.
- [X] T067 [P] Testes primeiro: `prejuizo.test.ts` (totais do pitch calculados da fonte) e `video-incorporado.test.ts` (identificador do vídeo e player `youtube-nocookie.com`).
- [X] T068 Conteúdo em `landing-content.ts`: `PREJUIZO`, `FRENTES`, `JORNADA`, textos da história, causa, trava, piloto e chamada final; nova ordem de `SECOES` e menu.
- [X] T069 Seções novas: `historia.tsx`, `prejuizo.tsx`, `causa.tsx`, `solucao.tsx` (quatro frentes), `jornada.tsx`, `trava.tsx`, `piloto.tsx`; `hero.tsx` em tela cheia; `chamada-final.tsx` com a pergunta do pitch. Saem `proposta.tsx` e `problema.tsx`.
- [X] T070 Vídeos na própria página: `video-destaque.tsx` com capa desenhada pelo projeto e player após o clique; os cartões de vídeo dos materiais levam ao player.
- [X] T071 Movimento só com `transform` e `opacity`, atrás de `prefers-reduced-motion: no-preference`: caminhão na rota, contadores, linha da jornada, volante e pino da trava, mascote espiando.
- [X] T072 Contratos ajustados: terceiros (exceção só do player após o clique), contraste (pares da tabela oficial), conteúdo (fonte única dos valores e itens de piloto marcados).
- [X] T073 Desempenho: `sizes` do mascote igual ao palco e pré-carregamento só na landing (`index.html`), para o LCP voltar ao orçamento.
- [X] T074 Regressão: lint, typecheck, Vitest, E2E da landing (Chromium e WebKit), medição 4G e capturas visuais regeneradas no Linux.
- [ ] T075 Confirmar com a pessoa responsável a publicação do nome da Oxigênio Cariri e dos valores de perda na página pública (sem presumir).

## Fase 9c: Plano de ação da crítica de design (14/10/2026)

- [X] T076 Ação principal: "Assistir ao pitch" na abertura e na chamada final; "Entrar no sistema" discreto no cabeçalho (sempre visível) e como segunda opção no fim; título final com referente claro.
- [X] T077 Simulação do piloto marcada "Estimativa", com a base visível, "X de 130" e a ressalva de hipótese; plural correto no texto do leitor de tela.
- [X] T078 Meio enxuto: "O que já funciona" (telas reais + quatro itens + fila de envio) no lugar de funcionalidades, sem sinal e segurança; jornada em linha de marcos com as regras numa faixa; trava logo depois da solução.
- [X] T079 Cor com sentido: estado ativo da trava neutro, vermelho só na violação (botão, LED e área da geocerca), "?" do C-262 em cor de alerta, barras neutras, fonte do prejuízo em destaque.
- [X] T080 Celular: gaveta de âncoras com sanduíche à direita (Escape, véu e escolha fecham; foco preso e devolvido); cartão do C-262 na primeira tela; "Entrar" sempre no cabeçalho.
- [X] T081 Movimento: nenhuma animação infinita (WCAG 2.2.2); cenas só quando entram na tela; um momento autoral (o caminhão); player com "Fechar o vídeo".
- [X] T082 Acabamento: sem etiqueta acima do título, sem números 01–04, cartões sem borda e sombra juntas, seleção de texto na cor da marca, medida de leitura de 68 caracteres, raio total documentado no DESIGN.md; detector sem achados.
- [X] T083 Pose "procurando" (e as demais poses) extraídas da apresentação do FluxID (IntegraSENAI) em `specs/011-landing-page-institucional/assets/` e usadas em `mascote.tsx`.
- [X] T084 Logo em destaque no topo (pedido de 14/10/2026) e abertura com o espaço reservado.
- [X] T085 Jornada em três trechos com o cartão do C-262 que acompanha a leitura; fecho com a resposta do C-262; materiais em três blocos; regras e componentes da trava recolhidos; gaveta como diálogo; player com mensagem se demorar; capturas reais regeneradas sem jargão.
- [X] T087 Decisões da pessoa responsável (14/10/2026): valores do pitch mantidos; equipe com nomes, funções e fotos (seção "Quem faz o FluxID"); da linha do tempo, só os marcos (a validação do protótipo com data de 20 a 22 out. 2026, informada pela pessoa responsável); fotos de cena fora.
- [X] T088 Vídeos nas próprias seções (iniciado em outra sessão e concluído aqui): seção "Pitch" logo após o prejuízo; vídeo do protótipo físico na trava; vídeo do sistema em "O que já funciona"; jornada dentro de "A solução"; materiais só com os 5 destinos externos; testes do player em `video-destaque.test.tsx`.
- [ ] T089 Registrar em `validation.md` a autorização de cada integrante (Natã, Carlos, John, Simão e Kauan) para publicar nome e foto, antes da publicação.
- [X] T090 Distill (15/10/2026, decisão da pessoa responsável): "O que já funciona" fica com dois itens (sem sinal e segurança); cadastro e viagens saem da lista porque já aparecem na jornada e nas telas reais. Causa, Solução e Piloto continuam separadas, na ordem do pitch; os demais cortes propostos foram recusados.
- [X] T091 Layout (15/10/2026): no computador, passada a abertura, o cabeçalho vira barra compacta fixa (logo menor, navy sólido) e o menu marca a seção atual com `aria-current` (`secao-atual.ts`); âncoras com margem de rolagem para o título não ficar sob a barra. No celular, elos da causa e integrantes da equipe em linhas (ícone ou foto ao lado do texto) e resumos recolhíveis sem a dica "Ver as…". A prévia da fila deixou de ser fixa (com dois itens não havia o que acompanhar).
- [X] T092 Logos institucionais (pedido de 15/10/2026): Integra SENAI, SENAI Ceará e Saga SENAI de Inovação no fim de "Quem faz o FluxID", recortadas da folha enviada pela pessoa responsável (`assets/logos-senai-original.png`) por `scripts/landing/recortar-logos-senai.mjs`.
- [ ] T093 Logo da empresa parceira Oxigênio Cariri: aguarda o arquivo da imagem (enviada só na conversa) para recortar e aplicar.
- [X] T094 Crítica de 15/10/2026 (23/32), decisões da pessoa responsável: marco da validação do protótipo marcado "Agendado" (bloco renomeado para "Marcos do projeto"); contato "Quero conversar sobre um piloto" (e-mail fluxid2026@gmail.com) no fim do Piloto e como primeira ação da chamada final; o menu só marca a seção quando ela tem âncora; verde só no botão principal sobre navy (exceção registrada no DESIGN.md), frase final e simulador em branco, gaveta com "Entrar" em contorno; vídeo offline com ícone de sem sinal e borda tracejada.
- [X] T095 Polish (15/10/2026): ícones locais de código e vídeo nos materiais (no lugar de configurações e sino; a prancha da Spec 003 continua fechada), logos institucionais numa linha a 360 px, formação dos integrantes em 16 px no celular e título do Pitch alinhado ao topo do vídeo.
- [X] T096 Animate (15/10/2026): segundo momento autoral, o pino que avança e encaixa no anel quando a trava entra na tela (uma vez, 600 ms); texto do momento da trava troca por esmaecimento; seta e conteúdo dos blocos recolhíveis animam ao abrir; gaveta do celular entra pela direita com o véu escurecendo. Tudo só com transform e opacity, dentro de prefers-reduced-motion: no-preference (contrato em tests/contract/landing-movimento.test.ts).
- [X] T097 Apresentação em slides (pedido de 15/10/2026): cada seção é um ou mais slides de tela cheia (18 no total; História, Solução, Trava, O que já funciona e Piloto divididos), conteúdo centrado. No computador, passo a passo pela roda, teclado (setas, PageUp/PageDown, espaço) e indicador "n / 18" com anterior e próximo (`apresentacao.tsx`, lógica em `slides.ts`); num slide mais alto que a tela, o passo anda por dentro antes de trocar; o rodapé é alcançado. Sem scroll-snap (travava a roda no Chromium). No celular, slides de tela cheia com rolagem livre. Todos os slides cabem a 1440×900, 1536×864 e 1920×1080; a 1366×768, seis passam da tela e são percorridos por dentro.
- [X] T098 Direção premium editorial (pedido de 15/10/2026, mascote mantido): títulos de slide em 48 px no computador (pergunta final em 64 px) com tracking apertado; lead dos slides em 24 px; seções escuras em navy sólido (gradiente só na abertura) e sem brilhos coloridos; frentes sem o quadrado do ícone; valor e etapas do piloto sem cartões (filete no topo e número grande). Nenhum texto foi cortado.
- [X] T099 Hero orientado à prova do produto (pedido de 16/10/2026): texto mais direto sobre localizar cada cilindro; composição com o mascote ao lado do cilindro equipado e uma captura real do sistema marcada “Exemplo”; hierarquia e responsividade preservadas de 360 px a desktop.
- [X] T100 Legibilidade tipográfica do hero (pedido de 16/10/2026): título responsivo em 36/48/64 px, textos corridos com piso de 16 px e textos funcionais da captura, do cartão C-262 e do convite de continuidade elevados de 12 para 16 px.
- [X] T101 Prova visual em “O que já funciona” (pedido de 16/10/2026): mockups reais como foco, benefícios acessíveis em uma hierarquia guiada por dispositivo e CTA do vídeo com aparência e alvo de botão, sem ocultar conteúdo da tecnologia assistiva.
- [X] T102 Continuidade de leitura em “O que já funciona” (pedido de 16/10/2026): telas reais, funcionamento offline, segurança e fila de envio reunidos no mesmo slide; o vídeo permanece no slide seguinte. O total da apresentação passa de 18 para 17 slides.
- [X] T103 Endereço oficial nos mockups (pedido de 16/10/2026): barras de navegador do notebook e do protótipo exibem `fluxid.tec.br`, preservando os caminhos que contextualizam a tela.
- [X] T104 Unificação dos slides 15 e 16 (pedido de 16/10/2026): “Planos e investimento” reúne modelo de cobrança, três faixas e contato em um slide alto, com leitura contínua, comparação responsiva e hierarquia de títulos acessível. A apresentação passa de 19 para 18 slides.
- [X] T105 Legibilidade do apoio do piloto (pedido de 16/10/2026): texto sobre medição contínua elevado da escala de legenda para corpo (16 px), preservando contraste, medida e ritmo vertical.
- [X] T106 Ajuste do conteúdo de “O que já funciona” ao slide (pedido de 16/10/2026): prova visual compacta e resumo operacional em três colunas no desktop, preservando texto de corpo em 16 px, estados escritos e empilhamento no celular.
- [X] T086 Decidir com a pessoa responsável o que mais da apresentação entra na página: equipe (nomes e fotos, com consentimento), linha do tempo 2026–2032, fotos de cena e a divergência de valores (R$ 3.767 e R$ 497.244 contra R$ 3.766 e R$ 489.666).

## Fase 10: Encerramento obrigatório (gate de IA)

- [ ] T059a Teste de compreensão com ao menos 5 pessoas que não conhecem o projeto (mistura de celular e computador), com roteiro fixo: (1) 30 s na página e explicar em uma frase o que o FluxID faz; (2) achar e tocar em "Entrar no sistema", cronometrando. Registrar o roteiro, o ambiente de cada pessoa (sem nome nem dado pessoal) e os resultados em `validation.md`; meta: ao menos 4 de 5 explicam corretamente e 100% acham o botão em até 5 s [SC-001, SC-002]. Itens que falharem voltam para ajuste e repetição do teste.
- [ ] T060 Confirmar **direito de uso da arte do mascote** e **aprovação do texto final das seções** com a pessoa responsável; registrar a resposta em `validation.md` (sem presumir). Sem isso, não publicar.
- [ ] T061 Preparar a implementação e os testes com `git add` explícito (sem criar o commit) e gerar o RIA com `npm run ia:registro -- --spec 011 --ciclo 01 --titulo "Landing page institucional do FluxID"`.
- [ ] T062 **Entrevistar a pessoa responsável pela validação humana** (quem valida este ciclo é definido na própria entrevista; a spec cita Natã Baracho como validador oficial, a confirmar) (quem validou; amostra de perfis, telas, larguras e fluxos; ambiente; duração; resultado; itens a corrigir; decisão `utilizado`, `adaptado` ou `descartado` com justificativa; confirmação para gravar em nome dela). Nunca presumir nem inferir dos testes. Se houver itens a corrigir, corrigir, repetir os testes e perguntar de novo [AGENTS.md].
- [ ] T063 Preencher o RIA com as respostas, executar `npm run ia:validar` e incluir código, testes, `docs/governanca-ia/indice.md` e o RIA no mesmo commit; abrir o pull request (sem `--no-verify`, sem force push, sem citação de ferramenta nas mensagens).
- [ ] T064 Após o merge: PR de documentação `docs/ria-NNN-docx` com o DOCX do RIA e o índice apontando para ele (`python scripts/governanca-ia/exportar-docx.py ...`).
- [ ] T065 Após o merge: publicar (`npx vercel deploy --prod`) com a pessoa responsável autorizando, e conferir `https://fluxid.tec.br/`, o botão de entrada, os 8 links e o PWA instalado.

---

## Dependências e ordem

- **Fase 1** antes de tudo. **Fase 2** bloqueia todas as histórias.
- **US1** vem primeiro (a página existe e entra no sistema). **US2, US3 e US4** podem andar em paralelo depois de US1 (arquivos diferentes). **US5** depende de as seções existirem (US1 a US4). **US6** depende de a landing e das imagens existirem.
- A **Fase 9** vem depois de todas as histórias; a **Fase 10** é o encerramento e só começa com tudo verde.
- Dentro de cada história: testes (RED), implementação (GREEN), regressão.

## Oportunidades de paralelismo

- Fase 1: T002 e T003.
- Fase 2: T004 a T006 (testes); T008 e T009 (arquivos diferentes).
- US1: T015 a T018 (testes).
- US2: T024, T025 e depois T026 a T029 (seções em arquivos diferentes).
- US3: T031 a T035. US4: T037 a T039.
- US5: T044 a T047. US6: T051 e T052.
- Fase 9: T055 a T057.

## Estratégia de implementação

- **MVP**: Fases 1 e 2 e **US1**: `/` mostra a abertura com o botão de entrada e a Visão geral já está em `/visao-geral`. Já dá para publicar (após o gate) e entrega o essencial do pedido.
- **Incremento 2**: US3 (materiais), porque foi pedido explicitamente, depois US2 (conteúdo).
- **Incremento 3**: US4 (mascote e movimento) e US5 (acessibilidade e metadados, que fecha as seções).
- **Incremento 4**: US6 (medições e PWA), Fase 9 e Fase 10.
- Cada incremento termina com a regressão completa e sem quebrar o pacote de entrada.
