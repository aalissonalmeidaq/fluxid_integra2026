# Contrato: permissões e papéis

**Atende**: RF-039, RF-049, RF-030, CA-001

## Permissões novas (escopo `tenant`, `tenant_delegable`, não críticas)

| Código | Descrição | Operações |
|---|---|---|
| `customer.read` | Ver clientes e unidades | listas, detalhes e busca de clientes e unidades |
| `customer.write` | Cadastrar e editar clientes e unidades | criar e editar cliente, contatos e unidade; **consultar CEP**; ver telefone e e-mail dos contatos |
| `customer.deactivate` | Inativar e reativar clientes e unidades | inativar, reativar e prévia da cascata |
| `customer.history` | Ver o histórico de clientes e unidades | `history` de `customer` e `site` |
| `customer.document` | Ver o CPF completo de cliente pessoa física | `reveal_document` de cliente |
| `customer.anonymize` | Anonimizar dados pessoais de cliente pessoa física e de contatos (crítica, exige MFA) | `anonymize_customer`, `anonymize_contact` |
| `geofence.read` | Ver geocercas | listas, detalhes, "Testar um ponto" e consulta de ponto dentro |
| `geofence.write` | Cadastrar e editar geocercas | criar e editar |
| `geofence.deactivate` | Inativar e reativar geocercas | inativar e reativar |
| `geofence.history` | Ver o histórico de geocercas | `history` de `geofence` |
| `vehicle.read` | Ver veículos | listas e detalhes |
| `vehicle.write` | Cadastrar e editar veículos | criar e editar |
| `vehicle.deactivate` | Mudar a situação de veículos | disponível, em manutenção e inativo |
| `vehicle.history` | Ver o histórico de veículos | `history` de `vehicle` |
| `driver.read` | Ver motoristas (documentos mascarados) | listas e detalhes |
| `driver.write` | Cadastrar e editar motoristas e vínculos | criar, editar, vincular e desvincular usuário, listar usuários vinculáveis |
| `driver.deactivate` | Inativar e reativar motoristas | inativar e reativar |
| `driver.history` | Ver o histórico de motoristas | `history` de `driver` |
| `driver.document` | Ver o CPF e a CNH completos de motorista | `reveal_document` de motorista |
| `driver.anonymize` | Anonimizar dados pessoais de motorista (crítica, exige MFA) | `anonymize_driver` |

Total: **20** permissões. `customer.anonymize` e `driver.anonymize` são marcadas `critical = true` no catálogo. Identificadores de catálogo continuam o padrão `40000000-0000-0000-0000-0000000000NN`, a partir de `...020` (as de cilindros terminam em `...016`).

## Papéis padrão

| Papel | Permissões da Fase 3 |
|---|---|
| `tenant_admin` | todas as 20 |
| `stock_operator` | `customer.read`, `geofence.read`, `vehicle.read`, `driver.read` |
| `technical_operator` | `customer.read`, `vehicle.read` |
| `tenant_auditor` | `customer.read`, `customer.history`, `geofence.read`, `geofence.history`, `vehicle.read`, `vehicle.history`, `driver.read`, `driver.history` (sem `*.document` nem `*.anonymize`) |
| `driver` | nenhuma |
| `master_fluxid` (global) | todas as ativas, no escopo da organização proprietária |

`customer.document`, `driver.document`, `customer.anonymize` e `driver.anonymize` só existem no `tenant_admin`, por decisão da clarificação de 07/10/2026. Um papel personalizado só as recebe se o administrador as atribuir de forma explícita.

## Entrega por migration

- `bootstrap_tenant_roles` é substituído de forma idempotente para conceder as permissões acima aos papéis padrão de organizações **novas**.
- Os tenants existentes recebem as concessões por `insert ... on conflict do nothing`, sem remover nada.
- Nenhum papel existente perde permissão (premissa 8).
- Teste de contrato: o conjunto de códigos na migration, no catálogo de telas e nos manipuladores é o mesmo; nenhuma operação de comando é acessível apenas por `*.read`.

## Regras de decisão

- A decisão final é sempre do servidor (`private.actor_has_permission`); a tela só esconde o que a pessoa não pode usar.
- Operações que dependem de duas permissões são conferidas pelas duas (por exemplo, criar geocerca exige `geofence.write` e a unidade pertencer à organização da sessão).
- `list_linkable_users` exige `driver.write` e nunca devolve e-mail.
