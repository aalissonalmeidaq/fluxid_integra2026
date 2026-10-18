---
description: "Tarefas executáveis da Spec 012 — Lacre IoT: posição em tempo real, geocerca e trava do cilindro"
---

# Tarefas: Lacre IoT — posição em tempo real, geocerca e trava do cilindro

**Entrada**: artefatos em `specs/012-lacre-iot-geocerca-trava/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD. Em cada incremento, escrever o teste, confirmar a falha esperada (RED), implementar (GREEN), refatorar e rodar a regressão antes de avançar. Testes de banco em `supabase/tests/012_*.test.sql` (pgTAP); domínio, serviço, funções e páginas em Vitest ao lado do código; contratos em `tests/contract/`; suítes contra o Supabase local em `tests/integration/seals-*.live.test.ts`; E2E em `tests/e2e/lacres-*.spec.ts`; firmware com `pio test -e native`.

**Escopo protegido**:
- **Nenhum comando físico presumido**: só `command_result` com `executed` ou `auto_lock` mudam `seal_devices.lock_state` [RN-001, CA-002, princípio IV].
- **Nenhuma chave de dispositivo, senha de rede Wi-Fi, chave VAPID privada ou `service_role`** no cliente, no repositório, em log, em auditoria, em evento ou em notificação [RF-039, RF-040, CA-008, CA-010]. Valores de teste são gerados pela suíte; nada real em `firmware/`.
- Nenhuma coordenada em auditoria, evento de auditoria ou notificação [RF-039, RF-036c].
- As RPCs da Spec 008 **não são reescritas**: a integração é por gatilhos `after` [research.md, item 11]; as suítes `008_*`, `009_*` e `010_*` rodam inteiras em toda tarefa de integração.
- Nenhuma operação de exclusão; nenhum `delete` nem `truncate` nas tabelas novas [RF-041]. A única remoção é a da senha no Vault ao fim do comando de rede [RF-034c].
- Comandos de lacre nunca entram na fila offline da Spec 010 [RF-043].
- `public.seal_ingest` é criada uma única vez (T041); as histórias substituem só os tratadores `private.seal_handle_*`, `private.seal_build_response` e `private.seal_broadcast` [research.md, item 1].
- Nenhuma dependência nova no `package.json` do cliente [plan.md]; a função `seal-push` usa `jsr:@negrel/webpush` (plano B `npm:web-push`).
- Arquivos alheios à spec (`.agents/skills/impeccable/`, `.claude/agents/`, `.claude/settings.local.json`, `.codex/`, `.tmp/` e alterações da landing page fora desta spec) **não** entram nos commits; usar `git add` explícito.

**Convenções de interface** (AGENTS.md, Spec 005): skill `ui-ux-pro-max` ao criar ou alterar telas; só tokens (`tests/contract/escalas-no-codigo.test.ts` reprova valor arbitrário, cor literal e transição que atrase o foco); `prefers-reduced-motion`; saúde, trava e severidade sempre com ícone **e** texto; mapa com lista de posições como alternativa; capturas visuais regeneradas no Linux (`npm run test:visual:atualizar`), nunca `*-win32.png`; `npm run build` antes do E2E.

**Nomes de migrations**: `20261018xxxxxx_seals_*.sql`, uma por área, junto da história que a usa: `seals_schema`, `seals_permissions` (Fundação), `seals_ingest`, `seals_realtime`, `seals_read` (US1), `seals_watchdog`, `seals_alerts`, `seals_push` (US6), `seals_commands`, `seals_trip_lock` (US2), `seals_delivery_unlock` (US3), `seals_geofence_watch` (US4), `seals_devices_binding` (US5) e `seals_wifi` (US7).

**Procedimento do Supabase local**: funções novas exigem `npx supabase stop` e `npx supabase start`; suítes que contam `audit_logs` exigem `npx supabase db reset` antes de `npx supabase test db`; `npm run test:live` e o E2E não rodam ao mesmo tempo que o pgTAP.

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode rodar em paralelo (arquivos diferentes, sem depender de tarefa incompleta).
- `[USN]`: história da spec (US1 a US8 = Histórias 1 a 8).
- Referências entre colchetes ligam a tarefa aos requisitos e critérios da spec.

## Mapa das histórias

| História | Prioridade | Entrega |
|---|---|---|
| US1 O lacre envia a posição e o sistema mostra onde o cilindro está | P1 | `seal-gateway`, `seal_ingest`, deduplicação, simulador, leitura, tempo real e bloco "Lacre" no cilindro |
| US6 Saber se o lacre está funcionando, mesmo quando para de comunicar | P1 | verificação automática, saúde, alertas reais, notificação push |
| US2 Travar o lacre quando o cilindro entra em viagem | P1 | comandos, ciclo de estados, trava no início da viagem, coluna "Trava física" |
| US3 Destravar depois da entrega correta dentro da geocerca | P1 | prova de posição, destravamento automático e excepcional com `aal2` |
| US4 Violação de geocerca: travar, registrar e alertar | P1 | vigilância, violação, comando na mesma resposta, `auto_lock` |
| US5 Cadastrar o dispositivo e vincular o lacre ao cilindro | P2 | cadastro com chave uma vez, troca de chave, vínculo e desvínculo, lista de lacres |
| US7 Configurar as redes Wi-Fi do lacre pelo sistema | P2 | comandos de rede, senha no Vault, detalhe do dispositivo |
| US8 Lacre físico de ponta a ponta com o firmware desta spec | P1 | firmware em `firmware/`, CI, roteiro de bancada |

US6 vem logo depois de US1 porque os alertas e a página de alertas são usados pelas histórias 2 a 4. US5 é P2 porque, até ela, os testes criam dispositivos e vínculos pelo apoio de SQL da Fundação (spec, História 5: "pode ser preparado por dados de exemplo"). US8 depende do contrato estável (US1, US2, US4 e US7) e fica por último entre as histórias.

---

## Fase 1 — Preparação

**Objetivo**: rastreabilidade, linha de base e prova das peças de plataforma antes de qualquer código de produto.

- [X] T001 Registrar em `specs/012-lacre-iot-geocerca-trava/plan.md` (seção Rastreabilidade) o número da issue e a branch `feat/012-lacre-iot-geocerca-trava`; se a issue não existir, **pedir confirmação da pessoa responsável antes de abri-la** (ação externa) com a conta `equipefluxid` e o título "Spec 012: lacre IoT, geocerca e trava" [princípio VI].
- [X] T002 Rodar `npm run lint`, `npm run typecheck`, `npm test`, `npx supabase db reset` e `npx supabase test db` e registrar em `specs/012-lacre-iot-geocerca-trava/baseline.md` as contagens de arquivos e testes das Specs 001 a 011 antes da mudança.
- [X] T003 [P] Rodar `npm run build` e anotar em `baseline.md` o tamanho de `dist/assets/index-*.js` e o limite de +5 % [RNF-006].
- [X] T004 [P] Confirmar com `git status` que os arquivos alheios à spec ficam fora dos commits e anotar a lista em `baseline.md`.
- [X] T005 Prova de plataforma no Supabase local, registrada em `baseline.md`: `create extension` de `pg_cron`, `pg_net` e `supabase_vault` funciona; `cron.schedule` de uma função de teste roda a cada minuto; `net.http_post` de dentro do banco alcança uma Edge Function local; `vault.create_secret` e `delete from vault.secrets` funcionam; `realtime.send` em canal privado chega a um cliente autenticado com política em `realtime.messages`. Desfazer os objetos de teste ao final [research.md, itens 6 a 10; plan.md, Riscos].
- [X] T006 [P] Prova de Web Push: função de fumaça temporária em `supabase/functions/_spike-webpush/` que envia uma notificação com `jsr:@negrel/webpush` e chaves VAPID de teste geradas localmente (fora do git) para uma inscrição do Chrome; se falhar, repetir com `npm:web-push` e registrar a escolha em `research.md` (item 8); apagar a função de fumaça antes do commit.
- [X] T007 [P] Gerar o par VAPID de desenvolvimento e documentar em `quickstart.md` onde cada parte vai (`VITE_VAPID_PUBLIC_KEY` em `.env.local`; `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` em `supabase/functions/.env`, ignorado pelo git); conferir no `.gitignore` que `supabase/functions/.env` e `firmware/include/secrets.h` estão ignorados e acrescentar o que faltar [RF-040].

---

## Fase 2 — Fundação (bloqueia as histórias)

**Objetivo**: esquema com RLS e imutabilidade, permissões, limites, contrato das mensagens, domínio de apresentação, catálogo de telas, serviço e apoio de testes.

### Banco: testes primeiro (RED)

- [X] T008 [P] Escrever `supabase/tests/012_rls.test.sql` (parte tabelas): para as 12 tabelas públicas (`seal_devices`, `seal_device_events`, `seal_bindings`, `seal_messages`, `seal_positions`, `seal_commands`, `seal_command_events`, `seal_watches`, `seal_violations`, `seal_alerts`, `push_subscriptions`, `push_outbox`) e as 3 privadas, com os Tenants A e B: RLS ligada **sem política para `authenticated`**, privilégios de `anon` e `authenticated` revogados, nenhum acesso direto [RF-037, CA-001].
- [X] T009 [P] Escrever `supabase/tests/012_no_delete.test.sql`: `delete` e `truncate` recusados em todas as tabelas novas para `authenticated` **e** `service_role`; `update` recusado em `seal_command_events`, `seal_device_events` e `seal_messages` [RF-041].
- [X] T010 [P] Escrever `supabase/tests/012_constraints.test.sql` com as restrições do `data-model.md`, citadas literalmente: `seal_devices.device_code` único no FluxID inteiro e no formato `DSP-` + 8 caracteres; `label` de 2 a 60; `status` ∈ `active`, `inactive`; `report_interval_s` padrão 60, de 30 a 900; `seal_code` único; `health` ∈ `ok`, `no_gps`, `low_battery`, `no_comm`, `off`, `never_seen`; `seal_state` ∈ `closed`, `open`, `broken`, `unknown`; `lock_state` ∈ `none`, `locked`, `unlocked`, `unconfirmed`, `locked_violation`, `locked_comm_loss`; `battery_pct` 0 a 100; `seal_bindings` com índices únicos parciais `(device_id) where unbound_at is null` e `(cylinder_id) where unbound_at is null`, `unbind_reason` ∈ `manual`, `device_inactivated`, `cylinder_inactivated`, `replaced` e `unbind_justification` de 5 a 500, obrigatória em `manual`; `seal_device_events.event_type` ∈ `created`, `updated`, `deactivated`, `key_rotated`, `activated`, `shutdown`, `network_changed`, com `justification` de 5 a 500 obrigatória em `deactivated` e `key_rotated`; `seal_messages unique (device_id, message_id)`, `message_id` até 64, `type` ∈ `position`, `event`, `alert`, `command_result`, `activation`, `shutdown`, `network_change`, `auto_lock`, `outcome` ∈ `stored`, `refused`; `seal_positions.quality` ∈ `gps`, `last_known`; `seal_commands.kind` ∈ `lock`, `unlock`, `wifi_add`, `wifi_remove`, `wifi_reset`, `origin` ∈ `trip_start`, `delivery`, `delivery_correction`, `trip_cancel`, `geofence_violation`, `manual`, `exceptional`, `admin_network`, `status` ∈ `pending`, `delivered`, `confirmed`, `failed`, `cancelled`, `expired`, justificativa de 5 a 500 obrigatória em `manual`, `exceptional` e `wifi_reset`, `aal = 'aal2'` obrigatório em `exceptional`, `wifi_ssid` até 32 bytes só nos de rede, índice único parcial `(trip_item_id, origin) where origin in ('trip_start', 'delivery', 'trip_cancel')`; `seal_watches` índice único parcial `(cylinder_id) where ended_at is null` e `end_reason` ∈ `new_trip`, `stock_in`, `unbound`, `cylinder_inactivated`; `seal_violations.status` ∈ `open`, `returned`, `closed` com índice único parcial `(watch_id) where status = 'open'`; `seal_alerts.kind` na lista de 16 tipos do `data-model.md`, `severity` ∈ `medium`, `high`, `critical`, `source` ∈ `device`, `system`, `status` ∈ `open`, `acknowledged`, `closed`, `close_note` de 5 a 500 obrigatória em `closed`, índice único parcial `(device_id, kind) where status <> 'closed'`; `push_subscriptions.endpoint` único e `revoke_reason` ∈ `user`, `permission_lost`, `gone`; `push_outbox unique (alert_id, subscription_id, kind)`, `kind` ∈ `opened`, `recovered`, `status` ∈ `pending`, `sent`, `failed`, `skipped`; chaves estrangeiras compostas por organização (registro do Tenant A nunca aponta para o B); `trip_items.seal_command_id` existe e é nulo por padrão [data-model.md].
- [X] T011 [P] Escrever `supabase/tests/012_permissions.test.sql` (parte catálogo): `seal.read`, `seal.operate` e `seal.admin` existem com escopo `tenant`, `tenant_delegable`, só `seal.admin` crítica; `tenant_admin` todas; `logistics_manager` e `stock_operator` `seal.read` e `seal.operate`; `tenant_auditor` só `seal.read`; `technical_operator` e `driver` nenhuma; organizações existentes recebem o mapeamento; nenhum papel perde permissão [RF-038; contracts/permissoes-e-papeis.md].
- [X] T012 [P] Escrever `supabase/tests/012_limits_contract.test.sql`: `private.seal_limits()` devolve 20 m, 60 s, 30 s de folga, 3 intervalos, 50 m, 2 posições, 2 min, 10 min, 30 min, 50 leituras, 3 min, 5 redes, 15 %, −85 dBm, 6 pedidos por minuto, 10 chaves erradas em 10 min e `protocols` = `[1]` [data-model.md, "Limites"; RF-007a].

### Banco: implementação (GREEN)

- [X] T013 Criar `supabase/migrations/20261018100000_seals_schema.sql` com as 12 tabelas públicas e as 3 privadas do `data-model.md` (colunas, tipos, `check`, índices, GiST em `seal_positions.point`, `organization_id` com `on delete restrict`, `version bigint not null default 1` onde houver edição), RLS em todas sem política para `authenticated`, `revoke` de `anon` e `authenticated`, gatilhos de exclusão proibida e de imutabilidade no molde de `private.refuse_trip_mutation`, `private.seal_limits()`, a coluna `trip_items.seal_command_id uuid` as extensões `pg_cron`, `pg_net` e `supabase_vault` com o mesmo `begin … exception` de `20260930165120_identity_retention.sql`, e as funções vazias `private.seal_handle_position`, `seal_handle_event`, `seal_handle_alert`, `seal_handle_command_result`, `seal_handle_activation`, `seal_handle_shutdown`, `seal_handle_network_change`, `seal_handle_auto_lock`, `private.seal_build_response` (resposta com `command: null` e `watch: {active: false, version: 0}`) e `private.seal_broadcast` (sem efeito) [data-model.md; research.md, itens 1, 6, 8 e 10].
- [X] T014 Criar `supabase/migrations/20261018100100_seals_permissions.sql`: as 3 permissões com ids `40000000-0000-0000-0000-000000000050` a `...052`, `private.bootstrap_tenant_roles` substituída mantendo **todos** os mapeamentos de `20261009120100_trips_permissions.sql` e acrescentando os do contrato, e o mapeamento aplicado às organizações existentes [contracts/permissoes-e-papeis.md].
- [X] T015 Rodar `npx supabase db reset` e `npx supabase test db`: `012_rls` (tabelas), `012_no_delete`, `012_constraints`, `012_permissions` (catálogo) e `012_limits_contract` passam; as suítes `001` a `010` seguem verdes, ajustando só as contagens de permissões e papéis nos testes antigos que as conferem.

### Contrato das mensagens e apoio de testes

- [X] T016 [P] Criar os exemplos canônicos em `tests/fixtures/seal-protocol/` (um JSON por pedido de cada `type`, um por resposta `200` com e sem comando, com `watch` com e sem `fences`, e um por erro `400`, `401`, `429` e `503`), exatamente como em `contracts/mensagens-do-lacre.md` e só com valores fictícios [CA-011].
- [X] T017 [P] Escrever `tests/contract/seal-protocol.test.ts` (RED): todo exemplo passa no esquema da borda; todo `type` de mensagem e toda resposta do contrato têm exemplo; mensagem com mais de 50 leituras, `protocol` fora da lista aceita (responde `unsupported_protocol`; a lista vem de `private.seal_limits()` e é igual em `_shared/seal-protocol.ts`), `message_id` acima de 64 caracteres e `quality` fora de `gps` e `last_known` são recusados [CA-011, RF-004, RF-007].
- [X] T018 Criar `supabase/functions/_shared/seal-protocol.ts` (esquema do pedido e da resposta, sem dependência de Deno, importável pelo Vitest) até `seal-protocol.test.ts` passar.
- [X] T019 [P] Criar `tests/support/sql/seals-fixtures.sql` com funções de apoio **só de teste** (`tests_seal_device(org, key)` grava um dispositivo com o hash de uma chave conhecida pela suíte; `tests_seal_bind(device, cylinder)` grava o vínculo) usadas pelas suítes pgTAP e `.live` até a US5; nunca aplicadas por migration.
- [X] T020 [P] Criar `tests/support/seal-simulator.ts` (biblioteca: monta pedidos com os exemplos de `tests/fixtures/seal-protocol/`, gera `message_id` únicos, guarda fila local, reenvia com o mesmo id, lê o comando e confirma) e `tests/support/seal-simulator.test.ts` [research.md, item 18].

### Domínio, serviço e telas (base)

- [X] T021 [P] Escrever `src/domain/seals/seal-limits.ts` com os mesmos valores de `private.seal_limits()`, inclusive as versões de protocolo aceitas, e `tests/contract/seals-limits.test.ts` comparando com o SQL.
- [X] T022 [P] Escrever `src/domain/seals/seal-vocabulary.test.ts` e criar `src/domain/seals/seal-vocabulary.ts`: saúde, trava, comando, origem, alerta e severidade com rótulo em português e ícone oficial do design system (ex.: "Funcionando", "Sem comunicação", "Travada", "Não confirmada", "Travada por violação de geocerca", "Possível extravio"), recusando valor desconhecido; teste de contrato com as listas do SQL [RF-042].
- [X] T023 [P] Escrever `src/domain/seals/seal-age.test.ts` e criar `src/domain/seals/seal-age.ts`: idade da posição em texto ("agora", "há 2 minutos", "há 3 horas", "ontem às 14:05"), no fuso de São Paulo, sem depender da hora do sistema nos testes [RF-011].
- [X] T024 [P] Escrever `src/domain/seals/seal-abilities.test.ts` e criar `src/domain/seals/seal-abilities.ts`: o que cada combinação de permissão e situação permite (vincular, travar, destravar normal ou excepcional, alterar rede, encerrar alerta) e o motivo de cada ação desabilitada, inclusive offline ("Sem conexão: comandos de lacre exigem conexão") [RF-025, RF-043].
- [X] T025 Acrescentar ao catálogo de `supabase/functions/_shared/operations.ts` os códigos de `contracts/operacoes-servidor.md` (`SEAL_ALREADY_BOUND`, `CYLINDER_ALREADY_BOUND`, `CYLINDER_IN_TRIP`, `SEAL_INACTIVE`, `NO_BINDING`, `WIFI_LIST_FULL`, `WIFI_NOT_IN_LIST`, `WIFI_RISK_NOT_CONFIRMED`, `ALERT_CLOSED`, `NOTE_REQUIRED`) com o HTTP do contrato, **sem mudar** as funções existentes, e estender os testes da borda comum.
- [X] T026 [P] Criar `src/infrastructure/supabase/seal-adapter.ts` e `src/application/seals/seal-service.ts` (esqueleto sobre `createFunctionTransport` com `query-seals` e `manage-seals`, `request_id` por comando, erro do servidor vira estado de tela, `offline` sem chamada, nada guardado em `localStorage`, `sessionStorage` ou IndexedDB) com `seal-service.test.ts`.
- [X] T027 [P] Atualizar `src/domain/navigation/screens.ts` com `lacres` (`/lacres`, `seal.read`, `tenantScoped: true`, `requireAal2: false`) e `alertas` (`/alertas`, `seal.read`, `tenantScoped: true`), e os testes da Spec 004 que contam telas e itens do menu [contracts/permissoes-e-papeis.md].
- [X] T028 Criar `src/app/seals/seal-routes.ts` e `seal-routes.test.ts` (rotas `/lacres`, `/lacres/:id`, `/alertas`, `/alertas/:id` de `contracts/telas-e-rotas.md`, permissão por rota, rota desconhecida em "não encontrado") e ligar em `src/app/App.tsx` com `ProtectedRoute`, `TenantGate` e `Suspense`, substituindo a rota atual de `/alertas`; a área `src/pages/seals/seals-area.tsx` entra vazia com `React.lazy`.
- [X] T029 [P] Criar `tests/e2e/support/mock-seals.ts` (backend simulado de `query-seals` e `manage-seals` com isolamento por organização, permissões e `request_id`) acoplado a `tests/e2e/support/mock-backend.ts`.

**Ponto de controle**: Fundação verde; nenhuma suíte antiga quebrada.

---

## Fase 3 — US1: O lacre envia a posição e o sistema mostra onde o cilindro está (P1) 🎯 MVP

**Objetivo**: o lacre (simulado) chama o endpoint com a própria chave, a posição é guardada uma vez na organização certa e aparece sozinha no detalhe do cilindro.

**Teste independente**: com o simulador enviando posições de dois lacres de organizações diferentes, inclusive repetidas e reenviadas, confirmar que cada posição foi guardada uma vez, na organização certa, que as repetidas só atualizaram o horário e que a outra organização não vê nada.

### Testes primeiro (RED)

- [X] T030 [P] [US1] Escrever `supabase/tests/012_device_auth.test.sql`: `seal_ingest` com a chave certa aceita; sem chave, chave errada, chave de outro dispositivo, dispositivo `inactive` e `device_code` inexistente devolvem **o mesmo** resultado `unauthorized`; nada é gravado nas recusas; nenhuma coluna guarda a chave em texto [RF-002, CA-006].
- [X] T031 [P] [US1] Escrever `supabase/tests/012_rate_limit.test.sql`: o 7º pedido do mesmo dispositivo no mesmo minuto responde `rate_limited` com segundos de espera e abre **um** alerta `rate_limited` por hora; 10 chaves erradas do mesmo `source_hash` em 10 minutos bloqueiam aquele endereço por 15 minutos, inclusive para a chave certa, sem revelar se o dispositivo existe; a mesma mensagem reenviada depois do bloqueio é gravada [RF-006].
- [X] T032 [P] [US1] Escrever `supabase/tests/012_ingest_dedupe.test.sql`: posição gravada com `cylinder_id` do vínculo válido no `read_at`, organização do cadastro, `read_at`, `received_at`, `quality`, `battery_pct`, `signal_dbm` e `seal_state` [RF-008]; mesma `message_id` responde `duplicate` sem gravar e devolve o comando pendente [RF-003]; posição a até 20 m da última **guardada** com a mesma `quality` e o mesmo `seal_state` só atualiza `last_seen_at`, bateria, sinal e `repeat_count` [RF-009, RN-009]; acima de 20 m, mudança de `quality` ou de `seal_state` cria ponto novo; oscilação que passa e volta do limite compara sempre com a última guardada; 1.440 leituras paradas geram 1 ponto [MS-002]; lacre ativo sem vínculo grava a mensagem só no dispositivo [RF-005]; `read_at` mais de 5 min no futuro é recusado com `read_at_in_future`; `activation` com `valve` diferente de `lock_state` abre alerta `command_failed` com motivo `state_mismatch` sem mudar a trava [CA-003, MS-001, RN-010].
- [X] T033 [P] [US1] Escrever `supabase/tests/012_ingest_batch.test.sql`: lote de 50 leituras com resultado por item (`stored`, `duplicate`, `refused` com motivo); lote de 51 recusado inteiro; leituras fora de ordem gravadas pela ordem de `read_at`; leitura mais antiga que `last_read_at` entra no histórico sem mudar `last_position_id`, a saúde nem disparar regra; a última posição do cilindro é a de maior `read_at` [RF-004, RF-010; casos de borda].
- [X] T034 [P] [US1] Escrever `supabase/tests/012_read.test.sql` (leituras e canal de tempo real com dois tenants; arquivo próprio para não misturar com o catálogo de `012_rls` e `012_permissions`): `cylinder_seal_view`, `list_positions`, `get_seal` e `list_seals` só devolvem dados da organização do ator, exigem `seal.read` e respondem `NOT_FOUND` a cilindro ou dispositivo de outra organização; a política de `realtime.messages` só aceita o tópico `seals:<organização>` de quem tem `seal.read` nela, e o Tenant B não recebe o aviso do A [RF-037, CA-001].
- [X] T035 [P] [US1] Escrever `tests/contract/seal-gateway-handler.test.ts`: só `POST`; `X-Device-Id` e `X-Device-Key` obrigatórios; corpo acima de 64 KB, não JSON ou fora do esquema responde `400 invalid_body`; qualquer falha de autenticação responde `401 {"error":"unauthorized"}` idêntico; `429` com `Retry-After`; falha interna `503`; a borda calcula o SHA-256 da chave e nunca a repassa em texto; nenhum `console.*` com corpo, cabeçalho ou resposta [RF-002, RF-006, CA-006].
- [X] T036 [P] [US1] Escrever `tests/contract/query-seals-handler.test.ts` (parte leitura): autenticação, método, operação desconhecida negada e auditada, organização divergente, mapeamento HTTP e nenhuma operação de exclusão [RF-037, RF-041].
- [X] T037 [P] [US1] Escrever `tests/contract/seals-no-secrets-in-logs.test.ts`: varre o código de `seal-gateway`, `query-seals`, `manage-seals` e `seal-push` e uma execução da suíte `.live`, e não encontra chave de dispositivo, senha de rede, chave VAPID privada nem coordenada em log, auditoria ou evento [RF-039, RF-040].
- [X] T038 [P] [US1] Escrever `src/application/seals/seal-realtime.test.ts`: assina `seals:<organização>` em canal privado, refaz a consulta ao receber aviso, consulta a cada 30 s quando o canal cai e volta ao tempo real quando ele reconecta, expõe "atualizado há X s" e não guarda dado no aparelho [RNF-001; research.md, item 7].
- [X] T039 [P] [US1] Escrever `src/pages/cylinders/components/cylinder-seal-block.test.tsx`: mapa sob demanda com a última posição, idade em texto, qualidade, bateria, saúde e trava em ícone e texto; lista de posições como alternativa; estados carregando, "Cilindro sem lacre", erro e offline (última informação com horário); posição nova anunciada por `aria-live="polite"` sem mover o foco [RF-011, RF-042, RF-043; História 1, cenários 6 e 7].
- [X] T040 [P] [US1] Escrever `tests/integration/seals-ingest.live.test.ts` com o simulador e dois tenants: posições, repetidas, reenviadas e em lote gravadas uma vez na organização certa; o aviso Realtime chega ao assinante do A e não ao do B; da chamada do lacre até a consulta da tela em até 10 s; resposta do gateway em até 3 s [MS-001, MS-002, RNF-001, RNF-002].

### Implementação (GREEN)

- [X] T041 [US1] Criar `supabase/migrations/20261018100200_seals_ingest.sql` com `public.seal_ingest(p_device_code text, p_key_hash bytea, p_source_hash bytea, p_body jsonb)` — **única versão** —, `security definer`, `set search_path = ''`, `grant` só ao `service_role`, que faz autenticação, limites, deduplicação, ordenação e repasse aos tratadores; e substituir `private.seal_handle_position`, `seal_handle_event`, `seal_handle_activation` e `seal_handle_shutdown` com: limite por endereço e por dispositivo (`private.seal_rate_windows`, `private.seal_auth_failures`), autenticação pelo hash com resposta única, deduplicação por `(device_id, message_id)`, ordenação por `read_at`, regra dos 20 m com `extensions.st_distance` em `geography` contra a última posição guardada com `read_at` anterior ou igual, atualização de `last_seen_at`, `last_read_at`, `last_position_id`, bateria, sinal, `seal_state`, `wifi_in_use` e `firmware_version`, tipos `position`, `event`, `activation` (gera `seal_code` `LCR-` + 8 na primeira vez) e `shutdown` (só grava; a saúde vem na US6), e a resposta do contrato pela `private.seal_build_response` vazia da Fundação até as histórias seguintes [RF-001 a RF-010, RF-032; research.md, itens 1 a 5].
- [X] T042 [US1] Criar `supabase/functions/seal-gateway/{deno.json,handler.ts,index.ts}`: valida com `_shared/seal-protocol.ts`, calcula SHA-256 da chave e do endereço de origem (com sal em segredo da função), chama `seal_ingest` com a chave de serviço, traduz em `200`, `400`, `401`, `429` e `503` do contrato, sem registrar corpo, cabeçalho nem resposta; em `supabase/config.toml`, `[functions.seal-gateway] verify_jwt = false`.
- [X] T043 [US1] Criar `supabase/migrations/20261018100250_seals_realtime.sql`: substituir `private.seal_broadcast(org, kind, device, cylinder)` (já chamada pelos tratadores desde a Fundação) chamando `realtime.send` em `seals:<organização>` com aviso sem coordenada, chamada quando nasce posição, muda saúde, trava, comando ou alerta (não a cada "visto por último"); política de `select` em `realtime.messages` por função `security definer` própria que confere `seal.read` com `auth.uid()` e a sessão do token [research.md, item 7].
- [X] T044 [US1] Criar `supabase/migrations/20261018100300_seals_read.sql` com `list_seals`, `get_seal`, `cylinder_seal_view`, `trip_seal_view` (cilindro sem vínculo aparece "sem lacre") e `list_positions` (até 500 por página, intervalo de datas) [contracts/operacoes-servidor.md].
- [X] T045 [US1] Criar `supabase/functions/query-seals/{deno.json,handler.ts,index.ts}` sobre `_shared/operations.ts` com as operações de leitura de US1 e `supabase/functions/manage-seals/{deno.json,handler.ts,index.ts}` vazia de operações (preenchida nas histórias seguintes); carregar as funções (`npx supabase stop` e `start`), rodar `db reset`, `test db` e os testes de borda.
- [X] T046 [US1] Implementar `src/application/seals/seal-realtime.ts` e as leituras em `seal-service.ts` e `src/application/seals/seal-views.ts` (snake_case para camelCase, valor desconhecido recusado, nunca presumido) com `seal-views.test.ts`.
- [X] T047 [US1] Implementar `src/pages/cylinders/components/cylinder-seal-block.tsx` e ligá-lo ao detalhe do cilindro, usando `src/components/maps` e a skill `ui-ux-pro-max` [RF-011, RF-042].
- [X] T048 [US1] Criar `scripts/lacre/simulador.mjs` (linha de comando sobre `tests/support/seal-simulator.ts`, cenários `ativar`, `parado`, `movendo`, `reenvio`, `lote-atrasado`, `chave-errada`, com `--url`, `--device` e `--key` lidos de argumento ou variável de ambiente, nunca de arquivo versionado) e conferir os cenários do `quickstart.md`, passo 2.
- [X] T049 [US1] Rodar `npm test`, `npx supabase db reset`, `npx supabase test db` e `npm run test:live`; todas as suítes de US1 passam e as `008_*` a `010_*` seguem verdes.

**Ponto de controle**: MVP — posição do lacre simulado no detalhe do cilindro, em tempo real, isolada por organização.

---

## Fase 4 — US6: Saber se o lacre está funcionando, mesmo quando para de comunicar (P1)

**Objetivo**: saúde calculada sozinha, alertas reais numa lista única e notificação push para o possível extravio e os alertas altos e críticos.

**Teste independente**: com o simulador, fazer um lacre avisar o desligamento, outro parar sem avisar e um terceiro enviar só posições sem GPS; sem ação humana, confirmar "desligado", "sem comunicação" e "sem GPS", os alertas certos (possível extravio só em viagem ou vigilância) e a volta a "funcionando".

### Testes primeiro (RED)

- [X] T050 [P] [US6] Escrever `supabase/tests/012_watchdog.test.sql` com o relógio controlado: `no_comm` depois de `report_interval_s` + 30 s sem contato; com o cilindro em viagem em andamento ou sob vigilância, alerta `possible_loss` alto com `requires_push`; no estoque ou sem vínculo, alerta `no_comm` médio sem push; `shutdown` muda para `off` **na hora** com a mesma regra de tipo e severidade; `no_gps` depois de 3 intervalos só com `last_known`, alerta médio; bateria abaixo de 15 % → `low_battery`; posição com GPS devolve `ok`, grava `recovered_at` e mantém o alerta aberto; nenhum estado muda `cylinders` nem `trip_items`; rodar `run_seal_watchdog()` duas vezes não duplica alerta [RF-013 a RF-017, RN-002, CA-007; Clarifications 17/10].
- [X] T051 [P] [US6] Escrever `supabase/tests/012_alerts.test.sql`: alertas do lacre (`low_battery`, `weak_signal` abaixo de −85 dBm, `seal_open`, `seal_broken`) abertos só na mudança e sem duplicar; `seal_open` ou `seal_broken` com a trava `locked*` é crítico; `list_alerts` e `get_alert` com filtros e isolamento por organização; `acknowledge_alert` e `close_alert` exigem `seal.operate`, a observação de 5 a 500 e geram auditoria `seal.alert_close` [RF-016, RF-035, RF-036].
- [X] T052 [P] [US6] Escrever `supabase/tests/012_push_outbox.test.sql`: alerta com `requires_push` gera uma linha em `push_outbox` por inscrição ativa de quem tem `seal.read` **naquela** organização; o Tenant B não recebe; inscrição revogada não recebe; repetir o alerta não duplica; a volta gera `recovered`; retirar `seal.read` ou o vínculo da pessoa revoga as inscrições com `permission_lost` [RF-036a, RF-036d, CA-010].
- [X] T053 [P] [US6] Escrever `tests/contract/seal-push-handler.test.ts`: sem o segredo no cabeçalho responde `401`; envia o lote pendente; `404` e `410` revogam a inscrição com `gone`; o texto tem só tipo, código do cilindro e horário, sem coordenada, cliente ou nome [RF-036c, CA-010].
- [X] T054 [P] [US6] Escrever `src/application/seals/push-subscription.test.ts` e `src/infrastructure/push/push-manager.test.ts`: ativar pede a permissão do navegador **só depois** do clique; permissão negada explica como ativar; sem suporte (iPhone fora da tela de início) explica a instalação; desativar revoga no servidor; a inscrição não é guardada fora do navegador [RF-036b].
- [X] T055 [P] [US6] Escrever `src/pages/alerts/alerts-page.test.tsx` (reescrita) e `src/pages/alerts/alert-detail-page.test.tsx`: lista real sem o selo "Exemplo", filtros por situação, severidade e tipo, severidade em ícone e texto, detalhe com a última posição no mapa e em texto, reconhecer e encerrar com observação, estados carregando, vazio ("Nenhum alerta aberto"), erro e offline [RF-035, RF-036, RF-042].
- [X] T056 [P] [US6] Escrever `src/pages/seals/seal-list-page.test.tsx`: tabela a partir de 768 px e cartões abaixo, filtros por saúde, trava e "sem cilindro", saúde em ícone e texto, mudança anunciada por `aria-live="polite"` [História 6, cenário 7].
- [X] T057 [P] [US6] Escrever `src/pages/profile/push-settings.test.tsx`: "Notificações deste aparelho" com o estado da permissão, ativar, desativar e a explicação para iPhone [RF-036b].
- [X] T058 [P] [US6] Escrever `tests/integration/seals-health.live.test.ts`: os três cenários do teste independente com o simulador, rodando `run_seal_watchdog()` como o `pg_cron` faria; alerta em até 1 minuto depois do envio esperado; notificação enviada a uma inscrição de teste em até 30 s [RNF-001a, RNF-003, MS-006].

### Implementação (GREEN)

- [X] T059 [US6] Criar `supabase/migrations/20261018100400_seals_watchdog.sql` com `private.run_seal_watchdog()` (saúde, `no_comm`, `off`, `no_gps`, `low_battery`, volta; os prazos de comando entram na US2) e `cron.schedule('fluxid-seal-watchdog', '* * * * *', ...)` no `begin … exception`; substituir `private.seal_handle_position`, `seal_handle_shutdown` e `seal_handle_alert` com a saúde na chegada [RF-013 a RF-017; research.md, item 6].
- [X] T060 [US6] Criar `supabase/migrations/20261018100500_seals_alerts.sql` com `private.open_seal_alert` (tipo, severidade, `requires_push`, sem duplicar), `private.recover_seal_alert`, `list_alerts`, `get_alert`, `acknowledge_alert` e `close_alert` com auditoria na mesma transação [RF-016, RF-035, RF-036].
- [X] T061 [US6] Criar `supabase/migrations/20261018100600_seals_push.sql` com `push_subscribe`, `push_unsubscribe`, `push_status`, o preenchimento de `push_outbox`, `claim_push_outbox` (`for update skip locked`), a revogação por perda de permissão (gatilho nas tabelas de vínculo e papel da Spec 002), o segredo do `seal-push` criado no Vault com valor aleatório, o gatilho de comando que chama `net.http_post` para `seal-push` com o segredo e o reenvio do pendente dentro de `run_seal_watchdog()` [RF-036a, RF-036d; research.md, item 8].
- [X] T062 [US6] Criar `supabase/functions/seal-push/{deno.json,handler.ts,index.ts}` com a biblioteca escolhida em T006, `verify_jwt = false` em `supabase/config.toml` e o segredo conferido em tempo constante; acrescentar as operações de alertas e push a `query-seals` e `manage-seals`.
- [X] T063 [US6] Criar `public/push-sw.js` (eventos `push` e `notificationclick` abrindo `/alertas/<id>`, sem dado sensível) e acrescentar `importScripts: ['push-sw.js']` ao `workbox` de `vite.config.ts`; ajustar `src/app/pwa-config.test.ts` [contracts/telas-e-rotas.md].
- [X] T064 [US6] Implementar `src/infrastructure/push/push-manager.ts` (PushManager com `VITE_VAPID_PUBLIC_KEY`), `src/application/seals/push-subscription.ts` e `src/pages/profile/push-settings.tsx` no perfil.
- [X] T065 [US6] Reescrever `src/pages/alerts/alerts-page.tsx` sobre `seal-service` (troca da fonte de exemplo pela real, mantendo `SeverityBadge` e `NewBadge`) e criar `src/pages/alerts/alert-detail-page.tsx`; ajustar o bloco de alertas da Visão geral se ele apontar para a fonte de exemplo, mantendo o selo "Exemplo" onde o dado continuar de exemplo.
- [X] T066 [US6] Implementar `src/pages/seals/seal-list-page.tsx` na `seals-area` com tempo real, usando a skill `ui-ux-pro-max`.
- [X] T067 [US6] Carregar as funções, rodar `db reset`, `test db`, `npm test` e `npm run test:live`; todas as suítes de US1 e US6 passam.

**Ponto de controle**: lacre que some vira alerta sozinho; possível extravio chega por notificação.

---

## Fase 5 — US2: Travar o lacre quando o cilindro entra em viagem (P1)

**Objetivo**: comandos com estados explícitos e trava no início da viagem, confirmada só pelo lacre.

**Teste independente**: iniciar uma viagem com três cilindros com lacre e um sem lacre; três comandos de travar saem, cada lacre simulado recebe o seu na próxima comunicação, o sem lacre fica "sem lacre" e a trava só aparece "travada" depois da confirmação.

### Testes primeiro (RED)

- [X] T068 [P] [US2] Escrever `supabase/tests/012_command_lifecycle.test.sql`: transições válidas `pending → delivered → confirmed | failed | expired` e `pending → cancelled`, e todas as inválidas, inclusive por `update` direto; a resposta ao lacre leva no máximo um comando, trava antes de rede, o entregue repetido com o mesmo `id` até a confirmação; `command_result` `executed` muda `lock_state` e `error` deixa `unconfirmed` com alerta `command_failed`; confirmação repetida é idempotente; confirmação de comando de outro dispositivo ou organização é recusada com `command_of_other_device` ou `unknown_command` e registrada sem efeito; comando novo de trava cancela o pendente com motivo e a confirmação do cancelado é registrada em `seal_command_events` sem mudar a trava; entregue sem confirmação em 10 min → `expired`, `unconfirmed` e alerta `command_expired`; trava **não entregue** não expira; aos 30 min, `lock_state` passa a `unconfirmed` e abre `command_not_delivered`, uma vez; a confirmação posterior leva a trava a `locked` e registra a entrega no alerta; `request_lock` e `request_unlock` normais exigem `seal.operate` e justificativa de 5 a 500 e geram `seal.command_manual` [RF-026 a RF-029, CA-002; Clarifications 17/10].
- [X] T069 [P] [US2] Escrever `supabase/tests/012_trip_lock.test.sql`: `start_trip` (Spec 008) cria um `lock` com origem `trip_start` por item em trânsito com vínculo ativo e grava `trip_items.seal_command_id`; cilindro sem lacre não ganha comando; repetir o pedido de início não duplica; a viagem fica `in_progress` sem esperar confirmação; o comando segue pendente enquanto a viagem estiver em andamento e é cancelado quando ela termina ou é cancelada; as suítes `008_loading_start`, `008_idempotency` e `010_*` seguem verdes [RF-023, RN-008, MS-003].
- [X] T070 [P] [US2] Escrever `tests/contract/manage-seals-handler.test.ts` (parte comandos): `request_lock` e `request_unlock` com `request_id` obrigatório, justificativa, mapeamento HTTP, `MFA_REQUIRED` vindo do banco e nenhuma operação de exclusão.
- [X] T071 [P] [US2] Escrever `src/pages/trips/components/trip-seal-column.test.tsx` e `src/pages/seals/components/lock-command-dialog.test.tsx`: coluna "Trava física" ao lado do bloqueio lógico ("travada", "destravada", "travamento pendente" até 30 min, "não confirmada" depois, "sem lacre") em ícone e texto; diálogo com justificativa, erros junto do campo, um único envio, desabilitado offline com o motivo [RF-030, RF-042, RF-043].
- [X] T072 [P] [US2] Escrever `tests/integration/seals-trip-lock.live.test.ts`: o teste independente com o simulador e a Spec 008 real.

### Implementação (GREEN)

- [X] T073 [US2] Criar `supabase/migrations/20261018100700_seals_commands.sql`: `private.issue_seal_command` (cancela o pendente do mesmo grupo, grava evento), `private.next_seal_command`, a substituição de `private.seal_build_response` (com o comando) e de `private.seal_handle_command_result`, `request_lock`, `request_unlock` (normal; a exceção entra na US3), os prazos em `run_seal_watchdog()` (expiração de 10 min e alerta de 30 min) e o aviso Realtime [RF-025 a RF-029; research.md, item 9].
- [X] T074 [US2] Criar `supabase/migrations/20261018100800_seals_trip_lock.sql` com o gatilho `after update of status on public.trips` (para `in_progress` chama `private.seal_on_trip_started`; para `completed` ou `cancelled` cancela os `lock` pendentes) e a leitura de `trip_seal_view` com o estado do comando [RF-023; research.md, item 11].
- [X] T075 [US2] Acrescentar `request_lock`, `request_unlock` e `list_commands` a `manage-seals` e `query-seals`; implementar `src/pages/trips/components/trip-seal-column.tsx` no detalhe da viagem e `src/pages/seals/components/lock-command-dialog.tsx` no bloco do cilindro.
- [X] T076 [US2] Rodar `db reset`, `test db` (inclusive todas as `008_*`), `npm test` e `npm run test:live`.

---

## Fase 6 — US3: Destravar depois da entrega correta dentro da geocerca do cliente (P1)

**Objetivo**: destravamento automático só com prova de posição dentro da geocerca; exceção com segundo fator.

**Teste independente**: registrar a entrega de dois cilindros, um com o lacre dentro da geocerca da unidade e outro fora; só o primeiro recebe `unlock` automaticamente e o segundo exige o destravamento excepcional.

### Testes primeiro (RED)

- [X] T077 [P] [US3] Escrever `supabase/tests/012_delivery_unlock.test.sql`: entrega de cilindro com trava `locked` ou `unconfirmed` dentro da geocerca ativa com posição do lacre com GPS lida nos 2 minutos anteriores → `unlock` origem `delivery`, `proof` `seal` sem coordenada, desbloqueio lógico da Spec 008 registrado junto; sem ela, posição do celular com origem `gps` dentro → `proof` `phone`; posição digitada ou "no endereço da unidade" não comprova; fora, sem prova ou sem geocerca ativa → nenhum comando e motivo gravado para a tela; cilindro "não entregue" → nada; `lock` pendente é cancelado com o motivo e o evento registra que a trava anterior não tinha confirmação; correção da entrega para "não entregue" depois do destravamento → `lock` origem `delivery_correction`; cancelamento da viagem com itens devolvidos ao estoque → `unlock` origem `trip_cancel`; as suítes `008_delivery`, `008_delivery_correction`, `008_delivery_geofence`, `008_unlock`, `008_close` e `010_*` seguem verdes [RF-024, MS-004; Clarifications 17/10].
- [X] T078 [P] [US3] Escrever a parte excepcional de `supabase/tests/012_permissions.test.sql`: `request_unlock` fora da regra de entrega, depois de violação ou de `locked_comm_loss` sem `aal2` responde `MFA_REQUIRED`; com `aal2`, cria origem `exceptional` e auditoria `seal.unlock_exceptional` sem coordenada [RF-025, RN-005].
- [X] T079 [P] [US3] Escrever `src/pages/trips/components/delivery-unlock-notice.test.tsx`: depois de salvar a entrega, explica por que o destravamento não foi automático (fora da geocerca, sem posição que comprove, unidade sem geocerca) e oferece o destravamento excepcional, que pede o segundo fator como na Spec 008 [História 3, cenários 4 e 5].
- [X] T080 [P] [US3] Escrever `tests/integration/seals-delivery-unlock.live.test.ts`: o teste independente com o simulador posicionando o lacre dentro e fora.

### Implementação (GREEN)

- [X] T081 [US3] Criar `supabase/migrations/20261018100900_seals_delivery_unlock.sql`: gatilho `after insert on public.trip_deliveries` chamando `private.seal_on_delivery_recorded` (prova de posição, `private.point_inside_site_geofence` da Spec 008, `unlock`, cancelamento do `lock` pendente, desbloqueio lógico, motivo sem destravamento), gatilhos de cancelamento e retorno de item (`trip_cancel`), correção (`delivery_correction`) e a regra de exceção com `aal2` em `request_unlock` [RF-024, RF-025, RN-005; research.md, item 11].
- [X] T082 [US3] Implementar `src/pages/trips/components/delivery-unlock-notice.tsx` na tela de entrega e o fluxo excepcional no `lock-command-dialog.tsx`, reaproveitando o pedido de segundo fator da Spec 008.
- [X] T083 [US3] Rodar `db reset`, `test db`, `npm test` e `npm run test:live`.

---

## Fase 7 — US4: Violação de geocerca: travar, registrar e alertar (P1)

**Objetivo**: vigiar o cilindro entregue, travar na saída real e aceitar a trava do próprio lacre fora da geocerca.

**Teste independente**: com um cilindro entregue e destravado dentro da geocerca, enviar duas posições com GPS fora e confirmar a violação, o `lock` entregue já na resposta, o alerta e, depois da confirmação, "travado por violação de geocerca".

### Testes primeiro (RED)

- [X] T084 [P] [US4] Escrever `supabase/tests/012_geofence_watch.test.sql`: vigilância começa na entrega com a unidade da parada e termina na nova viagem (`new_trip`), na entrada no estoque (`stock_in`), no desvínculo e na inativação do cilindro, sem violação; unidade sem geocerca ativa não abre vigilância; geocerca inativada durante a vigilância suspende com alerta `watch_suspended` médio; `watch.version` sobe quando a vigilância começa, termina ou a geocerca muda, e a resposta leva `fences` (círculos com centro e raio, polígonos com até 100 vértices) só quando a `watch_version` do pedido é diferente; duas posições com GPS seguidas fora além de 50 m → violação com geocerca, horário, posição e distância, alerta `geofence_violation` alto e `lock` origem `geofence_violation` **na resposta do mesmo envio**; uma posição só fora, ou fora dentro da tolerância, ou sem GPS → nada; violação aberta não cria outra nem outro comando e guarda a última posição; volta para dentro → `returned`, alerta continua aberto e o lacre **não** destrava; lote atrasado só trava se a leitura mais nova ainda estiver fora; borda e qualquer geocerca da unidade contam como dentro [RF-018 a RF-022a, RN-004, MS-005].
- [X] T085 [P] [US4] Escrever `supabase/tests/012_auto_lock.test.sql`: `auto_lock` registra `locked_comm_loss` com o horário informado, alerta `comm_loss_lock` alto com push, processa as leituras guardadas pela regra de violação e não cria comando de travar; o destravamento depois disso exige `aal2` [RF-022a, RN-011, MS-011].
- [X] T086 [P] [US4] Escrever `src/pages/cylinders/components/cylinder-watch-panel.test.tsx`: vigilância ativa com a unidade, violação aberta ou "retornou à área" e trava "travada por violação de geocerca" ou "travada por perda de comunicação" em ícone e texto [RF-030].
- [X] T087 [P] [US4] Escrever `tests/integration/seals-geofence.live.test.ts`: o teste independente e o cenário `auto-lock` do simulador.

### Implementação (GREEN)

- [X] T088 [US4] Criar `supabase/migrations/20261018101000_seals_geofence_watch.sql`: abertura da vigilância em `private.seal_on_delivery_recorded`, encerramento por gatilhos em `trip_items` (cilindro em nova viagem) e na entrada no estoque, `outside_streak`, violação, `lock` na resposta, substituição de `private.seal_handle_auto_lock` e de `private.seal_build_response` (com `watch` e `fences`), suspensão por geocerca inativada em `run_seal_watchdog()` e gatilho de versão nas geocercas da Spec 007 [research.md, item 12].
- [X] T089 [US4] Implementar `src/pages/cylinders/components/cylinder-watch-panel.tsx` no bloco do cilindro e os novos cenários `sair-da-geocerca`, `ir-para` e `auto-lock` em `scripts/lacre/simulador.mjs`.
- [X] T090 [US4] Rodar `db reset`, `test db` (inclusive `007_*` de geocercas e `008_*`), `npm test` e `npm run test:live`.

---

## Fase 8 — US5: Cadastrar o dispositivo e vincular o lacre ao cilindro (P2)

**Objetivo**: o administrador cadastra o dispositivo e recebe a chave uma vez; o operador vincula e desvincula.

**Teste independente**: cadastrar um dispositivo, simular a ativação, vincular a um cilindro e ver a próxima posição nele; desvincular e ver que a seguinte não aparece mais.

### Testes primeiro (RED)

- [X] T091 [P] [US5] Escrever `supabase/tests/012_binding.test.sql`: `create_device` gera `device_code` e devolve `device_key` `fxk_` + base64url de 32 bytes **uma vez**, guardando só `key_hash`; `rotate_device_key` invalida a antiga na hora; `deactivate_device` encerra o vínculo com `device_inactivated` e recusa os envios seguintes; `update_device` com versão; `list_unbound_active_seals` mostra os ativos sem cilindro com ativação, bateria e última posição; `bind_seal` por `cylinder_id` ou identificador lido (Spec 009) só com lacre e cilindro ativos da mesma organização; recusas `SEAL_ALREADY_BOUND` e `CYLINDER_ALREADY_BOUND`; `unbind_seal` recusado com `CYLINDER_IN_TRIP` em viagem em andamento; inativação do cilindro (Spec 006) encerra o vínculo com `cylinder_inactivated`; `shutdown` não encerra o vínculo; `deactivate_device`, `rotate_device_key` e `unbind_seal` sem justificativa, ou com menos de 5 ou mais de 500 caracteres, respondem `JUSTIFICATION_REQUIRED` e não gravam nada; a justificativa vai para `seal_device_events` ou `seal_bindings.unbind_justification` e nunca para `audit_logs.metadata`; auditorias `seal.device_create`, `seal.device_update`, `seal.device_deactivate`, `seal.key_rotate`, `seal.bind`, `seal.unbind` sem a chave [RF-031 a RF-034, RF-039; princípio III].
- [X] T092 [P] [US5] Cobrir a auditoria do RF-039 nas suítes de cada ação (`012_binding`, `012_alerts`, `012_command_lifecycle`, `012_permissions` e `012_push_outbox` conferem a ação e a ausência de chave, senha, justificativa e coordenada; não há arquivo `012_audit` separado): toda ação do RF-039 gera auditoria na mesma transação, sem chave, senha ou coordenada em `metadata` [RF-039, CA-004].
- [X] T093 [P] [US5] Escrever `src/pages/seals/components/device-form-dialog.test.tsx`, `device-key-reveal.test.tsx` e `bind-seal-dialog.test.tsx`: chave mostrada uma vez com "Copiar" e confirmação antes de fechar, nunca em armazenamento local; diálogos de desativar, gerar chave nova e desvincular com campo de justificativa obrigatório (5 a 500) e aviso; vínculo pela leitura do identificador ou pela lista; recusas em texto; offline desabilitado com o motivo [História 5].
- [X] T094 [P] [US5] Escrever `src/pages/seals/seal-detail-page.test.tsx` (parte dispositivo): saúde, trava, bateria, vínculo atual e anteriores, últimas posições, comandos e alertas; ações conforme a permissão.
- [X] T095 [P] [US5] Escrever `tests/e2e/lacres-cadastro.spec.ts`: cadastrar, copiar a chave, ativar pelo backend simulado, vincular, desvincular; Tenant B não vê o dispositivo do A.

### Implementação (GREEN)

- [X] T096 [US5] Criar `supabase/migrations/20261018101100_seals_devices_binding.sql` com `create_device`, `update_device`, `deactivate_device`, `rotate_device_key`, `bind_seal`, `unbind_seal`, `list_unbound_active_seals` e o gatilho na inativação do cilindro; a chave é gerada com `extensions.gen_random_bytes(32)` e só o SHA-256 é guardado [RF-031 a RF-034; research.md, item 2].
- [X] T097 [US5] Acrescentar as operações a `manage-seals` e `query-seals`; implementar `device-form-dialog.tsx`, `device-key-reveal.tsx`, `bind-seal-dialog.tsx` e `src/pages/seals/seal-detail-page.tsx`, e a ação de vincular no bloco do cilindro, com a skill `ui-ux-pro-max`.
- [X] T098 [US5] Trocar nas suítes `.live` e nos cenários do simulador o apoio `tests/support/sql/seals-fixtures.sql` pelo cadastro real onde o teste for de ponta a ponta (o apoio continua nas suítes pgTAP de unidade); rodar `db reset`, `test db`, `npm test`, `npm run test:live` e o E2E.

---

## Fase 9 — US7: Configurar as redes Wi-Fi do lacre pelo sistema (P2)

**Objetivo**: adicionar, remover e voltar à rede padrão por comando, sem a senha nunca sair de onde deve.

**Teste independente**: adicionar uma rede com senha certa e outra com senha errada pelo sistema; a primeira entra na lista depois da confirmação, a segunda termina "com erro", o lacre continua comunicando e as duas senhas somem do FluxID.

### Testes primeiro (RED)

- [X] T099 [P] [US7] Escrever `supabase/tests/012_wifi_commands.test.sql`: `wifi_add` com `ssid` de 1 a 32 bytes e `password` de 8 a 63, ou `open: true`; senha guardada no Vault e só o `wifi_secret_id` no comando; a senha só aparece na resposta ao próprio lacre; apagada do Vault e `wifi_secret_id` anulado ao confirmar, falhar, cancelar ou expirar (30 min sem entrega); `WIFI_LIST_FULL` com 5 redes; `WIFI_NOT_IN_LIST` ao remover rede desconhecida; `wifi_reset` esvazia a lista e, sem justificativa de 5 a 500, responde `JUSTIFICATION_REQUIRED`; com viagem em andamento ou vigilância exige `confirm_risk: true` (`WIFI_RISK_NOT_CONFIRMED`); novo pedido para a mesma rede cancela o anterior; um comando de rede por vez, na ordem, e nunca à frente de um de trava; `error` com motivo (`wifi_not_found`, `wifi_auth`, `wifi_no_internet`) abre `wifi_change_failed` médio; `network_change` atualiza `wifi_in_use` e `wifi_saved`; auditorias `seal.wifi_add`, `seal.wifi_remove` e `seal.wifi_reset` só com o nome da rede; exige `seal.admin` [RF-034a a RF-034f, CA-008, CA-009].
- [X] T100 [P] [US7] Escrever `src/pages/seals/components/wifi-networks-panel.test.tsx`: rede em uso (nome, padrão ou da lista, sinal, horário), nomes das redes guardadas, adicionar com campo de senha que nunca é mostrado de novo nem guardado, rede aberta, aviso de risco com viagem ou vigilância, limite de 5, remover e voltar à padrão com justificativa obrigatória; nenhuma senha em tela [RF-034a, RF-034f, RF-040].
- [X] T101 [P] [US7] Escrever `tests/integration/seals-wifi.live.test.ts`: o teste independente com os cenários `rede-ok` e `rede-falha` do simulador, conferindo `vault.secrets` antes e depois [MS-010].

### Implementação (GREEN)

- [X] T102 [US7] Criar `supabase/migrations/20261018101200_seals_wifi.sql` com `wifi_add`, `wifi_remove`, `wifi_reset`, a montagem do comando de rede na resposta (lendo do Vault só nesse ponto), o apagamento ao fim do comando, a substituição de `private.seal_handle_network_change` e a expiração de 30 min em `run_seal_watchdog()` [research.md, item 10].
- [X] T103 [US7] Acrescentar as operações a `manage-seals` e implementar `src/pages/seals/components/wifi-networks-panel.tsx` no detalhe do dispositivo; cenários `rede-ok` e `rede-falha` no simulador.
- [X] T104 [US7] Rodar `db reset`, `test db`, `npm test`, `npm run test:live` e `tests/contract/seals-no-secrets-in-logs.test.ts` com a senha de teste.

---

## Fase 10 — US8: Lacre físico de ponta a ponta com o firmware desta spec (P1)

**Objetivo**: firmware na pasta `firmware/` que fala o contrato, testado no computador, compilado no CI e validado no lacre real.

**Teste independente**: com o lacre físico no Supabase de teste, cumprir o roteiro da seção 3 do `quickstart.md`.

### Base e testes primeiro (RED)

- [X] T105 [US8] Trazer o firmware de `simaoBastos/fluxid-firmware` para `firmware/` (com o histórico de origem citado no `firmware/README.md`), remover `GSM.cpp`, `GSM.h`, TinyGSM e ArduinoHttpClient, e reescrever `firmware/platformio.ini` com os ambientes `esp32c3` (`esp32-c3-devkitm-1`, `board_build.filesystem = littlefs`, `TinyGPSPlus`, `ArduinoJson`) e `native` (Unity, só módulos puros); manter `include/secrets.example.h` sem valores reais e `include/secrets.h` no `.gitignore` [research.md, item 16; CA-012].
- [X] T106 [P] [US8] Escrever `firmware/test/test_protocolo/test_protocolo.cpp`: monta cada pedido e lê cada resposta dos exemplos de `tests/fixtures/seal-protocol/` (comando, `watch` com e sem `fences`, erros) [CA-011].
- [X] T107 [P] [US8] Escrever `firmware/test/test_fila/test_fila.cpp`: fila persistente (com armazenamento simulado), lotes de até 50, mesmos `message_id` no reenvio, remoção só depois de `stored` ou `duplicate`, `429` e `503` mantêm a fila.
- [X] T108 [P] [US8] Escrever `firmware/test/test_rede/test_rede.cpp`: escolha da rede conhecida de sinal mais forte, volta à padrão sem nenhuma da lista, lista de até 5, rede nova só guardada depois de alcançar o FluxID por ela, falha volta à rede anterior com o motivo [RF-034d, RF-034e, CA-009].
- [X] T109 [P] [US8] Escrever `firmware/test/test_vigilancia/test_vigilancia.cpp`: ponto dentro e fora de círculo e polígono (haversine), borda conta como dentro, 50 m de tolerância, duas posições seguidas, sem GPS não conta, 3 envios sem resposta, `auto_lock` só fora, rede caída dentro não trava [RN-011, MS-011].
- [X] T110 [P] [US8] Escrever `firmware/test/test_trava/test_trava.cpp`: comando `lock` e `unlock` acionam o pulso do acionador e só então confirmam `executed`; falha do acionador confirma `error` com `actuator`; sem estado gravado, a válvula começa aberta e não aciona a solenoide; depois do reinício, restaura o último estado confirmado e o informa em `activation.valve` [RN-010].

### Implementação (GREEN)

- [X] T111 [US8] Implementar os módulos puros em `firmware/src/` (`Protocolo`, `FilaOffline`, `Rede`, `Vigilancia`, `Trava`) até `pio test -e native` passar.
- [X] T112 [US8] Implementar os módulos de hardware em `firmware/src/` (`Transporte` com `WiFiClientSecure` e o pacote de certificados raiz, sem `setInsecure`; `Relogio` com SNTP antes da primeira chamada; `GPS` com TinyGPSPlus; `Bateria` medida pelo ADC; `LED`; acionador da solenoide por pulso com pinos em `include/config.h`) e o laço em `main.cpp`: envio a cada `report_interval_s`, ativação ao ligar, aviso de desligamento quando possível, comando lido da resposta e confirmado, `watch` guardado; `pio run -e esp32c3` compila [spec, "Requisitos para o firmware"].
- [X] T113 [US8] Acrescentar a `.github/workflows/quality.yml` um job `firmware` que instala o PlatformIO, roda `pio test -e native` e `pio run -e esp32c3` e reprova se `firmware/` contiver `secrets.h`, chave `fxk_`, senha ou endereço `*.supabase.co` real [CA-012].
- [X] T114 [US8] Escrever `firmware/README.md`: montagem (ESP32-C3 Super Mini, GPS, solenoide, bateria, pinos), gravação, `secrets.h`, LEDs, roteiro de bancada e o limite conhecido das senhas na flash sem cifragem [research.md, item 16].
- [ ] T115 [US8] Gravar o lacre físico contra o Supabase local (por `npm run dev:rede` ou rede local) e conferir posição, trava e desligamento em bancada; registrar em `specs/012-lacre-iot-geocerca-trava/validation.md` o modelo da solenoide confirmado e os pinos usados.

---

## Fase 11 — Polimento e encerramento

- [X] T116 [P] Escrever e rodar `tests/e2e/lacres-acompanhamento.spec.ts` e `tests/e2e/lacres-alertas.spec.ts` em 360, 768 e 1920 px: jornadas de acompanhar o cilindro, a viagem e os alertas, só com teclado, axe sem violação crítica ou grave, sem rolagem horizontal, offline [CA-005, MS-008, MS-009].
- [X] T117 [P] Criar as capturas visuais das telas novas em `tests/e2e/visual/lacres-*.spec.ts` e regenerar no Linux com `npm run test:visual:atualizar`; nenhum `*-win32.png`.
- [X] T118 [P] Conferir o pacote de entrada (`npm run build`) contra o `baseline.md` (+5 % no máximo; mapa e telas de lacre em chunks `React.lazy`) e registrar em `validation.md` [RNF-006].
- [X] T119 [P] Atualizar `docs/publicacao-em-nuvem.md` (chaves VAPID, sal do endereço, `pg_cron` e `pg_net` no projeto de teste, consumo de invocações), `docs/prd.md` (situação da Fase 6), `README.md`, `contracts/` e `quickstart.md` ao que foi construído; conferir no `plan.md` a contagem de migrations (14).
- [X] T120 Rodar a rodada completa: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (sem reduzir limites), `npx supabase db reset` e `npx supabase test db`, `npm run test:live`, `npm run build`, `npm run test:e2e`, `cd firmware && pio test -e native && pio run -e esp32c3`; anotar os números em `validation.md`.
- [X] T121 Publicar no Supabase de teste conforme `docs/publicacao-em-nuvem.md` (migrations e funções, **sem seed**, segredos pela pessoa responsável); conferir `public-compatibility`, o `cron.job` ativo e o envio de uma notificação; nada de segredo em arquivo versionado.
- [ ] T122 Rodar com a pessoa responsável o roteiro do `quickstart.md` (seções 2 e 3) com o lacre físico e **medir** MS-008 (localizar o cilindro e entender lacre e trava em até 20 s), MS-010 (rede em até 1 minuto), MS-012 (História 8 completa) e o consumo de invocações (RNF-004), registrando tempos e resultados em `validation.md`.
- [X] T123 Conferir que nenhum segredo, chave de dispositivo, senha de rede, chave VAPID privada ou `service_role` entrou no cliente, no repositório ou nos logs, e que `git status` não tem `*-win32.png` nem arquivos alheios à spec [RF-040].
- [X] T124 **Gate de registro de IA** (AGENTS.md): `git add` explícito do código, testes, migrations, funções, firmware e documentação, sem commit; `npm run ia:registro -- --spec 012 --ciclo 01 --titulo "Lacre IoT, geocerca e trava"`; **entrevistar Natã da Silva Baracho** (quem validou; amostra de perfis, telas, larguras e fluxos, incluindo o lacre físico; ambiente; duração; resultado; itens a corrigir; decisão `utilizado`, `adaptado` ou `descartado` com justificativa; confirmação de que as respostas podem ser gravadas em nome da pessoa), **sem presumir nem inferir dos testes**; se houver correções, corrigir, repetir os testes e perguntar de novo; preencher o RIA, trocar o link de revisão pelo do pull request, incluir `docs/governanca-ia/indice.md`, rodar `npm run ia:validar` e só então commitar, sem `--no-verify` e sem linhas de coautoria.
- [X] T125 Abrir o pull request da branch `feat/012-lacre-iot-geocerca-trava` com a conta `equipefluxid`, citando a issue, aguardar os checks verdes e a revisão humana; **não** fazer merge sem aprovação.
- [X] T126 Depois do merge aprovado, entregar o DOCX do RIA em `docs/ria-NNN-docx` (`python scripts/governanca-ia/exportar-docx.py ...`), apontar o índice para ele e abrir um pull request só de documentação.

---

## Pendências fora desta spec

- [ ] T127 Proximidade entre o GPS do lacre e o do celular, rastreamento do veículo, relatórios e notificações por e-mail (Fase 7).
- [ ] T128 Cifragem da flash do ESP32, homologação do hardware e da solenoide para produção (Fase 8).
- [ ] T129 Prazo de retenção e anonimização das posições (spec de privacidade das Specs 009 e 010).

---

## Dependências e ordem de execução

- **Fase 1** (T001 a T007) não depende de nada; T005 e T006 decidem as peças de plataforma antes do código.
- **Fase 2** (T008 a T029) depende da Fase 1 e **bloqueia todas as histórias**. Os testes (T008 a T012) vêm antes das migrations (T013, T014); o contrato (T016 a T020) e o domínio (T021 a T024) andam em paralelo ao banco.
- **US1** depende da Fundação e é o MVP.
- **US6** depende de US1 (precisa de posições e de `seal_ingest`).
- **US2** depende de US1 e US6 (usa os alertas e o `run_seal_watchdog`).
- **US3** depende de US2 (comandos); **US4** depende de US3 (a vigilância começa na entrega).
- **US5** depende de US1 e pode andar em paralelo a US2–US4 (arquivos diferentes, exceto `manage-seals`, que recebe operações de várias histórias e deve ser editado em sequência).
- **US7** depende de US2 (comandos).
- **US8** depende do contrato estável: US1, US2, US4 e US7; os testes nativos (T106 a T110) podem começar logo depois de T016.
- **Fase 11** depende de todas. T124 (gate de IA) só depois da rodada completa (T120), da validação com o lacre físico (T122) e da entrevista.

### Oportunidades de paralelismo

```text
# Fundação: testes de banco juntos
Task: "supabase/tests/012_rls.test.sql"
Task: "supabase/tests/012_no_delete.test.sql"
Task: "supabase/tests/012_constraints.test.sql"
Task: "supabase/tests/012_permissions.test.sql"
Task: "supabase/tests/012_limits_contract.test.sql"

# Fundação: contrato e domínio em paralelo ao banco
Task: "tests/fixtures/seal-protocol/*.json"
Task: "src/domain/seals/seal-vocabulary.ts"
Task: "src/domain/seals/seal-age.ts"
Task: "src/domain/seals/seal-abilities.ts"

# US1: testes RED juntos
Task: "supabase/tests/012_device_auth.test.sql"
Task: "supabase/tests/012_rate_limit.test.sql"
Task: "supabase/tests/012_ingest_dedupe.test.sql"
Task: "supabase/tests/012_ingest_batch.test.sql"
Task: "tests/contract/seal-gateway-handler.test.ts"

# US8: testes nativos do firmware juntos
Task: "firmware/test/test_protocolo"
Task: "firmware/test/test_fila"
Task: "firmware/test/test_rede"
Task: "firmware/test/test_vigilancia"
Task: "firmware/test/test_trava"
```

## Estratégia de implementação

1. **MVP**: Fases 1 e 2, depois US1. Parar e validar: o simulador envia, a posição aparece sozinha no detalhe do cilindro, a repetição não duplica e o Tenant B não vê nada.
2. **Proteção mínima**: US6 (lacre que some vira alerta e notificação) e US2 (trava na viagem).
3. **Ciclo da entrega**: US3 (destravar na entrega) e US4 (violação e `auto_lock`).
4. **Operação**: US5 (cadastro e vínculo pela tela) e US7 (redes Wi-Fi).
5. **Lacre real**: US8 (firmware, CI, bancada) e a Fase 11 com a validação no Supabase de teste.

Cada história termina com a regressão das Specs 001 a 011 verde.

## Notas

- Nenhuma tarefa apaga dado; a única remoção é a da senha no Vault ao fim do comando de rede.
- Dados de teste fictícios: e-mails `@example.invalid`, chaves e senhas geradas pela suíte.
- O CI não chama nenhum serviço externo; o envio real de push e o lacre físico só aparecem na validação.
- Funções novas do Supabase local exigem `npx supabase stop` e `npx supabase start`.
- O Playwright reaproveita a porta 4173: `npm run build` antes do E2E.
