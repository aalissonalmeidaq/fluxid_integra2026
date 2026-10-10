---
description: "Tarefas executáveis da Spec 008 — Viagens, paradas, carga e entrega"
---

# Tarefas: Viagens, paradas, carga e entrega

**Entrada**: artefatos em `specs/008-viagens-paradas-carga/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD. Em cada incremento, escrever o teste, confirmar a falha esperada (RED), implementar (GREEN), refatorar e rodar a regressão antes de avançar. Testes de banco ficam em `supabase/tests/008_*.test.sql` (pgTAP); testes de domínio, serviço, funções e páginas em Vitest ao lado do código; E2E em `tests/e2e/viagens-*.spec.ts`; suítes contra o Supabase local em `tests/integration/trips-*.live.test.ts`.

**Escopo protegido**:
- Nenhum comando a dispositivo: o bloqueio é **lógico** (reserva e marca) e a trava do lacre é da Fase 6 [spec, Clarifications; RF-009, RF-020].
- Sem leitura por câmera ou NFC, sem GPS e sem fila offline: a conferência é manual, a posição é informada e toda escrita exige conexão [premissas 2 a 4].
- Sem dependência nova de execução no `package.json` e nenhuma extensão nova no banco [plan.md].
- Nenhuma operação de exclusão em lugar algum [RF-033]; nenhum `delete` nem `truncate` nas tabelas novas.
- **O nome do recebedor nunca aparece em evento, auditoria, log, URL, mensagem de erro ou cache** [RF-017, RF-032, CA-007]; todo nome de teste é fictício e `@example.invalid`.
- Nenhuma chave `service_role` ou credencial privilegiada no cliente [RF-030].
- Os testes das Specs 001 a 007 só mudam onde o catálogo de telas ganha a entrada nova, onde o catálogo de permissões e papéis cresce e onde a lista de tipos de evento do cilindro ganha os cinco tipos novos.
- Arquivos alheios à spec (`package.json`, `package-lock.json`, `vite.config.ts`, `docs/arquitetura-conectividade-supabase.md` e outros modificados fora desta spec) **não** entram nos commits; usar `git add` explícito.

**Convenções de interface** (AGENTS.md, Spec 005): usar a skill `ui-ux-pro-max` ao criar ou alterar telas; só tokens (nenhum valor arbitrário do Tailwind, cor literal ou transição que atrase o anel de foco; `tests/contract/escalas-no-codigo.test.ts` reprova); movimento respeita `prefers-reduced-motion`; regenerar as capturas visuais no Linux (`npm run test:visual:atualizar`) quando o visual mudar e nunca versionar `*-win32.png`; antes do E2E, `npm run build`.

**Nomes de migrations**: `2026100900xxxx_trips_*.sql`, uma por área, com a RPC junto da história que a usa: `trips_schema`, `trips_permissions`, `trips_cylinder_guards` (Fundação), `trips_plan` (US1), `trips_loading_start` (US2), `trips_delivery` (US3), `trips_unlock` (US4), `trips_close` (US5) e `trips_history` (US6).

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode rodar em paralelo, porque não modifica os mesmos arquivos nem depende de tarefa incompleta.
- `[USN]`: história de usuário da spec (US1 a US7, na ordem das histórias 1 a 7).
- Referências entre colchetes ligam a tarefa aos requisitos e critérios da spec.

## Mapa das histórias

| História | Prioridade | Entrega |
|---|---|---|
| US1 Planejar uma viagem com paradas e cilindros | P1 | tabelas e RPCs de planejamento, reserva atômica, consulta mínima, formulário e detalhe |
| US2 Conferir o carregamento e iniciar a viagem | P1 | conferência, retirada com exceção, início com revalidação, bloqueio lógico e custódia |
| US3 Registrar a entrega ou a divergência em cada parada | P1 | chegada, entrega por parada, divergência, correção, posição e geocerca |
| US4 Registrar o desbloqueio como ato independente | P2 | desbloqueio normal e excepcional com `aal2` |
| US5 Concluir ou cancelar uma viagem | P2 | conclusão, cancelamento, retorno ao estoque |
| US6 Consultar viagens e o histórico | P2 | filtros, histórico, viagens por cilindro e por unidade |
| US7 Usar tudo em celular, tablet e desktop, só com teclado | P3 | responsividade, teclado, leitor de tela, estados e offline |

---

## Fase 1 — Preparação

**Objetivo**: rastreabilidade e linha de base antes de qualquer mudança.

- [X] T001 Registrar em `specs/008-viagens-paradas-carga/plan.md` (seção Rastreabilidade) o número da issue da Spec 008 e a branch `feat/008-viagens-paradas-carga`; se a issue ainda não existir, **pedir confirmação da pessoa responsável antes de abri-la** (ação externa) e abri-la com o título "Spec 008: viagens, paradas, carga e entrega".
- [X] T002 Rodar `npm run lint`, `npm run typecheck`, `npm test` e `npx supabase test db` na branch e registrar em `specs/008-viagens-paradas-carga/baseline.md` que as suítes das Specs 001 a 007 estão verdes antes da mudança (contagens de arquivos e testes).
- [X] T003 [P] Rodar `npm run build` e anotar em `baseline.md` o tamanho do pacote de entrada e as medianas de `tests/e2e/medicao-shell.spec.ts`, se existirem.
- [X] T004 [P] Anotar em `baseline.md` o procedimento do Supabase local: funções novas exigem `npx supabase stop` e `npx supabase start`; as suítes pgTAP que contam linhas de `audit_logs` exigem base limpa (`npx supabase db reset` antes de `npx supabase test db`, depois de `test:live`); conferir em `supabase/config.toml` que `query-trips` e `manage-trips` seguem o padrão das funções de cadastro (`verify_jwt` e demais campos).
- [X] T005 [P] Confirmar com `git status` que os arquivos alheios à spec **não** entram nos commits desta spec (adicionar só arquivos desta spec com `git add` explícito).

---

## Fase 2 — Fundação (bloqueia as histórias)

**Objetivo**: esquema com RLS e imutabilidade, permissões, regras de domínio puras, catálogo de operações, transporte, catálogo de telas e base do backend simulado. Sem isso nenhuma história pode ser montada.

### Banco: testes primeiro (RED)

- [X] T006 [P] Escrever `supabase/tests/008_rls.test.sql`: para cada tabela nova (`trips`, `trip_stops`, `trip_items`, `trip_deliveries`, `trip_unlocks`, `trip_events`), com os Tenants A e B, RLS ligada **sem política para `authenticated`** e privilégios revogados; o A não lê nem escreve pelo acesso direto, e o B não enxerga nada do A; as asserções por RPC entram nos testes de cada história [RF-029, CA-001].
- [X] T007 [P] Escrever `supabase/tests/008_immutability.test.sql`: `update` e `delete` em `trip_events`, `trip_deliveries` e `trip_unlocks` recusados para `authenticated` **e** `service_role`; `truncate` recusado em `trip_events`; `delete` recusado em `trips`, `trip_stops` e `trip_items` para qualquer papel [RF-033, CA-006].
- [X] T008 [P] Escrever `supabase/tests/008_constraints.test.sql` com as restrições do `data-model.md`, citadas literalmente: `trips.status` ∈ `planned`, `loading`, `in_progress`, `completed`, `cancelled`; `trips.notes` até 500; índices únicos parciais `(vehicle_id)` e `(driver_id)` onde `status in ('loading', 'in_progress')`; `cancel_reason` obrigatório em `cancelled` e até 500; `unique (organization_id, number)`; `trip_stops.position` de 1 a 30 e `unique (trip_id, position)`; `trip_stops.status` ∈ `pending`, `on_site`, `delivered`, `with_divergence`; `trip_items.item_status` ∈ `planned`, `checked`, `in_transit`, `delivered`, `not_delivered`, `removed`, `released`, `returned`; `lock_status` ∈ `none`, `locked`, `unlocked`; `unique (trip_id, cylinder_id)`; índice único parcial `(cylinder_id) where is_open`, com `is_open` verdadeira em `planned`, `checked`, `in_transit` e `not_delivered`; `divergence_reason` até 500 e obrigatório em `not_delivered` e `removed`; `trip_deliveries.recipient_name` de 2 a 120 e `recipient_role` até 80; `latitude` e `longitude` ambas ou nenhuma, de −90 a 90 e de −180 a 180; `trip_unlocks unique (item_id)`, `justification` até 500 e obrigatória se `exceptional`; `trip_events.event_type` na lista do `data-model.md` e `data` sem `password`, `token`, `secret` ou `refresh_token`; chaves estrangeiras compostas por organização (um item do Tenant A não aponta para cilindro do B) [RF-002, RF-003, RF-004, RF-029].
- [X] T009 [P] Escrever `supabase/tests/008_cylinder_custody.test.sql`: `cylinders.custody_status` ∈ `in_organization`, `in_transit`, `at_customer` com padrão `in_organization`; `custody_site_id` obrigatório em `at_customer` e nulo nos demais; `cylinder_events.event_type` aceita os 12 tipos existentes mais `trip_reserved`, `trip_released`, `trip_departed`, `trip_delivered` e `trip_returned`; as restrições antigas (`cylinders_inactive_out_of_stock_check`) continuam valendo e as suítes `006_*` seguem verdes [RF-024].
- [X] T010 [P] Escrever `supabase/tests/008_permissions.test.sql` (parte catálogo): as 8 permissões existem (escopo `tenant`, `tenant_delegable`; `trip.exception` com `critical = true` e as demais não críticas); `tenant_admin` tem todas; `logistics_manager` existe como papel de sistema com `trip.read`, `trip.write`, `trip.operate`, `trip.cancel`, `trip.unlock`, `trip.history`, `trip.recipient`, `cylinder.read`, `customer.read`, `geofence.read`, `vehicle.read` e `driver.read`; `stock_operator` ganha só `trip.read`, `trip.operate` e `trip.history`; `tenant_auditor` só `trip.read` e `trip.history`; `technical_operator` e `driver` nenhuma; nenhum papel existente perde permissão [RF-031; contracts/permissoes-e-papeis.md].
- [X] T011 [P] Escrever `supabase/tests/008_limits_contract.test.sql`: `private.trip_limits()` devolve paradas máximo 30, cilindros por parada máximo 200 e observações até 500 [RF-002, RF-003].
- [X] T012 [P] Escrever `supabase/tests/008_cylinder_in_trip.test.sql`: `stock_in_cylinder` e `inactivate_cylinder` (Spec 006) respondem `CYLINDER_IN_TRIP` com `trip_id` e `trip_number` para cilindro com item aberto (`planned`, `checked`, `in_transit` ou `not_delivered`); aceitam o cilindro depois de `released`, `removed`, `returned` ou `delivered`; `reactivate_cylinder` não muda; nada é gravado nas recusas [RF-024a; contracts/operacoes-servidor.md].

### Banco: implementação (GREEN)

- [X] T013 Criar `supabase/migrations/2026100900xxxx_trips_schema.sql` com as 6 tabelas públicas e as 2 privadas (`private.trip_counters`, `private.trip_requests`) do `data-model.md` (colunas, tipos, `check`, índices, `organization_id` com `on delete restrict`, `version bigint not null default 1`, `is_open` gerada), RLS ligada em todas, **nenhuma política** para `authenticated`, `revoke` de todo privilégio de `anon` e `authenticated`, gatilhos de imutabilidade (`private.refuse_trip_mutation`) e de exclusão proibida (`private.refuse_trip_delete`) no molde de `private.refuse_cylinder_mutation`, `private.trip_limits()`, `cylinders.custody_status` e `cylinders.custody_site_id` com suas restrições, e o `check` de `cylinder_events.event_type` recriado com os 17 tipos [data-model.md; research.md, decisões 2 a 4].
- [X] T014 Criar `supabase/migrations/2026100900xxxx_trips_permissions.sql`: inserir as 8 permissões do contrato (ids `40000000-0000-0000-0000-0000000000NN` de `...040` a `...047`; `trip.exception` com `critical = true`), substituir `private.bootstrap_tenant_roles` de forma idempotente acrescentando o papel `logistics_manager` e o mapeamento do contrato sem retirar permissão de papel algum, conceder às organizações existentes e ao `master_fluxid` o que cabe [contracts/permissoes-e-papeis.md].
- [X] T015 Criar `supabase/migrations/2026100900xxxx_trips_cylinder_guards.sql` substituindo `public.stock_in_cylinder` e `public.inactivate_cylinder` para consultar `trip_items` aberto (`is_open`) antes de agir e devolver `CYLINDER_IN_TRIP` com a viagem; mapear o código novo em `supabase/functions/_shared/cylinders.ts` e em `src/application/cylinders/`; ajustar os testes das suítes `006_*` e dos manipuladores que dependem das duas funções, sem mudar nenhum outro comportamento [RF-024a].
- [X] T016 Rodar `npx supabase db reset` e `npx supabase test db`: as suítes `008_rls`, `008_immutability`, `008_constraints`, `008_cylinder_custody`, `008_cylinder_in_trip`, `008_permissions` (parte catálogo) e `008_limits_contract` passam e as `001` a `007` continuam verdes (ajustar só as contagens de permissões e papéis, e a lista de tipos de evento do cilindro, nos testes antigos que os conferem).

### Domínio (TypeScript), testes primeiro

- [X] T017 [P] Escrever `src/domain/trips/trip-vocabulary.test.ts` e criar `src/domain/trips/trip-vocabulary.ts` com os vocabulários literais do `data-model.md` (situações de viagem, parada, item e bloqueio, tipos de evento) e rótulos em português ("bloqueado (lógico)", "em trânsito", "não entregue" etc.); teste de contrato com as listas do SQL. [RF-008]
- [X] T018 [P] Escrever `src/domain/trips/trip-limits.ts` (30 paradas, 200 cilindros por parada, observações 500, justificativa 500, nome do recebedor 2 a 120, função 80) e `tests/contract/trips-limits.test.ts` comparando com `private.trip_limits()` [RF-002, RF-003].
- [X] T019 [P] Escrever `src/domain/trips/trip-transitions.test.ts` e criar `src/domain/trips/trip-transitions.ts`: `canTransitionTrip`, `canTransitionStop`, `canTransitionItem` e `nextLockStatus` com **todas** as transições válidas e inválidas do `data-model.md` (tabela de verdade completa), incluindo que `completed` e `cancelled` são finais e que o bloqueio nunca volta [RF-007, RF-008, RF-009, CA-003].
- [X] T020 [P] Escrever `src/domain/trips/trip-eligibility.test.ts` e criar `src/domain/trips/trip-eligibility.ts`: `cylinderEligibility` (ativo, em estoque, teste em dia ou a vencer; recusa `inactive`, `out_of_stock`, `hydro_expired`, `hydro_rejected`), `vehicleEligibility` (disponível), `driverEligibility` (ativo; CNH vencida impede iniciar; a vencer só avisa) e `licensingWarning` (licenciamento vencido só avisa), usando `validityStatus` da Spec 007 [RF-005, RF-011; premissa 5].
- [X] T021 [P] Escrever `src/domain/trips/trip-summary.test.ts` e criar `src/domain/trips/trip-summary.ts`: total de paradas e de cilindros, capacidade restante do veículo, avisos e verificação de capacidade; mesmo cilindro em duas paradas recusado [RF-002, RF-003].
- [X] T022 Escrever `src/domain/trips/trip-validation.test.ts` e criar `src/domain/trips/trip-validation.ts` (zod) com as regras de formulário da viagem, da entrega (nome e função do recebedor, horário não futuro, posição ambas ou nenhuma, justificativa por cilindro não entregue), do desbloqueio e do cancelamento, usando os limites acima; mensagens em português junto do campo, sem culpar a pessoa.

### Funções e serviço, base

- [X] T023 Acrescentar ao catálogo de `supabase/functions/_shared/operations.ts` os códigos novos do contrato (`CYLINDER_RESERVED`, `CYLINDER_NOT_ELIGIBLE`, `CAPACITY_EXCEEDED`, `RESOURCE_BUSY`, `DRIVER_LICENSE_EXPIRED`, `INVALID_TRANSITION`, `ITEMS_PENDING`, `STOPS_OPEN`, `TRIP_CLOSED`, `STOP_CLOSED`, `REQUEST_REUSED`) com o HTTP de `contracts/operacoes-servidor.md`, **sem mudar o comportamento** das funções existentes, e estender os testes dessa borda.
- [X] T024 [P] Criar `src/application/trips/trip-service.ts` (esqueleto sobre `createFunctionTransport`, com `RegistryFunction` estendido por `query-trips` e `manage-trips`, mapeamento dos códigos de erro para estados de tela e geração de `request_id` por comando) e `src/application/trips/trip-service.test.ts`; o serviço nunca guarda resposta em armazenamento local e devolve `offline` sem chamar o servidor.
- [X] T025 [P] Atualizar `src/domain/navigation/screens.ts` com `viagens` (`/viagens`, `trip.read`, `tenantScoped: true`, `requireAal2: false`, ícone oficial `localizacao`) e os testes da Spec 004 que contam telas e itens do menu.
- [X] T026 Criar `src/app/trips/trip-routes.ts` e `trip-routes.test.ts` (resolver das 4 rotas de `contracts/telas-e-rotas.md`, permissão por rota, rota desconhecida cai em "não encontrado") e ligar o resolvedor em `src/app/App.tsx` no padrão de `registry-routes.ts` (`ProtectedRoute` e `TenantGate`); as telas entram com as histórias.
- [X] T027 [P] Criar `tests/e2e/support/mock-trips.ts` (base do backend simulado das duas funções, com isolamento por organização, permissões, sequência de histórico e `request_id`) e acoplá-lo a `mock-backend.ts`; as histórias estendem o simulado com suas operações.
- [X] T028 [P] Criar `tests/support/sql/trips-volume-semear.sql` e `trips-volume-limpar.sql` (10 mil viagens, 50 mil paradas e 200 mil itens de carga em organização própria, com `generate_series`, dados fictícios) para as medições de desempenho [RNF-001].

---

## Fase 3 — US1: Planejar uma viagem com paradas e cilindros (P1) 🎯 MVP

**Objetivo**: planejar a viagem completa e vê-la salva, com reserva atômica dos cilindros.

**Teste independente**: com o administrador do Tenant A, planejar uma viagem com duas paradas e quatro cilindros, ver o resumo, salvar, reabrir e conferir ordem, cilindros, veículo e motorista; tentar um cilindro já reservado e ser recusado; com o Tenant B, confirmar que nada aparece.

### Testes primeiro (RED)

- [X] T029 [P] [US1] Escrever `supabase/tests/008_plan.test.sql`: `create_trip` cria `planned` com número sequencial por organização (`private.trip_counters`), evento `trip_created`, evento `trip_reserved` no histórico de cada cilindro e auditoria `trip.create` **sem observações em texto aberto**; recusa veículo que não está disponível, motorista ou unidade ou cliente inativos (`PARENT_INACTIVE`), cilindro inativo, fora do estoque, com teste vencido ou reprovado (`CYLINDER_NOT_ELIGIBLE` com `reason`), cilindro repetido na mesma viagem, mais cilindros que a capacidade (`CAPACITY_EXCEEDED`), 0 ou mais de 30 paradas, 0 ou mais de 200 cilindros por parada, data prevista anterior a hoje no fuso de São Paulo em `create_trip` (aceita em `update_trip` de viagem já planejada, que a leitura marca como `overdue`); `update_trip` só em `planned` ou `loading`, reservas acompanham a edição (cilindro novo reservado e removido liberado com `trip_released`), evento com valores anteriores e novos e `VERSION_CONFLICT` na segunda gravação; veículo, motorista, unidade e cilindro de outra organização respondem `NOT_FOUND` [RF-001 a RF-006, RF-024]. `create_trip` aceita viagem com cliente que depois foi anonimizado: o nome continua o fixo "anonimizado" e a viagem segue operável; datas coincidentes com outra viagem `planned` do mesmo veículo ou motorista são aceitas [RF-001a, RF-006a].
- [X] T030 [P] [US1] Escrever `supabase/tests/008_reservation_concurrency.test.sql` e `tests/integration/trips-reservation.live.test.ts`: duas conexões planejando ao mesmo tempo viagens com o mesmo cilindro (uma vence e a outra recebe `CYLINDER_RESERVED` com `trip_id` e `trip_number` da vencedora); duas viagens com os mesmos cilindros em ordem diferente não geram deadlock; 50 repetições sem nenhuma reserva duplicada [RF-004, RNF-002, CA-002, MS-004]. Também: duas conexões iniciando o carregamento de viagens diferentes com o mesmo veículo (e depois com o mesmo motorista): uma vence e a outra recebe `RESOURCE_BUSY` com a viagem que ocupa o recurso [RF-006a].
- [X] T031 [P] [US1] Escrever `supabase/tests/008_idempotency.test.sql` como teste **por operação**: percorre os 14 comandos de `manage-trips` e confere que repetir o mesmo `request_id` devolve o resultado gravado com `replayed: true` sem efeito duplicado (viagem, reserva, item, entrega, desbloqueio ou evento), que o mesmo `request_id` com outra operação ou outra viagem responde `REQUEST_REUSED` e que `request_id` de outra organização não colide; as operações das histórias seguintes entram na lista conforme são criadas [research.md, decisão 5].
- [X] T032 [P] [US1] Escrever a parte leitura de `supabase/tests/008_rls.test.sql` e de `supabase/tests/008_permissions.test.sql` para US1: `get_trip`, `list_trips`, `trip_options` e `list_eligible_cylinders` só devolvem dados da organização do ator, exigem as permissões do contrato (`trip.read`, `trip.write`) e respondem `NOT_FOUND` a id de outra organização; `trip_options` só devolve veículos disponíveis, motoristas ativos e unidades ativas de clientes ativos; `list_eligible_cylinders` não devolve cilindro reservado, inativo, fora do estoque ou com teste vencido ou reprovado [RF-029, RF-030, CA-001].
- [X] T033 [P] [US1] Escrever `tests/contract/query-trips-handler.test.ts` e `tests/contract/manage-trips-handler.test.ts` (parte planejamento): autenticação, método, operação desconhecida (`VALIDATION_FAILED` e auditoria `denied`), corpo inválido, `request_id` obrigatório nos comandos, `organization_id` divergente da sessão, mapeamento HTTP e nenhuma operação de exclusão [RF-030, RF-033].
- [X] T034 [P] [US1] Escrever `src/application/trips/trip-service.test.ts` (parte planejamento): cada falha de servidor vira um estado de tela (`CYLINDER_RESERVED` com a viagem, `CAPACITY_EXCEEDED`, `CYLINDER_NOT_ELIGIBLE` com o motivo, `PARENT_INACTIVE`), `request_id` novo por tentativa e o mesmo na repetição do mesmo envio, `offline` sem chamada e nada em `localStorage`, `sessionStorage` ou IndexedDB.
- [X] T035 [P] [US1] Escrever `src/pages/trips/components/stop-editor.test.tsx`, `cylinder-picker.test.tsx` e `trip-summary-panel.test.tsx`: paradas (acrescentar, remover, subir e descer com teclado, no máximo 30), busca paginada de cilindros elegíveis com seleção por teclado e contador "x de capacidade", recusa em texto (reservado em qual viagem, teste vencido), resumo com capacidade e avisos de CNH e de licenciamento, tudo anunciado em um único `role="status"`.
- [X] T036 [P] [US1] Escrever `src/pages/trips/trip-form-page.test.tsx` e `trip-detail-page.test.tsx` (parte planejada): erros junto dos campos e foco no primeiro erro, um único envio, rota sem permissão nega sem exibir o formulário, conflito de versão orienta recarregar, escrita desabilitada offline com o motivo, detalhe mostra paradas, cilindros e situações em texto e ícone. Viagem "planejada" ou "carregando" com data passada aparece como "atrasada", em texto e ícone [RF-001a].
- [X] T037 [P] [US1] Escrever `tests/e2e/viagens-planejamento.spec.ts`: planejar com duas paradas e quatro cilindros, ver o resumo e salvar; recusas (cilindro reservado, teste vencido, capacidade); editar e reordenar; Tenant B não vê a viagem e a rota do A responde "Viagem não encontrada"; duplo clique não duplica.

### Implementação (GREEN)

- [X] T038 [US1] Criar `supabase/migrations/2026100900xxxx_trips_plan.sql` com `create_trip`, `update_trip`, `get_trip`, `list_trips` (filtro e ordenação mínimos), `trip_options` e `list_eligible_cylinders` (`security definer`, `set search_path = ''`, `private.actor_has_permission` primeiro, `grant` só ao `service_role`), `private.append_trip_event` (sequência contínua por viagem sob `for update`), reserva ordenando os cilindros por `id` e travando com `for update`, tradução da violação do índice parcial em `CYLINDER_RESERVED`, capacidade, elegibilidade, número por organização, idempotência por `private.trip_requests`, eventos `trip_reserved` e `trip_released` no cilindro (via `private.append_cylinder_event`), auditoria na mesma transação e **sem observações nem nome em texto aberto** [RF-001 a RF-006, RF-024, RF-029; research.md, decisões 2, 5 e 6].
- [X] T039 [US1] Criar `supabase/functions/query-trips/{deno.json,handler.ts,index.ts}` e `supabase/functions/manage-trips/{deno.json,handler.ts,index.ts}` sobre `_shared/operations.ts`, com as operações `create_trip`, `update_trip`, `get_trip`, `list_trips`, `trip_options` e `list_eligible_cylinders`, regras de campo iguais às restrições do `data-model.md`, `request_id` obrigatório nos comandos e nenhum registro de corpo nem de resposta.
- [X] T040 [US1] Carregar as funções novas (`npx supabase stop` e `npx supabase start`), rodar `npx supabase db reset`, `npx supabase test db` e os testes de função; todas as suítes desta fase passam.
- [X] T041 [US1] Implementar em `src/application/trips/trip-service.ts` os comandos e consultas de planejamento e em `src/application/trips/trip-views.ts` as visões de leitura (snake_case para camelCase, valor desconhecido recusado, nunca presumido), com `trip-views.test.ts`.
- [X] T042 [P] [US1] Criar os componentes `stop-editor.tsx`, `cylinder-picker.tsx` e `trip-summary-panel.tsx` em `src/pages/trips/components/`, com a skill `ui-ux-pro-max`, só tokens, rótulos visíveis, ajuda e erros associados, foco devolvido ao disparador e o resultado anunciado em `role="status"` uma vez.
- [X] T043 [US1] Criar `src/pages/trips/trip-form-page.tsx` (cadastro e edição em modal pelo padrão da Spec 007, seções na mesma página, um único envio), `trip-detail-page.tsx` (cabeçalho, paradas, cilindros e situações) e `trip-list-page.tsx` (lista simples com estados de carregamento, vazio, erro e offline), ligadas às rotas `/viagens`, `/viagens/nova`, `/viagens/<id>` e `/viagens/<id>/editar`, com `React.lazy` em `src/pages/trips/trips-area.tsx`. Mostrar a marca "atrasada" em texto e ícone quando `overdue` for verdadeiro [RF-001a].
- [X] T044 [US1] Estender `tests/e2e/support/mock-trips.ts` com `create_trip`, `update_trip`, `get_trip`, `list_trips`, `trip_options` e `list_eligible_cylinders` e rodar `npm run build` e `npx playwright test tests/e2e/viagens-planejamento.spec.ts` nos projetos desktop e mobile; conferir a captura da tela no celular.
- [X] T045 [US1] Rodar a regressão: `npm run lint`, `npm run typecheck`, `npm test`, `npx supabase test db`; conferir que `008_reservation_concurrency` passa.

**Ponto de verificação**: viagem planejada com reserva atômica de cilindros, isolada por tenant.

---

## Fase 4 — US2: Conferir o carregamento e iniciar a viagem (P1)

**Objetivo**: conferir cada cilindro, retirar o que não pode seguir (com exceção) e iniciar a viagem com bloqueio lógico, saída do estoque e custódia.

**Teste independente**: viagem com três cilindros: conferir dois e tentar iniciar (recusado, mostra o que falta); conferir o terceiro e iniciar (três em trânsito e a viagem em andamento).

### Testes primeiro (RED)

- [X] T046 [P] [US2] Escrever `supabase/tests/008_transitions.test.sql` (parte carregamento e início): `start_loading` (`planned → loading`), `revert_loading` (só se nada foi conferido), `check_item`, `uncheck_item` e `remove_item` só em `loading`, `start_trip` só em `loading`; `update_trip` em `in_progress`, `completed` ou `cancelled` responde `INVALID_TRANSITION` (ou `TRIP_CLOSED` nas duas finais) e nada muda; **todas** as transições inválidas respondem `INVALID_TRANSITION` com `from` e `to`, inclusive por chamada direta à RPC; `expected_version` antigo responde `VERSION_CONFLICT` [RF-007, RF-010, CA-003].
- [X] T047 [P] [US2] Escrever `supabase/tests/008_loading_start.test.sql`: conferência grava quem e quando e `check_source = 'manual'`; desfazer volta a `planned`; `remove_item` exige `trip.operate` **e** `trip.exception`, justificativa e libera a reserva com `trip_released` e `divergence_reason`; `start_loading` e `start_trip` recusam com `RESOURCE_BUSY` (`entity`, `trip_id`, `trip_number`) quando o veículo ou o motorista já estão em outra viagem `loading` ou `in_progress`, e duas viagens `planned` com o mesmo veículo ou motorista são aceitas; `start_trip` recusa com `ITEMS_PENDING` e a lista de itens faltando, com `DRIVER_LICENSE_EXPIRED`, com teste que venceu depois do planejamento (`CYLINDER_NOT_ELIGIBLE`), com veículo que saiu de "disponível" e com motorista, cliente ou unidade inativados (`PARENT_INACTIVE`); no início, itens vão a `in_transit` e `locked`, cilindros a `out_of_stock` e `custody_status = in_transit`, com evento `trip_departed` em cada um e auditoria `trip.start`; nada muda se qualquer verificação falha [RF-010 a RF-012, RF-024, CA-004]. Também: trocar o veículo de uma viagem em carregamento por outro com capacidade menor que a quantidade de cilindros é recusado (`CAPACITY_EXCEEDED`) [RF-006a].
- [X] T048 [P] [US2] Escrever em `supabase/tests/008_permissions.test.sql` (parte operação) que cada operação de US2 nega quem não tem a permissão do contrato e que `stock_operator` confere mas não retira nem inicia sem as permissões.
- [X] T049 [P] [US2] Escrever `tests/contract/manage-trips-handler.test.ts` (parte carregamento e início) e `src/application/trips/trip-service.test.ts` (parte carregamento): mapeamento de `ITEMS_PENDING`, `INVALID_TRANSITION`, `DRIVER_LICENSE_EXPIRED` e dos demais para estados de tela.
- [X] T050 [P] [US2] Escrever `src/pages/trips/components/loading-panel.test.tsx` e `remove-item-dialog.test.tsx`: lista de conferência com "Conferir" e "Desfazer", contador "x de y conferidos" anunciado, "Iniciar viagem" desabilitado com o motivo enquanto falta algo, retirada com justificativa obrigatória e foco devolvido, resultado em um único `role="status"`.
- [X] T051 [P] [US2] Escrever `tests/e2e/viagens-carregamento.spec.ts`: conferir dois de três, tentar iniciar (recusado), conferir o terceiro e iniciar; retirar um com justificativa; CNH vencida impede iniciar; viagem iniciada mostra "em trânsito" e "bloqueado (lógico)" com o aviso da Fase 6; só com teclado.

### Implementação (GREEN)

- [X] T052 [US2] Criar `supabase/migrations/2026100900xxxx_trips_loading_start.sql` com `start_loading`, `revert_loading`, `check_item`, `uncheck_item`, `remove_item` e `start_trip` (funções de transição que conferem o estado de origem sob `for update`, revalidação completa no início, efeitos sobre cilindro e estoque, eventos de viagem e de cilindro, idempotência, auditoria na mesma transação) [RF-007, RF-010 a RF-012, RF-024].
- [X] T053 [US2] Acrescentar essas operações a `supabase/functions/manage-trips/handler.ts`, rodar `npx supabase stop`, `npx supabase start`, `npx supabase db reset` e `npx supabase test db`; as suítes desta fase passam.
- [X] T054 [US2] Implementar em `src/application/trips/trip-service.ts` os comandos de carregamento e início e criar `src/pages/trips/components/loading-panel.tsx` e `remove-item-dialog.tsx` (skill `ui-ux-pro-max`, só tokens, três situações independentes do item mostradas em texto e ícone), ligados ao detalhe da viagem, com as ações permitidas por situação.
- [X] T055 [US2] Estender `tests/e2e/support/mock-trips.ts` com as operações de US2, rodar `npm run build` e `npx playwright test tests/e2e/viagens-carregamento.spec.ts` nos projetos desktop e mobile.
- [X] T056 [US2] Rodar a regressão (`lint`, `typecheck`, `test`, `supabase test db`); conferir que as suítes das Specs 006 e 007 continuam verdes com os eventos e colunas novos.

**Ponto de verificação**: viagem iniciada só com tudo conferido e bloqueado, com custódia e estoque coerentes.

---

## Fase 5 — US3: Registrar a entrega ou a divergência em cada parada (P1)

**Objetivo**: registrar chegada e entrega por parada, com recebedor, horário e posição, e tratar a divergência.

**Teste independente**: viagem com duas paradas: entregar a primeira por completo (recebedor, horário, posição) e registrar a segunda com um cilindro não entregue e justificativa; conferir estados das paradas, dos itens e dos cilindros.

### Testes primeiro (RED)

- [X] T057 [P] [US3] Escrever `supabase/tests/008_delivery.test.sql`: `arrive_stop` só em viagem `in_progress` e parada `pending`, em qualquer ordem: fora da ordem planejada grava `out_of_order = true` e a marca no evento `stop_arrived`, sem mudar `position` [RF-013]; `register_delivery` uma vez por parada, com resultado de cada cilindro previsto, `recipient_name` de 2 a 120 e `recipient_role` até 80, horário não futuro, posição ambas ou nenhuma; entregues vão a `delivered` e o cilindro a `at_customer` com `custody_site_id` da parada e evento `trip_delivered`; não entregue exige `reason` e fica `not_delivered` (cilindro continua em trânsito); parada vai a `delivered` ou `with_divergence`; cilindro que não estava previsto na parada é recusado (`VALIDATION_FAILED`, RF-014); viagem não iniciada ou encerrada responde `INVALID_TRANSITION`/`TRIP_CLOSED`; parada fechada responde `STOP_CLOSED`; correção com `supersedes_id` grava novo registro, evento `delivery_corrected` e preserva o original; idempotência por `request_id` [RF-013 a RF-015, RF-024].
- [X] T058 [P] [US3] Escrever `supabase/tests/008_delivery_geofence.test.sql`: posição dentro da geocerca ativa da unidade grava `outside_geofence = false`, fora grava `true` e é aceita, sem geocerca ativa ou sem posição grava nulo; `at_site_address` aceito sem coordenadas; usa a função de ponto-dentro da Spec 007 [RF-016].
- [X] T059 [P] [US3] Escrever `supabase/tests/008_history_audit.test.sql` (parte entrega): evento `delivery_registered` e auditoria `trip.deliver` guardam só `has_recipient`, contagens e `outside_geofence`; **nem o nome, nem a função, nem a posição, nem as justificativas** aparecem em evento ou auditoria em texto aberto; `get_trip` devolve o nome só a quem tem `trip.recipient` e `"(restrito)"` aos demais [RF-017, RF-032, CA-007].
- [X] T060 [P] [US3] Escrever `tests/contract/trips-no-recipient-in-logs.test.ts`: os manipuladores de `manage-trips` e `query-trips` nunca registram corpo nem resposta (captura de `console`), e uma varredura do código confirma que nenhum log, evento ou auditoria recebe `recipient_name` ou `recipient_role` [CA-007].
- [X] T061 [P] [US3] Escrever `tests/contract/manage-trips-handler.test.ts` (parte entrega) e `src/application/trips/trip-service.test.ts` (parte entrega): validação do corpo (resultado de cada cilindro, recebedor, posição), mapeamento de `STOP_CLOSED`, `TRIP_CLOSED` e `INVALID_TRANSITION`, `outside_geofence` devolvido à tela.
- [X] T062 [P] [US3] Escrever `src/pages/trips/components/delivery-dialog.test.tsx` e `arrive-stop-action.test.tsx`: resultado por cilindro, nome e função do recebedor, horário, posição opcional com aviso de fora da geocerca em texto, justificativa obrigatória por cilindro não entregue, erro junto do campo, foco e anúncio; correção abre o diálogo com o registro anterior à vista.
- [X] T063 [P] [US3] Escrever `tests/e2e/viagens-entrega.spec.ts`: chegada e entrega completa na parada 1; divergência na parada 2; correção posterior; auditor não vê o nome do recebedor (mostra "(restrito)"); só com teclado.

### Implementação (GREEN)

- [X] T064 [US3] Criar `supabase/migrations/2026100900xxxx_trips_delivery.sql` com `arrive_stop` e `register_delivery` (inclui a correção por `supersedes_id`), comparação com a geocerca pela função da Spec 007, efeitos sobre item e cilindro, eventos e auditoria **sem dado pessoal em texto aberto**, idempotência, e a leitura do recebedor mascarada em `get_trip` por `trip.recipient` [RF-013 a RF-017, RF-024, RF-032].
- [X] T065 [US3] Acrescentar essas operações a `supabase/functions/manage-trips/handler.ts`, recarregar as funções e rodar `npx supabase db reset` e `npx supabase test db`; as suítes desta fase passam.
- [X] T066 [US3] Implementar em `src/application/trips/trip-service.ts` os comandos de chegada e entrega e criar `src/pages/trips/components/delivery-dialog.tsx` e `arrive-stop-action.tsx` (skill `ui-ux-pro-max`, só tokens), ligados à parada no detalhe da viagem; o nome do recebedor só aparece quando o servidor o devolve.
- [X] T067 [US3] Estender `tests/e2e/support/mock-trips.ts` com as operações de US3, rodar `npm run build` e `npx playwright test tests/e2e/viagens-entrega.spec.ts` nos projetos desktop e mobile.
- [X] T068 [US3] Rodar a regressão (`lint`, `typecheck`, `test`, `supabase test db`); conferir `tests/contract/trips-no-recipient-in-logs.test.ts`.

**Ponto de verificação**: entrega e divergência registradas por parada, sem dado pessoal fora de lugar.

---

## Fase 6 — US4: Registrar o desbloqueio como ato independente (P2)

**Objetivo**: desbloqueio normal (item entregue) e excepcional (item em trânsito), independente da entrega.

**Teste independente**: entregar dois cilindros, desbloquear um e ver o outro bloqueado; tentar desbloquear um cilindro em trânsito sem segundo fator e ser recusado.

### Testes primeiro (RED)

- [X] T069 [P] [US4] Escrever `supabase/tests/008_unlock.test.sql`: `register_unlock` de item `delivered` com `trip.unlock` passa `locked → unlocked`, grava `trip_unlocks` com autor, horário e `aal`, evento `unlock_registered` e auditoria `trip.unlock` sem a justificativa em texto aberto; **não altera** a situação da entrega nem do cilindro; item em trânsito ou `not_delivered` exige `trip.unlock` **e** `trip.exception`, justificativa e `aal2` (sem o segundo fator responde `MFA_REQUIRED`, sem justificativa `JUSTIFICATION_REQUIRED`, sem `trip.exception` `ACCESS_DENIED`); segundo desbloqueio do mesmo item recusado; não existe operação de refazer o bloqueio [RF-018, RF-019, CA-005].
- [X] T070 [P] [US4] Escrever `tests/contract/manage-trips-handler.test.ts` (parte desbloqueio) e `src/application/trips/trip-service.test.ts` (parte desbloqueio): `MFA_REQUIRED` leva a tela ao fluxo do segundo fator já existente; nenhuma chamada sai da tela sem os campos obrigatórios.
- [X] T071 [P] [US4] Escrever `src/pages/trips/components/unlock-dialog.test.tsx`: diálogo com o aviso "registro lógico; a trava do lacre será comandada na Fase 6", campo de justificativa obrigatório no excepcional, passo do segundo fator, anúncio e foco.
- [X] T072 [P] [US4] Escrever `tests/e2e/viagens-desbloqueio.spec.ts`: desbloqueio normal de um cilindro entregue com o outro continuando bloqueado; excepcional recusado sem segundo fator e aceito com ele; auditor não vê a ação.

### Implementação (GREEN)

- [X] T073 [US4] Criar `supabase/migrations/2026100900xxxx_trips_unlock.sql` com `register_unlock` (normal e excepcional, `aal2` lido da sessão do ator, justificativa, idempotência, evento e auditoria na mesma transação) [RF-018 a RF-020].
- [X] T074 [US4] Acrescentar a operação a `supabase/functions/manage-trips/handler.ts`, recarregar as funções e rodar `npx supabase db reset` e `npx supabase test db`.
- [X] T075 [US4] Implementar em `src/application/trips/trip-service.ts` o comando de desbloqueio e criar `src/pages/trips/components/unlock-dialog.tsx` (skill `ui-ux-pro-max`, só tokens), ligado a cada item entregue ou em trânsito, com o aviso do registro lógico.
- [X] T076 [US4] Estender `tests/e2e/support/mock-trips.ts`, rodar `npm run build` e `npx playwright test tests/e2e/viagens-desbloqueio.spec.ts`; rodar a regressão.

**Ponto de verificação**: entrega e desbloqueio como registros independentes, com `aal2` no excepcional.

---

## Fase 7 — US5: Concluir ou cancelar uma viagem (P2)

**Objetivo**: concluir com todas as paradas encerradas, cancelar liberando reservas e retornar ao estoque o que ficou em trânsito.

**Teste independente**: concluir uma viagem com todas as paradas encerradas; cancelar outra planejada e ver os cilindros disponíveis de novo; tentar concluir com parada aberta e ser recusado.

### Testes primeiro (RED)

- [X] T077 [P] [US5] Escrever `supabase/tests/008_close.test.sql`: `complete_trip` só em `in_progress` com todas as paradas `delivered` ou `with_divergence` e cada item `not_delivered` com decisão (entregue por correção ou retornado), senão `STOPS_OPEN`; `cancel_trip` de `planned` e `loading` exige `trip.cancel` e justificativa, libera as reservas (`released`, `trip_released` no cilindro) e deixa os cilindros disponíveis; de `in_progress` exige também `trip.exception` e mantém em trânsito o que já saiu; viagem `completed` ou `cancelled` não aceita edição nem operação (`TRIP_CLOSED`); `return_item` exige `trip.operate` e `trip.exception`, justificativa, item `in_transit` ou `not_delivered`, leva o cilindro a `in_stock` e `in_organization`, evento `trip_returned` [RF-021 a RF-023, RF-024].
- [X] T078 [P] [US5] Escrever `tests/contract/manage-trips-handler.test.ts` (parte encerramento) e `src/application/trips/trip-service.test.ts` (parte encerramento): `STOPS_OPEN` com as paradas, `TRIP_CLOSED`, justificativa obrigatória.
- [X] T079 [P] [US5] Escrever `src/pages/trips/components/cancel-dialog.test.tsx` e `return-item-dialog.test.tsx` e as partes de conclusão em `trip-detail-page.test.tsx`: justificativa obrigatória, aviso de que o cancelamento em andamento mantém os cilindros em trânsito, "Concluir viagem" desabilitado com o motivo, foco e anúncio.
- [X] T080 [P] [US5] Escrever `tests/e2e/viagens-encerramento.spec.ts`: concluir; cancelar planejada e ver os cilindros elegíveis de novo; cancelar em andamento com exceção; retornar ao estoque; viagem encerrada sem ações de edição.

### Implementação (GREEN)

- [X] T081 [US5] Criar `supabase/migrations/2026100900xxxx_trips_close.sql` com `complete_trip`, `cancel_trip` e `return_item` (transições sob `for update`, efeitos sobre item e cilindro, eventos, idempotência e auditoria na mesma transação) [RF-021 a RF-023]. [RF-022]
- [X] T082 [US5] Acrescentar as operações a `supabase/functions/manage-trips/handler.ts`, recarregar as funções e rodar `npx supabase db reset` e `npx supabase test db`.
- [X] T083 [US5] Implementar em `src/application/trips/trip-service.ts` os comandos de encerramento e criar `src/pages/trips/components/cancel-dialog.tsx` e `return-item-dialog.tsx` (skill `ui-ux-pro-max`, só tokens), ligados ao detalhe.
- [X] T084 [US5] Estender `tests/e2e/support/mock-trips.ts`, rodar `npm run build` e `npx playwright test tests/e2e/viagens-encerramento.spec.ts`; rodar a regressão.

**Ponto de verificação**: ciclo completo da viagem, do planejamento ao encerramento.

---

## Fase 8 — US6: Consultar viagens e o histórico (P2)

**Objetivo**: lista com busca e filtros, histórico imutável e viagens por cilindro e por unidade.

**Teste independente**: com viagens em todas as situações, filtrar por cada uma, abrir o detalhe de uma concluída e reconstruir quem fez o quê e quando, sem editar nada.

### Testes primeiro (RED)

- [X] T085 [P] [US6] Escrever `supabase/tests/008_query.test.sql`: `list_trips` com busca (número, placa, motorista, cliente), filtros (situação, período, veículo, motorista, cliente), ordenação, cursor, total, filtro padrão "abertas"; `trips_of_cylinder` e `trips_of_site` exigem `trip.read` e a leitura do cadastro de origem; o Tenant B nunca aparece para o A [RF-026, RF-027, CA-001].
- [X] T086 [P] [US6] Escrever `supabase/tests/008_history_audit.test.sql` (parte histórico): `trip_history` exige `trip.history`, é paginado por sequência (crescente e decrescente), filtra por tipo e período, não traz dado pessoal e é imutável; eventos de custódia aparecem no histórico do cilindro com a viagem; o auditor consulta tudo e não tem ação de escrita [RF-025, CA-006].
- [X] T087 [P] [US6] Escrever `tests/contract/trips-permissions.test.ts` (catálogo e papéis iguais ao contrato) e `tests/contract/trips-no-delete.test.ts` (nenhuma operação de exclusão em `query-trips`, `manage-trips` nem no serviço) [RF-031, RF-033].
- [X] T088 [P] [US6] Escrever `src/domain/trips/trip-history-format.test.ts` e criar `src/domain/trips/trip-history-format.ts`: texto de cada tipo de evento sem dado pessoal, com valores anteriores e novos nas edições.
- [X] T089 [P] [US6] Escrever `src/pages/trips/trip-list-page.test.tsx` e `src/pages/trips/components/trip-history-list.test.tsx`: busca e filtros combinados, paginação mantendo os filtros, total anunciado, estados vazio e erro, histórico com filtro e paginação, links entre veículo, motorista, cliente, unidade e cilindro, e "Viagens" nos detalhes de cilindro e de unidade. Filtro por custódia ("em trânsito", "no cliente") e a marca "atrasada" na lista [RF-001a, RF-024].
- [X] T090 [P] [US6] Escrever `tests/e2e/viagens-consulta.spec.ts`: filtros, histórico de uma viagem concluída, auditor sem ações de escrita e sem o nome do recebedor, detalhes de cilindro e de unidade com "Viagens".

### Implementação (GREEN)

- [X] T091 [US6] Criar `supabase/migrations/2026100900xxxx_trips_history.sql` com os filtros completos de `list_trips`, `trip_history`, `trips_of_cylinder` e `trips_of_site` e os índices do `research.md` (decisão 13).
- [X] T092 [US6] Acrescentar as operações a `supabase/functions/query-trips/handler.ts`, recarregar as funções e rodar `npx supabase db reset` e `npx supabase test db`.
- [X] T093 [US6] Implementar em `src/application/trips/trip-service.ts` as consultas, completar `trip-list-page.tsx` (tabela a partir de 768 px, cartões abaixo, filtros), criar `src/pages/trips/components/trip-history-list.tsx` e a aba "Histórico" do detalhe, e acrescentar o bloco "Viagens" aos detalhes de cilindro (`src/pages/cylinders/`) e de unidade (`src/pages/registry/customers/site-detail-page.tsx`), cada um sob a permissão de leitura do cadastro de origem, com a skill `ui-ux-pro-max`. Mostrar `custody_status` e a unidade do cliente (quando "no cliente") no detalhe e na lista de cilindros, com filtro por custódia, estendendo `supabase/functions/query-cylinders` e `src/pages/cylinders/` sem mudar o comportamento atual [RF-024].
- [X] T094 [US6] Estender `tests/e2e/support/mock-trips.ts`, rodar `npm run build` e `npx playwright test tests/e2e/viagens-consulta.spec.ts`; rodar a regressão.

**Ponto de verificação**: viagens consultáveis e história reconstruível por quem tem permissão.

---

## Fase 9 — US7: Usar tudo em celular, tablet e desktop, só com teclado (P3)

**Objetivo**: responsividade, teclado, leitor de tela, estados e offline em todas as telas de viagem.

**Teste independente**: abrir cada tela em 360, 768 e 1920 px, percorrer os fluxos só com teclado, rodar o axe e ligar o modo offline.

- [X] T095 [P] [US7] Escrever `tests/e2e/viagens-acessibilidade.spec.ts`: axe sem violação crítica ou grave e sem rolagem horizontal em 360, 768 e 1920 px na lista, no formulário, no detalhe e em cada diálogo; navegação só com teclado (planejar, conferir, entregar, desbloquear, cancelar); foco devolvido ao disparador; no máximo um `role="status"` por tela; `prefers-reduced-motion` respeitado [RNF-003, CA-008, MS-008].
- [X] T096 [P] [US7] Escrever `tests/e2e/viagens-offline.spec.ts`: sem conexão a estrutura aparece, as escritas ficam desabilitadas com o motivo "Esta operação exige conexão" e nada é guardado em `localStorage`, `sessionStorage` nem IndexedDB; ao voltar a conexão, as ações voltam; resposta perdida no meio do envio mostra "resultado desconhecido" e repetir não duplica [spec, história 7 e casos de borda]. Sessão expirada no meio de uma operação não grava nada e leva a pessoa a entrar de novo.
- [X] T097 [P] [US7] Escrever `tests/e2e/visual/viagens.visual.spec.ts` e gerar as capturas no Linux com `npm run test:visual:atualizar` (lista, formulário, detalhe com cada situação e diálogos); nunca versionar `*-win32.png`.
- [X] T098 [US7] Corrigir o que os testes T095 a T097 apontarem nas telas de `src/pages/trips/` (rótulos, ordem de foco, contraste, alvos de toque de 44 px, tabela que vira cartões, texto longo que quebra), só com tokens, e repetir os testes até passarem.

---

## Fase 10 — Acabamento e encerramento

- [X] T099 [P] Rodar `tests/contract/escalas-no-codigo.test.ts`, `tests/contract/no-external-assets.test.ts` e `tests/contract/client-secrets.test.ts` e corrigir qualquer valor arbitrário, recurso de terceiros ou segredo apontado nas telas e no serviço de viagens [RF-030].
- [X] T100 [P] Criar `scripts/viagens/medir-desempenho-4g.mjs` (no padrão de `scripts/registro/medir-desempenho-4g.mjs`) e medir lista e detalhe com 10 mil viagens e 200 mil itens em 4G (p95 de até 2 s e 1,5 s); registrar os números reais em `validation.md` [RNF-001].
- [X] T101 [P] Conferir o tamanho do pacote de entrada (`npm run build`): as telas de viagem ficam em chunks `React.lazy` e o pacote de entrada não cresce além do limite da linha de base; registrar em `validation.md`.
- [X] T102 [P] Atualizar `README.md`, `docs/prd.md` (nota "Situação da Fase 4 (Spec 008)": o que foi entregue e o que fica para as Fases 5 a 7), `contracts/` e `quickstart.md` ao que foi realmente construído.
- [X] T103 Rodar a rodada completa: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (sem reduzir limites nem excluir arquivos), `npx supabase db reset` e `npx supabase test db`, `npm run test:live`, `npm run build`, `npm run catalogo:build`, `npm run test:e2e` e `npm run test:visual:atualizar`; anotar os números em `specs/008-viagens-paradas-carga/validation.md`.
- [X] T104 Rodar o roteiro completo de `quickstart.md` (passos 1 a 13) e **medir com a pessoa responsável as métricas de sucesso**, registrando tempo e resultado de cada uma em `validation.md`: MS-001 (viagem com duas paradas e quatro cilindros em até 4 minutos), MS-002 (conferência de dez cilindros e início em até 5 minutos), MS-003 (entrega completa de uma parada em até 2 minutos), MS-004 e MS-005 (0 reserva duplicada e 0 vazamento entre organizações), MS-006 (100% das ações sensíveis com evento e auditoria e 0 nome de recebedor em log), MS-007 (auditor reconstrói o histórico em até 3 minutos) e MS-008 (0 violação crítica ou grave de acessibilidade e 0 rolagem horizontal).
- [X] T105 Conferir que nenhum segredo, token ou chave `service_role` entrou no cliente ou no repositório, que nenhum nome real foi usado em teste e que `git status` não contém `*-win32.png` a versionar [RF-030].
- [X] T106 **Gate de registro de IA** (AGENTS.md): `git add` explícito do código, dos testes, das migrations e das funções (sem os arquivos alheios à spec), sem commit; `npm run ia:registro -- --spec 008 --ciclo 01 --titulo "Viagens, paradas, carga e entrega"`; **entrevistar Natã Baracho** (quem validou; amostra de perfis, telas e larguras, incluindo planejamento, conferência, entrega, divergência, desbloqueio e cancelamento; ambiente; duração; resultado; itens a corrigir; decisão `utilizado`, `adaptado` ou `descartado` com justificativa; e a confirmação de que as respostas podem ser gravadas em nome da pessoa; incluir a **confirmação das premissas** da spec: conferência manual, posição informada, CNH e licenciamento, recebedor sem documento), **sem presumir nem inferir dos testes**; se houver itens a corrigir, corrigir, repetir os testes e perguntar de novo; preencher o RIA com as respostas, trocar o link de revisão pelo do pull request, incluir `docs/governanca-ia/indice.md`, rodar `npm run ia:validar` e só então commitar, sem `--no-verify`.
- [ ] T107 Abrir o pull request da branch `feat/008-viagens-paradas-carga` citando a issue da Spec 008, aguardar todos os checks verdes e a revisão humana; **não** fazer merge sem aprovação.
- [ ] T108 Depois do merge do pull request aprovado e com a `main` verde, entregar o DOCX do RIA em uma branch `docs/ria-NNN-docx` (`python scripts/governanca-ia/exportar-docx.py ...`), apontar o índice para ele e abrir um pull request só de documentação.

---

## Pendências fora desta spec

- [ ] T109 Leitura por QR Code, Data Matrix e NFC no carregamento e na entrega, GPS do celular e do lacre, fotos, assinatura e fila offline com sincronização idempotente (Fase 5); usar `check_source = 'scan'` e `request_id` já previstos.
- [ ] T110 Comando assíncrono à trava do lacre, confirmação pelo dispositivo e estado "bloqueado pelo dispositivo" (Fase 6).
- [ ] T111 Proximidade, geocerca do cliente após a entrega, alertas e relatórios (Fase 7); recolhimento de cilindros vazios do cliente e otimização de rota (specs futuras).

---

## Dependências e ordem de execução

- **Fase 1** (T001 a T005) não depende de nada.
- **Fase 2** (Fundação, T006 a T028) depende da Fase 1 e **bloqueia todas as histórias**: esquema, permissões, domínio, catálogo de operações, transporte, telas e backend simulado. Dentro dela, os testes (T006 a T012) vêm antes das migrations (T013 a T015); o domínio (T017 a T022) pode andar em paralelo ao banco.
- **US1** (Fase 3) depende da Fundação e traz o detalhe e a lista mínimos que as demais histórias usam.
- **US2** depende de US1 (precisa da viagem planejada); **US3** depende de US2 (precisa da viagem em andamento); **US4** depende de US3 (itens entregues); **US5** depende de US3 (paradas encerradas); **US6** pode começar depois de US1 e termina depois de US5 (histórico completo); **US7** depende das telas de todas.
- **Fase 10** depende de todas as histórias. T106 (gate de IA) só acontece depois da rodada completa (T103), do roteiro (T104) e da entrevista de validação humana.

### Oportunidades de paralelismo

```text
# Fundação, testes de banco juntos
Task: "supabase/tests/008_rls.test.sql"
Task: "supabase/tests/008_immutability.test.sql"
Task: "supabase/tests/008_constraints.test.sql"
Task: "supabase/tests/008_cylinder_custody.test.sql"
Task: "supabase/tests/008_permissions.test.sql"
Task: "supabase/tests/008_limits_contract.test.sql"

# Fundação, domínio em paralelo
Task: "src/domain/trips/trip-vocabulary.ts"
Task: "src/domain/trips/trip-transitions.ts"
Task: "src/domain/trips/trip-eligibility.ts"
Task: "src/domain/trips/trip-summary.ts"
```

## Estratégia de implementação

1. **MVP**: Fases 1 e 2, depois US1 (planejar com reserva atômica e consulta mínima). Parar e validar: planejar, recusar reserva duplicada, isolar por tenant.
2. **Incremental**: US2 (carregar e iniciar) → US3 (entrega e divergência) → US4 (desbloqueio) → US5 (encerrar) → US6 (consultas e histórico), cada uma validada sozinha com a regressão das Specs 001 a 007.
3. **Fechamento**: US7 (acessibilidade, offline e capturas), desempenho com o volume de referência, concorrência, bundle, documentação, roteiro do quickstart, entrevista de validação humana e RIA.

## Notas

- Nenhuma tarefa inclui `delete` de dado; toda correção é um novo registro ou uma edição com evento.
- **Nenhum nome real em testes**: recebedores, clientes e motoristas são fictícios e gerados pela suíte.
- O CI não chama nenhum serviço externo nesta spec.
- Funções novas do Supabase local exigem `npx supabase stop` e `npx supabase start` para carregar.
- O Playwright reaproveita a porta 4173: rodar `npm run build` antes dos E2E.
- As suítes pgTAP que contam linhas de `audit_logs` exigem base limpa: `npx supabase db reset` antes de `npx supabase test db`.
- Dados de teste: e-mails `@example.invalid`; nenhum dado real.
