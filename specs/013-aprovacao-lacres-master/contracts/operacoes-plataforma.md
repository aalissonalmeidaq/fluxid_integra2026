# Contrato: operações da plataforma (`platform-seals`) e do tenant (`manage-seals`)

## `platform-seals` (Master)

`POST /functions/v1/platform-seals`, com JWT. A sessão precisa estar ativa e ter `platform.manage` (`ACCESS_DENIED`); não há segundo fator (RF-021); toda negação é auditada. Não recebe `organization_id`. Comandos com `request_id` (idempotência), como nas outras funções. Toda operação que muda estado ou revela a senha exige `justification` de 5 a 500 caracteres (`JUSTIFICATION_REQUIRED`), guardada na auditoria (constituição, princípio III).

| Operação | Entrada | Saída e regras |
|---|---|---|
| `list_enrollments` | `status?` (`pending`, `approved`, `refused`, `expired`, `returned`), `conflict?`, `offset`, `limit` (até 100) | pedidos com código, situação, marca de conflito, primeira e última chamada, chamadas, sinal, rede, firmware, tenant (nome), decisão, `last_organization` (nome do último tenant) e `networks_cleared` (`last_organization_id` nulo); e `rate_limited_last_24h` |
| `list_tenants_for_seals` | — | tenants ativos (id e nome) para o seletor da aprovação |
| `approve_enrollment` | `request_id`, `enrollment_id`, `organization_id`, `justification` (5 a 500), `expected_updated_at` | `pending`, `returned` ou `refused` → `approved`; cria a linha ativa em `seal_devices` no tenant e avisa o tenant em tempo real. Recusa: `ENROLLMENT_CONFLICT` (pedido com conflito), `NETWORKS_NOT_CLEARED` (tenant diferente de `last_organization_id` enquanto ele não for nulo; RN-006), `TENANT_INACTIVE`, `INVALID_STATE`, `STALE`, `JUSTIFICATION_REQUIRED` |
| `refuse_enrollment` | `request_id`, `enrollment_id`, `justification` (5 a 500), `expected_updated_at` | `pending` → `refused`. Recusa: `JUSTIFICATION_REQUIRED`, `INVALID_STATE`, `STALE` |
| `replace_enrollment_key` | `request_id`, `enrollment_id`, `keep_current?` (padrão `false`), `justification` (5 a 500), `expected_updated_at` | só com marca de conflito e fora de `approved`. Sem `keep_current`: `key_hash` passa a ser a `conflict_key_hash` e a situação vira `pending`. Com `keep_current`: só limpa a marca. Auditado como `seal.enrollment_key_replace`, sem as chaves. Recusa: `INVALID_STATE` (sem conflito ou em `approved`), `STALE`, `JUSTIFICATION_REQUIRED` |
| `withdraw_device` | `request_id`, `enrollment_id`, `forget_networks?` (`extras` ou `all`, padrão `extras`), `justification` (5 a 500), `expected_updated_at` | `approved` → `pending`; inativa a linha (`withdrawn`) pelo auxiliar comum (vínculo, comandos, vigilância e alertas; ver `data-model.md`), marca `forget_networks` com o valor escolhido, mantém `last_organization_id` e avisa o tenant. Recusa: `CYLINDER_IN_TRIP`, `INVALID_STATE`, `JUSTIFICATION_REQUIRED`, `STALE` |
| `request_forget_networks` | `request_id`, `enrollment_id`, `justification` (5 a 500), `expected_updated_at` | fora de `approved` e com `last_organization_id` preenchido: marca `forget_networks = 'all'` e `forget_networks_requested_at`; o lacre recebe a marca no próximo `202` e confirma com `networks_forgotten`. Auditado como `seal.networks_forget_request`. Recusa: `INVALID_STATE` (em `approved` ou sem `last_organization_id`), `STALE`, `JUSTIFICATION_REQUIRED` |
| `reveal_portal_password` | `request_id`, `justification` (5 a 500) | `{ "password": "…" }`; auditado com a justificativa, nunca com a senha. Recusa: `JUSTIFICATION_REQUIRED`; `NOT_CONFIGURED` sem o segredo no Vault |

## `manage-seals` (tenant), mudanças

| Operação | Mudança |
|---|---|
| `return_device` | **nova**. `seal.admin`, `request_id`, `device_id`, `justification` (5 a 500). Inativa a linha (`returned`) pelo auxiliar comum (vínculo, comandos, vigilância e alertas), marca `forget_networks = 'all'`, devolve o pedido à fila do Master e avisa o tenant em tempo real. Recusa: `CYLINDER_IN_TRIP`, `JUSTIFICATION_REQUIRED`, `NOT_FOUND` |
| `create_device`, `rotate_device_key`, `deactivate_device` | **saem** do catálogo da borda (RF-018); as funções do banco ficam para os testes da Spec 012 |

## `query-seals` (tenant), mudanças

- `list_seals` e `get_seal` passam a trazer `approved_at` e `ready_to_bind` (ativo e sem cilindro). Linhas inativas de destinações anteriores só aparecem com o filtro de histórico.
