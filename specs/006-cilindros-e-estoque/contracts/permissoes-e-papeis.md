# Contrato: permissões e papéis

**Atende**: RF-027, RF-039, premissa 8

## Permissões novas (escopo `tenant`, delegáveis, não críticas)

| Código | Descrição | Autoriza |
|---|---|---|
| `cylinder.read` | Ver cilindros | lista, detalhe, busca, catálogo de tipos |
| `cylinder.write` | Cadastrar e editar cilindros | `create`, `update`, `save_type` |
| `cylinder.deactivate` | Inativar e reativar cilindros | `inactivate`, `reactivate` |
| `cylinder.identifier` | Gerenciar identificadores | `add_identifier`, `deactivate_identifier`, `transfer_identifier` |
| `cylinder.stock_in` | Registrar entrada no estoque | `stock_in` |
| `cylinder.test` | Registrar teste hidrostático | `register_test`, `rectify_test` |
| `cylinder.history` | Ver histórico | `history` |

## Concessão aos papéis padrão

| Permissão | Administrador do tenant (`tenant_admin`) | Operador de estoque (`stock_operator`) | Operador técnico (`technical_operator`) | Auditor (`tenant_auditor`, novo) |
|---|:-:|:-:|:-:|:-:|
| `cylinder.read` | sim | sim | sim | sim |
| `cylinder.write` | sim | sim | — | — |
| `cylinder.deactivate` | sim | — | — | — |
| `cylinder.identifier` | sim | — | sim | — |
| `cylinder.stock_in` | sim | sim | — | — |
| `cylinder.test` | sim | — | sim | — |
| `cylinder.history` | sim | sim | sim | sim |

- `driver` e os papéis globais (`master_fluxid`, `admin_fluxid`) não recebem permissões de cilindro. O Administrador FluxID só chega aos dados de uma organização com vínculo ativo e papel que conceda a permissão (spec, atores).
- A migration é idempotente (`on conflict do nothing`) e atualiza os tenants existentes; **nenhum papel existente perde permissão**.
- Papéis personalizados do tenant podem receber as permissões pela tela de papéis da Spec 004 (são delegáveis).

## Menu e rotas (Spec 004)

| Tela | Caminho | Permissão exigida | AAL2 |
|---|---|---|---|
| Cilindros | `/cilindros` | `cylinder.read` | não |
| Entrada no estoque | `/estoque/entrada` | `cylinder.stock_in` | não |

Sub-rotas: `/cilindros/novo` exige `cylinder.write`; `/cilindros/<id>` exige `cylinder.read`; a aba/bloco de histórico exige `cylinder.history`. A tela só **oferece** cada ação a quem a tem; a decisão final é do servidor. A visibilidade das telas existentes não muda.
