---

description: "Tarefas de implementação da fundação técnica do FluxID"
---

# Tarefas: Fundação técnica do FluxID

**Entrada**: Artefatos em `specs/001-fundacao-tecnica/`

**Pré-requisitos**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Testes**: obrigatórios. Cada incremento segue RED → GREEN → REFACTOR; os testes da história devem falhar antes da implementação correspondente.

**Organização**: tarefas agrupadas por história para permitir validação e entrega incremental.

## Formato

- `[P]`: pode ser executada em paralelo porque atua em arquivos diferentes e não depende de tarefa incompleta.
- `[US1]` a `[US4]`: história de usuário correspondente em `spec.md`.
- Todas as dependências devem ser instaladas com versão exata e registradas em `package-lock.json`.

## Fase 1: Setup

**Objetivo**: criar a aplicação e a infraestrutura de ferramentas sem implementar comportamento das histórias.

- [X] T001 Vincular a issue da Spec 001 em `specs/001-fundacao-tecnica/plan.md`, confirmar a branch `chore/bootstrap-antigravity` e interromper o início do código de implementação enquanto o link da issue não estiver registrado
- [X] T002 Inicializar a base React 19.3.0, TypeScript 7.0.2 e Vite 8.3.1 sem substituir os scripts `ia:*` existentes em `package.json`, gerando `package-lock.json`, `index.html`, `src/main.tsx` e `src/app/App.tsx`
- [X] T003 Fixar Tailwind CSS 4.3.3, `@tailwindcss/vite` 4.3.3, `@supabase/supabase-js` 2.117.2, Zod e `vite-plugin-pwa` 1.3.0 em `package.json` e `package-lock.json`
- [X] T004 Fixar Supabase CLI 2.117.0, Vitest 5.0.2, React Testing Library, jest-dom, jsdom, Playwright 1.63.0, axe-core e ESLint 10.11.0 como dependências de desenvolvimento em `package.json` e `package-lock.json`, sem faixas semver
- [X] T005 [P] Configurar TypeScript estrito para aplicação, testes e build em `tsconfig.json`, `tsconfig.app.json` e `tsconfig.node.json`
- [X] T006 [P] Configurar lint sem regras de domínio em componentes em `eslint.config.js`
- [X] T007 Configurar Vite, Tailwind e aliases coerentes com a estrutura do plano em `vite.config.ts` e `src/styles/globals.css`
- [X] T008 [P] Configurar Vitest, jsdom, cobertura mínima de 85% para linhas/funções e 80% para branches em `vitest.config.ts` e `src/test/setup.ts`
- [X] T009 [P] Configurar Playwright para desktop, tablet e viewport de 360 px em `playwright.config.ts`
- [X] T010 Adicionar scripts `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:coverage` e `test:e2e` sem remover a governança em `package.json`

**Checkpoint**: T001 concluída; projeto instala, compila o esqueleto e reconhece os comandos de qualidade, ainda sem comportamento funcional.

---

## Fase 2: Fundação compartilhada

**Objetivo**: contratos tipados, fixtures e limites de segurança que bloqueiam todas as histórias.

**⚠️ CRÍTICO**: nenhuma história começa antes desta fase.

- [X] T011 [P] Criar fixtures sanitizadas de endpoints, respostas HTTP, timeouts e erros de transporte em `src/test/fixtures/connectivity.ts`
- [X] T012 [P] Criar helpers de ambiente que nunca leem nem registram valores reais de `.env.local` em `src/test/fixtures/environment.ts`
- [X] T013 RED: escrever testes do contrato de ambiente para modos `auto`, `local`, `lan`, `cloud`, pares URL/chave e timeout entre 250 e 10.000 ms em `tests/contract/environment.test.ts`
- [X] T014 GREEN: implementar leitura e validação tipada conforme `contracts/environment.md`, sem incluir valores de chave nos erros, em `src/config/environment.ts`
- [X] T015 RED: escrever testes dos enums, resultados e transições permitidas de `idle`, `probing`, `connected`, `degraded`, `blocked` e `offline` em `src/infrastructure/supabase/connection-state.test.ts`
- [X] T016 GREEN: implementar `ConnectionMode`, `EndpointKind`, `EndpointConfig`, `FailureKind`, `ResolutionAttempt`, `ResolutionResult` e transições puras em `src/infrastructure/supabase/connection-state.ts`
- [X] T017 REFACTOR: remover duplicação entre validação e tipos e documentar exports públicos em `src/config/environment.ts` e `src/infrastructure/supabase/connection-state.ts`

**Checkpoint**: contratos compartilhados aprovados; nenhuma tabela, migration ou cliente Supabase foi criado.

---

## Fase 3: História 1 — Iniciar o projeto com segurança (P1) 🎯 MVP

**Objetivo**: permitir instalar, iniciar e validar a base sem dados ou regras de negócio e sem depender de segredos versionados.

**Teste independente**: em ambiente com pré-requisitos, `npm ci`, `npm run build`, `npm run lint`, `npm run typecheck` e `npm run test` passam, e o shell inicia sem tela, entidade ou dado de domínio.

### RED — testes da História 1

- [X] T018 [P] [US1] Escrever teste do shell vazio, título do produto e ausência de funcionalidades de domínio em `src/app/App.test.tsx`
- [X] T019 [P] [US1] Escrever teste de contrato que rejeita nomes de variáveis secretas com prefixo `VITE_` em `tests/contract/client-secrets.test.ts`

### GREEN — implementação da História 1

- [X] T020 [US1] Implementar o shell sem regras de negócio e com regiões semânticas básicas em `src/app/App.tsx`
- [X] T021 [US1] Integrar o shell e os providers vazios no ponto de entrada em `src/app/providers.tsx` e `src/main.tsx`
- [X] T022 [US1] Atualizar instruções reproduzíveis de instalação, execução e validação em `README.md`

### REFACTOR — História 1

- [X] T023 [US1] Revisar imports, semântica, mensagens e ausência de regras de domínio nos componentes em `src/app/App.tsx`, `src/app/providers.tsx` e `src/main.tsx`

**Checkpoint**: MVP técnico iniciável e verificável de forma independente.

---

## Fase 4: História 2 — Reconhecer o estado de conectividade (P2)

**Objetivo**: selecionar um único endpoint nos modos explícitos e em `auto`, criar um único cliente e apresentar o destino ativo sem expor chaves.

**Teste independente**: doubles controlados comprovam que cada modo explícito consulta somente seu endpoint e que `auto` escolhe `local → lan → cloud`; a interface mostra o destino e o fallback em texto.

### RED — testes da História 2

- [X] T024 [P] [US2] Escrever testes dos modos explícitos e da prioridade `local < lan < cloud`, garantindo uma tentativa por endpoint, estado `connected` no primeiro elegível e `degraded` em fallback para LAN ou cloud, em `src/infrastructure/supabase/connection-resolver.test.ts`
- [X] T025 [P] [US2] Escrever testes do probe `GET {url}/auth/v1/health`, resposta 2xx e cancelamento por timeout em `src/infrastructure/supabase/endpoint-health.test.ts`
- [X] T026 [P] [US2] Escrever testes de criação de exatamente um cliente apenas para resultados `connected` ou `degraded` em `src/infrastructure/supabase/client-factory.test.ts`
- [X] T027 [P] [US2] Escrever testes acessíveis para `probing`, `connected` e `degraded`, com destino e ocorrência de fallback expressos em texto e sem valores de chave, em `src/components/system/ConnectivityStatus.test.tsx`

### GREEN — implementação da História 2

- [X] T028 [P] [US2] Implementar probe com `fetch`, `AbortController`, timeout configurável e descarte do corpo da resposta em `src/infrastructure/supabase/endpoint-health.ts`
- [X] T029 [US2] Implementar resolução sequencial dos modos explícitos e `auto`, preservando tentativas sem dados sensíveis, em `src/infrastructure/supabase/connection-resolver.ts`
- [X] T030 [P] [US2] Implementar fábrica que recebe apenas o endpoint escolhido e cria um único `SupabaseClient` em `src/infrastructure/supabase/client-factory.ts`
- [X] T031 [P] [US2] Implementar indicador textual e acessível dos estados `probing`, `connected` e `degraded`, identificando o destino usado após fallback para LAN ou cloud, em `src/components/system/ConnectivityStatus.tsx`
- [X] T032 [US2] Integrar resolução, criação do cliente e apresentação de estado em `src/app/providers.tsx` e `src/app/App.tsx`

### REFACTOR — História 2

- [X] T033 [US2] Separar efeitos de rede das regras puras e eliminar qualquer criação antecipada de clientes em `src/infrastructure/supabase/connection-resolver.ts`, `src/infrastructure/supabase/endpoint-health.ts` e `src/infrastructure/supabase/client-factory.ts`

**Checkpoint**: seleção e visualização de destino funcionam sem depender das histórias 3 e 4.

---

## Fase 5: História 3 — Diferenciar indisponibilidade de bloqueio (P3)

**Objetivo**: permitir fallback somente para timeout, transporte e 5xx; bloquear 4xx e manter o endpoint estável até reconexão explícita.

**Teste independente**: uma matriz de respostas comprova que timeout/rede/5xx avançam, 4xx e falhas desconhecidas bloqueiam, e nenhuma sessão troca de endpoint automaticamente.

### RED — testes da História 3

- [X] T034 [P] [US3] Escrever matriz que distingue falhas do probe (`timeout`, `network`, `service_unavailable`, 4xx de configuração) de erros operacionais sanitizados (`authentication`, `authorization`, `validation`, `isolation`, `configuration`, `unknown`) em `src/infrastructure/supabase/failure-classifier.test.ts`
- [X] T035 [P] [US3] Escrever testes de integração para fallback em timeout/rede/5xx do probe e, depois da seleção, bloqueio sem nova resolução em rejeições de chave, sessão, autorização, validação ou RLS em `tests/integration/connectivity.test.ts`
- [X] T036 [P] [US3] Escrever testes de estabilidade da sessão e reconexão exclusivamente explícita em `src/app/providers.test.tsx`
- [X] T037 [P] [US3] Escrever testes acessíveis para estados `blocked` e `offline`, incluindo ação recomendada, em `src/components/system/ConnectivityStatus.blocked.test.tsx`

### GREEN — implementação da História 3

- [X] T038 [P] [US3] Implementar classificação separada de falhas do probe e erros operacionais usando somente status e códigos sanitizados, sem registrar corpo, chave, sessão ou token, em `src/infrastructure/supabase/failure-classifier.ts`
- [X] T039 [US3] Integrar classificação bloqueante/elegível e esgotamento de endpoints ao resolvedor em `src/infrastructure/supabase/connection-resolver.ts`
- [X] T040 [US3] Implementar estabilidade da sessão, transição para `blocked` diante de erro operacional e reconexão acionada explicitamente, sem invocar fallback automático, em `src/app/providers.tsx`
- [X] T041 [US3] Apresentar estados `blocked` e `offline` com `alert`, texto e ação de reconexão em `src/components/system/ConnectivityStatus.tsx`

### REFACTOR — História 3

- [X] T042 [US3] Revisar a máquina de estados para impedir transições automáticas após `connected` ou `degraded` em `src/infrastructure/supabase/connection-state.ts` e `src/app/providers.tsx`

**Checkpoint**: política de fallback segura e sessão estável validadas de forma independente.

---

## Fase 6: História 4 — Validar a base em diferentes dispositivos (P4)

**Objetivo**: entregar shell responsivo, acessível, instalável e disponível offline sem cachear respostas Supabase.

**Teste independente**: E2E valida 360 px, tablet e desktop, teclado, axe, manifest, instalação e abertura offline do shell.

### RED — testes da História 4

- [X] T043 [P] [US4] Escrever cenários E2E do shell em 360 px, tablet e desktop sem rolagem horizontal indevida e verificar o orçamento de 2.000 ms no ambiente de referência definido em `plan.md`, em `tests/e2e/app-shell.spec.ts`
- [X] T044 [P] [US4] Escrever cenários de teclado, foco visível, semântica e zero violação crítica axe em `tests/e2e/accessibility.spec.ts`
- [X] T045 [P] [US4] Escrever cenários de manifest, service worker, instalação e abertura offline do shell em `tests/e2e/pwa.spec.ts`
- [X] T046 [P] [US4] Escrever teste que reprova qualquer regra de cache para URLs Supabase em `src/app/pwa-config.test.ts`

### GREEN — implementação da História 4

- [X] T047 [P] [US4] Implementar estilos responsivos, foco visível, contraste e alvos de toque em `src/styles/globals.css`
- [X] T048 [P] [US4] Criar ícones PWA acessíveis e consistentes com a identidade FluxID em `public/icons/icon-192.png`, `public/icons/icon-512.png` e `public/icons/maskable-512.png`
- [X] T049 [US4] Configurar manifest, atualização do service worker e cache exclusivo do shell estático em `vite.config.ts`
- [X] T050 [US4] Integrar feedback de instalação compatível e estado offline ao shell em `src/app/App.tsx`

### REFACTOR — História 4

- [X] T051 [US4] Revisar responsividade, ordem de foco, textos e comportamento sem JavaScript de instalação em `src/app/App.tsx`, `src/components/system/ConnectivityStatus.tsx` e `src/styles/globals.css`

**Checkpoint**: base responsiva, acessível e instalável validada sem introduzir cache de dados.

---

## Fase 7: Acabamento e gates transversais

**Objetivo**: convergir todos os incrementos e preparar o encerramento auditável do ciclo.

- [X] T052 [P] Atualizar `.env.example` e `specs/001-fundacao-tecnica/contracts/environment.md` para refletir exatamente as variáveis implementadas, mantendo todos os valores de chave vazios
- [X] T053 [P] Atualizar `specs/001-fundacao-tecnica/quickstart.md` e `README.md` com comandos realmente existentes e resultados esperados
- [X] T054 [P] Adicionar workflow de CI para instalação reproduzível, lint, tipagem, testes, cobertura, E2E e build em `.github/workflows/quality.yml`
- [X] T055 Validar `supabase/config.toml` e o stack local com `npx --no-install supabase start` e `npx --no-install supabase status`, confirmando a versão 2.117.0 e capturando somente resultado sanitizado, sem `--linked`, `db push`, migrations de domínio, URLs completas, chaves ou credenciais
- [X] T056 Executar `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:coverage`, `npm run test:e2e` e `npm run build`, registrando comandos e resultados sanitizados em `specs/001-fundacao-tecnica/validation.md`
- [X] T057 Executar varredura de segredos e confirmar que `.env.local`, chaves secretas, `service_role`, senhas e tokens não aparecem em `src/`, `public/`, `dist/`, `specs/` ou arquivos preparados no Git, registrando somente o resultado em `specs/001-fundacao-tecnica/validation.md`
- [X] T058 Conferir manualmente os cenários de `specs/001-fundacao-tecnica/quickstart.md`, cronometrar de `npm ci` até o shell visível em checkout limpo com pré-requisitos instalados, comprovar o limite de 15 minutos e registrar ambiente, duração, resultado e demais evidências sanitizadas em `specs/001-fundacao-tecnica/validation.md`
- [X] T059 Executar a convergência formal da Spec 001 contra `spec.md`, `plan.md` e `tasks.md`; se forem encontradas lacunas, acrescentar e concluir as novas tarefas, repetir T056–T058 e somente então registrar a convergência em `specs/001-fundacao-tecnica/validation.md`
- [X] T060 Preparar `src/`, `tests/`, `public/`, `package.json`, `package-lock.json`, `.github/workflows/quality.yml`, `specs/001-fundacao-tecnica/` e documentação aprovada com `git add`, confirmando que `.env.local` e segredos ficaram fora do diff funcional
- [X] T061 Criar o RIA do ciclo somente após T056–T060 e a convergência sem pendências, preencher revisão humana natural e link do PR/branch em `docs/governanca-ia/registros/` e atualizar `docs/governanca-ia/indice.md`
- [X] T062 Executar `npm run ia:validar`, `git diff --check` e revisão humana final sobre `docs/governanca-ia/`, `specs/001-fundacao-tecnica/` e o diff preparado, sem criar commit, push ou PR sem autorização explícita

---

## Dependências e ordem de execução

### Dependências por fase

- **Fase 1 — Setup**: inicia imediatamente.
- **Fase 2 — Fundação**: depende da Fase 1 e bloqueia todas as histórias.
- **US1 (P1)**: depende da Fase 2; entrega o MVP técnico.
- **US2 (P2)**: depende da Fase 2 e integra seu provider ao shell da US1; regras e testes do resolvedor são independentes.
- **US3 (P3)**: depende da US2 porque especializa classificação, fallback e estabilidade da sessão.
- **US4 (P4)**: depende do shell da US1; seus testes de PWA e estilos podem avançar em paralelo com US2/US3.
- **Fase 7 — Acabamento**: depende das histórias incluídas no ciclo; T059 bloqueia staging, RIA e encerramento até a convergência não possuir pendências.

### Grafo das histórias

```text
Setup → Fundação → US1 (MVP) ─┬─→ US2 → US3 ─┐
                              └─→ US4 ──────├─→ Acabamento
```

### Ordem interna obrigatória

1. escrever os testes RED da história;
2. executar e confirmar a falha esperada;
3. implementar o mínimo GREEN;
4. executar e confirmar aprovação;
5. refatorar sem quebrar os testes;
6. validar o checkpoint independente.

## Oportunidades de paralelismo

- T005, T006, T008 e T009 atuam em configurações diferentes depois das dependências instaladas.
- T011 e T012 criam fixtures independentes.
- T018 e T019 cobrem contratos distintos da US1.
- T024–T027 podem ser escritos em paralelo antes do GREEN da US2.
- T028, T030 e T031 atuam em arquivos independentes; T029 integra os resultados.
- T034–T037 podem ser escritos em paralelo antes do GREEN da US3.
- T043–T046 podem ser escritos em paralelo; T047 e T048 também.
- T052–T054 podem avançar em paralelo depois que os contratos estabilizarem.

## Exemplos de execução paralela

### US1

```text
Tarefa: T018 — teste do shell em src/app/App.test.tsx
Tarefa: T019 — teste de segredos em tests/contract/client-secrets.test.ts
```

### US2

```text
Tarefa: T024 — testes do resolvedor
Tarefa: T025 — testes do probe
Tarefa: T026 — testes da fábrica
Tarefa: T027 — testes do status visual
```

### US3

```text
Tarefa: T034 — matriz de classificação
Tarefa: T035 — integração do fallback
Tarefa: T036 — estabilidade da sessão
Tarefa: T037 — estados bloqueado e offline
```

### US4

```text
Tarefa: T043 — responsividade E2E
Tarefa: T044 — acessibilidade E2E
Tarefa: T045 — PWA E2E
Tarefa: T046 — contrato de cache
```

## Estratégia de implementação

### MVP primeiro

1. concluir Setup e Fundação;
2. implementar US1 com TDD;
3. parar e validar o shell reproduzível;
4. somente então iniciar conectividade e PWA.

### Entrega incremental

1. **US1**: base instalável pelo time e gates básicos;
2. **US2**: seleção e apresentação do destino;
3. **US3**: fallback seguro e estabilidade de sessão;
4. **US4**: responsividade, acessibilidade e PWA;
5. **Acabamento**: CI, integração local, convergência e governança.

## Observações

- Não ler, imprimir ou versionar `.env.local`.
- Não criar migration, tabela ou policy nesta spec.
- Não executar `supabase link`, `db pull`, `db push`, `migration repair` ou comando remoto.
- O Supabase CLI local não pode ser exposto como servidor operacional na LAN.
- Nenhum RIA é gerado durante planejamento ou implementação parcial; somente no encerramento após testes e convergência.
- Nenhum commit, push ou PR é criado sem autorização humana explícita.
