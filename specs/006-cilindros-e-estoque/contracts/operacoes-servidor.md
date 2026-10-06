# Contrato: operações do servidor

**Atende**: RF-001 a RF-026, RF-038 a RF-043, CA-001 a CA-005

Duas Edge Functions, ambas `POST` com `authorization: Bearer <token da sessão>` e `apikey` publicável (padrão de `createFunctionTransport`). Corpo JSON com `operation` e `organization_id` (contexto; a RPC confere o vínculo, o corpo nunca prova acesso). Resposta JSON `{ code, ... }`. Nenhuma operação de exclusão existe.

## Convenções

| Código | HTTP | Significado |
|---|---|---|
| `AUTH_REQUIRED` | 401 | sem token válido, sessão vencida ou ator sem permissão/vínculo na organização |
| `ACCESS_DENIED` | 403 | autenticado, mas sem a permissão da operação |
| `NOT_FOUND` | 404 | cilindro/identificador inexistente **ou de outra organização** (mesma resposta, RF-042) |
| `VALIDATION_FAILED` | 400 | corpo inválido; traz `fields: [{ field, message }]` |
| `JUSTIFICATION_REQUIRED` | 400 | justificativa ausente onde obrigatória |
| `SERIAL_CONFLICT` | 409 | número de série já usado na organização; traz `cylinder_id` do dono |
| `IDENTIFIER_CONFLICT` | 409 | identificador ativo em outro cilindro da organização; traz `cylinder_id` do dono |
| `IDENTIFIER_UNAVAILABLE` | 409 | valor já existiu na organização e só pode ser reutilizado por transferência |
| `VERSION_CONFLICT` | 409 | `expected_version` antigo; orienta recarregar |
| `CYLINDER_INACTIVE` | 409 | operação exige cilindro ativo |
| `ALREADY_IN_STOCK` | 409 | cilindro já está em estoque |
| `ALREADY_INACTIVE` | 409 | cilindro já estava inativo (inativação simultânea) |
| `IDEMPOTENCY_PAYLOAD_CONFLICT` | 409 | mesma chave com pedido diferente |
| `METHOD_NOT_ALLOWED` | 405 | método diferente de `POST` |
| `INTERNAL_ERROR` | 500 | falha inesperada, sem detalhe |

Negações e falhas de comando são auditadas como `denied` ou `failed` pelo manipulador, sem alvo de outra organização. Sucessos são auditados **na mesma transação** da RPC.

## `query-cylinders` (somente leitura, sem auditoria de sucesso)

| `operation` | Permissão | Entrada | Saída |
|---|---|---|---|
| `list` | `cylinder.read` | `search?`, `status?` (`active` padrão, `inactive` ou `all`), `stock_status?`, `hydro_status?`, `cylinder_type_id?`, `sort?`, `cursor?`, `limit?` (1–100, padrão 25) | `{ code: 'LISTED', items[], total, next }` |
| `get` | `cylinder.read` | `cylinder_id` | `{ code: 'FOUND', cylinder, identifiers[], tests[], hydro_status }` |
| `lookup` | `cylinder.read` | `identifier_value` | `{ code: 'FOUND', cylinder, identifier }` ou `{ code: 'NOT_FOUND' }`; para identificador desativado informa `deactivated: true` e o cilindro a que pertencia (mesma organização) |
| `history` | `cylinder.history` | `cylinder_id`, `event_type?`, `from?`, `to?`, `order?` (`desc` padrão), `cursor?`, `limit?` | `{ code: 'LISTED', events[], next }` |
| `catalog` | `cylinder.read` | — | `{ code: 'LISTED', types[] }` |

`search` casa o identificador (igualdade normalizada) **ou** parte do número de série (trigrama). Cada item de `list` traz `id`, `serial_number`, tipo, `status`, `stock_status`, `hydro_status`, `active_identifier_count` (0 mostra "Sem identificador") e `version`.

## `manage-cylinders` (comando, auditado, exige conexão)

| `operation` | Permissão | Entrada principal | Evento / auditoria |
|---|---|---|---|
| `create` | `cylinder.write` | dados cadastrais + `identifier { kind, value }` inicial | `cylinder_created` + `identifier_added` / `cylinder.create` |
| `update` | `cylinder.write` | `cylinder_id`, `expected_version`, campos; só cilindro ativo (`CYLINDER_INACTIVE` se inativo); incrementa `version` | `cylinder_updated` (valores anteriores e novos) / `cylinder.update` |
| `save_type` | `cylinder.write` | `gas`, `capacity_value`, `capacity_unit`, `classification`, `type_id?`, `active?` | — / `cylinder.type_save` |
| `inactivate` | `cylinder.deactivate` | `cylinder_id`, `reason`, `justification` | `cylinder_inactivated` (+ `stock_out_inactivation` se estava em estoque) / `cylinder.inactivate` |
| `reactivate` | `cylinder.deactivate` | `cylinder_id`, `justification` | `cylinder_reactivated` / `cylinder.reactivate` |
| `add_identifier` | `cylinder.identifier` | `cylinder_id`, `kind`, `value` | `identifier_added` / `cylinder.identifier_add` |
| `deactivate_identifier` | `cylinder.identifier` | `identifier_id`, `justification` | `identifier_deactivated` / `cylinder.identifier_deactivate` |
| `transfer_identifier` | `cylinder.identifier` | `value`, `target_cylinder_id`, `justification`, `confirmed: true` | `identifier_transferred_out` + `identifier_transferred_in` / `cylinder.identifier_transfer` |
| `stock_in` | `cylinder.stock_in` | `identifier_value`, `operation_key` (UUID) | `stock_in` / `cylinder.stock_in` |
| `register_test` | `cylinder.test` | `cylinder_id`, `performed_on`, `result`, `report_number?`, `executor`, `next_due_on?`, `notes?` | `hydrostatic_test_registered` / `cylinder.test_register` |
| `rectify_test` | `cylinder.test` | `test_id`, mesmos campos, `justification` | `hydrostatic_test_rectified` / `cylinder.test_rectify` |

### `stock_in` em detalhe (RF-013 a RF-017, CA-002)

1. Normaliza o valor, resolve o cilindro pelo identificador **ativo** na organização; senão `NOT_FOUND` (ou, se o valor está desativado, `NOT_FOUND` com `deactivated` e o cilindro de origem).
2. `claim_idempotency_key(organization, operation_key, actor, 'cylinder.stock_in', hash)`; repetição devolve o `result_payload` da primeira vez com `replayed: true`.
3. Cilindro inativo → `CYLINDER_INACTIVE`; já em estoque (com outra chave) → `ALREADY_IN_STOCK`, sem evento.
4. Teste vencido ou reprovado **não impede**; o evento guarda `hydro_status` no momento e a resposta traz `warning: 'hydro_expired' | 'hydro_rejected'`.
5. Resposta: `{ code: 'STOCKED', replayed, cylinder, event_sequence, hydro_status, warning? }`.

## Regras comuns

- `version` do cilindro sobe a cada `update`, `inactivate`, `reactivate` e `stock_in`; não sobe em `register_test`, `rectify_test` nem nas operações de identificador.
- A consulta de permissões do ator (`query-permissions`, Spec 004) é o que a tela de cadastro usa para negar a abertura sem permissão; as operações de comando negam sempre pelo servidor.

- Ator, sessão e organização são resolvidos no servidor; o corpo nunca escolhe o ator.
- Toda RPC confere `private.actor_has_permission` primeiro e filtra por organização.
- Justificativa de 5 a 500 caracteres onde a spec exigir (inativar, reativar, desativar e transferir identificador, retificar teste).
- Nada de valor de identificador, justificativa livre ou dado pessoal em log de servidor; a auditoria guarda `metadata` mínima.
- Nenhuma operação aceita `delete`; operação desconhecida → `VALIDATION_FAILED` e auditoria `denied`.
