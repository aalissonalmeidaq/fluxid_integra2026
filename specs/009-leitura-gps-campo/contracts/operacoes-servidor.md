# Contrato: operações do servidor

**Atende**: RF-001 a RF-019, CA-001, CA-002, CA-004

Nenhuma Edge Function nova: a consulta nova entra em `query-cylinders` e as alterações em `manage-trips`. Mesmo transporte das Specs 006 a 008: `POST` com `authorization: Bearer <token da sessão>`, `apikey` publicável e corpo JSON com `operation` e `organization_id` (contexto; a RPC confere a pertinência). Nenhuma credencial privilegiada no cliente.

## Convenções

Herdam as da Spec 008 (`AUTH_REQUIRED` 401, `ACCESS_DENIED` 403, `NOT_FOUND` 404, `VALIDATION_FAILED` 400 com `fields`, `VERSION_CONFLICT` 409, `INVALID_TRANSITION` 409 e demais). Não há código de erro novo. Comandos repetidos continuam idempotentes pelo `request_id`.

**Auditoria**: sucesso na mesma transação da RPC, com método, origem da posição e faixa de precisão (`good` ou `low`). **Nunca** coordenadas, valor lido, número de série de etiqueta ou nome do recebedor, no log, na auditoria ou na resposta de erro.

## `query-cylinders`: operação nova `resolve`

| Campo | Regra |
|---|---|
| Permissão | `cylinder.read` (a mesma de `lookup`); a viagem só vem a quem também tem `trip.read` |
| Entrada | `candidates[]` (1 a 3 textos, cada um de 1 a 200 caracteres sem quebra de linha), `expected_kind?` (`qr_code`, `data_matrix`, `nfc_tag` ou `hull_number`) |
| Busca | só identificadores **ativos** da organização ativa, por valor normalizado (maiúsculas, sem espaços nas pontas), na ordem dos candidatos; o primeiro que casa vale. Com `expected_kind`, só desse tipo |
| Auditoria | sem auditoria de sucesso (é leitura); negações e falhas são auditadas como nas demais consultas |

| Resposta | HTTP | Conteúdo |
|---|---|---|
| `FOUND` | 200 | `cylinder` (`id`, `serial_number`, `status`, `stock_status`, `hydro_status`), `identifier` (`id`, `kind`), `matched` (índice do candidato) e, se permitido e se houver, `trip` (`id`, `number`, `status`) |
| `NOT_FOUND` | 404 | corpo vazio; **igual** para código inexistente e para código de outra organização. Com `deactivated: true` e `cylinder` mínimo (`id`, `serial_number`) quando o valor pertencia a um identificador desativado |
| `VALIDATION_FAILED` | 400 | lista vazia, mais de 3 candidatos ou candidato inválido |

Cilindro inativo vem dentro de `FOUND`, em `cylinder.status`, como na Spec 006.

## `manage-trips`: operações alteradas

### `check_item`

Novo campo opcional `source` (`manual`, `typed`, `camera` ou `nfc`; padrão `manual`). Valor fora da lista: `VALIDATION_FAILED` com `fields.source`. O efeito não muda; o evento `item_checked` e a linha do item guardam o método. `uncheck_item` limpa o método, como já limpa `checked_at`.

### `arrive_stop`

| Campo novo (todos opcionais) | Regra |
|---|---|
| `latitude`, `longitude` | em par, -90 a 90 e -180 a 180 |
| `accuracy_m` | 0 a 100000, só com coordenadas |
| `position_source` | `gps` ou `typed`; exige coordenadas |
| `position_read_at` | instante; só com `gps`; não pode estar no futuro nem ter mais de 10 minutos |

A resposta inclui `outside_geofence` (nulo sem posição ou sem geocerca ativa). Sem posição, tudo continua como na Spec 008.

### `register_delivery`

| Campo novo (todos opcionais) | Regra |
|---|---|
| `accuracy_m`, `position_source`, `position_read_at` | as mesmas da chegada, mais `site_address` como origem quando `at_site_address` é verdadeiro |
| `results[].source` | método por cilindro (`manual`, `typed`, `camera`, `nfc`); padrão `manual`; só vale para resultados "entregue" |

Valem a exclusividade de coordenadas e "no endereço da unidade", a justificativa de correção e as demais regras da Spec 008. **O banco repete as validações do cliente**: par de coordenadas, origem coerente, precisão não negativa e horário da leitura.

### `query-trips`: `get_trip` (resposta ampliada)

`stops[]` ganha `arrival` (nulo quando a chegada não teve posição) com `latitude`, `longitude`, `accuracy_m`, `position_source` (`gps` ou `typed`), `position_read_at` e `outside_geofence`; `deliveries[]` ganha `accuracy_m`, `position_source` (`gps`, `typed`, `site_address` ou nulo nas entregas anteriores à Spec 009) e `position_read_at`; `items[]` ganha `check_source`. A faixa de precisão (`good` ou `low`) é derivada pelo cliente a partir de `accuracy_m` (limite de 100 m). **Todo o detalhe exige `trip.read`**, então a posição só chega a quem pode ver viagens; o nome do recebedor continua só com `trip.recipient` (Spec 008).

## Permissões

Nenhuma permissão nova (RF-019). `resolve` usa `cylinder.read`; `check_item`, `arrive_stop` e `register_delivery` mantêm `trip.operate`; a viagem na resposta usa `trip.read`.

## Verificações de contrato

- O catálogo de operações lista `resolve` e os novos campos.
- Nenhum corpo de erro, log ou linha de auditoria contém coordenadas, número de série de etiqueta ou valor lido.
- `NOT_FOUND` de código de outra organização é igual, byte a byte, ao de código inexistente.
