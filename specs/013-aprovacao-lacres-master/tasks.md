---
description: "Tarefas executáveis da Spec 013 — Aprovação e destinação de lacres pelo Master, com a rede configurada pelo próprio lacre"
---

# Tarefas: Aprovação e destinação de lacres pelo Master, com a rede configurada pelo próprio lacre

**Entrada**: artefatos em `specs/013-aprovacao-lacres-master/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD (constituição, princípio II). Em cada incremento, escrever o teste, confirmar a falha esperada (RED), implementar (GREEN), refatorar e rodar a regressão antes de avançar. Testes de banco em `supabase/tests/013_*.test.sql` (pgTAP); domínio, serviço e páginas em Vitest ao lado do código; contratos em `tests/contract/`; suíte contra o Supabase local em `tests/integration/seals-enrollment.live.test.ts`; E2E em `tests/e2e/lacres-*.spec.ts`; capturas em `tests/e2e/visual/`; firmware com `pio test -e native`.

**Escopo protegido**:
- **O lacre nunca informa organização** e nada do que ele envia antes da aprovação vira dado de tenant: nenhuma posição, alerta, evento ou comando [RN-001, RN-003, RF-009, MS-004].
- **Justificativa em toda ação sensível**: aprovar, recusar, resolver conflito, retirar, devolver e revelar a senha exigem justificativa de 5 a 500 e geram auditoria [constituição, princípio III].
- **Redes de um tenant não seguem para outro**: devolução e retirada mandam o lacre esquecer as redes (`forget_networks`) [RN-006].
- **Uma linha de `seal_devices` por destinação**: devolução e retirada inativam a linha pelo auxiliar `private.seal_deactivate_line`; nenhuma tarefa troca o `organization_id` de uma linha existente nem move histórico entre tenants [RN-005; research.md, item 5].
- **As políticas RLS da Spec 012 não mudam.** `seal_enrollments` tem RLS ligada e nenhuma política; só RPCs `security definer` com `platform.manage` a leem e escrevem [research.md, item 6].
- **Nenhuma chave de dispositivo nem a senha padrão da rede de configuração** em arquivo versionado, log, auditoria, evento, resposta de erro ou serial do firmware [RF-014, RF-016]. A senha fica em `firmware/include/secrets.h` (fora do git) e no Vault como `seal_portal_password`, gravada por SQL documentado, nunca por migration. Os testes geram valores de teste dentro da própria transação ou suíte.
- Nenhuma operação de exclusão nas tabelas novas; `seal_enrollments` recebe o mesmo gatilho contra `delete` das tabelas da Spec 012.
- As funções do banco `create_device`, `rotate_device_key` e `deactivate_device` **ficam** (testes da Spec 012 e lacres antigos); só saem do catálogo do `manage-seals` e das telas [RF-018; research.md, item 8].
- Lacres da Spec 012 cadastrados à mão continuam respondendo `200` com a chave que têm [research.md, item 12].
- Nenhuma dependência nova no `package.json` nem no `firmware/platformio.ini` (o portal usa `WebServer` e `DNSServer` do arduino-esp32) [plan.md].
- Arquivos alheios à spec (`.agents/skills/impeccable/`, `.claude/agents/`, `.claude/settings.local.json`, `.codex/`, `.tmp/`) **não** entram nos commits; usar `git add` explícito.

**Convenções de interface** (AGENTS.md, Spec 005): skill `ui-ux-pro-max` ao criar ou alterar telas; conteúdo em toda a largura; só tokens (`tests/contract/escalas-no-codigo.test.ts` reprova valor arbitrário, cor literal e transição que atrase o foco); `prefers-reduced-motion`; situação, conflito e sinal sempre com ícone **e** texto; tabela vira cartões abaixo de 768 px; capturas regeneradas no Linux (`npm run test:visual:atualizar`), nunca `*-win32.png`; `npm run build` antes do E2E.

**Nomes de migrations**: `20261019120xxx_seals_enrollment_*.sql`, uma por área, junto da história que a usa: `seals_enrollment_schema` (Fundação), `seals_enrollment_ingest`, `seals_enrollment_platform`, `seals_enrollment_watchdog`, `seals_enrollment_compat` (US2), `seals_enrollment_return` (US3) e `seals_enrollment_portal_password` (US4).

**Procedimento do Supabase local**: função nova (`platform-seals`) exige `npx supabase stop` e `npx supabase start`; suítes que contam `audit_logs` exigem `npx supabase db reset` antes de `npx supabase test db`; `npm run test:live` e o E2E não rodam ao mesmo tempo que o pgTAP.

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode rodar em paralelo (arquivos diferentes, sem depender de tarefa incompleta).
- `[USN]`: história da spec (US1 a US4 = Histórias 1 a 4).
- Referências entre colchetes ligam a tarefa aos requisitos e critérios da spec.

## Mapa das histórias

| História | Prioridade | Entrega |
|---|---|---|
| US2 O lacre pede aprovação e o Master aprova e destina a um tenant | P1 | `seal_enrollments`, respostas novas do `seal-gateway`, `platform-seals`, tela `/admin/lacres`, compatibilidade com a Spec 012, simulador |
| US3 O administrador do tenant vê os lacres destinados e vincula | P1 | "Pronto para vincular", `return_device`, saída do cadastro manual |
| US1 Configurar a rede do lacre pelo celular, sem internet | P1 | firmware: código do chip, chave própria, modo aguardando, portal cativo, botão BOOT |
| US4 O Master consulta a senha padrão da rede de configuração | P2 | `reveal_portal_password`, bloco "Rede de configuração" |

As três primeiras são P1. US2 vem primeiro porque é o eixo do fluxo e pode ser validada inteira com o simulador, sem hardware; US3 depende das linhas criadas pela aprovação; US1 depende do contrato das respostas novas (US2) para o firmware saber quando está "aguardando". US4 é P2 e só acrescenta uma operação e um bloco à tela de US2.

---

## Fase 1 — Preparação

**Objetivo**: rastreabilidade e linha de base antes de qualquer código.

- [X] T001 Registrar em `specs/013-aprovacao-lacres-master/plan.md` (seção nova "Rastreabilidade") a branch `feat/013-aprovacao-lacres-master` e o número da issue; se a issue não existir, **pedir confirmação da pessoa responsável antes de abri-la** (ação externa) com a conta `equipefluxid` e o título "Spec 013: aprovação e destinação de lacres pelo Master" [princípio VI].
- [X] T002 Conferir que a branch parte da `main` com a Spec 012 integrada (`git log --oneline main -5` contém o merge do PR #43 ou posterior) e, quando a Fase 3 começar, trocar o "Status" de `specs/013-aprovacao-lacres-master/spec.md` para "Em implementação".
- [X] T003 Rodar `npm run lint`, `npm run typecheck`, `npm test`, `npx supabase db reset`, `npx supabase test db` e `cd firmware && pio test -e native && pio run -e esp32c3` e registrar em `specs/013-aprovacao-lacres-master/baseline.md` as contagens de arquivos e testes, o tamanho do pacote de entrada (`npm run build`) e o uso de flash e RAM do firmware antes da mudança.

---

## Fase 2 — Fundação (bloqueia todas as histórias)

**Objetivo**: tabela de pedidos, colunas novas em `seal_devices`, vocabulário do domínio e exemplos do protocolo, usados por todas as histórias.

**⚠️ Nenhuma história começa antes do fim desta fase.**

### Testes (RED)

- [X] T004 [P] Escrever `supabase/tests/013_constraints.test.sql`: `seal_enrollments.device_code` "`^DSP-[0-9A-Z]{8}$`; único"; `status` só em "`pending`, `approved`, `refused`, `expired`, `returned`"; `signal_dbm` "-127 a 0"; `wifi_ssid` "até 32 bytes"; `firmware_version` "até 32"; `decision_note` "5 a 500"; "`approved` exige `organization_id` e `device_id`; `refused` e `returned` exigem `decision_note`"; "`conflict_at` e `conflict_key_hash` são nulos juntos"; `forget_networks` só "`all` (devolução, ou retirada com "Esquecer todas as redes"), `extras` (retirada) ou nulo"; "`forget_networks` e `forget_networks_requested_at` são nulos juntos"; `last_organization_id` referencia `organizations`; `organization_id` e `device_id` nulos fora de `approved`; `delete` e `truncate` recusados pelo gatilho; e em `seal_devices`: `inactive_reason` só "`returned`, `withdrawn` ou `manual`", e dois `device_code` iguais aceitos só se no máximo um estiver `status = 'active'` [data-model.md].
- [X] T005 [P] Escrever `supabase/tests/013_rls.test.sql`: com dois tenants (A e B) e um usuário Master, `anon`, `authenticated` de A e de B **não** leem nem escrevem `seal_enrollments` diretamente (nem `select`, nem `insert`, nem `update`); as políticas de `seal_devices`, `seal_positions` e `seal_bindings` da Spec 012 continuam iguais (A vê só as linhas de A, B só as de B) com duas linhas do mesmo `device_code`, uma inativa em A e uma ativa em B [princípio III, RN-005, MS-004].
- [X] T006 [P] Escrever `src/domain/seals/seal-enrollment.test.ts`: rótulos e ícones das situações do pedido (Aguardando, Em operação, Recusado, Expirado, Devolvido) e do conflito ("Outro aparelho com este código"); sinal em texto (forte ≥ -60 dBm, médio -61 a -75, fraco < -75); regra `isReadyToBind` (ativo e sem cilindro); validação da justificativa (5 a 500 caracteres depois de aparar espaços); `canApprove` falso com conflito, com o motivo em texto; transições permitidas do diagrama de situações do `data-model.md` [RF-011, RF-013, RF-015].
- [X] T007 [P] Criar os exemplos de protocolo em `tests/fixtures/seal-protocol/enrollment-*.json` (`pending-request` com as três mensagens do lacre aguardando — `event` `boot`, `network_change` com `wifi` e `saved`, e `event` `networks_forgotten` —, `pending-approval-202`, `returned-202` com `forget_networks: "all"`, `withdrawn-202` com `forget_networks: "extras"`, `refused-403`, `conflict-401`, `rate-limited-429`, `approved-200`) a partir de `contracts/pedido-de-aprovacao.md`, e escrever `tests/contract/seal-enrollment-protocol.test.ts` conferindo que nenhum exemplo revela organização, cilindro ou o motivo de um 401 [CA-006 da Spec 012].

### Implementação (GREEN)

- [X] T008 Criar `supabase/migrations/20261019120000_seals_enrollment_schema.sql`: tabela `public.seal_enrollments` com os campos e restrições de `data-model.md` (inclusive `conflict_key_hash`, `forget_networks`, `forget_networks_requested_at` e `last_organization_id`), RLS ligada sem política e `revoke all` de `anon` e `authenticated`; gatilho contra exclusão igual ao das tabelas da Spec 012; em `public.seal_devices`, colunas `enrollment_id uuid references public.seal_enrollments(id)`, `approved_at timestamptz`, `approved_by uuid`, `inactive_reason text check (inactive_reason in ('returned','withdrawn','manual'))`; troca de `seal_devices_code_key` por um índice único parcial `on (device_code) where status = 'active'`; tabela `private.seal_enroll_rate_windows (bucket text, window_start timestamptz, count integer, primary key (bucket, window_start))` com RLS e `revoke all` [data-model.md; research.md, itens 5, 6 e 11]. Rodar `db reset` e `test db` até T004 e T005 passarem, com as suítes `012_*` inteiras verdes.
- [X] T009 [P] Implementar `src/domain/seals/seal-enrollment.ts` até T006 passar, reaproveitando os limites de `src/domain/seals/seal-limits.ts` e o vocabulário de `src/domain/seals/seal-vocabulary.ts` (sem duplicar o sinal em texto, se já existir).
- [X] T010 [P] Acrescentar a `src/domain/seals/seal-limits.ts` os limites de `data-model.md` ("20 por hora" por endereço, "6 por minuto" por pedido, "7 dias sem chamada", "a cada 1 h", "15 min aberto, 5 min fechado", "5 s") e cobri-los em `tests/contract/seals-limits.test.ts` contra os valores da migration e do `firmware/include/config.h`.

**Checkpoint**: tabela e colunas criadas, regressão da Spec 012 verde, domínio pronto.

---

## Fase 3 — US2: O lacre pede aprovação e o Master aprova e destina a um tenant (P1) 🎯 MVP

**Objetivo**: um lacre desconhecido vira pedido na fila da plataforma; o Master aprova para um tenant, recusa ou retira de operação, sempre com auditoria.

**Teste independente**: com o simulador, um lacre novo recebe `202 pending_approval`; o Master aprova para o Tenant A; na chamada seguinte o simulador recebe `200` e as posições ficam no Tenant A; o Tenant B não vê nada.

### Testes (RED)

- [X] T011 [P] [US2] Escrever `supabase/tests/013_enrollment_ingest.test.sql`: código desconhecido cria o pedido `pending` com `key_hash`, `first_seen_at`, `last_seen_at`, `calls`, `signal_dbm` (= `wifi.rssi` do `network_change`), `wifi_ssid` (= `wifi.ssid`), `firmware_version` (do envelope) e `source_hash` (nunca o endereço), a partir do corpo de `pending-request` e devolve `202 {"status":"pending_approval","report_interval_s":60}`; pedido pendente com a mesma chave só atualiza a última chamada, o sinal e a rede; pendente ou aprovado com outra chave devolve `401` e preenche `conflict_at`, `conflict_key_hash` e `conflict_calls` sem afetar o lacre conhecido; recusado devolve `403 {"status":"refused"}` e só atualiza `last_seen_at`, sem mudar a situação; expirado volta a `pending` e devolve `202`; devolvido devolve `202` com `forget_networks: "all"` e retirado com o valor escolhido pelo Master; o `event` `networks_forgotten` limpa `forget_networks` e `forget_networks_requested_at` e, com `all`, anula `last_organization_id`; o mesmo evento sem pedido aberto não tem efeito, e é aceito também de lacre aprovado; nenhuma linha em `seal_device_events` para pedido pendente; aprovado com a chave certa segue como na Spec 012 (`200`). Em nenhum caso pendente há linha nova em `seal_messages`, `seal_positions`, `seal_alerts`, `seal_device_events` ou `seal_commands` de tenant algum [RF-008 a RF-010, RN-003, MS-004; contracts/pedido-de-aprovacao.md].
- [X] T012 [P] [US2] Escrever `supabase/tests/013_enrollment_rate_limit.test.sql`: o 21º pedido **novo** do mesmo `source_hash` na mesma hora devolve `429` sem criar pedido e soma no contador mostrado ao Master (`rate_limited_last_24h`); a 7ª chamada de um mesmo pedido pendente no mesmo minuto devolve `429`; pedidos já existentes não contam no limite de novos [RF-017].
- [X] T013 [P] [US2] Escrever as suítes da plataforma, cada uma com dois tenants e o Master do seed: `supabase/tests/013_approve.test.sql` (aprovação, recusa, `NETWORKS_NOT_CLEARED`, `STALE`), `supabase/tests/013_conflict.test.sql` (`replace_enrollment_key`), `supabase/tests/013_withdraw.test.sql` (retirada e efeitos de inativar) e `supabase/tests/013_forget_networks.test.sql` (`request_forget_networks`, confirmação e liberação para outro tenant). Conteúdo: toda operação que muda estado exige justificativa de 5 a 500 (`JUSTIFICATION_REQUIRED`) [constituição, princípio III] e recebe `expected_updated_at`, respondendo `STALE` quando o pedido mudou desde a leitura (duas decisões simultâneas sobre o mesmo pedido: só a primeira vale); `approve_enrollment` (`pending`, `returned` ou `refused` → `approved`) cria uma linha **nova** e ativa em `seal_devices` no tenant escolhido, com o mesmo `device_code` e `key_hash`, `enrollment_id`, `approved_at`, `approved_by`, sem cilindro, preenche `last_organization_id` e chama `private.seal_broadcast` para o tenant de destino com o tipo `device`; com `last_organization_id` preenchido, recusa `NETWORKS_NOT_CLEARED` para um tenant diferente e aprova para o mesmo tenant [RN-006]; recusa `ENROLLMENT_CONFLICT` com `conflict_at` preenchido, `TENANT_INACTIVE`, `INVALID_STATE` e `STALE` (`expected_updated_at` diferente); `refuse_enrollment` só sai de `pending`; `replace_enrollment_key` sem `keep_current` troca `key_hash` pela `conflict_key_hash`, limpa a marca e põe em `pending` (o lacre com a chave nova passa a receber `202`, o da chave antiga `401`), com `keep_current: true` só limpa a marca, recusa `INVALID_STATE` sem conflito ou em `approved`, e grava `seal.enrollment_key_replace` sem nenhuma das chaves; `withdraw_device` (`approved` → `pending`) recusa `CYLINDER_IN_TRIP` e, com sucesso, inativa a linha com `inactive_reason = 'withdrawn'`, encerra o vínculo, cancela os comandos pendentes (comando de rede sem a senha em `vault.secrets`), encerra o `seal_watches` ativo, fecha os alertas abertos com `device_inactive`, mantém `lock_state`, marca `forget_networks` com `extras` (padrão) ou `all` (escolha do Master) e `forget_networks_requested_at`, mantém `last_organization_id` e avisa o tenant antigo; `request_forget_networks` fora de `approved` com `last_organization_id` marca `all` e grava `seal.networks_forget_request`, recusa `INVALID_STATE` em `approved` ou sem último tenant, e, depois de `networks_forgotten`, `approve_enrollment` para outro tenant passa; `list_enrollments` filtra por situação e conflito e pagina em até 100; `list_tenants_for_seals` traz só tenants ativos; todas as RPCs negam sem `platform.manage`; auditorias `seal.enrollment_approve` (plataforma e tenant de destino, com código e tenant), `seal.enrollment_refuse` (plataforma, com código), `seal.enrollment_key_replace` (plataforma), `seal.device_withdraw` (plataforma e tenant) e `seal.enrollment_access` negada (com o motivo), com a justificativa no campo próprio da auditoria e sem chave nem justificativa em `metadata`; `request_id` repetido não duplica efeito [RF-011 a RF-014, MS-006].
- [X] T014 [P] [US2] Escrever `supabase/tests/013_reassign_isolation.test.sql`: aprovar para A, gerar posições, retirar, aprovar para B: B não vê posição, alerta, comando nem vínculo de A; A continua vendo o próprio histórico na linha inativa; o `seal_ingest` grava as novas posições só na linha ativa de B [RN-002, RN-005, MS-004].
- [X] T015 [P] [US2] Escrever `supabase/tests/013_watchdog.test.sql`: `private.run_seal_watchdog()` expira pedidos `pending` sem chamada há 7 dias, não toca em pedidos com chamada recente nem em outras situações, e não abre alerta de sem comunicação para linha inativa de `seal_devices` [RF-017; data-model.md, "Ao inativar"].
- [X] T016 [P] [US2] Escrever `supabase/tests/013_compat.test.sql`: depois da migration de compatibilidade, cada `seal_devices` ativo da Spec 012 tem um pedido `approved` com o mesmo código, `key_hash`, `organization_id`, `device_id` e `last_organization_id` igual ao `organization_id`; retirado, não pode ser aprovado para outro tenant sem `networks_forgotten` (`NETWORKS_NOT_CLEARED`); e continua recebendo `200` com a chave manual [research.md, item 12; RF-018].
- [X] T017 [P] [US2] Escrever `tests/contract/platform-seals-handler.test.ts` no molde de `tests/contract/organizations.test.ts`: sem sessão `401`; sessão sem `aal2` responde `MFA_REQUIRED`; sem `platform.manage` responde `ACCESS_DENIED` e audita a negação; recusa `organization_id` no corpo; operações e entradas exatamente as de `contracts/operacoes-plataforma.md` (oito, inclusive `replace_enrollment_key` e `request_forget_networks`); `limit` acima de 100 recusado; comandos sem `request_id` ou sem `justification` de 5 a 500 recusados; erros do banco mapeados para os códigos do contrato.
- [X] T018 [P] [US2] Atualizar `tests/contract/seal-gateway-handler.test.ts`: a borda repassa `202` e `403` com o corpo do banco, `429` com `Retry-After`, e nunca acrescenta organização, cilindro ou motivo de 401.
- [X] T019 [P] [US2] Escrever `src/application/seals/platform-seal-service.test.ts` e `src/application/seals/platform-seal-views.test.ts`: chamadas às operações de `platform-seals`, mapeamento para a vista (situação, conflito, sinal em texto, tenant, decisão), contagens por aba, atualização a cada 30 s e detecção de pedidos novos para o anúncio, erros do contrato em texto.
- [X] T020 [P] [US2] Escrever `src/pages/admin/seals/platform-seals-page.test.tsx`: abas Aguardando (padrão), Em operação, Devolvidos, Recusados e Expirados com a contagem e o filtro "Só com conflito"; tabela com código, situação com ícone e texto, marca de conflito, primeira e última chamada, chamadas, sinal, rede, firmware e, em Em operação, o tenant; diálogos Aprovar (seletor de tenant, o código em destaque com "Confira se é o código do lacre em mãos" e justificativa de 5 a 500), Recusar e Retirar de operação (justificativa de 5 a 500), Destinar de novo em Devolvidos e "Reconsiderar e aprovar" em Recusados (o diálogo de Aprovar); "Resolver conflito" com as duas saídas ("Aceitar a chave do aparelho novo" e "Manter a chave atual") e justificativa, explicando que um lacre em operação precisa ser retirado antes; Retirar de operação com a escolha entre "Manter a rede principal" (padrão) e "Esquecer todas as redes"; Aprovar desabilitado com conflito e o motivo em texto; Aprovar desabilitado para tenant diferente do último sem `networks_cleared`, com o aviso "Este lacre ainda pode ter redes do tenant [nome do último tenant]…" apontando para a ação "Esquecer todas as redes"; essa ação, com justificativa, nos pedidos fora de operação que ainda têm redes do tenant anterior; linha com "Aguardando o lacre esquecer as redes"; estados carregando, vazio por aba ("Nenhum lacre aguardando aprovação"), erro com "Tentar de novo" e sem conexão; novos pedidos anunciados por `aria-live="polite"` sem mover o foco; contador de pedidos descartados pelo limite [contracts/telas.md].
- [X] T021 [P] [US2] Atualizar `src/app/admin-routes.test.ts`, `src/app/shell/navigation-menu.test.tsx` e `src/app/seals/seal-routes.test.ts`: `/admin/lacres` só com `platform.manage` e `aal2`, item "Lacres da plataforma" logo depois de "Organizações", e a rota fora das rotas de lacre do tenant.
- [X] T022 [P] [US2] Escrever `tests/integration/seals-enrollment.live.test.ts`: o teste independente com o simulador (`pedir-aprovacao`), o Master do seed aprovando para o Tenant A por `platform-seals`; o lacre aparece pela consulta do Tenant A (`query-seals`) em menos de 60 s depois da aprovação; o `200` na chamada seguinte, a posição no Tenant A e nada no Tenant B; conflito com outra chave resolvido por `replace_enrollment_key`; recusa e `403` [MS-002, MS-003, MS-004].

### Implementação (GREEN)

- [X] T023 [US2] Criar `supabase/migrations/20261019120100_seals_enrollment_ingest.sql` com `create or replace function public.seal_ingest` (mesma assinatura da Spec 012): busca só a linha **ativa** pelo código; sem linha ativa, registra ou atualiza o pedido em `seal_enrollments` e devolve as respostas de `contracts/pedido-de-aprovacao.md` sem gravar o corpo; conflito marcado (`conflict_at`, `conflict_key_hash`) sem revelar o motivo; `signal_dbm`, `wifi_ssid` e `firmware_version` tirados de `network_change` e do envelope; `forget_networks` na resposta `202` até o `event` `networks_forgotten`, cujo código passa a ser aceito no tratador de `event` (`private.seal_handle_event`) também de lacre aprovado; limites em `private.seal_enroll_rate_windows` com os buckets `enroll:` + resumo do endereço e `pending:` + id do pedido; contagem do que passou do limite para o Master. Até T011 e T012 passarem com as suítes `012_device_auth`, `012_rate_limit`, `012_ingest_*` verdes [research.md, itens 3, 4 e 11].
- [X] T024 [US2] Criar `supabase/migrations/20261019120200_seals_enrollment_platform.sql` com o auxiliar `private.seal_deactivate_line(p_device uuid, p_reason text)` (vínculo, comandos pendentes com a senha de rede apagada do Vault, vigilância, alertas com `device_inactive`, `lock_state` mantido e `private.seal_broadcast` com o tipo `device`; ver `data-model.md`, "Ao inativar") e com `list_enrollments`, `list_tenants_for_seals`, `approve_enrollment`, `refuse_enrollment`, `replace_enrollment_key`, `withdraw_device` e `request_forget_networks`, todas `security definer`, `set search_path = ''`, exigindo `platform.manage` e justificativa de 5 a 500, com idempotência por `request_id`, bloqueio otimista por `expected_updated_at`, o aviso em tempo real ao tenant de destino na aprovação e a auditoria de `data-model.md` (plataforma com `organization_id` nulo e, onde indicado, também no tenant), até T013 (as quatro suítes) e T014 passarem [RF-010 a RF-014, RN-006].
- [X] T025 [US2] Criar `supabase/migrations/20261019120300_seals_enrollment_watchdog.sql` substituindo `private.run_seal_watchdog()` para acrescentar a expiração de 7 dias e ignorar linhas inativas, sem mudar o restante do vigia da Spec 012, até T015 e `012_watchdog` passarem.
- [X] T026 [US2] Criar `supabase/migrations/20261019120400_seals_enrollment_compat.sql`: um pedido `approved` para cada `seal_devices` ativo, com `last_organization_id = organization_id`, e o preenchimento de `enrollment_id` e `approved_at` (com `created_at` da linha) nessas linhas, até T016 passar.
- [X] T027 [US2] Atualizar `supabase/functions/seal-gateway/handler.ts` para repassar `202`, `403` e `429` com `Retry-After` conforme o contrato, até T018 passar.
- [X] T028 [US2] Criar `supabase/functions/platform-seals/` (`handler.ts`, `index.ts`, `deno.json`) no molde de `supabase/functions/manage-organizations/`: identidade global, `aal2`, `platform.manage`, auditoria das negações e as oito operações do contrato (`reveal_portal_password` responde `NOT_CONFIGURED` até a US4), até T017 passar; a função usa JWT e por isso **não** entra em `supabase/config.toml`, que só registra as funções com `verify_jwt = false`; `npx supabase stop` e `npx supabase start`.
- [X] T029 [US2] Criar `src/infrastructure/supabase/platform-seal-adapter.ts`, `src/application/seals/platform-seal-service.ts` e `src/application/seals/platform-seal-views.ts` até T019 passar; só a chave publicável no cliente.
- [X] T030 [US2] Implementar `src/pages/admin/seals/platform-seals-page.tsx` e os componentes em `src/pages/admin/seals/components/` (`enrollment-table.tsx`, `approve-enrollment-dialog.tsx`, `justification-dialog.tsx`, `resolve-conflict-dialog.tsx`), com a skill `ui-ux-pro-max`, só tokens e cartões abaixo de 768 px, até T020 passar.
- [X] T031 [US2] Acrescentar o item `{ id: 'lacres-plataforma', label: 'Lacres da plataforma', path: '/admin/lacres', requires: { scope: 'global', code: 'platform.manage' }, tenantScoped: false, requireAal2: true }` em `src/domain/navigation/screens.ts`, logo depois de "Organizações", e a rota com `React.lazy` em `src/app/admin-routes.ts`, até T021 passar.
- [X] T032 [US2] Acrescentar o cenário `pedir-aprovacao` a `scripts/lacre/simulador.mjs` e a `tests/support/seal-simulator.ts` (enquanto recebe `202`, só `event` `boot`, `network_change` e, quando houver, `networks_forgotten` por intervalo, sem fila de leituras; responde a `forget_networks` com `networks_forgotten`; posições a partir do primeiro `200`; `403` passa a tentar de hora em hora) e o cenário `devolucao` (responde a `forget_networks` com `networks_forgotten` na chamada seguinte), cobrindo os dois em `tests/support/seal-simulator.test.ts` [research.md, itens 4 e 5; quickstart.md, seção 2].
- [X] T033 [US2] Rodar `npx supabase db reset`, `npx supabase test db`, `npm test` e `npm run test:live` até T022 passar, com as suítes `008_*` a `012_*` e as `.live` da Spec 012 verdes.

**Checkpoint**: o fluxo de aprovação funciona de ponta a ponta com o simulador; MVP validável.

---

## Fase 4 — US3: O administrador do tenant vê os lacres destinados e vincula (P1)

**Objetivo**: o tenant vê só os lacres destinados a ele, "prontos para vincular", vincula como na Spec 012 e pode devolver um lacre à plataforma; o cadastro manual sai da tela.

**Teste independente**: depois da aprovação para o Tenant A, o administrador do A vê o lacre como "Pronto para vincular" e o vincula a um cilindro; o administrador do B não o vê; a devolução tira o lacre do A e o põe em Devolvidos.

### Testes (RED)

- [X] T034 [P] [US3] Escrever `supabase/tests/013_return.test.sql`: `return_device` exige `seal.admin`, justificativa de 5 a 500 (`JUSTIFICATION_REQUIRED`) e recusa `CYLINDER_IN_TRIP` com viagem em andamento e `NOT_FOUND` para lacre de outro tenant (B tentando devolver o lacre de A); com sucesso inativa a linha com `inactive_reason = 'returned'` pelo auxiliar comum (vínculo encerrado, comandos pendentes cancelados sem senha no Vault, vigilância encerrada, alertas fechados com `device_inactive`, `lock_state` mantido, aviso `device` ao tenant), põe o pedido em `returned` com `decision_note`, `decided_by`, `decided_at` e `forget_networks = 'all'`, e grava `seal.device_return` no tenant e na plataforma, só com o código; depois disso o lacre recebe `202` com `forget_networks: "all"` [RF-013a, RF-014, RN-006].
- [X] T035 [P] [US3] Escrever `supabase/tests/013_read.test.sql`: `list_seals` e `get_seal` trazem `approved_at` e `ready_to_bind` (ativo e sem cilindro); linhas inativas de destinações anteriores só aparecem com o filtro de histórico; pedido pendente nunca aparece em tenant algum; `list_unbound_active_seals` traz o lacre aprovado e não traz o inativo; B não encontra o lacre de A pelo id [RF-015; contracts/operacoes-plataforma.md].
- [X] T036 [P] [US3] Atualizar `tests/contract/manage-seals-handler.test.ts` e `tests/contract/query-seals-handler.test.ts`: `return_device` no catálogo com a entrada do contrato; `create_device`, `rotate_device_key` e `deactivate_device` **fora** do catálogo da borda (operação desconhecida); `ready_to_bind`, `approved_at` e o filtro de histórico em `query-seals` [RF-018].
- [X] T037 [P] [US3] Atualizar `src/application/seals/seal-service.test.ts` e `src/application/seals/seal-views.test.ts`: `returnDevice` com justificativa; vista com "Pronto para vincular", "Aprovado em" e a origem ("aprovado pelo Master" ou "cadastro manual (Spec 012)"); filtro "Só prontos para vincular"; a lista recarrega com o aviso em tempo real `device` (aprovação, retirada, devolução) [MS-003]; sem operações de cadastro, chave nova e desativação.
- [X] T038 [P] [US3] Atualizar `src/pages/seals/seal-list-page.test.tsx`: sem o botão "Cadastrar dispositivo"; marca "Pronto para vincular" com ícone e texto e a data da aprovação; filtro "Só prontos para vincular"; vazio com "Os lacres chegam pelo Master da plataforma. Peça a destinação de um lacre ao seu tenant."; um lacre recém-aprovado aparece com o aviso `device`, sem recarregar a página e sem mover o foco [contracts/telas.md, MS-003].
- [X] T039 [P] [US3] Atualizar `src/pages/seals/seal-detail-page.test.tsx` e `src/pages/seals/components/device-dialogs.test.tsx`: sem "Gerar chave nova" e "Desativar"; "Devolver à plataforma" só com `seal.admin`, em diálogo com justificativa de 5 a 500; desabilitado com o cilindro em viagem e o motivo em texto; desabilitado sem conexão; fatos "Aprovado em" e "Origem" [História 3, cenários 5 e 6].
- [X] T040 [P] [US3] Escrever `tests/e2e/lacres-plataforma.spec.ts` (backend simulado): o Master aprova um lacre para o Tenant A em `/admin/lacres`; o administrador do A o vê como "Pronto para vincular" em `/lacres`, vincula pelo detalhe do cilindro e devolve com justificativa; o lacre aparece em Devolvidos; o administrador do B recebe "não encontrado" no endereço direto. Reescrever `tests/e2e/lacres-cadastro.spec.ts` só com a vinculação e o desvínculo, sem o cadastro manual [MS-003].

### Implementação (GREEN)

- [X] T041 [US3] Criar `supabase/migrations/20261019120500_seals_enrollment_return.sql` com `return_device` (usando `private.seal_deactivate_line` de T024 e marcando `forget_networks = 'all'`) e as mudanças de leitura (`approved_at`, `ready_to_bind`, filtro de histórico em `list_seals` e `get_seal`), até T034 e T035 passarem com `012_read` e `012_binding` verdes.
- [X] T042 [US3] Atualizar `supabase/functions/manage-seals/handler.ts` (acrescentar `return_device`; tirar `create_device`, `rotate_device_key` e `deactivate_device` de `MANAGE_SEAL_OPERATIONS`) e `supabase/functions/query-seals/handler.ts` (novos campos e filtro), até T036 passar.
- [X] T043 [US3] Atualizar `src/application/seals/seal-service.ts`, `src/application/seals/seal-views.ts` e `src/infrastructure/supabase/seal-adapter.ts` até T037 passar.
- [X] T044 [US3] Atualizar `src/pages/seals/seal-list-page.tsx`, `src/pages/seals/seal-detail-page.tsx` e `src/pages/seals/components/seal-badge.tsx` e criar `src/pages/seals/components/return-device-dialog.tsx`, com a skill `ui-ux-pro-max`; remover `src/pages/seals/components/device-form-dialog.tsx` e `src/pages/seals/components/device-key-reveal.tsx` (usados só pela lista e pelo detalhe) e as partes de cadastro, chave nova e desativação de `device-dialogs.test.tsx`; ligar a lista ao aviso `device` de `src/application/seals/seal-realtime.ts`, até T038 e T039 passarem.
- [X] T045 [US3] Trocar nas suítes `.live` da Spec 012 (`tests/integration/seals-*.live.test.ts`) e em `tests/support/seal-db.ts` o cadastro por `manage-seals` `create_device` pelo apoio de SQL ou pela aprovação de `platform-seals`; rodar `db reset`, `test db`, `npm test`, `npm run test:live`, `npm run build` e `npx playwright test tests/e2e/lacres-*.spec.ts` até T040 passar.

**Checkpoint**: US2 e US3 completas; o fluxo do Master ao tenant funciona sem cadastro manual.

---

## Fase 5 — US1: Configurar a rede do lacre pelo celular, sem internet (P1)

**Objetivo**: um único firmware para toda a frota; o lacre calcula o próprio código, cria a própria chave, abre o portal sem rede salva (ou pelo botão BOOT), testa a rede escolhida e pede aprovação.

**Teste independente**: com um lacre sem rede salva, um celular sem internet e uma rede com internet ao alcance, a rede é configurada pela página e o lacre passa a alcançar o FluxID (aparece em Aguardando no `/admin/lacres`).

### Testes (RED)

- [X] T046 [P] [US1] Escrever `firmware/test/test_identidade/test_identidade.cpp`: código = `DSP-` + 8 caracteres base32 Crockford (sem I, L, O e U) dos primeiros 40 bits do SHA-256 de `fluxid-lacre:` + MAC em hexadecimal maiúsculo, com vetores fixos; o código casa com `^DSP-[0-9A-Z]{8}$`; mesmo MAC dá o mesmo código; chave `fxk_` + base64url de 32 bytes a partir de um gerador simulado; chave já guardada é reaproveitada; com `FLUXID_DISPOSITIVO` e `FLUXID_CHAVE` definidos (lacre da Spec 012), usa os dois [RF-007, RF-008; research.md, itens 1, 2 e 12].
- [X] T047 [P] [US1] Escrever `supabase/tests/013_device_code.test.sql` com uma função SQL só de teste (criada dentro da transação) que repete o cálculo do código e confere os mesmos vetores de T046 [research.md, item 1].
- [X] T048 [P] [US1] Escrever `firmware/test/test_portal/test_portal.cpp` para `nucleo/Portal`: nome de rede de 1 a 32 bytes (acentos contam em bytes); senha de 8 a 63 ou rede aberta; escape de HTML e de JSON de nomes maliciosos (`<script>`, aspas, `&`, barra invertida); lista de `/redes` ordenada pelo sinal, sem nomes repetidos, com "forte" (≥ -60), "médio" (-61 a -75) e "fraco" (< -75); `/situacao` com `testando`, `conectado` (com `aprovacao` conforme o modo, aguardando ou operando) e `falhou` e os motivos `wifi_auth`, `wifi_not_found` e `wifi_no_internet`; um teste por vez (`ocupado`); sem rede salva, 15 min aberto e 5 min fechado sem conexão de cliente; fechamento 60 s depois do sucesso; nome `FluxID-Lacre-` + 4 últimos caracteres do código; botão segurado por 5 s abre o portal sem apagar a rede atual; o portal nunca abre sozinho com rede salva [RF-001 a RF-006, RN-004; contracts/portal-do-lacre.md].
- [X] T049 [P] [US1] Escrever `firmware/test/test_aprovacao/test_aprovacao.cpp` (suíte própria do núcleo `nucleo/Aprovacao`, no lugar de estender `test_protocolo` e `test_fila`) com os exemplos `enrollment-*.json` de T007: `202` mantém o modo aguardando (só `boot` por intervalo, nenhuma leitura entra na fila); `403` passa a tentar a cada 1 h; `401` guarda e tenta no próximo intervalo; `200` liga o modo operando e só então a fila começa; devolução (`202` depois de `200`) volta ao modo aguardando; enquanto aguarda, cada chamada leva exatamente `event` `boot`, `network_change` (`wifi` e `saved`) e, quando houver, `event` `networks_forgotten`; com `forget_networks: "all"` o lacre apaga todas as redes, exceto a configurada pelo portal depois do último `200`, em dois cenários: (a) ainda no local antigo, sem rede configurada depois do último `200`, apaga tudo e abre o portal; (b) chegou desligado ao novo local e a rede nova foi configurada pelo botão BOOT, mantém só a rede nova; com `"extras"` apaga só as redes da lista do sistema e mantém a principal; depois de apagar, guarda `networks_forgotten` na NVS e o repete enquanto a resposta `202` ainda trouxer `forget_networks` (ou, aprovado, até `stored` ou `duplicate`); a marca repetida não tem efeito; sem rede principal compilada, `esquecerRedes(todas)` nunca deixa uma rede de fora [RF-009, RN-006; research.md, itens 4, 5 e 12].
- [X] T050 [P] [US1] Estender `firmware/test/test_rede/test_rede.cpp`: a rede do portal vira a rede principal (a "padrão" da Spec 012) só depois do teste com sucesso; falha não guarda nada; as redes extras do sistema continuam somadas a ela; `esquecerRedes(extras)` mantém só a principal; `esquecerRedes(todas)` mantém só a rede configurada pelo portal depois do último `200` e, sem ela, deixa o lacre sem rede salva; a marca "configurada pelo portal depois do último `200`" é limpa a cada `200` [RF-005, RF-020, RN-006].

### Implementação (GREEN)

- [X] T051 [US1] Implementar `firmware/src/nucleo/Identidade.h` e `firmware/src/nucleo/Identidade.cpp` (puros, SHA-256 e base32 sem dependência nova) até T046 e T047 passarem com `pio test -e native`.
- [X] T052 [US1] Implementar `firmware/src/nucleo/Portal.h` e `firmware/src/nucleo/Portal.cpp` (validação, escape, JSON, motivos e tempos) e ajustar `firmware/src/nucleo/Protocolo.*` e `firmware/src/nucleo/Rede.*` até T048 a T050 passarem.
- [X] T075 [P] [US1] Escrever `tests/e2e/portal-lacre.spec.ts`: abre `http://192.168.4.1/` com `page.route` servindo `firmware/portal/index.html` e simulando `/redes`, `/testar` e `/situacao` de `contracts/portal-do-lacre.md`; axe sem violação crítica ou grave; sem rolagem horizontal; jornada só com teclado (escolher rede, rede oculta, senha, testar); `role="status"` anuncia "testando", "conectado" e cada motivo de falha (`wifi_auth`, `wifi_not_found`, `wifi_no_internet`) e `ocupado`; sinal em texto (forte, médio, fraco); um nome de rede `<img src=x onerror=alert(1)>` aparece como texto e não executa; a senha nunca volta para a página; a mensagem de sucesso segue `aprovacao` ("aguarda a vinculação a um tenant" ou "O lacre voltou a operar com a nova rede"); incluir `portal-lacre` em `LARGURAS_DE_REFERENCIA` de `playwright.config.ts` para rodar em 360, 768 e 1920 px [RF-002, RF-003, princípio V].
- [X] T076 [US1] Criar `firmware/portal/index.html` (HTML, CSS e JS inline, sem rede externa, `lang="pt-BR"`, rótulos visíveis, área de toque de 44 px, foco visível, contraste AA, `role="status"` no resultado, campo para rede oculta e consulta da situação a cada 2 s) e `firmware/ferramentas/embutir_portal.py`, ligado por `extra_scripts = pre:ferramentas/embutir_portal.py` no ambiente `esp32c3` de `firmware/platformio.ini`, gerando `firmware/src/PortalPagina.h` (em `PROGMEM`) e incluindo-o no `.gitignore`, até T075 passar com `npm run build` e `npx playwright test tests/e2e/portal-lacre.spec.ts` [research.md, item 10].
- [X] T053 [US1] Implementar `firmware/src/PortalWiFi.h` e `firmware/src/PortalWiFi.cpp`: `WiFi.softAP` com WPA2 e `FLUXID_PORTAL_SENHA`, `DNSServer` respondendo a todos os nomes com `192.168.4.1`, `WebServer` na porta 80 com `/` (servindo `PortalPagina.h` de T076), `/redes`, `/testar` e `/situacao`; o teste reaproveita a `TrocaDeRede` da Spec 012; a senha da rede nunca volta para a página nem aparece no serial [RF-002 a RF-005; contracts/portal-do-lacre.md].
- [X] T054 [US1] Atualizar `firmware/src/main.cpp`, `firmware/src/Memoria.*` e `firmware/src/Estado.*`: chave gerada com `esp_fill_random` e guardada na NVS no primeiro uso; modos aguardando × operando; portal sem rede salva e pelo botão BOOT (GPIO9) segurado por 5 s; LED do modo aguardando e do erro; o firmware novo não lê `FLUXID_WIFI_SSID` nem `FLUXID_WIFI_SENHA`, e a rede principal vem só do portal (RN-006; research.md, item 12); pinos e tempos em `firmware/include/config.h` [RF-006 a RF-009].
- [X] T055 [US1] Atualizar `firmware/include/secrets.example.h` para conter só `FLUXID_URL` e `FLUXID_PORTAL_SENHA` (com marcador, sem valor real), mantendo `FLUXID_DISPOSITIVO` e `FLUXID_CHAVE` comentados como opção dos lacres da Spec 012, e sem rede padrão; estender o job `firmware` de `.github/workflows/quality.yml` para reprovar também um valor real em `FLUXID_PORTAL_SENHA` versionado e o uso de `FLUXID_WIFI_SSID` ou `FLUXID_WIFI_SENHA` em `firmware/src/` [RF-019, RN-006].
- [X] T056 [US1] Rodar `cd firmware && pio test -e native && pio run -e esp32c3` e registrar em `specs/013-aprovacao-lacres-master/validation.md` o uso de flash e RAM; se a flash passar de 95%, parar e registrar em `research.md`, item 10, a troca para `huge_app.csv` antes de seguir [plan.md, Restrições].

**Checkpoint**: firmware único compila, núcleo testado no computador; falta só a bancada (Fase 7).

---

## Fase 6 — US4: O Master consulta a senha padrão da rede de configuração (P2)

**Objetivo**: o Master revela a senha padrão, com auditoria, e lê as instruções do primeiro contato.

**Teste independente**: o Master abre `/admin/lacres`, revela a senha e entra com ela na rede de configuração de um lacre novo.

### Testes (RED)

- [X] T057 [P] [US4] Escrever `supabase/tests/013_portal_password.test.sql`: com o segredo `seal_portal_password` criado dentro da transação por `vault.create_secret`, `reveal_portal_password` exige justificativa de 5 a 500 (`JUSTIFICATION_REQUIRED`), devolve o valor ao Master e grava `seal.portal_password_reveal` na plataforma com a justificativa no campo próprio e sem a senha em `metadata`; sem o segredo, `NOT_CONFIGURED`; sem `platform.manage`, negado e auditado; nenhuma função troca o segredo [RF-016, MS-006; História 4].
- [X] T058 [P] [US4] Escrever `src/pages/admin/seals/components/portal-network-panel.test.tsx`: padrão do nome (`FluxID-Lacre-` + 4 últimos caracteres do código), passo a passo do primeiro contato, "Mostrar a senha" pedindo o motivo (5 a 500) antes de revelar num campo copiável, texto de que a senha é fixa no firmware e só muda com nova gravação, nenhum botão de troca, `NOT_CONFIGURED` explicado, senha nunca guardada em armazenamento local nem mantida depois de sair da tela [contracts/telas.md].

### Implementação (GREEN)

- [X] T059 [US4] Criar `supabase/migrations/20261019120600_seals_enrollment_portal_password.sql` com `reveal_portal_password` lendo `vault.decrypted_secrets` só nesse ponto, até T057 passar; **sem** gravar a senha na migration.
- [X] T060 [US4] Ligar `reveal_portal_password` em `supabase/functions/platform-seals/handler.ts`, em `platform-seal-service.ts` e implementar `src/pages/admin/seals/components/portal-network-panel.tsx` na `platform-seals-page.tsx`, com a skill `ui-ux-pro-max`, até T058 e T017 passarem.
- [X] T061 [US4] Acrescentar a `tests/contract/seals-no-secrets-in-logs.test.ts` a senha de teste do portal e uma chave gerada pelo simulador: nenhuma das duas aparece em log da função, `audit_logs`, `seal_enrollments` ou resposta de erro [RF-014].

**Checkpoint**: todas as histórias funcionais e independentes.

---

## Fase 7 — Polimento e encerramento

- [X] T062 [P] Estender `tests/e2e/lacres-plataforma.spec.ts` em 360, 768 e 1920 px: jornadas do Master e do tenant só com teclado, axe sem violação crítica ou grave, sem rolagem horizontal, estado offline [princípio V].
- [X] T063 [P] Criar `tests/e2e/visual/lacres-plataforma.visual.spec.ts` (abas, diálogo de aprovação, bloco da rede de configuração, cartões em 360 px) e atualizar `tests/e2e/visual/lacres.visual.spec.ts` (sem cadastro, com "Pronto para vincular"); regenerar no Linux com `npm run test:visual:atualizar`; nenhum `*-win32.png`.
- [X] T064 [P] Conferir o pacote de entrada (`npm run build`) contra o `baseline.md` (`/admin/lacres` em chunk `React.lazy`) e registrar em `validation.md`.
- [X] T065 [P] Atualizar `firmware/README.md` (firmware único, `secrets.h` só com URL e senha do portal, primeiro contato pelo portal, botão BOOT, LEDs, lacres da Spec 012 e a regra de regravá-los com o firmware novo antes de retirar ou devolver), `docs/publicacao-em-nuvem.md` (SQL para gravar `seal_portal_password` no Vault pela pessoa responsável, sem o valor), `docs/prd.md`, `README.md`, `contracts/` e `quickstart.md` ao que foi construído; conferir no `plan.md` a contagem de migrations (7).
- [X] T077 Remover a exigência do segundo fator (RF-021, sessão de 19/10/2026; substituída pela T080, que removeu o segundo fator de vez): `SECOND_FACTOR_REQUIRED = false` em `supabase/functions/_shared/auth-policy.ts` (checagens de `invite-user`, `manage-access`, `manage-membership`, `manage-organizations`, `platform-seals`, `query-audit` e `spec.mfa` em `_shared/operations.ts`) e em `src/domain/identity/auth-policy.ts` (`isProtectedAccessAllowed`, `authorize` e os diálogos de destravar e de desbloqueio excepcional); migration `20261019120700_auth_sem_segundo_fator.sql` (`login_eligibility`, `private.session_has_aal2`, as restrições de `aal` e o nível real da sessão no comando manual); testes pgTAP, de contrato, de unidade, `.live` e E2E ajustados à política nova.
- [X] T078 Senha da rede de configuração com exatamente 8 caracteres (RF-022, decisão de 19/10/2026): `static_assert` em `firmware/src/Segredos.h` (fora do modelo do CI) e a regra em `firmware/include/secrets.example.h`, `firmware/README.md` e `docs/publicacao-em-nuvem.md`; as redes do local digitadas no portal seguem de 8 a 63.
- [X] T079 Rede padrão da plataforma e conexão na página do lacre (RF-023 e RF-024, decisão de 19/10/2026): `DefinirRedeDeFabrica` e `TemRedeParaTentar` em `firmware/src/nucleo/Rede.*` (nunca esquecida nem gravada), `conexao` em `/situacao` (`nucleo/Portal.*`, `PortalWiFi`, `ConexaoWiFi::RedeAtual`/`ChegaAoFluxID`), bloco "Conexão do lacre" em `firmware/portal/index.html`; testes em `test_rede`, `test_portal` e `tests/e2e/portal-lacre.spec.ts`; `FLUXID_REDE_FABRICA_*` opcionais no `secrets.example.h`, com o CI reprovando valor real.
- [X] T080 Remover de vez o segundo fator (RF-021, pedido de 20/10/2026): sem `auth-policy`; tela `MfaPage`, `MfaService` e `createMfaClient` removidos; sessão sem o estado `mfa_required`; `requireAal2` fora das telas e rotas; diálogos de destravar e desbloqueio excepcional só com justificativa; nenhuma checagem de `aal2` nas funções; `session-login` sempre `AUTHENTICATED` e `session-status` sem `mfa_required`; TOTP desligado em `supabase/config.toml`; textos sem "duas etapas" (landing, aviso de desbloqueio, sessões ativas, papéis, mensagens de recusa); testes de unidade, contrato, `.live` e E2E ajustados (`mfa.live` e `tests/support/totp.ts` removidos).
- [X] T066 Rodar a rodada completa: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (sem reduzir limites), `npx supabase db reset` e `npx supabase test db`, `npm run test:live`, `npm run build`, `npm run test:e2e`, `cd firmware && pio test -e native && pio run -e esp32c3`; anotar os números em `validation.md`.
- [X] T067 Gravar o firmware novo num lacre físico contra o Supabase local e rodar a seção 3 do `quickstart.md` com a pessoa responsável: rede `FluxID-Lacre-XXXX` aberta, página sozinha no celular, senha errada sem nada guardado, aprovação, vinculação e botão BOOT; **medir** MS-001 (até 3 min), MS-002 e MS-003 (até 1 min cada) e MS-005, registrando tempos e resultados em `validation.md`.
- [X] T068 Publicar no Supabase de teste conforme `docs/publicacao-em-nuvem.md` (migrations e `platform-seals`, **sem seed**; o segredo `seal_portal_password` gravado pela pessoa responsável); conferir `public-compatibility` e que os lacres da Spec 012 em bancada continuam respondendo `200`.
- [X] T069 Conferir que nenhuma chave de dispositivo, a senha do portal ou `service_role` entrou no cliente, no repositório, nos logs ou na auditoria, e que `git status` não tem `*-win32.png`, `firmware/include/secrets.h` nem arquivos alheios à spec [RF-014, RF-016].
- [X] T070 **Gate de registro de IA** (AGENTS.md): `git add` explícito do código, testes, migrations, funções, firmware e documentação, sem commit; `npm run ia:registro -- --spec 013 --ciclo 01 --titulo "Aprovação e destinação de lacres pelo Master"`; **entrevistar a pessoa responsável pela validação** (quem validou; amostra de perfis, telas, larguras e fluxos, incluindo o lacre físico; ambiente; duração; resultado; itens a corrigir; decisão `utilizado`, `adaptado` ou `descartado` com justificativa; confirmação de que as respostas podem ser gravadas em nome da pessoa), **sem presumir nem inferir dos testes**; se houver correções, corrigir, repetir os testes e perguntar de novo; preencher o RIA, incluir `docs/governanca-ia/indice.md`, rodar `npm run ia:validar` e só então commitar, sem `--no-verify` e sem linhas de coautoria.
- [X] T071 Abrir o pull request da branch `feat/013-aprovacao-lacres-master` com a conta `equipefluxid`, citando a issue, trocar no RIA o link de revisão pelo do PR, aguardar os checks verdes e a revisão humana; **não** fazer merge sem aprovação.
- [ ] T072 Depois do merge aprovado, entregar o DOCX do RIA na branch `docs/ria-NNN-docx` (`python scripts/governanca-ia/exportar-docx.py --source docs/governanca-ia/registros/RIA-NNN-<slug>.md --output docs/governanca-ia/registros/NN_<Titulo>.docx`), apontar o índice para ele e abrir um pull request só de documentação.

---

## Pendências fora desta spec

- [ ] T073 Cifragem da flash do ESP32 e troca da senha única do portal por uma senha por lacre (Fase 8).
- [ ] T074 Bluetooth para a configuração inicial.

---

## Dependências e ordem de execução

- **Fase 1** (T001 a T003) não depende de nada.
- **Fase 2** (T004 a T010) depende da Fase 1 e **bloqueia todas as histórias**. Os testes (T004 a T007) vêm antes da migration (T008); o domínio (T009, T010) anda em paralelo ao banco.
- **US2** (T011 a T033) depende da Fundação e é o MVP. Dentro dela, as migrations seguem a ordem T023 → T024 → T025 → T026; a borda (T027, T028) depende de T023 e T024; a tela (T029 a T031) depende de T028.
- **US3** (T034 a T045) depende de US2 (as linhas de `seal_devices` vêm da aprovação). `manage-seals` só é editado em T042.
- **US1** (T046 a T056, mais T075 e T076) depende do contrato das respostas (T007) e pode começar em paralelo a US2 e US3 nos testes nativos (T046, T048 a T050), no teste da página (T075) e no núcleo (T051, T052). T075 e T076 entram logo depois de T050 e antes de T053; os IDs ficaram fora da sequência para não renumerar as demais tarefas. T053 e T054 dependem de T027 para o teste contra o simulador ou o Supabase local.
- **US4** (T057 a T061) depende de T028 e T030 (função e tela de US2); é independente de US1 e US3.
- **Fase 7** depende de todas. T067 depende de US1 e US2; T070 (gate de IA) só depois da rodada completa (T066), da bancada (T067) e da entrevista.

### Oportunidades de paralelismo

```text
# Fundação: testes juntos
Task: "supabase/tests/013_constraints.test.sql"
Task: "supabase/tests/013_rls.test.sql"
Task: "src/domain/seals/seal-enrollment.test.ts"
Task: "tests/fixtures/seal-protocol/enrollment-*.json e tests/contract/seal-enrollment-protocol.test.ts"

# US2: testes RED juntos
Task: "supabase/tests/013_enrollment_ingest.test.sql"
Task: "supabase/tests/013_enrollment_rate_limit.test.sql"
Task: "supabase/tests/013_approve.test.sql"
Task: "supabase/tests/013_conflict.test.sql"
Task: "supabase/tests/013_withdraw.test.sql"
Task: "supabase/tests/013_forget_networks.test.sql"
Task: "supabase/tests/013_reassign_isolation.test.sql"
Task: "tests/contract/platform-seals-handler.test.ts"
Task: "src/pages/admin/seals/platform-seals-page.test.tsx"

# US3: testes RED juntos
Task: "supabase/tests/013_return.test.sql"
Task: "supabase/tests/013_read.test.sql"
Task: "src/pages/seals/seal-list-page.test.tsx"
Task: "src/pages/seals/seal-detail-page.test.tsx"

# US1: testes nativos do firmware juntos (podem começar logo depois de T007)
Task: "firmware/test/test_identidade"
Task: "firmware/test/test_portal"
Task: "firmware/test/test_protocolo e test_fila (modo aguardando)"
Task: "firmware/test/test_rede"
Task: "tests/e2e/portal-lacre.spec.ts"
```

## Estratégia de implementação

1. **MVP**: Fases 1 e 2, depois US2. Parar e validar com o simulador: pedido em Aguardando em até 1 min, aprovação para o Tenant A, `200` na chamada seguinte e nada no Tenant B.
2. **Fechamento do fluxo no tenant**: US3 (pronto para vincular, devolução, saída do cadastro manual).
3. **Lacre real**: US1 (firmware único com portal), com os testes nativos adiantados em paralelo a US2 e US3.
4. **Apoio à instalação**: US4 (senha padrão para o Master).
5. **Encerramento**: Fase 7, com bancada, publicação no Supabase de teste, validação humana e RIA.

Cada história termina com a regressão das Specs 001 a 012 verde.

## Notas

- Nenhuma tarefa apaga dado; devolução e retirada só inativam linhas.
- Dados de teste fictícios: e-mails `@example.invalid`, chaves e senhas geradas pela suíte.
- O CI não chama serviço externo; o lacre físico só aparece na validação.
- Funções novas do Supabase local exigem `npx supabase stop` e `npx supabase start`.
- O Playwright reaproveita a porta 4173: `npm run build` antes do E2E.
