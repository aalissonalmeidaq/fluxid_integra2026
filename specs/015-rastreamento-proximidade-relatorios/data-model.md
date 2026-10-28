# Modelo de dados — Spec 015

Todas as tabelas públicas abaixo possuem `organization_id uuid not null`, FK composta para entidades do mesmo tenant, RLS habilitada e nenhuma permissão direta de escrita para `authenticated`. Escritas passam por funções transacionais que validam JWT, sessão, vínculo e permissão.

## Entidades

### `proximity_rules`

- `id`, `organization_id`, `version`, `distance_threshold_m numeric(6,1)`, `max_age_seconds smallint`, `max_accuracy_m numeric(6,1)`
- `valid_from`, `valid_until`, `created_by`, `created_at`
- checks: distância 50–500 m; idade 60–300 s; precisão 20–100 m; vigência coerente
- único parcial: uma regra aberta por organização; índice `(organization_id, valid_from desc)`

Alterar a regra fecha a vigente e cria nova versão; comparações apontam para a versão usada. Somente `set_proximity_rule`, com `proximity_rule.manage` e justificativa, altera a regra; sessões ativas usam a nova versão a partir da próxima comparação.

### `tracking_sessions`

- `id`, `organization_id`, `trip_id`, `driver_user_id`, `device_installation_id`
- `status`: `active | completed | cancelled | paused_auth_expired`
- `platform`: `android_native | web_visible`
- `capability`: `full | foreground_only | denied | unavailable`
- `started_at`, `last_online_confirmed_at`, `ended_at`, `end_reason`, `created_at`, `updated_at`
- único parcial por viagem/dispositivo enquanto ativa

É o limite que impede posições de motoristas, viagens ou instalações distintas de formar pares.

### `mobile_positions`

- `id`, `client_position_id`, `organization_id`, `tracking_session_id`, `trip_id`, `driver_user_id`, `device_installation_id`
- `sequence_no bigint`, `point geography(Point,4326)`, `accuracy_m numeric(8,1)`
- `observed_at`, `received_at`, `sync_kind`: `live | retrospective`
- `validity`: `pending | valid | stale | imprecise | future | context_invalid`
- `invalid_reason`, `created_at`
- únicos `(organization_id, client_position_id)` e `(tracking_session_id, sequence_no)`
- índices `(organization_id, trip_id, observed_at desc, id desc)`, `(tracking_session_id, observed_at, id)` e GiST em `point`

`observed_at` é o instante do sensor. `received_at` nunca substitui o original. A fila local espelha os campos necessários e guarda proprietário/endpoint, mas não token.

### `proximity_pairs`

Um par de acompanhamento por sessão e item de viagem/lacre:

- `id`, `organization_id`, `tracking_session_id`, `trip_id`, `trip_item_id`, `cylinder_id`, `device_id`
- `status`: `active | delivered | session_ended`
- `outside_streak smallint`, `confirmed_occurrence_id`, `started_at`, `ended_at`
- único parcial por sessão/item enquanto ativo

### `proximity_comparisons`

- `id`, `organization_id`, `pair_id`, `rule_id`, `rule_version`
- `mobile_position_id`, `seal_position_id`, `evaluated_at`
- `distance_m numeric(10,2)` nullable
- cópias imutáveis dos limites aplicados
- `result`: `inside | outside | inconclusive`
- `reason`: `within_limit | beyond_limit | mobile_missing | seal_missing | stale | imprecise | future | context_invalid`
- `sequence_ordinal`, `retrospective boolean`, `created_at`
- único `(pair_id, mobile_position_id, seal_position_id, rule_id)`
- índice `(organization_id, pair_id, evaluated_at, id)`

Comparações são append-only. `inconclusive` não altera `outside_streak`; `inside` zera sequência ainda não confirmada; `outside` incrementa e a terceira cria ocorrência na mesma transação.

### `proximity_occurrences`

- `id`, `organization_id`, `pair_id`, `trip_id`, `trip_item_id`, `cylinder_id`, `device_id`
- `alert_id` nullable (fica nulo quando retrospectiva após término da viagem)
- `status`: `open | acknowledged | closed | historical_only`
- `detection_kind`: `live | retrospective`
- `first_comparison_id`, `confirming_comparison_id`, `opened_at`
- `acknowledged_at/by`, `closed_at/by`, `close_note`, `created_at`, `updated_at`
- único parcial `(pair_id)` para `open|acknowledged`

Se a viagem ainda está ativa, cria `seal_alerts.kind = proximity_separation`, um alerta próprio por ocorrência (T132); se encerrada, nasce `historical_only` sem push/e-mail urgente. Reconhecer e encerrar não altera custódia, cilindro ou trava.

### `proximity_presence_evidences`

- `id`, `organization_id`, `tracking_session_id`, `trip_id`, `trip_item_id`, `cylinder_id`
- `delivery_id`, `source` (`camera|nfc|typed`), `confirmed_by`, `observed_at`, `created_at`
- `kind` fixo `in_person_reading`; único `(delivery_id, trip_item_id)`
- FKs compostas asseguram que sessão, viagem, item, cilindro e leitura pertencem ao mesmo tenant

A evidência nasce somente de uma leitura presencial válida já aceita pelo fluxo de campo. Ela confirma presença naquele instante e aparece na cronologia, mas não cria posição móvel, distância estimada ou afirmação de proximidade contínua. Por não ser uma comparação GPS válida, ela não incrementa, reinicia, confirma nem desfaz `outside_streak`.

### `report_exports`

- `id`, `organization_id`, `requested_by`, `report_type`, `filters jsonb`, `filter_hash`
- `snapshot_at`, `row_count`, `status`: `queued | processing | ready | failed | expired`
- `storage_path`, `failure_code`, `requested_at`, `started_at`, `completed_at`, `expires_at`, `downloaded_at`
- único `(organization_id, requested_by, request_id)` para idempotência
- índices parciais de jobs pendentes e expiração

`filters` aceita somente chaves canônicas e IDs, nunca SQL. `storage_path` aponta para bucket privado e só existe em `ready`. O objeto incompleto usa caminho temporário e não é exposto.

### `email_notification_categories`

- `organization_id`, `category`: `proximity_confirmed | seal_high_critical | seal_recovered`
- `enabled boolean default false`, `version`, `updated_by`, `updated_at`
- PK `(organization_id, category)`

### `email_notification_preferences`

- `organization_id`, `user_id`, `category`, `enabled boolean default false`, `updated_at`
- PK `(organization_id, user_id, category)`
- FK composta para associação ativa e categoria do tenant

Uma preferência só é efetiva quando categoria do tenant, opt-in individual, associação e permissão continuam válidos.

### `email_notification_outbox`

- `id`, `organization_id`, `occurrence_type`, `occurrence_id`, `transition`: `opened | recovered`
- `recipient_user_id`, `status`: `pending | processing | sent | retry | failed | cancelled`
- `attempt_count`, `next_attempt_at`, `claimed_at`, `sent_at`, `provider_message_ref`, `last_error_code`, `created_at`
- único `(organization_id, occurrence_type, occurrence_id, transition, recipient_user_id)`
- índice parcial `(next_attempt_at, id)` para `pending|retry`

Não armazena coordenadas nem corpo completo; o corpo mínimo é montado no servidor no momento do envio.

## Entidades existentes alteradas

- `seal_alerts`: adicionar `proximity_separation` ao domínio de `kind`; manter estados e tratamento existentes. A chave de alerta aberto por lacre e tipo (`seal_alerts_open_key`) deixa de valer para `proximity_separation`, que passa a ter um alerta por ocorrência (`seal_alerts_proximity_occurrence_key`, sobre `context->>'occurrence_id'`); decisão de 28/10/2026, migração `20261022100800`.
- `trip_events`/operação de entrega: publicar a referência da leitura presencial e encerrar `proximity_pairs.status = delivered` na mesma transação da entrega; a vigilância de geocerca da Spec 012 permanece ativa.
- `permissions`: incluir `tracking.read`, `report.export`, `notification_category.manage` e `proximity_rule.manage`; atribuições padrão explícitas em migration (`proximity_rule.manage` somente ao administrador), sem implicação automática entre elas. Matriz completa em `contracts/permissoes-e-papeis.md`.
- `realtime.messages`: somente nova política de leitura para `tracking:<organization_id>`, sem alterar tabela/schema interno.
- `audit_logs`: nenhuma coluna nova; usar eventos sanitizados de regra, ocorrência, exportação e categoria.
- Storage: bucket privado `report-exports` com objeto particionado por organização/solicitante/exportação e políticas restritivas.

## Funções transacionais

- `start_tracking_session`, `pause_tracking_session`, `end_tracking_session`
- `get_proximity_rule`, `set_proximity_rule(distance_m, max_age_s, max_accuracy_m, justification, request_id)` — fecha a versão vigente e abre nova na mesma transação; exige `proximity_rule.manage`; auditoria `proximity_rule.update` com valores antigos/novos, sem coordenadas
- `ingest_driver_positions` (lote limitado, resultados por item, idempotente)
- `evaluate_proximity_for_position` (privada, mesma transação da ingestão)
- `register_proximity_presence` e `end_proximity_for_delivery` (privadas, chamadas por um gatilho `after insert` em `trip_deliveries`, na mesma transação de `public.register_delivery`): para cada item entregue lido por `camera|nfc|typed` com sessão ativa, registra a presença pontual; todo item entregue encerra o par (`delivered`); uma correção para "não entregue" reabre o par. Leitura `manual` não gera evidência. `check_item` não participa: só roda no carregamento, antes da coleta.
- `list_active_trip_tracking`, `get_trip_tracking`, `query_tracking_history`, `get_proximity_occurrence`
- `acknowledge_proximity_occurrence`, `close_proximity_occurrence`
- `query_report_summary`, `query_report_rows`
- `request_report_export`, `claim_report_exports`, `complete_report_export`, `get_report_export`, `authorize_report_download`
- `set_notification_categories`, `set_my_email_preferences`, `claim_email_notifications`, `report_email_delivery`

## Estados e transições

```text
tracking_session: active -> completed | cancelled | paused_auth_expired
export: queued -> processing -> ready -> expired
                         \-> failed
email: pending -> processing -> sent
                    \-> retry -> processing | failed
                    \-> cancelled
occurrence: open -> acknowledged -> closed
                 \---------------> closed
retrospective after trip: historical_only (terminal)
```

Transições sensíveis exigem versão/request ID, permissão atual e auditoria na mesma transação. Jobs recuperam claims abandonados com limite de tentativas.

## RLS e testes obrigatórios

- SELECT exige organização ativa e permissão correspondente; posição bruta e histórico exigem `tracking.read`.
- Exportação exige `report.export`, `requested_by = auth.uid()` e a permissão de consulta correspondente ao `report_type` na solicitação, no claim/processamento, na consulta de status e no download. A perda de qualquer autorização impede processar ou obter o arquivo.
- Administração de categorias exige `notification_category.manage`; a pessoa só edita a própria preferência dentro do tenant ativo.
- Escrita direta fica negada; funções usam `security definer set search_path = ''` e validam `auth.uid()`/`session_id`.
- Testar tenant A permitido, tenant B invisível e tentativa cruzada indistinguível de inexistência para cada entidade/RPC/Storage/Broadcast.
- Auditoria registra ação, alvo, resultado, filtros resumidos/contagens e justificativa quando aplicável; nunca ponto, endereço, e-mail, token ou URL assinada.
