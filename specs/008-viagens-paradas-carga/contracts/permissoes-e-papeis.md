# Contrato: permissões e papéis

**Atende**: RF-028, RF-030 a RF-032, CA-001, CA-005, CA-007

## Permissões novas (8)

Identificadores no padrão do catálogo (`40000000-0000-0000-0000-0000000000NN`), continuando depois de `...039`.

| Código | Id | Descrição | Crítica | Libera |
|---|---|---|---|---|
| `trip.read` | `...040` | Ver viagens | não | `list_trips`, `get_trip`, `trips_of_*` |
| `trip.write` | `...041` | Planejar e editar viagens | não | `create_trip`, `update_trip`, `trip_options`, `list_eligible_cylinders` |
| `trip.operate` | `...042` | Conferir, iniciar, registrar entrega e concluir | não | `start_loading`, `revert_loading`, `check_item`, `uncheck_item`, `start_trip`, `arrive_stop`, `register_delivery`, `return_item` (com exceção), `complete_trip` |
| `trip.cancel` | `...043` | Cancelar viagens | não | `cancel_trip` |
| `trip.unlock` | `...044` | Registrar o desbloqueio de cilindros | não | `register_unlock` |
| `trip.exception` | `...045` | Aprovar exceções (retirar item, retornar ao estoque, cancelar em andamento, desbloqueio excepcional) | **sim** | complementa as operações acima |
| `trip.history` | `...046` | Ver o histórico de viagens | não | `trip_history` |
| `trip.recipient` | `...047` | Ver o nome e a função do recebedor | não | campos do recebedor em `get_trip` |

`trip.exception` é crítica: só o administrador do tenant a recebe por padrão e a delegação segue a regra das permissões críticas da Spec 002. O segundo fator (`aal2`) é exigido **somente** no desbloqueio excepcional (RF-019).

## Papéis padrão

Papel novo **Gestor logístico** (`logistics_manager`, sistema), criado para cada tenant novo e acrescentado aos existentes pela mesma migration, sem retirar permissão de nenhum papel atual.

| Papel | Permissões de viagem | Outras que passam a ter |
|---|---|---|
| `tenant_admin` | todas as oito | já tem as demais |
| `logistics_manager` | `trip.read`, `trip.write`, `trip.operate`, `trip.cancel`, `trip.unlock`, `trip.history`, `trip.recipient` | `cylinder.read`, `customer.read`, `geofence.read`, `vehicle.read`, `driver.read` |
| `stock_operator` | `trip.read`, `trip.operate` (separa e confere a carga), `trip.history` | mantém as atuais |
| `technical_operator` | nenhuma | mantém as atuais |
| `tenant_auditor` | `trip.read`, `trip.history` (sem `trip.recipient`) | mantém as atuais |
| `driver` | nenhuma nesta spec | mantém as atuais |

Esta spec acrescenta **8** permissões ao catálogo e **1** papel padrão (de 5 para 6).

## Regras de leitura

- Quem não tem `trip.recipient` vê `"(restrito)"` no lugar do nome e da função do recebedor, na tela e na resposta do servidor.
- `trips_of_cylinder` e `trips_of_site` exigem, além de `trip.read`, a permissão de leitura do cadastro de origem.
- Nenhuma permissão de viagem permite excluir: não existe operação de exclusão.
