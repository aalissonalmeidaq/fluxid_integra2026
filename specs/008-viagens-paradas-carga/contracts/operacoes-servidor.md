# Contrato: operações do servidor

**Atende**: RF-001 a RF-033, CA-001 a CA-008

Duas Edge Functions de domínio, `query-trips` e `manage-trips`, ambas `POST` com `authorization: Bearer <token da sessão>` e `apikey` publicável (mesmo transporte das Specs 006 e 007). Corpo JSON com `operation` e `organization_id` (contexto; a RPC confere o vínculo e a sessão e rejeita organização que não seja a do ator). Todo comando traz `request_id` (UUID); todo comando de edição traz `expected_version`.

## Convenções de resposta

Herdam as da Spec 007 (`AUTH_REQUIRED` 401, `ACCESS_DENIED` 403, `NOT_FOUND` 404 inclusive para registro de outra organização, `VALIDATION_FAILED` 400 com `fields`, `JUSTIFICATION_REQUIRED` 400, `VERSION_CONFLICT` 409, `MFA_REQUIRED` 403, `METHOD_NOT_ALLOWED` 405, `INTERNAL_ERROR` 500) e acrescentam:

| Código | HTTP | Significado |
|---|---|---|
| `CYLINDER_RESERVED` | 409 | o cilindro já está em viagem aberta; traz `trip_id` e `trip_number` da viagem que o reservou |
| `CYLINDER_NOT_ELIGIBLE` | 409 | cilindro inativo, fora do estoque, com teste vencido ou reprovado; traz `cylinder_id` e `reason` (`inactive`, `out_of_stock`, `hydro_expired`, `hydro_rejected`) |
| `CAPACITY_EXCEEDED` | 409 | mais cilindros que a capacidade do veículo; traz `capacity` e `requested` |
| `PARENT_INACTIVE` | 409 | veículo indisponível, motorista, cliente ou unidade inativos; traz `entity` e `entity_id` |
| `DRIVER_LICENSE_EXPIRED` | 409 | CNH vencida ao iniciar |
| `CYLINDER_IN_TRIP` | 409 | operação da Spec 006 (entrada no estoque ou inativação) recusada porque o cilindro está em viagem aberta; traz `trip_id` e `trip_number` |
| `RESOURCE_BUSY` | 409 | veículo ou motorista já estão em outra viagem "carregando" ou "em andamento"; traz `entity` (`vehicle` ou `driver`), `trip_id` e `trip_number` |
| `INVALID_TRANSITION` | 409 | a transição não existe a partir da situação atual; traz `from` e `to` |
| `ITEMS_PENDING` | 409 | iniciar com cilindro não conferido; traz `item_ids` |
| `STOPS_OPEN` | 409 | concluir com parada aberta; traz `stop_ids` |
| `TRIP_CLOSED` | 409 | viagem concluída ou cancelada não aceita a operação |
| `STOP_CLOSED` | 409 | parada já fechada; a correção usa `supersedes_id` |
| `REQUEST_REUSED` | 409 | `request_id` já usado com outra operação ou outra viagem |

Respostas de sucesso de comando repetido trazem `replayed: true`. Negações e falhas são auditadas como `denied` ou `failed` pelo manipulador, sem alvo de outra organização. Sucessos são auditados **na mesma transação** da RPC, sem o nome do recebedor.

## `query-trips` (somente leitura, sem auditoria de sucesso)

| `operation` | Permissão | Entrada | Saída |
|---|---|---|---|
| `list_trips` | `trip.read` | `search?` (número, placa, motorista, cliente), `status?` (`open` padrão, `planned`, `loading`, `in_progress`, `completed`, `cancelled`, `all`), `from?`, `to?`, `vehicle_id?`, `driver_id?`, `customer_id?`, `sort?`, `cursor?`, `limit?` (1–100, padrão 25) | `{ code: 'LISTED', items[], total, next }`; cada item: número, data, situação, veículo (placa), motorista, paradas, cilindros, divergências |
| `get_trip` | `trip.read` | `trip_id` | `{ code: 'FOUND', `overdue` (data passada em viagem planejada ou carregando), trip, stops[], items[], deliveries[], unlocks[], warnings[] }`; o nome do recebedor só com `trip.recipient` |
| `trip_history` | `trip.history` | `trip_id`, `event_type?`, `from?`, `to?`, `order?`, `cursor?`, `limit?` | `{ code: 'LISTED', events[], next }` |
| `trip_options` | `trip.write` | `search?` | `{ code: 'LISTED', vehicles[], drivers[], sites[] }`: só veículos disponíveis, motoristas ativos e unidades ativas de clientes ativos, com os dados mínimos (placa e capacidade; nome e situação da CNH; unidade e cliente) |
| `list_eligible_cylinders` | `trip.write` | `search?`, `cylinder_type_id?`, `cursor?`, `limit?` | cilindros ativos, em estoque, com teste em dia ou a vencer e sem reserva aberta |
| `trips_of_cylinder` | `trip.read` e `cylinder.read` | `cylinder_id`, `cursor?`, `limit?` | viagens em que o cilindro apareceu |
| `trips_of_site` | `trip.read` e `customer.read` | `site_id`, `cursor?`, `limit?` | viagens com parada na unidade |

## `manage-trips` (comandos, auditados na transação)

| `operation` | Permissão | Entrada | Efeito e saída |
|---|---|---|---|
| `create_trip` | `trip.write` | `planned_date` (hoje ou depois, fuso de São Paulo), `vehicle_id`, `driver_id`, `notes?`, `stops[]` (`site_id`, `cylinder_ids[]`) | cria `planned`, reserva os cilindros, grava eventos (`trip_created` e `trip_reserved` por cilindro); `{ code: 'CREATED', trip_id, number, version }` |
| `update_trip` | `trip.write` | `trip_id`, `expected_version`, mesmos campos de `create_trip` | só em `planned` ou `loading` (em `in_progress` responde `INVALID_TRANSITION`); reservas acompanham; evento com valores anteriores e novos; `{ code: 'UPDATED', version }`. Em `loading`, itens já conferidos não podem sair por aqui (usar `remove_item`) |
| `start_loading` | `trip.operate` | `trip_id`, `expected_version` | `planned → loading`; recusa com `RESOURCE_BUSY` se o veículo ou o motorista já estão em outra viagem aberta; `{ code: 'LOADING', version }` |
| `revert_loading` | `trip.operate` | `trip_id`, `expected_version` | `loading → planned` só se nenhum item foi conferido |
| `check_item` | `trip.operate` | `trip_id`, `item_id` | `planned → checked` com quem e quando; só em `loading`; `{ code: 'CHECKED' }` |
| `uncheck_item` | `trip.operate` | `trip_id`, `item_id` | `checked → planned`; só em `loading` |
| `remove_item` | `trip.operate` e `trip.exception` | `trip_id`, `item_id`, `justification` | item vai a `removed`, libera a reserva, evento `trip_released` no cilindro; só em `loading` |
| `start_trip` | `trip.operate` | `trip_id`, `expected_version` | confere tudo no momento (itens conferidos, teste, veículo, motorista, CNH, clientes e unidades), então `loading → in_progress`, itens `in_transit` e `locked`, cilindros fora do estoque e `in_transit` |
| `arrive_stop` | `trip.operate` | `trip_id`, `stop_id`, `arrived_at?` | `pending → on_site` em qualquer parada pendente; devolve `out_of_order` (verdadeiro se havia parada pendente de posição menor) e grava a marca no evento `stop_arrived` |
| `register_delivery` | `trip.operate` | `trip_id`, `stop_id`, `delivered_at`, `recipient_name`, `recipient_role?`, `latitude?`, `longitude?`, `at_site_address?`, `results[]` (`item_id`, `delivered`, `reason?`), `supersedes_id?` | uma vez por parada; entregues vão a `delivered` e o cilindro a `at_customer`; não entregues a `not_delivered` com `reason`; parada vai a `delivered` ou `with_divergence`; devolve `outside_geofence`. Com `supersedes_id`, é correção (evento `delivery_corrected`) |
| `register_unlock` | `trip.unlock` | `trip_id`, `item_id`, `justification?` | `locked → unlocked`. Item `delivered`: normal. Item em trânsito ou `not_delivered`: excepcional, exige também `trip.exception`, `aal2` (`MFA_REQUIRED` sem ele) e `justification` |
| `return_item` | `trip.operate` e `trip.exception` | `trip_id`, `item_id`, `justification` | `in_transit` ou `not_delivered` → `returned`; cilindro em estoque e `in_organization` |
| `complete_trip` | `trip.operate` | `trip_id`, `expected_version` | `in_progress → completed` se não há parada aberta e cada não entregue tem decisão |
| `cancel_trip` | `trip.cancel` (e `trip.exception` se `in_progress`) | `trip_id`, `expected_version`, `justification` | `planned` ou `loading → cancelled` liberando reservas; `in_progress → cancelled` mantém em trânsito o que já saiu |

## Registros de auditoria

Ações: `trip.create`, `trip.update`, `trip.start_loading`, `trip.revert_loading`, `trip.check_item`, `trip.uncheck_item`, `trip.remove_item`, `trip.start`, `trip.arrive_stop`, `trip.deliver`, `trip.correct_delivery`, `trip.unlock`, `trip.return_item`, `trip.complete`, `trip.cancel`. O alvo é `trip` e o id da viagem; os metadados trazem contagens, situações e `exceptional`, **nunca** o nome do recebedor, a posição nem o texto de justificativa.

## Ajustes feitos na implementação

- `trip_history`, `trips_of_cylinder` e `trips_of_site` ficam em `query-trips` e na migration `20261009120800_trips_history.sql`; as três paginam por cursor (`next`), da mais recente para a mais antiga (o histórico aceita `order`).
- `trips_of_cylinder` devolve, em cada viagem, `item_status` e `lock_status` do cilindro; `trips_of_site` devolve `stop_status` da parada.
- `list_cylinders`/`query-cylinders` aceita `custody` (`in_organization`, `in_transit`, `at_customer`).
- Resposta `AUTH_REQUIRED` (HTTP 401) é "sessão expirada": nada foi gravado e a tela leva a pessoa a entrar de novo.
