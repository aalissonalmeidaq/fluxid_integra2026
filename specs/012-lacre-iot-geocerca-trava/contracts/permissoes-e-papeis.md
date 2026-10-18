# Contrato: permissões e papéis

**Atende**: RF-025, RF-038, RN-005, CA-001

Três permissões novas, inseridas como na Spec 008 (`public.permissions`, com identificadores fixos `40000000-0000-0000-0000-00000000005x`), e `private.bootstrap_tenant_roles` substituída mantendo **todos** os mapeamentos anteriores. As organizações que já existem recebem o mapeamento novo na própria migration. Nenhum papel perde permissão.

| Código | Descrição | Delegável | Crítica |
|---|---|---|---|
| `seal.read` | Ver lacres, posições, comandos, violações e alertas, e receber as notificações | `tenant_delegable` | não |
| `seal.operate` | Vincular e desvincular lacres, pedir travar ou destravar, reconhecer e encerrar alertas | `tenant_delegable` | não |
| `seal.admin` | Cadastrar, editar, desativar e trocar a chave de dispositivos, e alterar as redes Wi-Fi dos lacres | `tenant_delegable` | **sim** |

## Papéis padrão

| Papel | `seal.read` | `seal.operate` | `seal.admin` |
|---|:-:|:-:|:-:|
| Administrador do tenant (`tenant_admin`) | sim | sim | sim |
| Gestor logístico (`logistics_manager`) | sim | sim | — |
| Operador de estoque (`stock_operator`) | sim | sim | — |
| Auditor do tenant (`tenant_auditor`) | sim | — | — |
| Operador técnico, Motorista | — | — | — |

## Exigências além da permissão

| Ação | Exigência |
|---|---|
| Destravar fora da regra de entrega, depois de violação ou de trava por perda de comunicação | `seal.operate`, justificativa de 5 a 500 caracteres e sessão `aal2` (`MFA_REQUIRED` sem ela) |
| Travar ou destravar manualmente nos demais casos | `seal.operate` e justificativa |
| Alterar redes com viagem em andamento ou vigilância | `seal.admin` e `confirm_risk: true` |
| Encerrar alerta | `seal.operate` e observação de 5 a 500 caracteres |
| Receber notificação | `seal.read` **no momento do envio**; quem perde a permissão ou o vínculo tem as inscrições daquela organização revogadas na hora (RF-036d) |
| Ver o canal de tempo real `seals:<organização>` | `seal.read` na organização do tópico (política de `realtime.messages` por função `security definer` própria) |

## Telas no menu

| Tela | Caminho | Exige |
|---|---|---|
| Lacres | `/lacres` | `seal.read` |
| Alertas | `/alertas` | `seal.read` (hoje sem exigência e com dados de exemplo; passa a ser a lista real) |

O catálogo é conferido por `tests/contract/seals-permissions.test.ts` e `supabase/tests/012_permissions.test.sql`.
