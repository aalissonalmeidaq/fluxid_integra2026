# Contrato — Rastreamento e sincronização

## Envelope

Todas as operações usam JWT autenticado, `session_id` válido e `request_id` UUID para mutações. A organização ativa é conferida contra a sessão; recursos de outro tenant retornam `NOT_FOUND`. Erros não ecoam coordenadas.

```json
{ "operation": "nome", "request_id": "uuid", "organization_id": "uuid", "payload": {} }
```

## `start_tracking_session`

Requer motorista vinculado à viagem e capacidade operacional vigente. Entrada: `trip_id`, `device_installation_id`, `platform`, `capability`. Saída: sessão, regra vigente, `collect_until` (oito horas após confirmação online), intervalo preferencial de 60 s e estado. Retry com mesmo `request_id` retorna a mesma sessão.

## `ingest_driver_positions`

Aceita lote de 1 a 100 itens ordenados:

```json
{
  "tracking_session_id": "uuid",
  "device_installation_id": "uuid",
  "positions": [{
    "client_position_id": "uuid",
    "sequence_no": 42,
    "observed_at": "2026-10-22T14:02:00Z",
    "latitude": -7.229,
    "longitude": -39.313,
    "accuracy_m": 18.4
  }]
}
```

O servidor valida ator, tenant, viagem ativa, instalação, janela de autenticação, limites geográficos e ordem. Retorna um resultado por item na ordem recebida:

```json
{
  "server_time": "2026-10-22T14:02:03Z",
  "results": [{
    "client_position_id": "uuid",
    "status": "stored",
    "retrospective": false,
    "evaluations_created": 2
  }]
}
```

Status: `stored | duplicate | rejected`. Retry nunca duplica posição, comparação, ocorrência ou alerta. `rejected` inclui código sanitizado e o cliente mantém apenas itens recuperáveis.

## `report_tracking_capability`

Entrada: `tracking_session_id`, `capability = full|foreground_only|denied|unavailable`, `notifications_denied`. Só o motorista da sessão ativa. Atualiza a capacidade e o instante em que ela mudou, que alimentam o estado degradado mostrado ao motorista e ao gestor. Saída: `UPDATED`; sessão encerrada: `SESSION_ENDED`.

A pausa por falta de confirmação online por mais de 8 horas não é gravada pelo aparelho (ele está sem conexão): o acompanhamento a deriva na leitura (`paused_auth_expired`) e a próxima ingestão a desfaz.

## `end_tracking_session`

Entrada: `tracking_session_id`, `reason = completed|cancelled`. Idempotente. Encerra novos pares sem apagar fila/evidência; posições recebidas depois são recusadas ou, se já coletadas antes do fim, podem ser ingeridas como retrospectivas conforme vínculo temporal.

## Consultas

Permissão: `tracking.read`.

- `list_active_trip_tracking(filters, cursor, limit<=100)`
- `get_trip_tracking(trip_id)`
- `query_tracking_history(subject=trip|cylinder, subject_id, from, to, filters, cursor, limit<=200)`
- `get_proximity_occurrence(occurrence_id)`

Respostas incluem `generated_at`, `freshness`, posições mínimas, qualidade, origem, precisão, `observed_at`, `received_at`, eventos, lacunas, segmentos e próximo cursor. O mapa e a lista consomem a mesma coleção; uma lacuna nunca une segmentos.

## Regra de proximidade

- `get_proximity_rule()` — permissão `tracking.read`; devolve versão vigente, limites e `valid_from`.
- `set_proximity_rule(distance_m, max_age_s, max_accuracy_m, justification, request_id)` — permissão `proximity_rule.manage`. Faixas 50–500 m, 60–300 s, 20–100 m; justificativa obrigatória (10–500 caracteres). Idempotente por `request_id`. Vale para comparações posteriores à gravação; sessões ativas passam a usar a nova versão na próxima comparação. Auditoria com valores anterior e novo.

## Tratamento de ocorrência

- `acknowledge_proximity_occurrence(occurrence_id, version, request_id)`
- `close_proximity_occurrence(occurrence_id, version, note, request_id)`

Nota de encerramento é obrigatória e limitada. Servidor exige permissão de operação de alertas, registra ator/horário/auditoria e não altera custódia/trava.

## Invalidação em tempo real

Canal privado: `tracking:<organization_id>`. Evento contém apenas `kind`, `trip_id` e opcional `occurrence_id`; nunca ponto, endereço ou nome. A recepção dispara nova consulta. Polling de 30 s é fallback.

## Erros

`INVALID_INPUT`, `ACCESS_DENIED`, `NOT_FOUND`, `SESSION_ENDED`, `AUTH_REFRESH_REQUIRED`, `CONTEXT_MISMATCH`, `POSITION_TOO_FUTURE`, `BATCH_TOO_LARGE`, `VERSION_CONFLICT`, `UNAVAILABLE`.

## Fila local

Cada item carrega dono e destino imutáveis. Sincronização só ocorre com autenticação online da mesma conta/empresa e endpoint de origem. Após oito horas, novas coletas pausam, mas itens permanecem. Logout/troca de tenant não apaga nem redireciona fila; a UI informa a pendência sem revelar coordenadas.
