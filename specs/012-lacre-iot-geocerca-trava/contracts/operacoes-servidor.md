# Contrato: operações de servidor da tela

**Atende**: RF-011, RF-024, RF-025, RF-031 a RF-039, RF-036a a RF-036d, CA-001, CA-004, CA-008, CA-010

Duas Edge Functions no molde de `query-trips` e `manage-trips` (catálogo de operações de `_shared/operations.ts`): o ator, a sessão e o `aal` vêm do token; a organização vem do corpo e é conferida no banco; toda RPC é `security definer`, confere a permissão por `private.cylinder_authorize`, grava evento e auditoria na mesma transação (a justificativa vai para o evento, nunca para a auditoria) e responde `NOT_FOUND` para qualquer registro de outra organização (RF-037). Todo comando leva `request_id` (idempotência, `private.seal_requests`). **Nenhuma operação de exclusão.** Os manipuladores nunca registram corpo nem resposta (a chave e a senha passam por eles).

## `query-seals` (leitura)

| Operação | Permissão | Devolve |
|---|---|---|
| `list_seals` | `seal.read` | dispositivos com rótulo, código, saúde, trava, bateria, último contato, cilindro vinculado e situação dele; filtros por saúde, trava e "sem cilindro"; paginação |
| `get_seal` | `seal.read` | o dispositivo, o vínculo atual e os anteriores, a rede em uso e os nomes das redes guardadas (nunca senha), os últimos comandos e alertas |
| `list_unbound_active_seals` | `seal.read` | lacres ativos sem cilindro, com horário da ativação, bateria e última posição (História 5, cenário 2) |
| `cylinder_seal_view` | `seal.read` | para o detalhe do cilindro: última posição (coordenadas, idade, qualidade), bateria, saúde, trava, comando em curso, vigilância e violação aberta |
| `trip_seal_view` | `seal.read` | para o detalhe da viagem: o mesmo por cilindro da viagem, com "sem lacre" quando não há vínculo |
| `list_positions` | `seal.read` | histórico de posições de um cilindro ou dispositivo num intervalo (alternativa em texto ao mapa, RF-042), até 500 por página |
| `list_commands` | `seal.read` | comandos com estados, origem e histórico |
| `list_alerts` | `seal.read` | lista única de alertas com filtros por situação, severidade e tipo (RF-035) |
| `get_alert` | `seal.read` | o alerta, a última posição do lacre e o contexto (viagem ou unidade) |
| `push_status` | autenticado | se o aparelho atual tem inscrição ativa (pelo `endpoint`) |

As coordenadas só aparecem nas respostas destas leituras, para quem tem `seal.read`; nunca em auditoria, evento ou notificação.

## `manage-seals` (comandos)

| Operação | Permissão | Regras | Auditoria |
|---|---|---|---|
| `create_device` | `seal.admin` | rótulo e intervalo; gera `device_code` e a chave e devolve a chave **uma única vez** no campo `device_key` (RF-031) | `seal.device_create` sem a chave |
| `update_device` | `seal.admin` | rótulo e intervalo, com versão | `seal.device_update` |
| `deactivate_device` | `seal.admin` | justificativa de 5 a 500 (`JUSTIFICATION_REQUIRED`); encerra o vínculo; envios seguintes recusados (História 5, cenário 6) | `seal.device_deactivate` |
| `rotate_device_key` | `seal.admin` | justificativa de 5 a 500; a chave antiga deixa de valer na hora; a nova volta uma única vez | `seal.key_rotate` |
| `bind_seal` | `seal.operate` | lacre ativo e cilindro ativo da mesma organização, por `cylinder_id` ou identificador lido (Spec 009, `resolve_identifier`); recusa `SEAL_ALREADY_BOUND` e `CYLINDER_ALREADY_BOUND` | `seal.bind` |
| `unbind_seal` | `seal.operate` | justificativa de 5 a 500; recusa `CYLINDER_IN_TRIP` com viagem em andamento (RF-034) | `seal.unbind` |
| `request_lock` | `seal.operate` | pelo cilindro; justificativa de 5 a 500; cancela o comando de trava pendente; `NO_BINDING` sem lacre, `SEAL_INACTIVE` com o dispositivo desativado | `seal.command_manual` |
| `request_unlock` | `seal.operate` | justificativa de 5 a 500 e sessão `aal2` (`MFA_REQUIRED`, RN-005): destravar pela tela é sempre fora da regra da entrega (RF-025); grava a origem `exceptional` | `seal.unlock_exceptional` |
| `wifi_add` | `seal.admin` | `ssid` (1 a 32 bytes), `password` (8 a 63) ou `open: true`; recusa `WIFI_LIST_FULL` com 5 redes; com viagem ou vigilância, exige `confirm_risk: true` (RF-034f); a senha vai para o Vault | `seal.wifi_add` só com o `ssid` |
| `wifi_remove` | `seal.admin` | `ssid` da lista | `seal.wifi_remove` |
| `wifi_reset` | `seal.admin` | justificativa de 5 a 500; esvazia a lista | `seal.wifi_reset` |
| `acknowledge_alert` | `seal.operate` | `open` → `acknowledged` | — |
| `close_alert` | `seal.operate` | observação de 5 a 500; encerra (RF-036) | `seal.alert_close` |
| `push_subscribe` | `seal.read` | `endpoint`, `p256dh`, `auth`, rótulo do aparelho; repetir é idempotente | `seal.push_subscribe` |
| `push_unsubscribe` | autenticado | revoga a inscrição do próprio aparelho | `seal.push_unsubscribe` |

Códigos de negócio novos: `SEAL_ALREADY_BOUND`, `CYLINDER_ALREADY_BOUND`, `CYLINDER_IN_TRIP`, `SEAL_INACTIVE`, `NO_BINDING`, `WIFI_LIST_FULL`, `WIFI_NOT_IN_LIST`, `WIFI_RISK_NOT_CONFIRMED`, `JUSTIFICATION_REQUIRED`, `MFA_REQUIRED`, `ALERT_CLOSED`, `NOTE_REQUIRED`, `VERSION_CONFLICT`. O mapeamento HTTP é o do catálogo comum.

## Funções internas (sem chamada da tela)

| Função | Quem chama | O que faz |
|---|---|---|
| `seal-gateway` | o lacre | [mensagens-do-lacre.md](./mensagens-do-lacre.md) |
| `seal-push` | `pg_net` a partir do banco | confere o segredo do Vault no cabeçalho, busca o lote pendente de `push_outbox` (`claim_push_outbox`), envia o Web Push com VAPID e marca `sent`, `failed` ou revoga a inscrição (`404`/`410`) |

## RPCs acionadas por gatilho (Spec 008)

Não são chamadas pela tela; documentadas em [research.md](../research.md), item 11: `private.seal_on_trip_started`, `private.seal_on_delivery_recorded`, `private.seal_on_trip_cancelled`, `private.seal_on_item_returned`, `private.seal_on_cylinder_inactivated`, `private.seal_end_watch`.
