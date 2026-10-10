# Modelo de dados: Viagens, paradas, carga e entrega

**Feature**: `008-viagens-paradas-carga` | **Data**: 08/10/2026

Todas as tabelas têm `organization_id`, RLS ligada **sem política de leitura nem de escrita para `authenticated`** (toda leitura e escrita passam por RPC `security definer`, como na Spec 007) e chaves estrangeiras **compostas por organização**, para um registro de um tenant nunca apontar para outro. Nenhuma tabela tem `delete`; `update` só acontece pelas funções de transição.

## Tabelas

### `public.trips`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid | chave primária |
| `organization_id` | uuid | referência a `organizations` |
| `number` | integer | único por organização, sequencial, nunca reaproveitado |
| `planned_date` | date | obrigatória; na criação, hoje ou depois (fuso `America/Sao_Paulo`); a leitura marca `overdue` quando a data passou e a viagem ainda é `planned` ou `loading` |
| `vehicle_id`, `driver_id` | uuid | chaves compostas com `(id, organization_id)` de `vehicles` e `drivers` |
| `status` | text | `planned`, `loading`, `in_progress`, `completed`, `cancelled` |
| `notes` | text | até 500 caracteres |
| `cancel_reason` | text | obrigatório se `cancelled` (até 500) |
| `version` | bigint | otimista, começa em 1 |
| `created_at`, `created_by` | | quem planejou |
| `started_at`, `started_by` | | preenchidos ao ir para `in_progress` |
| `completed_at`, `completed_by` | | preenchidos ao ir para `completed` |
| `cancelled_at`, `cancelled_by` | | preenchidos ao ir para `cancelled` |
| `updated_at` | timestamptz | |

Restrições: `unique (id, organization_id)`, `unique (organization_id, number)`, **índices únicos parciais** `(vehicle_id) where status in ('loading', 'in_progress')` e `(driver_id) where status in ('loading', 'in_progress')` (um veículo e um motorista em no máximo uma viagem aberta de cada vez), `check` de coerência entre `status` e as colunas de data e autor. Índices em `research.md` (item 13).

### `public.trip_stops`

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id`, `trip_id` | | `trip_id` composto com `trips` |
| `site_id` | uuid | composto com `customer_sites`; unidade ativa de cliente ativo no planejamento |
| `position` | smallint | 1 a 30, único por viagem (`unique (trip_id, position) deferrable initially deferred` para reordenar) |
| `status` | text | `pending`, `on_site`, `delivered`, `with_divergence` |
| `arrived_at`, `arrived_by` | | preenchidos em `on_site` |
| `out_of_order` | boolean | verdadeiro quando a chegada foi registrada com outra parada pendente de posição menor; não altera `position` |
| `closed_at`, `closed_by` | | preenchidos em `delivered` ou `with_divergence` |

### `public.trip_items`

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id`, `trip_id` | | |
| `stop_id` | uuid | composto com `trip_stops` |
| `cylinder_id` | uuid | composto com `cylinders`; **o mesmo cilindro não repete na mesma viagem** (`unique (trip_id, cylinder_id)`) |
| `item_status` | text | `planned`, `checked`, `in_transit`, `delivered`, `not_delivered`, `removed`, `released`, `returned` |
| `is_open` | boolean | **gerada**: verdadeira em `planned`, `checked`, `in_transit` e `not_delivered`; **índice único parcial** `(cylinder_id) where is_open` |
| `lock_status` | text | `none`, `locked`, `unlocked` |
| `checked_at`, `checked_by` | | conferência do carregamento |
| `check_source` | text | `manual` (a Fase 5 acrescenta `scan`) |
| `divergence_reason` | text | obrigatório em `not_delivered` e `removed` (até 500) |
| `created_at`, `created_by`, `updated_at` | | |

Restrições de coerência: `lock_status = locked` só em itens `in_transit`, `not_delivered` ou `delivered`; `unlocked` só depois de `locked`; `checked_at` presente de `checked` em diante, exceto `removed`.

### `public.trip_deliveries`

Um registro **por parada** (RF-013); a correção é um novo registro que aponta o anterior.

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id`, `stop_id` | | |
| `request_id` | uuid | idempotência |
| `delivered_at` | timestamptz | horário informado, não no futuro |
| `recipient_name` | text | 2 a 120; **dado pessoal**, nunca em evento nem auditoria |
| `recipient_role` | text | até 80 |
| `latitude`, `longitude` | numeric | ambas ou nenhuma, dentro do intervalo |
| `at_site_address` | boolean | marca "no endereço da unidade" |
| `outside_geofence` | boolean | nulo se não houve comparação |
| `results` | jsonb | por cilindro: `{ item_id, delivered, reason? }` |
| `supersedes_id` | uuid | registro corrigido (nulo no original) |
| `recorded_by`, `recorded_at` | | |

Gatilhos recusam `update` e `delete`.

### `public.trip_unlocks`

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id`, `item_id` | | `unique (item_id)`: cada item é desbloqueado uma vez |
| `request_id` | uuid | |
| `exceptional` | boolean | verdadeiro quando o item não estava `delivered` |
| `justification` | text | obrigatória se `exceptional` (até 500) |
| `aal` | text | nível da sessão no momento (`aal2` obrigatório se `exceptional`) |
| `actor_user_id`, `actor_session_id`, `occurred_at` | | |

Gatilhos recusam `update` e `delete`.

### `public.trip_events`

Histórico imutável por viagem, no molde de `registry_events`.

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id`, `trip_id` | | |
| `sequence` | integer | contínua por viagem, `unique (trip_id, sequence)` |
| `event_type` | text | `trip_created`, `trip_updated`, `loading_started`, `loading_reverted`, `item_checked`, `item_unchecked`, `item_removed`, `trip_started`, `stop_arrived`, `delivery_registered`, `delivery_corrected`, `unlock_registered`, `item_returned`, `trip_completed`, `trip_cancelled` |
| `actor_user_id`, `actor_session_id`, `occurred_at` | | |
| `justification` | text | até 500 |
| `data` | jsonb | sem nome de recebedor, segredo, token ou documento (`check` como nas outras tabelas) |

Gatilhos recusam `update`, `delete` e `truncate`.

### Tabelas privadas

- `private.trip_counters (organization_id pk, last_number integer)`.
- `private.trip_requests (organization_id, request_id, operation, trip_id, result jsonb, created_at)`, chave `(organization_id, request_id)`.

## Mudanças em tabelas existentes (Spec 006)

- `cylinders.custody_status text not null default 'in_organization'`, `check in ('in_organization', 'in_transit', 'at_customer')`.
- `cylinders.custody_site_id uuid null`, composto com `customer_sites`; obrigatório em `at_customer` e nulo nos demais (`check`).
- `cylinder_events.event_type`: `check` recriado com os 12 tipos atuais mais `trip_reserved`, `trip_released`, `trip_departed`, `trip_delivered`, `trip_returned`.
- `cylinders_inactive_out_of_stock_check` e as demais restrições permanecem.

## Transições

### Viagem

```text
planned ──start_loading──▶ loading ──start_trip──▶ in_progress ──complete──▶ completed
   ▲                          │                         │
   └──── revert_loading ──────┘ (nada conferido)        └──cancel (exceção)──▶ cancelled
planned / loading ──cancel──▶ cancelled
```

Qualquer outra transição é recusada com `INVALID_TRANSITION`. `completed` e `cancelled` são finais.

### Parada

`pending → on_site` (chegada); `on_site → delivered` (todos entregues) ou `on_site → with_divergence` (algum não entregue); `with_divergence → delivered` só por correção registrada que entregue o que faltava. Parada fechada não aceita nova chegada.

### Item de carga

| De | Para | Quem causa |
|---|---|---|
| (novo) | `planned` | planejamento e edição |
| `planned` | `checked` / `checked` → `planned` | conferir e desfazer (viagem `loading`) |
| `planned`, `checked` | `removed` | retirada com exceção (viagem `loading`) |
| `planned`, `checked` | `released` | cancelamento antes de sair |
| `checked` | `in_transit` | início da viagem (com `lock_status = locked`) |
| `in_transit` | `delivered` ou `not_delivered` | registro de entrega |
| `not_delivered` | `delivered` | correção que entrega o que faltava |
| `in_transit`, `not_delivered` | `returned` | retorno ao estoque |

### Bloqueio

`none → locked` no início da viagem; `locked → unlocked` por `register_unlock`; nunca volta.

## Efeitos sobre o cilindro

| Momento | `stock_status` | `custody_status` | Evento do cilindro |
|---|---|---|---|
| Entra no planejamento | inalterado | inalterado | `trip_reserved` |
| Sai do planejamento (retirada ou cancelamento) | inalterado | inalterado | `trip_released` |
| Início da viagem | `out_of_stock` | `in_transit` | `trip_departed` |
| Entrega | inalterado | `at_customer` com `custody_site_id` da parada | `trip_delivered` |
| Retorno ao estoque | `in_stock` | `in_organization` | `trip_returned` |

## Visibilidade e permissões nas leituras

- Todas as RPCs conferem a permissão pelo banco e filtram por `organization_id`; id de outra organização responde `NOT_FOUND`.
- `recipient_name` e `recipient_role` só saem a quem tem `trip.recipient`; os demais recebem `"(restrito)"`.
- O histórico exige `trip.history`; a lista e o detalhe, `trip.read`.

## Volume de referência

10 mil viagens, 50 mil paradas e 200 mil itens de carga por organização grande, semeados por `tests/support/sql/` no mesmo formato das medições das Specs 006 e 007.

## Ajustes feitos na implementação

- **Situação de parada `removed`.** Uma parada retirada na edição da viagem fica com `status = 'removed'` (e sem posição); ela não aparece no detalhe nem nas contagens, mas continua no banco e no histórico.
- **Motivo de recusa `hydro_missing`.** Cilindro sem teste hidrostático registrado não é elegível; os motivos são `inactive`, `out_of_stock`, `hydro_expired`, `hydro_rejected` e `hydro_missing`.
- **Custódia na leitura de cilindros.** `query_cylinders_list` ganhou o filtro opcional `p_custody` e os itens de lista e detalhe trazem `custody_status` e `custody_site` (`id`, `name`, `customer_id`), sem mudar o comportamento anterior (migration `20261009120900_trips_cylinder_custody_read.sql`).
