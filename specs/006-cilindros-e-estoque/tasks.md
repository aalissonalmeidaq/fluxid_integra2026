---
description: "Tarefas executáveis da Spec 006 — Cilindros, identificadores, estoque e histórico"
---

# Tarefas: Cilindros, identificadores, estoque e histórico

**Entrada**: artefatos em `specs/006-cilindros-e-estoque/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD. Em cada incremento, escrever o teste, confirmar a falha esperada (RED), implementar (GREEN), refatorar e rodar a regressão antes de avançar. Testes de banco ficam em pgTAP (`supabase/tests/006_*.test.sql`), herméticos (rollback), com os Tenants A e B e e-mails `@example.invalid`.

**Escopo protegido**:
- Nada de dado de cilindro vem de dados de exemplo; a Visão geral e sua fonte (`src/infrastructure/overview/`) **não mudam** [RF-032, premissa 6].
- Sem dependência nova de execução no `package.json` [RNF-004]. A única extensão nova é `pg_trgm`, no banco [research.md, decisão 7].
- Sem fila offline: toda escrita exige conexão e `sync-outbox` e `local-database` não são usados [RF-035].
- Nenhuma operação de exclusão em lugar algum [RF-005, CA-003].
- Nenhuma chave `service_role` ou credencial privilegiada no cliente [RF-041]. Nenhum dado de cilindro no cache do service worker [RF-036].
- Os testes das Specs 001 a 005 só mudam onde o catálogo de telas ganha as duas entradas novas (contagens e listas de telas).

**Convenções de interface** (AGENTS.md, Spec 005): usar a skill `ui-ux-pro-max` ao criar ou alterar telas; só tokens (nenhum valor arbitrário do Tailwind, cor literal ou transição que atrase o anel de foco); `prefers-reduced-motion` respeitado; um só `h1` (logotipo) e `h2` por tela; capturas visuais regeneradas no Linux e nunca versionar `*-win32.png`. Antes de rodar E2E, rodar `npm run build`.

**Nomes de migrations**: o plano previa 3 arquivos; aqui as RPCs entram junto da história que as usa (um arquivo por história), para cada incremento ser testável sozinho. O esquema e as permissões ficam na Fundação.

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode rodar em paralelo, porque não modifica os mesmos arquivos nem depende de tarefa incompleta.
- `[USN]`: história de usuário da spec (US1 a US8, na ordem das histórias 1 a 8).
- Referências entre colchetes ligam a tarefa aos requisitos.

## Mapa das histórias

| História | Prioridade | Entrega |
|---|---|---|
| US1 Cadastrar um cilindro com seu identificador | P1 | RPCs `create`, `update`, `save_type`, formulário e catálogo de tipos |
| US2 Consultar a lista e o detalhe | P1 | RPCs `list`, `get`, `catalog`, lista (tabela e cartões), busca, filtros, detalhe |
| US3 Registrar a entrada no estoque sem duplicar | P1 | `lookup`, `stock_in` idempotente e tela "Entrada no estoque" |
| US4 Registrar e acompanhar testes hidrostáticos | P2 | `register_test`, `rectify_test`, situação calculada e formulário |
| US5 Gerenciar identificadores | P2 | `add_identifier`, `deactivate_identifier`, `transfer_identifier` |
| US6 Inativar e reativar um cilindro | P2 | `inactivate`, `reactivate`, motivo, justificativa e saída do estoque |
| US7 Consultar o histórico de custódia | P2 | `history` paginado, filtros, ordem estável, bloco de histórico |
| US8 Usar em celular, tablet e desktop, só com teclado | P2 | verificação transversal de responsividade, acessibilidade, PWA e offline |

---

## Fase 1 — Preparação

**Objetivo**: rastreabilidade e linha de base antes de qualquer mudança.

- [X] T001 Registrar em `specs/006-cilindros-e-estoque/plan.md` (seção Rastreabilidade, a criar) a issue da Spec 006 e a branch `feat/006-cilindros-e-estoque`; se a issue ainda não existir, abri-la e anotar o número, para constar na descrição do PR e no RIA [constituição VI].
- [X] T002 Rodar `npm run lint`, `npm run typecheck`, `npm test` e `supabase test db` na branch e registrar em `specs/006-cilindros-e-estoque/baseline.md` que as suítes das Specs 001 a 005 estão verdes antes da mudança, com data, ambiente e comando [CA-001].
- [X] T003 [P] Rodar `npm run build` e registrar em `specs/006-cilindros-e-estoque/baseline.md` o tamanho do pacote de entrada (limite de 593,95 kB) e as medianas de `tests/e2e/medicao-shell.spec.ts` [RNF-003, CA-010].
- [X] T004 [P] Conferir que o Supabase local sobe com `supabase stop` e `supabase start` e que as funções existentes respondem; anotar em `baseline.md` o procedimento para carregar funções novas (parar e iniciar) [quickstart.md, pré-requisitos].

---

## Fase 2 — Fundação (bloqueia as histórias)

**Objetivo**: esquema com RLS e imutabilidade, permissões, regras de domínio puras, transporte, catálogo de telas e componentes compartilhados. Sem isso nenhuma história pode ser montada.

### Banco: testes primeiro (RED)

- [X] T005 [P] Escrever `supabase/tests/006_rls.test.sql`: para cada tabela (`cylinder_types`, `cylinders`, `cylinder_identifiers`, `cylinder_tests`, `cylinder_events`), com os Tenants A e B, confirmar que o membro com permissão lê só os dados do próprio tenant e **não** vê os do outro; que `anon` não lê nada; que `authenticated` não faz `insert`, `update` nem `delete` direto; que membro sem `cylinder.read` (e sem `cylinder.history` para eventos) não lê; que perfil global sem vínculo não lê. Confirmar a falha (tabelas inexistentes) [RF-038, CA-001, MS-004].
- [X] T006 [P] Escrever `supabase/tests/006_immutability.test.sql`: `update` e `delete` em `cylinder_events` e `cylinder_tests` recusados para `authenticated` **e** `service_role`; `delete` recusado em `cylinders`, `cylinder_types` e `cylinder_identifiers`; `cylinder_identifiers` aceita só a transição `active → deactivated` (uma vez) e rejeita qualquer outra alteração; `unique (cylinder_id, sequence)` em eventos [RF-005, RF-024, CA-003, CA-004].
- [X] T007 [P] Escrever `supabase/tests/006_constraints.test.sql` com as restrições do `data-model.md`: `serial_number` obrigatório de 1 a 60 caracteres; `serial_normalized = upper(btrim(serial_number))` único por organização entre ativos e inativos (e aceito em outra organização); `manufacture_year` entre 1900 e o ano corrente; `working_pressure_bar` maior que 0; `notes` até 500; `status` em `active|inactive`; `inactivation_reason` em `written_off|lost|condemned|other`, obrigatório se `inactive`; `stock_status` em `in_stock|out_of_stock` com `inactive` implicando `out_of_stock`; identificador: `kind` em `qr_code|data_matrix|nfc_tag|hull_number`, `value` de 1 a 200 caracteres sem quebra de linha, índice único parcial (`organization_id`, `value_normalized`) onde `status = 'active'`, justificativa de desativação de 5 a 500; tipo: `gas` de 2 a 80, `capacity_value` maior que 0, `capacity_unit` em `l|m3|kg`, `classification` em `medicinal|industrial`; teste: `result` em `approved|rejected`, `executor` de 2 a 120, `report_number` até 60, `notes` até 500, justificativa de retificação de 5 a 500 [data-model.md].
- [X] T008 [P] Escrever `supabase/tests/006_permissions.test.sql`: as 7 permissões existem (escopo `tenant`, `delegable`, não críticas); `tenant_admin` as tem todas; `stock_operator` tem `read`, `write`, `stock_in`, `history`; `technical_operator` tem `read`, `identifier`, `test`, `history`; `tenant_auditor` tem `read`, `history`; `driver` e papéis globais não têm nenhuma; um tenant criado depois recebe os papéis completos; nenhum papel existente perde permissão [RF-039, contracts/permissoes-e-papeis.md].

### Banco: implementação (GREEN)

- [X] T009 Criar `supabase/migrations/20261005150000_cylinders_schema.sql` com `create extension if not exists pg_trgm with schema extensions`, as 5 tabelas conforme [data-model.md](./data-model.md) (todas com `organization_id not null references public.organizations(id)`, RLS ativada, colunas geradas `serial_normalized` e `value_normalized`, `version bigint` padrão 1, `sequence integer`), índices (GIN trigrama em `serial_normalized`; B-tree em (`organization_id`,`status`,`stock_status`) e (`organization_id`,`hydro_next_due_on`); único parcial de identificador ativo; B-tree em (`organization_id`,`value_normalized`)), políticas `select` por `private.has_permission` (`cylinder.read`; `cylinder.history` em eventos), `revoke insert, update, delete` de `anon` e `authenticated`, e gatilhos `before update or delete` que recusam alteração de eventos e testes e `delete` das demais. T005 a T007 passam a verde [RF-038, RF-005, RF-024].
- [X] T010 Criar `supabase/migrations/20261005150100_cylinders_permissions.sql`: inserir as 7 permissões (`cylinder.read`, `cylinder.write`, `cylinder.deactivate`, `cylinder.identifier`, `cylinder.stock_in`, `cylinder.test`, `cylinder.history`; escopo `tenant`, `tenant_delegable`, não críticas), atualizar `private.bootstrap_tenant_roles` para criar `tenant_auditor` ("Auditor do tenant") e conceder conforme o mapeamento, atualizar as descrições dos papéis existentes, aplicar de forma idempotente (`on conflict do nothing`) aos tenants existentes e atualizar `supabase/seed.sql` somente se o Tenant A de seed precisar do `tenant_auditor` com id fixo para as suítes. T008 passa a verde [RF-039, premissa 8].
- [X] T011 Criar `private.hydrostatic_expiring_days()` retornando 30 e `private.hydro_status(p_last_result text, p_next_due_on date)` (data de hoje em `America/Sao_Paulo`; mesma tabela de decisão de `research.md`, decisão 8) em `supabase/migrations/20261005150050_cylinders_hydro_helpers.sql`; escrever antes `supabase/tests/006_hydrostatic.test.sql` com os casos: sem teste, reprovado, vencido (ontem), `a_vencer` com 0 e 30 dias, `em_dia` com 31 dias [RF-020, RF-021, CA-008].
- [X] T012 Criar `private.next_event_sequence(p_cylinder uuid)` e `private.append_cylinder_event(...)` em `supabase/migrations/20261005150060_cylinders_event_helpers.sql`: bloqueiam a linha do cilindro (`select ... for update`), atribuem `sequence` contínua e gravam o evento; escrever antes `supabase/tests/006_history_order.test.sql` (sequência contínua, estável e sem lacunas, inclusive para eventos no mesmo instante) [RF-025].

### Domínio, serviço e catálogo (TypeScript)

- [X] T013 [P] Escrever `src/domain/cylinders/identifier.test.ts` e `src/domain/cylinders/hydrostatic-status.test.ts`: normalização de identificador (maiúsculas/minúsculas, espaços e quebras de linha nas pontas, valor vazio inválido); situação do teste na mesma tabela de casos de T011 (31, 30 e 0 dias, ontem, sem teste, reprovado após aprovado, aprovado após reprovado, retificação); `HYDROSTATIC_EXPIRING_DAYS = 30` exportado uma única vez. Confirmar a falha [RF-012, RF-020, RF-021, CA-008].
- [X] T014 Criar `src/domain/cylinders/cylinder-types.ts` (vocabulário: situações cadastral, de estoque e do teste; motivos de inativação; tipos de identificador; tipos de evento), `src/domain/cylinders/identifier.ts` (`normalizeIdentifier`) e `src/domain/cylinders/hydrostatic-status.ts` (`HYDROSTATIC_EXPIRING_DAYS`, `hydrostaticStatus(lastResult, nextDueOn, today)`), sem React. T013 passa a verde.
- [X] T015 [P] Escrever `src/domain/cylinders/cylinder-validation.test.ts` e criar `src/domain/cylinders/cylinder-validation.ts` com esquemas `zod` dos campos de cadastro, identificador, teste e justificativa, com as mesmas restrições de T007 (limites de tamanho, ano de fabricação entre 1900 e o ano corrente, pressão maior que 0, próxima data posterior à realização e até 10 anos adiante, realização não futura, justificativa de 5 a 500) e mensagens em português por campo, sem culpar a pessoa [RF-001, RF-019, RF-030, spec: exceções].
- [X] T016 [P] Escrever `src/application/cylinders/operation-key.test.ts` e criar `src/application/cylinders/operation-key.ts`: gera UUID com `crypto.randomUUID`, mantém a mesma chave enquanto o resultado for desconhecido e só gera outra após resposta definitiva [RF-014, RF-029].
- [X] T017 Escrever `src/application/cylinders/cylinder-service.test.ts` com transporte falso (padrão de `audit-service.test.ts`): cada operação envia `operation` e `organization_id` à função certa (`query-cylinders` ou `manage-cylinders`); mapeia `AUTH_REQUIRED`/`ACCESS_DENIED`, `NOT_FOUND`, `VALIDATION_FAILED` (com `fields`), `SERIAL_CONFLICT`, `IDENTIFIER_CONFLICT`, `IDENTIFIER_UNAVAILABLE`, `VERSION_CONFLICT`, `CYLINDER_INACTIVE`, `ALREADY_IN_STOCK`, `ALREADY_INACTIVE`, `IDEMPOTENCY_PAYLOAD_CONFLICT` e `INTERNAL_ERROR` para resultados tipados; resposta de rede perdida vira `unknown`; sem conexão, o serviço devolve `offline` sem chamar o transporte; nenhuma operação de exclusão existe. Em seguida criar `src/application/cylinders/cylinder-service.ts` (T017 verde) [contracts/operacoes-servidor.md, RF-035].
- [X] T018 [P] Escrever e depois alterar `src/domain/navigation/screens.ts` e seu teste `src/domain/navigation/screens.test.ts` (e `visible-screens.test.ts` se contar telas): acrescentar `{ id: 'cilindros', label: 'Cilindros', path: '/cilindros', requires: { scope: 'tenant', code: 'cylinder.read' }, tenantScoped: true, requireAal2: false }` e `{ id: 'entrada-estoque', label: 'Entrada no estoque', path: '/estoque/entrada', requires: { scope: 'tenant', code: 'cylinder.stock_in' }, tenantScoped: true, requireAal2: false }`; nenhuma regra de visibilidade existente muda [RF-027, contracts/permissoes-e-papeis.md].
- [X] T019 [P] Escrever `src/app/cylinders/cylinder-routes.test.ts` e criar `src/app/cylinders/cylinder-routes.ts`: resolve `/cilindros`, `/cilindros/novo`, `/cilindros/<uuid>` e `/cilindros/<uuid>/editar`, devolvendo a permissão da ação (`novo` e `editar` exigem `cylinder.write`; detalhe exige `cylinder.read`); `<id>` que não é UUID vira "não encontrado" sem chamada ao servidor; o resolvedor expõe a permissão exigida para que a página a confirme no servidor pela consulta de permissões da Spec 004 (`src/app/navigation/permissions-context.ts`) antes de renderizar [contracts/telas-e-rotas.md].
- [X] T020 [P] Escrever testes e criar `src/pages/cylinders/components/status-badges.tsx` (`StatusBadge` da Spec 003): três selos separados com ícone e texto, nunca só cor — cadastral (Ativo/Inativo), estoque (Em estoque/Fora do estoque), teste (Em dia/A vencer/Vencido/Reprovado/Sem teste) e aviso "Sem identificador" exibido quando `active_identifier_count` é 0 [RF-018, RF-034]. Usar a skill `ui-ux-pro-max` e só tokens.
- [X] T021 Criar `supabase/functions/query-cylinders/{deno.json,handler.ts,index.ts}` e `supabase/functions/manage-cylinders/{deno.json,handler.ts,index.ts}` seguindo `query-permissions` e `manage-membership` (autenticação do token, `POST` apenas, corpo validado, `operation` conhecida, `organization_id` UUID, gateway com as RPCs por porta, auditoria de negação/falha no manipulador); escrever antes `tests/contract/cylinders-handlers.test.ts` (método, token, corpo inválido, operação desconhecida ou de exclusão negada e auditada como `denied`, `organization_id` divergente da sessão) [RF-041, RF-043, CA-003]. Conferir se `supabase/config.toml` precisa de entrada para as funções novas.
- [X] T022 Estender `tests/e2e/support/mock-backend.ts` com respostas simuladas de `query-cylinders` e `manage-cylinders` (dois tenants, permissões por papel, conflitos, idempotência por chave) para os E2E das histórias; manter o comportamento existente.

**Checkpoint**: esquema, permissões, regras de domínio, serviço, catálogo e funções prontos. Rodar `supabase db reset`, `supabase test db`, `npm run typecheck` e `npm test`.

---

## Fase 3 — US1: Cadastrar um cilindro com seu identificador (P1) 🎯 MVP

**Objetivo**: pessoa autorizada cadastra um cilindro com o primeiro identificador; ele aparece no banco do tenant e em nenhum outro.

**Teste independente**: com o administrador do Tenant A, cadastrar um cilindro com um identificador; com o do Tenant B, confirmar que ele não existe.

### Testes primeiro (RED)

- [X] T023 [P] [US1] Escrever `supabase/tests/006_create.test.sql` para as RPCs `create_cylinder`, `update_cylinder` e `save_cylinder_type`: cria ativo e fora do estoque, vincula o identificador, grava `cylinder_created` e `identifier_added` com `sequence` 1 e 2 e **uma** linha de auditoria `cylinder.create` na mesma transação; falha atômica (conflito de identificador não cria cilindro pela metade); `SERIAL_CONFLICT` com o dono; mesmo número de série e mesmo identificador aceitos no outro tenant; ator sem `cylinder.write` e ator de outro tenant negados com a mesma resposta; edição com `expected_version` antigo → `VERSION_CONFLICT` e sem evento; edição gera `cylinder_updated` com valores anteriores e novos e auditoria `cylinder.update`; edição de cilindro **inativo** recusada (`CYLINDER_INACTIVE`); `version` sobe a cada `update` (e não sobe ao registrar identificador); duas criações simultâneas do mesmo número de série → uma aceita e outra em conflito (suíte `.live` em T042) [RF-001 a RF-004, RF-008, RF-040, RNF-005].
- [X] T024 [P] [US1] Escrever `src/pages/cylinders/cylinder-form-page.test.tsx`: erros junto de cada campo, em texto, e foco no primeiro erro; número de série, tipo de gás e capacidade obrigatórios; conflito de série/identificador mostra o cilindro que usa o valor; um único envio e botão desabilitado durante o envio; `VERSION_CONFLICT` na edição mostra aviso com "Recarregar"; sem conexão o envio fica desabilitado com o motivo e nenhuma chamada é feita; pessoa sem `cylinder.write` não vê "Cadastrar cilindro", e ao abrir `/cilindros/novo` a página consulta as permissões no servidor (porta falsa de permissões), mostra o acesso negado e **não renderiza o formulário**; edição de cilindro inativo mostra o aviso e oferece reativar só a quem pode [RF-030, RF-035, história 1].

### Implementação (GREEN)

- [X] T025 [US1] Criar `supabase/migrations/20261005150200_cylinders_register.sql` com `public.create_cylinder`, `public.update_cylinder` e `public.save_cylinder_type` (`security definer`, `set search_path = ''`, `private.actor_has_permission` primeiro, `p_actor`, `p_session`, `p_organization`, advisory lock por (organização, valor), `private.write_audit_event`, `private.append_cylinder_event`; `revoke ... from public, anon, authenticated` e `grant ... to service_role`). T023 passa a verde [contracts/operacoes-servidor.md].
- [X] T026 [US1] Implementar em `supabase/functions/manage-cylinders/handler.ts` e `index.ts` as operações `create`, `update` e `save_type` (validação do corpo com os mesmos limites, `organization_id` do contexto, mapeamento de erros para os códigos do contrato) e completar os testes de `tests/contract/cylinders-handlers.test.ts` [RF-043].
- [X] T027 [US1] Criar `src/pages/cylinders/cylinder-form-page.tsx` (cadastro e edição no mesmo formulário: seções na mesma página, um único envio, rótulos visíveis, ajuda e erros associados aos campos, tipo vindo do catálogo com "Novo tipo" para quem pode, primeiro identificador no cadastro) usando `cylinder-service`, `cylinder-validation` e `operation-key` onde couber; T024 passa a verde. Usar a skill `ui-ux-pro-max` e só tokens [RF-030, RF-031].
- [X] T028 [US1] Registrar as rotas `/cilindros/novo` e `/cilindros/<id>/editar` em `src/app/App.tsx` com `React.lazy` e `ProtectedRoute`, usando `cylinder-routes.ts`; teste em `src/app/App.lazy.test.tsx` de que o chunk não entra no pacote de entrada [RF-037, CA-010].

**Checkpoint**: cadastrar e editar funciona e está isolado por tenant. `supabase test db`, `npm test` e `npm run typecheck` verdes.

---

## Fase 4 — US2: Consultar a lista e o detalhe (P1)

**Objetivo**: ver, buscar, filtrar e abrir os cilindros do tenant ativo.

**Teste independente**: com 60 cilindros de dois tenants, buscar um identificador no primeiro e ver só os dele em 360, 768 e 1920 px.

### Testes primeiro (RED)

- [X] T029 [P] [US2] Escrever `supabase/tests/006_query.test.sql` para `query_cylinders_list`, `query_cylinder_get`, `query_cylinder_catalog`: busca por identificador (igualdade normalizada, sem diferença de caixa e espaços) e por parte do número de série; filtros combinados por cadastral, estoque, situação do teste e tipo; paginação por cursor mantendo busca e filtros; `total` exato; `status` padrão `active` (inativos só com `inactive` ou `all`); cada item traz `active_identifier_count`; ordenação; cilindro de outra organização e inexistente respondem **igual** (`NOT_FOUND`); `cylinder.read` obrigatório; `hydro_status` coerente com T011 [RF-012, RF-028, RF-042].
- [X] T030 [P] [US2] Escrever `src/pages/cylinders/cylinder-list-page.test.tsx`: busca sem recarregar a página; filtro cadastral padrão "Ativos" (com opções Inativos e Todos); aviso "Sem identificador" quando `active_identifier_count` é 0; filtros combinados com o total anunciado em `role="status"` uma vez; paginação mantém busca e filtros; tabela com cabeçalhos associados a partir de 768 px e cartões abaixo (`use-min-width`); três selos separados com texto e ícone; estados de carregamento, vazio (com "Cadastrar cilindro" só para quem tem `cylinder.write`), erro com "Tentar de novo" e offline; trocar a organização ativa recarrega sem resquício da anterior [RF-028, RF-032, história 2].
- [X] T031 [P] [US2] Escrever `src/pages/cylinders/cylinder-detail-page.test.tsx`: blocos de dados, identificadores (ativos e desativados), testes e histórico, cada um com nome acessível; ações só para quem tem a permissão; `NOT_FOUND` para id desconhecido; **nenhuma** ação de excluir; histórico só para quem tem `cylinder.history` [história 2, RF-005].

### Implementação (GREEN)

- [X] T032 [US2] Criar `supabase/migrations/20261005150210_cylinders_query.sql` com as RPCs de consulta (somente leitura, sem auditoria de sucesso, `security definer`, permissão no início, filtro por `p_organization`, paginação por cursor, tamanho padrão 25 e máximo 100). T029 passa a verde [contracts/operacoes-servidor.md].
- [X] T033 [US2] Implementar em `supabase/functions/query-cylinders/handler.ts` e `index.ts` as operações `list`, `get`, `catalog` e completar `tests/contract/cylinders-handlers.test.ts`.
- [X] T034 [P] [US2] Criar `src/pages/cylinders/cylinder-list-page.tsx` com busca, filtros, ordenação e paginação (estado da consulta na URL ou em estado local, sem armazenamento persistente), tabela e cartões, e os estados da Spec 003; T030 verde. Usar a skill `ui-ux-pro-max` [RF-028, RF-031, RF-034].
- [X] T035 [P] [US2] Criar `src/pages/cylinders/cylinder-detail-page.tsx` e `src/pages/cylinders/components/identifier-list.tsx`; T031 verde (os blocos de testes e histórico entram vazios aqui e são preenchidos em US4 e US7).
- [X] T036 [US2] Registrar `/cilindros` e `/cilindros/<id>` em `src/app/App.tsx` e `src/app/admin-routes.ts` (ou resolvedor equivalente) com `React.lazy`; o menu mostra "Cilindros" só a quem tem `cylinder.read` (teste em `tests/contract/navigation-permissions.test.ts`) [RF-027, RF-037].

**Checkpoint**: US1 e US2 funcionam juntas — cadastrar, listar, buscar, abrir.

---

## Fase 5 — US3: Registrar a entrada no estoque sem duplicar (P1)

**Objetivo**: entrada por identificador, idempotente, com avisos e sem fila offline.

**Teste independente**: registrar a mesma entrada duas vezes com a mesma chave e confirmar um único evento; registrar com identificador desconhecido e confirmar a recusa.

### Testes primeiro (RED)

- [X] T037 [P] [US3] Escrever `supabase/tests/006_stock_in.test.sql` para `query_cylinder_lookup` e `stock_in_cylinder`: entrada de cilindro ativo e fora do estoque → `in_stock`, evento `stock_in` com `hydro_status` do momento, auditoria `cylinder.stock_in` e resposta `STOCKED`; **10 repetições com a mesma chave** → 1 evento e resposta idêntica (`replayed: true`) [CA-002]; mesma chave com identificador diferente → `IDEMPOTENCY_PAYLOAD_CONFLICT`; outra chave com cilindro em estoque → `ALREADY_IN_STOCK` sem evento; cilindro inativo → `CYLINDER_INACTIVE`; identificador inexistente → `NOT_FOUND`; identificador desativado → `NOT_FOUND` com `deactivated` e o cilindro de origem da mesma organização; teste vencido ou reprovado **permitido** com `warning`; identificador de outro tenant → `NOT_FOUND`; ator sem `cylinder.stock_in` negado [RF-013 a RF-017, RF-042].
- [X] T038 [P] [US3] Escrever `src/pages/cylinders/stock-in-page.test.tsx`: campo "Identificador" com foco inicial; Enter envia; remove quebras de linha e espaços das pontas; depois do resultado limpa o campo, devolve o foco a ele e anuncia o resultado uma vez em `role="status"` sem mover o foco; mensagens para sucesso, repetição, já em estoque, inativo, não encontrado (com "Cadastrar cilindro" só se `cylinder.write`), identificador desativado e aviso destacado de teste vencido/reprovado; sem conexão ou conexão perdida no envio: "estado desconhecido" com "Tentar de novo" **reusando a mesma chave**; duplo clique não envia duas vezes; sequência de 20 entradas só pelo teclado [RF-029, RF-035, MS-002, história 3].

### Implementação (GREEN)

- [X] T039 [US3] Criar `supabase/migrations/20261005150300_cylinders_stock_in.sql` com `public.query_cylinder_lookup` e `public.stock_in_cylinder` (`private.claim_idempotency_key` com operação `cylinder.stock_in` e hash SHA-256 de (`cylinder_id`, `identifier_value_normalized`); grava o `result_payload`; repetição devolve o mesmo payload; evento via `private.append_cylinder_event`; auditoria na mesma transação). T037 verde [research.md, decisão 6].
- [X] T040 [US3] Implementar `lookup` em `query-cylinders` e `stock_in` em `manage-cylinders` (corpo com `identifier_value` e `operation_key` UUID), com testes em `tests/contract/cylinders-handlers.test.ts`.
- [X] T041 [US3] Criar `src/pages/cylinders/stock-in-page.tsx` usando `operation-key`; T038 verde. Registrar `/estoque/entrada` em `src/app/App.tsx` com `React.lazy`. Usar a skill `ui-ux-pro-max` e só tokens [RF-029, RF-037].
- [X] T042 [P] [US3] Criar `tests/contract/cylinders-stock-in.live.test.ts` (suíte `.live`, Supabase local): 10 repetições da mesma entrada = 1 evento e resposta igual; duas sessões enviando a mesma chave ao mesmo tempo → 1 evento; duas sessões cadastrando o mesmo número de série e duas inativando o mesmo cilindro ao mesmo tempo → uma aceita e a outra com conflito, sem duplicar [CA-002, MS-003, spec: exceções].

**Checkpoint**: P1 completo (US1, US2, US3). Parar e validar o MVP com `supabase test db`, `npm test`, `npm run test:live` e o roteiro 1 do quickstart.

---

## Fase 6 — US4: Registrar e acompanhar testes hidrostáticos (P2)

**Objetivo**: registrar, retificar e ver a situação calculada.

**Teste independente**: registrar um teste aprovado com próxima data daqui a 6 meses, um a vencer em 20 dias e um reprovado, e conferir a situação de cada cilindro.

### Testes primeiro (RED)

- [X] T043 [P] [US4] Escrever `supabase/tests/006_tests.test.sql` para `register_hydrostatic_test` e `rectify_hydrostatic_test`: aprovado exige `next_due_on` posterior a `performed_on` e até 10 anos; reprovado não exige; `performed_on` futura recusada; atualiza `hydro_last_result` e `hydro_next_due_on` na mesma transação; reprovado vale até um aprovado posterior; retificação cria nova linha com `rectifies_test_id` e justificativa de 5 a 500, o original permanece, e retificar um registro já retificado é recusado (único parcial); eventos `hydrostatic_test_registered` e `hydrostatic_test_rectified` e auditoria por ação; cilindro inativo recusa registro; ator sem `cylinder.test` ou de outro tenant negado [RF-019, RF-020, RF-022, RF-040].
- [X] T044 [P] [US4] Escrever `src/pages/cylinders/components/hydrostatic-test-form.test.tsx`: erros junto dos campos (data futura, próxima data anterior à realização, próxima data ausente quando aprovado); retificação exige justificativa e mostra o original; o selo de situação do teste aparece no detalhe e na lista com texto e ícone [história 4].

### Implementação (GREEN)

- [X] T045 [US4] Criar `supabase/migrations/20261005150400_cylinders_tests.sql` com as RPCs de teste, que recalculam as colunas denormalizadas do cilindro com `private.hydro_status`. T043 verde.
- [X] T046 [US4] Implementar `register_test` e `rectify_test` em `manage-cylinders` e testes em `tests/contract/cylinders-handlers.test.ts`.
- [X] T047 [P] [US4] Criar `src/pages/cylinders/components/hydrostatic-test-form.tsx` e ligar o bloco de testes no `cylinder-detail-page.tsx` (lista com original e retificações); T044 verde.
- [X] T048 [P] [US4] Criar `tests/contract/cylinders-hydrostatic-limit.test.ts`: lê `HYDROSTATIC_EXPIRING_DAYS` e `private.hydrostatic_expiring_days()` e reprova se forem diferentes; reprova qualquer literal `30` de limite fora do domínio nas telas [RF-021].

**Checkpoint**: a situação do teste é a mesma na lista (banco) e no detalhe (cliente).

---

## Fase 7 — US5: Gerenciar identificadores (P2)

**Objetivo**: acrescentar, desativar e transferir identificadores, sem perder o histórico.

**Teste independente**: desativar a etiqueta NFC, vincular uma nova e confirmar que a antiga continua no histórico e só volta por transferência.

### Testes primeiro (RED)

- [X] T049 [P] [US5] Escrever `supabase/tests/006_identifiers.test.sql` para `add_cylinder_identifier`, `deactivate_cylinder_identifier` e `transfer_cylinder_identifier`: acrescenta dos 4 tipos; valor ativo em outro cilindro da mesma organização → `IDENTIFIER_CONFLICT` com o dono; mesmo valor em outro tenant aceito; valor que já existiu na organização → `IDENTIFIER_UNAVAILABLE`; desativação exige justificativa de 5 a 500 e grava quem, quando e por quê; desativar identificador de **cilindro inativo** é permitido e acrescentar a cilindro inativo é recusado; transferência exige `confirmed: true` e justificativa, só aceita valor com todas as linhas desativadas, cria linha ativa no destino (pode ser o próprio cilindro), mantém a antiga desativada com `transferred_to_identifier_id` e grava `identifier_transferred_out` e `identifier_transferred_in` em uma única transação; duas transferências simultâneas do mesmo valor → uma só vence; auditoria por ação [RF-007 a RF-012, RF-040].
- [X] T050 [P] [US5] Escrever `src/pages/cylinders/components/identifier-list.test.tsx` e `reason-dialog.test.tsx`: lista de ativos e desativados; diálogo acessível de desativação e transferência com justificativa obrigatória, que devolve o foco ao acionador; aviso "Sem identificador" quando não há ativo; leitor de tela anuncia o resultado uma vez [RF-009, história 5, spec: acessibilidade].

### Implementação (GREEN)

- [X] T051 [US5] Criar `supabase/migrations/20261005150500_cylinders_identifiers.sql` com as 3 RPCs (advisory lock por (organização, valor), índice único como barreira final). T049 verde.
- [X] T052 [US5] Implementar `add_identifier`, `deactivate_identifier` e `transfer_identifier` em `manage-cylinders` e testes em `tests/contract/cylinders-handlers.test.ts`.
- [X] T053 [P] [US5] Criar `src/pages/cylinders/components/reason-dialog.tsx` (reutilizado em US6 e US4) e completar `identifier-list.tsx` com as ações; T050 verde. Usar o `Dialog` da Spec 003.

---

## Fase 8 — US6: Inativar e reativar um cilindro, sem apagar nada (P2)

**Objetivo**: inativar com motivo e justificativa, reativar se foi engano; nada é excluído.

**Teste independente**: inativar um cilindro em estoque, confirmar a saída do estoque e a presença do histórico; tentar excluir por qualquer caminho e confirmar que não existe.

### Testes primeiro (RED)

- [X] T054 [P] [US6] Escrever `supabase/tests/006_inactivation.test.sql` para `inactivate_cylinder` e `reactivate_cylinder`: inativação exige motivo (`written_off`, `lost`, `condemned` ou `other`) e justificativa de 5 a 500; cilindro em estoque sai do estoque com `stock_out_inactivation`; **identificadores permanecem ativos e reservados**; entrada em inativo é recusada; segunda inativação → `ALREADY_INACTIVE`; `version` sobe em `inactivate`, `reactivate` e `stock_in`; cilindro inativo não pode ser editado (`CYLINDER_INACTIVE`); reativação exige justificativa e volta ativo **fora do estoque**; auditoria `cylinder.inactivate` e `cylinder.reactivate`; ator sem `cylinder.deactivate` negado [RF-006, RF-016, spec: clarificação de identificadores].
- [X] T055 [P] [US6] Escrever `tests/contract/cylinders-no-delete.test.ts`: nenhuma operação, serviço ou botão de exclusão em `src/` e `supabase/functions/`; chamada com operação de exclusão ou desconhecida é negada e auditada como `denied`; as migrations não concedem `delete` [RF-005, CA-003].
- [X] T056 [P] [US6] Escrever teste de página (em `cylinder-detail-page.test.tsx`) para inativar e reativar: diálogo com motivo e justificativa, foco devolvido ao acionador, mensagem junto do campo sem justificativa, aviso de "já inativo" para inativação simultânea [spec: exceções].

### Implementação (GREEN)

- [X] T057 [US6] Criar `supabase/migrations/20261005150600_cylinders_inactivation.sql` com as 2 RPCs. T054 verde.
- [X] T058 [US6] Implementar `inactivate` e `reactivate` em `manage-cylinders`; T055 verde.
- [X] T059 [US6] Ligar as ações de inativar e reativar no `cylinder-detail-page.tsx` usando `reason-dialog.tsx`; T056 verde.

---

## Fase 9 — US7: Consultar o histórico de custódia (P2)

**Objetivo**: ler cada evento em ordem estável, sem nenhuma ação de alteração.

**Teste independente**: executar uma sequência conhecida e comparar o histórico exibido, ordem e conteúdo, com a sequência; tentar alterar ou apagar um evento e confirmar que é impossível.

### Testes primeiro (RED)

- [X] T060 [P] [US7] Escrever `supabase/tests/006_history.test.sql` para `query_cylinder_history`: `cylinder.history` obrigatório; ordem decrescente por padrão e invertida por parâmetro; filtros por tipo e período; paginação por cursor em `sequence` com milhares de eventos sem carregar tudo; cilindro de outro tenant e inexistente respondem igual; correção referencia o evento anterior (`references_event_id`) [RF-024 a RF-026, RF-042].
- [X] T061 [P] [US7] Escrever `supabase/tests/006_audit.test.sql`: uma asserção por ação sensível (`cylinder.create`, `.update`, `.type_save`, `.inactivate`, `.reactivate`, `.identifier_add`, `.identifier_deactivate`, `.identifier_transfer`, `.stock_in`, `.test_register`, `.test_rectify`) confirmando o par evento + auditoria na mesma transação e que a falha desfaz os dois; sem segredos nem dados pessoais desnecessários no `metadata` [RF-040, CA-005].
- [X] T062 [P] [US7] Escrever `src/pages/cylinders/components/history-list.test.tsx`: mais recente primeiro, inversão de ordem, filtros por tipo e período, paginação, cada evento com tipo, data e hora, autor e justificativa; nenhuma ação de alteração, nem para o auditor [história 7].

### Implementação (GREEN)

- [X] T063 [US7] Criar `supabase/migrations/20261005150700_cylinders_history.sql` com `public.query_cylinder_history`. T060 e T061 verdes.
- [X] T064 [US7] Implementar `history` em `query-cylinders`; completar `tests/contract/cylinders-handlers.test.ts`.
- [X] T065 [P] [US7] Criar `src/pages/cylinders/components/history-list.tsx` e ligar o bloco de histórico no `cylinder-detail-page.tsx`; T062 verde.

---

## Fase 10 — US8: Usar em celular, tablet e desktop, só com teclado (P2)

**Objetivo**: provar responsividade, acessibilidade, PWA e offline nas telas novas.

**Teste independente**: percorrer cadastro, lista, detalhe e entrada em 360, 768 e 1920 px só com Tab, sem rolagem horizontal; rodar axe em cada tela.

- [X] T066 [P] [US8] Escrever `tests/e2e/cilindros.spec.ts` (projetos de `npm run test:e2e`): cadastrar → listar → abrir detalhe → registrar teste → inativar → ler histórico; 360, 768 e 1920 px, 320 px e zoom de 200% sem rolagem horizontal; alvos de 44 px; um só `h1` e um só `main`; ordem de foco coerente e anel de foco sempre visível; axe sem violação crítica ou grave [CA-006, RF-033, RF-034].
- [X] T067 [P] [US8] Escrever `tests/e2e/entrada-estoque.spec.ts`: 20 entradas só pelo teclado, entrada repetida sem duplicar, aviso de teste vencido, offline com a estrutura aberta e o aviso da Spec 003, sem dado de cilindro em `Cache Storage`, `localStorage`, `sessionStorage` nem IndexedDB [CA-007, RF-036, MS-002].
- [X] T068 [P] [US8] Estender `src/app/pwa-config.test.ts` e `tests/e2e/pwa.spec.ts` para reprovar `runtimeCaching` de dados de cilindro e confirmar que respostas de `/functions/v1` não entram no cache [RF-036, CA-007].
- [X] T069 [US8] Corrigir o que T066 a T068 reprovarem nos arquivos de `src/pages/cylinders/`, usando a skill `ui-ux-pro-max` e só tokens; rodar `tests/contract/escalas-no-codigo.test.ts` e `tests/e2e/cores-forcadas.spec.ts` e `tests/e2e/escalas-no-navegador.spec.ts` sobre as telas novas [RF-031, RF-034].

---

## Fase 11 — Acabamento e encerramento

**Objetivo**: desempenho, visual, documentação, bundle e o gate de registro de IA.

- [X] T070 [P] Criar `tests/contract/cylinders-volume.live.test.ts` (suíte `.live`, sem navegador): gerar 50 mil cilindros em organização própria com `generate_series` (massa reutilizada por T079), medir no servidor a busca por identificador (p95 ≤ 1 s) e a consulta da primeira página da lista, registrar os números em `specs/006-cilindros-e-estoque/validation.md` e remover a massa ao final [RNF-001, RNF-002a].
- [X] T079 [P] Criar `tests/e2e/desempenho-lista-cilindros.spec.ts` (Playwright, `--project=desktop-chromium`): contra a mesma massa de 50 mil cilindros, com limitação de rede equivalente a 4G, medir a primeira página da lista até estar utilizável (p95 ≤ 2 s em amostra de pelo menos 20 cargas) e registrar mediana, p95 e ambiente em `specs/006-cilindros-e-estoque/validation.md` [RNF-002]. Depende de T034, T036 e da massa de T070.
- [X] T071 [P] Criar `tests/contract/cylinders-permissions.test.ts`: o catálogo de telas, as rotas, os contratos e a migration usam os mesmos códigos de permissão e o mapeamento dos papéis padrão [RF-039].
- [X] T072 [P] Criar `tests/e2e/visual/cilindros.visual.spec.ts` com capturas da lista, do cadastro, do detalhe e da entrada em 360, 768 e 1920 px; gerar no Linux com `npm run test:visual:atualizar`; não versionar `*-win32.png` [CA-009].
- [X] T073 Rodar `npm run build`, comparar com `baseline.md` e registrar em `validation.md` o pacote de entrada (limite de 593,95 kB) e a lista de chunks novos; se passar, mover código para `React.lazy` antes de qualquer outra ação [RF-037, RNF-003, CA-010].
- [X] T074 [P] Atualizar `docs/prd.md` (Fase 2: RF004 a RF006, US002 e US008 na parte de cilindros), `README.md` e o catálogo da Spec 003 (se houver componente novo) com cilindros, identificadores, estoque e histórico [constituição VIII].
- [X] T075 Rodar o roteiro completo de `quickstart.md` (itens 1 a 6) e registrar resultados e desvios em `validation.md`; rodar `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `supabase test db`, `npm run test:live`, `npm run build` e `npm run test:e2e`.
- [X] T076 Conferir que nenhum segredo, token ou chave `service_role` entrou no cliente ou no repositório (`tests/contract/client-secrets.test.ts`) e que `git status` não contém `*-win32.png` a versionar [RF-041].
- [X] T080 [US2] Escrever `src/domain/cylinders/identifier-symbology.test.ts` e criar `identifier-symbology.ts` (QR Code → `qrcode`, Data Matrix → `datamatrix`, NFC e número do casco → sem símbolo) [RF-044, CA-011].
- [X] T081 [US2] Escrever `src/pages/cylinders/components/identifier-symbol.test.tsx` e criar `identifier-symbol.tsx` (botão "Mostrar código" com `aria-expanded`, carga sob demanda de `bwip-js/browser`, imagem com texto alternativo, erro tratado) e ligar à `IdentifierList` só para identificadores ativos QR/Data Matrix; cobrir no `cylinder-detail-page.test.tsx` [RF-044, CA-011].
- [X] T082 Rodar `npm run build`, confirmar que o pacote de entrada segue ≤ 593,95 kB e que `bwip-js` fica em chunk próprio; atualizar `docs/prd.md`/`README.md` [RNF-003, RNF-004, CA-010, CA-011].
- [X] T083 [US3] Escrever `camera-scan-button.test.tsx` e criar `src/pages/cylinders/components/camera-scan-button.tsx` (BarcodeDetector, diálogo, desligar a câmera, permissão negada) e ligar à entrada no estoque, à busca, ao cadastro e ao acréscimo de identificador [RF-045].
- [X] T084 Ajustes de layout da validação humana: ações do identificador em linha, filtros De/Até lado a lado no celular, "Ler com a câmera" junto de "Registrar entrada"; ícones oficiais `cilindro` e `inventario` no menu.
- [ ] T077 **Gate de registro de IA** (AGENTS.md): `git add` do código, dos testes e das migrations, sem commit; `npm run ia:registro -- --spec 006 --ciclo NN --titulo "Cilindros, identificadores, estoque e histórico"`; **entrevistar Alisson Almeida** (quem validou, amostra, ambiente, duração, resultado e itens a corrigir, decisão `utilizado`/`adaptado`/`descartado` com justificativa e confirmação para gravar em nome da pessoa), sem presumir nada; se houver itens a corrigir, corrigir, repetir os testes e perguntar de novo; preencher o registro; `npm run ia:validar`; commit com código, testes, `docs/governanca-ia/indice.md` e o RIA. Nunca usar `--no-verify` nem force push [MS-007].
- [ ] T078 Depois do merge do PR aprovado, entregar o DOCX do RIA em branch `docs/ria-NNN-docx` com `python scripts/governanca-ia/exportar-docx.py ...`, apontar o índice para o DOCX e abrir PR só de documentação.

---

## Dependências e ordem de execução

- **Fase 1** não tem dependência. **Fase 2** depende da Fase 1 e **bloqueia todas as histórias**.
- **US1 (Fase 3)** depende só da Fundação. **US2** depende de US1 para ter dados de teste de ponta a ponta, mas suas RPCs de consulta podem ser feitas em paralelo com US1.
- **US3** depende de US1 (cilindro com identificador) e do esquema. **US4**, **US5**, **US6** e **US7** dependem da Fundação e do detalhe de US2; entre si são independentes, exceto: US6 e US3 compartilham a regra "inativo recusa entrada" (T037 e T054); US7 consome os eventos das demais (testes de T061 só ficam completos depois de US4 a US6).
- **US8** e a Fase 11 dependem das histórias que verificam.
- Em cada história: testes (RED) → migration → função → serviço/página (GREEN) → regressão.

## Oportunidades de paralelismo

- Fundação: T005, T006, T007 e T008 (testes de banco) em paralelo; T013, T015, T016, T018, T019 e T020 (arquivos distintos).
- Após a Fundação, US1 e as RPCs de consulta de US2 (T029, T032) podem andar juntas; US4, US5 e US7 são independentes entre si.
- Dentro de cada história, os testes `[P]` rodam em paralelo (SQL e React em arquivos diferentes).

```text
# Exemplo: Fundação, testes de banco juntos
Task: "T005 supabase/tests/006_rls.test.sql"
Task: "T006 supabase/tests/006_immutability.test.sql"
Task: "T007 supabase/tests/006_constraints.test.sql"
Task: "T008 supabase/tests/006_permissions.test.sql"
```

## Estratégia de implementação

1. **MVP**: Fases 1 e 2, depois US1, US2 e US3 (todas P1). Parar e validar: cadastrar, listar, abrir e dar entrada sem duplicar, isolado por tenant.
2. **Incremental**: US4 (testes) → US5 (identificadores) → US6 (inativação) → US7 (histórico), cada uma validada sozinha.
3. **Fechamento**: US8, desempenho com 50 mil cilindros, capturas, bundle, documentação, entrevista de validação humana e RIA.

## Notas

- Nenhuma tarefa inclui `delete` de dado; toda correção é um novo registro que referencia o anterior.
- Funções novas do Supabase local exigem `supabase stop` e `supabase start` para carregar.
- O Playwright reaproveita a porta 4173: rodar `npm run build` antes dos E2E.
- Dados de teste: e-mails `@example.invalid`; nenhum dado real.
