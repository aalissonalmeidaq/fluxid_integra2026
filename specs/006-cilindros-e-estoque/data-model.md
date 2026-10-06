# Modelo de dados: Cilindros, identificadores, estoque e histórico

**Feature**: `006-cilindros-e-estoque` | **Data**: 05/10/2026

Todas as tabelas estão em `public`, têm `organization_id not null references public.organizations(id)`, RLS ativada e nenhuma exclusão. Nomes de colunas em inglês (identificadores de código); textos exibidos em português.

## `cylinder_types` — catálogo de tipos (RF-003)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `organization_id` | uuid | RLS |
| `gas` | text | 2 a 80 caracteres |
| `capacity_value` | numeric(10,2) | maior que 0 |
| `capacity_unit` | text | `l`, `m3` ou `kg` |
| `classification` | text | `medicinal` ou `industrial` |
| `active` | boolean | padrão `true`; tipo não se exclui |
| `created_at`, `created_by` | timestamptz, uuid | |

Único: (`organization_id`, `lower(gas)`, `capacity_value`, `capacity_unit`, `classification`).

## `cylinders` — o casco individual (RF-001, RF-002, RF-004, RF-006, RF-018)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid | RLS |
| `cylinder_type_id` | uuid | referencia `cylinder_types`; mesmo `organization_id` (gatilho/FK composta) |
| `serial_number` | text | obrigatório, 1 a 60 caracteres, como digitado |
| `serial_normalized` | text | `upper(btrim(serial_number))`, gerado |
| `manufacturer` | text | opcional, até 120 |
| `manufacture_year` | smallint | opcional, entre 1900 e o ano corrente |
| `working_pressure_bar` | numeric(7,2) | opcional, maior que 0 |
| `notes` | text | opcional, até 500 |
| `status` | text | `active` ou `inactive` (situação **cadastral**) |
| `inactivation_reason` | text | `written_off`, `lost`, `condemned`, `other`; obrigatório se `inactive` |
| `stock_status` | text | `in_stock` ou `out_of_stock` (situação de **estoque**), padrão `out_of_stock` |
| `hydro_last_result` | text | `approved`, `rejected` ou nulo; denormalizado das RPCs de teste |
| `hydro_next_due_on` | date | denormalizado; nulo se sem teste ou reprovado |
| `version` | bigint | padrão 1; incrementa a cada edição e a cada mudança de situação cadastral ou de estoque (inativar, reativar, entrada), para concorrência otimista (RF-004); não incrementa ao registrar teste ou identificador |
| `created_at`, `created_by`, `updated_at` | | |

- Único: (`organization_id`, `serial_normalized`) entre ativos e inativos (RF-002).
- Restrição: `status = 'inactive'` implica `stock_status = 'out_of_stock'` (a inativação tira do estoque, RF-016).
- Índices: GIN trigrama em `serial_normalized` (busca por parte do número); B-tree em (`organization_id`, `status`, `stock_status`) e em (`organization_id`, `hydro_next_due_on`) para filtros.
- A **situação do teste não é coluna**: é calculada a partir de `hydro_last_result` e `hydro_next_due_on` e da data de hoje (`research.md`, decisão 8).
- Gatilho `before delete` recusa sempre.

## `cylinder_identifiers` — identificadores (RF-007 a RF-012)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid | RLS |
| `cylinder_id` | uuid | referencia `cylinders` |
| `kind` | text | `qr_code`, `data_matrix`, `nfc_tag` ou `hull_number` |
| `value` | text | 1 a 200 caracteres, sem quebra de linha |
| `value_normalized` | text | `upper(btrim(value))`, gerado |
| `status` | text | `active` ou `deactivated` |
| `deactivated_at`, `deactivated_by`, `deactivation_justification` | | obrigatórios (justificativa de 5 a 500 caracteres) quando `deactivated` |
| `transferred_to_identifier_id` | uuid | preenchido na linha antiga quando o valor é transferido |
| `created_at`, `created_by` | | |

- Único parcial: (`organization_id`, `value_normalized`) onde `status = 'active'` (RF-008).
- Índice de busca: o próprio índice único parcial atende a busca por identificador ativo (RF-012); B-tree adicional em (`organization_id`, `value_normalized`) cobre a checagem de "valor já existiu" e a leitura de identificador desativado.
- Transição permitida: `active → deactivated` (uma vez). Nenhuma outra alteração; `delete` recusado.

## `cylinder_tests` — testes hidrostáticos (RF-019, RF-020, RF-022)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | |
| `organization_id`, `cylinder_id` | uuid | RLS |
| `performed_on` | date | obrigatória, não futura |
| `result` | text | `approved` ou `rejected` |
| `report_number` | text | opcional, até 60 |
| `executor` | text | obrigatório, 2 a 120 |
| `next_due_on` | date | obrigatória se `approved`; posterior a `performed_on`; até 10 anos |
| `notes` | text | opcional, até 500 |
| `rectifies_test_id` | uuid | referencia `cylinder_tests` do mesmo cilindro; nulo no registro original |
| `rectification_justification` | text | obrigatória se `rectifies_test_id` não é nulo (5 a 500) |
| `created_at`, `created_by` | | |

- Somente inserção: `update` e `delete` recusados para todo papel.
- Um registro só pode ser retificado enquanto nenhum outro o referencia (único parcial em `rectifies_test_id`).
- Teste efetivo: o de maior `performed_on` (desempate por `created_at`, depois `id`) que não foi retificado.

## `cylinder_events` — histórico imutável (RF-023 a RF-026)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | |
| `organization_id`, `cylinder_id` | uuid | RLS |
| `sequence` | integer | por cilindro, atribuída sob bloqueio da linha do cilindro; `unique (cylinder_id, sequence)` |
| `event_type` | text | ver tabela abaixo |
| `actor_user_id`, `actor_session_id` | uuid | autoria |
| `occurred_at` | timestamptz | `now()`; informativo, não ordena |
| `justification` | text | quando houver |
| `data` | jsonb | dados do fato (sem segredos; sem dados pessoais além do `actor_user_id`) |
| `references_event_id` | uuid | para correções que apontam o evento anterior |

Somente inserção; `update` e `delete` recusados para todo papel, inclusive `service_role` (CA-004).

| `event_type` | Quando | Dados principais (`data`) |
|---|---|---|
| `cylinder_created` | cadastro | campos cadastrais iniciais |
| `cylinder_updated` | edição | valores anteriores e novos |
| `cylinder_inactivated` | inativação | motivo; `was_in_stock` |
| `cylinder_reactivated` | reativação | — |
| `identifier_added` | acréscimo | `kind`, `identifier_id` (valor só no cilindro) |
| `identifier_deactivated` | desativação | `identifier_id` |
| `identifier_transferred_out` / `identifier_transferred_in` | transferência | origem e destino; um evento em cada cilindro |
| `stock_in` | entrada | `identifier_id`, situação do teste no momento (RF-017) |
| `stock_out_inactivation` | saída por inativação | `reason` |
| `hydrostatic_test_registered` | teste | `test_id`, resultado, próxima data |
| `hydrostatic_test_rectified` | retificação | `test_id`, `rectifies_test_id` |

Ordem de leitura: `sequence` decrescente (mais recente primeiro) ou crescente (inverter). Filtros: `event_type` e período sobre `occurred_at`. Paginação por cursor em `sequence`.

## Tabelas existentes que mudam

- `permissions`: 7 linhas novas (`research.md`, decisão 3).
- `roles` / `role_permissions`: papel `tenant_auditor` e concessões; `bootstrap_tenant_roles` atualizado; tenants existentes atualizados de forma idempotente.
- `audit_logs`: sem mudança de estrutura. Novas `action` (`cylinder.create`, `cylinder.update`, `cylinder.inactivate`, `cylinder.reactivate`, `cylinder.identifier_add`, `cylinder.identifier_deactivate`, `cylinder.identifier_transfer`, `cylinder.stock_in`, `cylinder.test_register`, `cylinder.test_rectify`, `cylinder.type_save`). `metadata` sem segredos e sem valores de identificador completos além do necessário.
- `private.idempotency_ledger`: operação `cylinder.stock_in`.

## Transições de estado

```text
Cadastral:  active ──inativar(motivo, justificativa)──▶ inactive
            inactive ──reativar(justificativa)──▶ active   (volta fora do estoque)

Estoque:    out_of_stock ──entrada(chave, identificador ativo, cilindro ativo)──▶ in_stock
            in_stock ──inativar o cilindro──▶ out_of_stock   (evento stock_out_inactivation)

Identificador:  active ──desativar(justificativa)──▶ deactivated
                deactivated ──transferir(confirmação, justificativa)──▶ (nova linha active no destino;
                                                                         a antiga permanece deactivated)

Teste (calculada): sem_teste | reprovado | vencido | a_vencer (0..30 dias) | em_dia (>30 dias)
```

As três situações (cadastral, estoque, teste) são independentes (Constituição, princípio IV; RF-018), exceto pela regra declarada: cilindro inativo está fora do estoque.

## Regras de visibilidade e RLS

- `select`: membro ativo, organização ativa, com `cylinder.read` (e `cylinder.history` para `cylinder_events`), via `private.has_permission`.
- `insert`, `update`, `delete`: revogados de `anon` e `authenticated`; só as RPCs `security definer` escrevem.
- Todas as RPCs filtram por `p_organization` e conferem permissão no início. Cilindro de outra organização e cilindro inexistente produzem a mesma resposta.
