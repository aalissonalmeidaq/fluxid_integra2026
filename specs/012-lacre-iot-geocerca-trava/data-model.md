# Modelo de dados: Lacre IoT — posição em tempo real, geocerca e trava do cilindro

**Feature**: `012-lacre-iot-geocerca-trava` | **Data**: 17/10/2026

Segue as regras das Specs 006 a 010: toda tabela tem `organization_id`, RLS ligada **sem política de leitura nem de escrita para `authenticated`** (leitura e escrita só por RPC `security definer`), chaves estrangeiras **compostas por organização**, nenhuma exclusão física (RF-041) e `update` só pelas funções de transição. A única exceção controlada é o Vault, que apaga a senha da rede Wi-Fi quando o comando termina (RF-034c). As decisões citadas estão em [research.md](./research.md).

## Tabelas públicas

### `public.seal_devices` — Dispositivo e lacre ativo

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid | chave primária |
| `organization_id` | uuid | referência a `organizations`; definida no cadastro, nunca pelo lacre (RN-006) |
| `device_code` | text | `DSP-` + 8 caracteres aleatórios sem ambiguidade; **único no FluxID inteiro** (o endpoint procura sem organização) |
| `label` | text | nome livre, 2 a 60 caracteres |
| `key_hash` | bytea | SHA-256 da chave; a chave nunca é guardada (RF-031) |
| `key_rotated_at` | timestamptz | última geração de chave |
| `status` | text | `active`, `inactive` |
| `firmware_version` | text | informada pelo lacre, até 40 caracteres |
| `report_interval_s` | integer | padrão 60, de 30 a 900 (RF-012) |
| `seal_code` | text | identificador do lacre gerado na primeira ativação (`LCR-` + 8), nunca muda |
| `activated_at` | timestamptz | última ativação |
| `last_seen_at` | timestamptz | último contato de qualquer tipo |
| `last_read_at` | timestamptz | horário da leitura mais nova já avaliada (item 5 da pesquisa) |
| `last_position_id` | uuid | última posição pelo horário da leitura (RF-010) |
| `health` | text | `ok`, `no_gps`, `low_battery`, `no_comm`, `off`, `never_seen` |
| `health_changed_at` | timestamptz | |
| `no_gps_since` | timestamptz | primeira leitura sem GPS da sequência atual |
| `battery_pct` | smallint | 0 a 100 |
| `signal_dbm` | smallint | força do Wi-Fi |
| `seal_state` | text | `closed`, `open`, `broken`, `unknown` (sensor do lacre) |
| `lock_state` | text | `none`, `locked`, `unlocked`, `unconfirmed`, `locked_violation`, `locked_comm_loss` (RF-030) |
| `lock_changed_at` | timestamptz | |
| `wifi_in_use` | jsonb | `{ssid, kind: default|list, rssi, at}`, sem senha (RF-034a) |
| `wifi_saved` | jsonb | lista de nomes das redes guardadas no lacre, como o lacre informou |
| `watch_version_ack` | integer | última versão da vigilância que o lacre informou ter |
| `version` | bigint | otimista |
| `created_at`, `created_by`, `updated_at` | | |

Restrições: `unique (id, organization_id)`, `unique (device_code)`, `unique (seal_code)`, `check`s de cada lista de valores. Índice em `(organization_id, health)` para a tela de lacres.

### `public.seal_device_events` — Histórico do dispositivo

Histórico imutável: `device_id`, `event_type` (`created`, `updated`, `deactivated`, `key_rotated`, `activated`, `shutdown`, `network_changed`), `justification` (5 a 500, obrigatória em `deactivated` e `key_rotated`), `at`, `by` (pessoa ou `device`) e `detail` (jsonb sem chave nem senha). É aqui que fica a justificativa das ações sensíveis do dispositivo, nunca em `audit_logs.metadata` (RF-039).

### `public.seal_bindings` — Vínculo lacre–cilindro

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id` | | |
| `device_id` | uuid | composto com `seal_devices` |
| `cylinder_id` | uuid | composto com `cylinders`; cilindro ativo no vínculo |
| `bound_at`, `bound_by` | | |
| `unbound_at`, `unbound_by` | | preenchidos no encerramento |
| `unbind_reason` | text | `manual`, `device_inactivated`, `cylinder_inactivated`, `replaced` |
| `unbind_justification` | text | 5 a 500, obrigatória quando `unbind_reason = 'manual'` |

Restrições: **índices únicos parciais** `(device_id) where unbound_at is null` e `(cylinder_id) where unbound_at is null` (um para um por vez, RF-033). O encerramento recusa cilindro com item de viagem em andamento (RF-034).

### `public.seal_messages` — Mensagem recebida

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id`, `device_id` | | |
| `message_id` | text | gerado pelo lacre, até 64 caracteres |
| `type` | text | `position`, `event`, `alert`, `command_result`, `activation`, `shutdown`, `network_change`, `auto_lock` (RF-007) |
| `read_at` | timestamptz | horário no lacre; recusado se mais de 5 min no futuro |
| `received_at` | timestamptz | `now()` |
| `outcome` | text | `stored`, `refused` |
| `refusal_code` | text | motivo do item recusado (RF-004) |
| `summary` | jsonb | campos não sensíveis da mensagem (sem chave, sem senha) |

Restrição: `unique (device_id, message_id)` (RF-003). Mensagem de lacre sem vínculo fica só aqui e no dispositivo (RF-005).

### `public.seal_positions` — Posição do lacre

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id`, `device_id` | | |
| `cylinder_id` | uuid | do vínculo válido no `read_at`; nulo sem vínculo |
| `message_id` | uuid | primeira mensagem que criou o ponto |
| `point` | geography(Point, 4326) | |
| `accuracy_m` | numeric | opcional |
| `quality` | text | `gps`, `last_known` (RN-003) |
| `seal_state` | text | estado do lacre na leitura |
| `battery_pct`, `signal_dbm` | | atualizados na repetição |
| `read_at` | timestamptz | primeira leitura do ponto |
| `received_at` | timestamptz | |
| `last_seen_at` | timestamptz | atualizado quando a leitura repete o ponto (RF-009) |
| `repeat_count` | integer | quantas leituras o ponto absorveu |

Índices: `(device_id, read_at desc)`, `(cylinder_id, read_at desc)`, GiST em `point`.

### `public.seal_commands` — Comando do lacre

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id`, `device_id` | | |
| `cylinder_id` | uuid | do vínculo no momento; nulo nos de rede |
| `kind` | text | `lock`, `unlock`, `wifi_add`, `wifi_remove`, `wifi_reset` |
| `origin` | text | `trip_start`, `delivery`, `delivery_correction`, `trip_cancel`, `geofence_violation`, `manual`, `exceptional`, `admin_network` |
| `status` | text | `pending`, `delivered`, `confirmed`, `failed`, `cancelled`, `expired` (RF-026) |
| `trip_id`, `trip_item_id`, `violation_id` | uuid | referência da origem, quando houver |
| `requested_by` | uuid | pessoa; nulo quando a origem é uma regra |
| `justification` | text | obrigatória em `manual`, `exceptional` e `wifi_reset` (5 a 500) |
| `aal` | text | `aal2` obrigatório em `exceptional` |
| `wifi_ssid` | text | nome da rede (até 32 bytes), só nos de rede |
| `wifi_open` | boolean | rede sem senha |
| `wifi_secret_id` | uuid | referência ao Vault; anulada quando a senha é apagada |
| `proof` | jsonb | no `unlock` de entrega: qual posição comprovou (`seal` ou `phone`), horário e distância; nunca a coordenada |
| `created_at`, `delivered_at`, `finished_at` | | |
| `device_response` | jsonb | `{result: executed|error, reason, at}` |
| `cancel_reason` | text | |
| `not_delivered_alert_at` | timestamptz | quando o alerta de 30 min foi aberto |

Restrições: índice único parcial `(trip_item_id, origin) where origin in ('trip_start', 'delivery', 'trip_cancel')` (não duplica, RF-023); índice `(device_id, status, created_at)`; `check` de coerência entre `kind`, `origin` e campos de rede.

**Transições** (só por função, com `for update`):

```text
pending ──(resposta ao lacre)──▶ delivered ──(executed)──▶ confirmed
   │                               │ └──(error)──▶ failed
   │                               └──(10 min sem confirmação)──▶ expired
   ├──(comando mais novo, fim do motivo)──▶ cancelled
   └──(rede: 30 min sem entrega)──▶ expired
```

O comando de trava pendente **não expira** enquanto o motivo valer (RF-028); aos 30 min leva `lock_state` a `unconfirmed` e abre o alerta `command_not_delivered`. A confirmação de um comando cancelado é gravada em `seal_command_events` sem mudar a trava (RF-029).

### `public.seal_command_events`

Histórico imutável: `command_id`, `from_status`, `to_status`, `at`, `by` (pessoa, `device` ou `system`), `detail` (jsonb sem segredo).

### `public.seal_watches` — Vigilância de geocerca

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id`, `cylinder_id`, `device_id` | | |
| `site_id` | uuid | unidade da entrega |
| `trip_item_id` | uuid | entrega que abriu a vigilância |
| `started_at` | timestamptz | |
| `ended_at`, `end_reason` | | `new_trip`, `stock_in`, `unbound`, `cylinder_inactivated` |
| `suspended_at` | timestamptz | unidade sem geocerca ativa (alerta médio) |
| `version` | integer | sobe quando a vigilância começa, termina ou a geocerca da unidade muda (o lacre recebe o contorno de novo) |
| `outside_streak` | smallint | posições com GPS seguidas fora, além de 50 m (RF-019) |

Índice único parcial `(cylinder_id) where ended_at is null`.

### `public.seal_violations` — Violação de geocerca

`id`, `organization_id`, `watch_id`, `cylinder_id`, `device_id`, `geofence_id`, `first_outside_at`, `first_position_id`, `last_position_id`, `distance_m` (até a geocerca mais próxima da unidade), `status` (`open`, `returned`, `closed`), `returned_at`, `closed_at`, `command_id`. Índice único parcial `(watch_id) where status = 'open'` (RF-021: uma violação aberta por vez).

### `public.seal_alerts` — Alerta

| Coluna | Tipo | Regra |
|---|---|---|
| `id`, `organization_id` | | |
| `device_id`, `cylinder_id` | uuid | o cilindro do vínculo na abertura |
| `kind` | text | `possible_loss`, `no_comm`, `device_off`, `no_gps`, `low_battery`, `weak_signal`, `seal_open`, `seal_broken`, `geofence_violation`, `comm_loss_lock`, `command_failed`, `command_expired`, `command_not_delivered`, `watch_suspended`, `rate_limited`, `wifi_change_failed` |
| `severity` | text | `medium`, `high`, `critical` |
| `source` | text | `device`, `system` |
| `status` | text | `open`, `acknowledged`, `closed` |
| `context` | jsonb | viagem ou unidade, posição de referência (id, não coordenada), comando |
| `opened_at`, `recovered_at` | | `recovered_at` registra a volta à normalidade (RF-017) |
| `acknowledged_at`, `acknowledged_by` | | |
| `closed_at`, `closed_by`, `close_note` | | observação obrigatória, 5 a 500 (RF-036) |
| `requires_push` | boolean | `possible_loss` e severidade alta ou crítica (RF-036a) |

Restrição: índice único parcial `(device_id, kind) where status <> 'closed'` (sem duplicar, RF-035). O alerta recebido do lacre repetido só atualiza o contexto.

**Regra da severidade e do tipo na falta de comunicação** (RF-014, Clarifications 17/10): em viagem em andamento ou sob vigilância, `possible_loss` alto com notificação; nos demais casos, `no_comm` ou `device_off` médio, sem notificação.

### `public.push_subscriptions`

`id`, `organization_id`, `user_id`, `endpoint` (único), `p256dh`, `auth_secret`, `user_agent_label` (ex.: "Chrome no Android"), `created_at`, `revoked_at`, `revoke_reason` (`user`, `permission_lost`, `gone`). Sem exclusão física; a inscrição revogada nunca recebe.

### `public.push_outbox`

`id`, `organization_id`, `alert_id`, `subscription_id`, `kind` (`opened`, `recovered`), `status` (`pending`, `sent`, `failed`, `skipped`), `attempts`, `created_at`, `sent_at`. Índice único `(alert_id, subscription_id, kind)` (RF-036d: uma por aparelho).

### Extensões em tabelas existentes

- `public.trip_items`: coluna `seal_command_id uuid` (o comando de travar do início da viagem); a leitura da viagem passa a devolver o estado da trava física junto do bloqueio lógico.
- `public.audit_logs`: ações novas `seal.device_create`, `seal.device_update`, `seal.device_deactivate`, `seal.key_rotate`, `seal.bind`, `seal.unbind`, `seal.command_manual`, `seal.unlock_exceptional`, `seal.wifi_add`, `seal.wifi_remove`, `seal.wifi_reset`, `seal.alert_close`, `seal.push_subscribe`, `seal.push_unsubscribe`, com `metadata` sem chave, senha ou coordenada (RF-039).

## Tabelas privadas

- `private.seal_rate_windows`: `device_id`, `window_start`, `count` (item 3 da pesquisa).
- `private.seal_auth_failures`: `source_hash` (SHA-256 do endereço com sal do servidor), `window_start`, `count`, `blocked_until`.
- `private.seal_requests`: idempotência dos comandos da tela (`request_id`, operação, resultado), no molde de `trip_requests`.

## Estado da saúde do lacre

```text
never_seen ──(primeiro contato)──▶ ok
ok ──(intervalo + 30 s sem contato)──▶ no_comm
ok ──(aviso de desligamento)──▶ off
ok ──(3 intervalos só sem GPS)──▶ no_gps
ok ──(bateria < 15 %)──▶ low_battery
no_comm | off | no_gps | low_battery ──(posição com GPS e bateria normal)──▶ ok   (alerta registra a volta, continua aberto)
```

Nenhum estado de saúde muda a situação do cilindro (RN-002, RF-017).

## Estado da trava física (`seal_devices.lock_state`)

```text
none ──(lock executed)──▶ locked
locked | unconfirmed | locked_* ──(unlock executed)──▶ unlocked
unlocked ──(lock executed, origem violação)──▶ locked_violation
qualquer ──(auto_lock informado)──▶ locked_comm_loss
qualquer ──(erro, expiração ou comando de trava não entregue em 30 min)──▶ unconfirmed
```

O comando pendente dentro do prazo não muda `lock_state`; a leitura devolve `pending_command` para a tela mostrar "travamento pendente" ou "destravamento pendente".

## Limites (fonte única)

Em `private.seal_limits()` e repetidos em `src/domain/seals/seal-limits.ts`, conferidos por teste de contrato: 20 m (posição repetida), 60 s (intervalo padrão), 30 s de folga (sem comunicação), 3 intervalos (sem GPS), 50 m e 2 posições (violação), 2 min (posição do lacre na entrega), 10 min (expira comando entregue), 30 min (alerta de trava não entregue e expiração de comando de rede), 50 leituras por lote, 3 min (trava pelo próprio lacre), 5 redes, 15 % de bateria, −85 dBm, 6 pedidos por minuto, 10 chaves erradas em 10 min, versões de protocolo aceitas `[1]`.
