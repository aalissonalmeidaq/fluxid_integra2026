# Contrato — Avisos por e-mail

## Categorias

- `proximity_confirmed`
- `seal_high_critical`
- `seal_recovered`

Todas começam desativadas. Um envio exige simultaneamente: categoria liberada no tenant, opt-in do destinatário, vínculo ativo, a permissão exata abaixo e evento elegível no mesmo tenant.

| Categoria | Permissão atual do destinatário | Elegibilidade adicional |
|---|---|---|
| `proximity_confirmed` | `tracking.read` | ocorrência ao vivo ou retrospectiva enquanto a viagem ainda está ativa |
| `seal_high_critical` | `seal.read` | abertura de alerta de lacre com severidade `high` ou `critical` |
| `seal_recovered` | `seal.read` | recuperação de alerta alto/crítico anteriormente elegível |

`notification_category.manage` permite administrar a liberação da categoria, mas não torna seu titular destinatário. Retirar a liberação cancela o que ainda não saiu e desliga a escolha de quem tinha optado; uma nova liberação exige nova escolha da pessoa (validação humana de 27/10/2026). A auditoria registra só a quantidade de escolhas desligadas. A perda do vínculo ou da permissão indicada cancela o item ainda não enviado.

## Administração

`set_notification_categories(organization_id, categories, version, request_id)` exige `notification_category.manage`, versionamento otimista e auditoria. Remover uma categoria cancela itens pendentes ainda não reclamados; não apaga histórico de entrega.

`get_notification_categories(organization_id)` devolve categorias, estado e versão sem listar preferências individuais.

## Preferência pessoal

`set_my_email_preferences(organization_id, categories, request_id)` permite somente ao próprio usuário e somente categorias liberadas. Ausência equivale a desligado. `get_my_email_preferences` retorna `allowed`, `enabled` e explicação quando indisponível.

## Elegibilidade e deduplicação

Ao abrir afastamento ao vivo ou alerta de lacre alto/crítico, e ao recuperar evento elegível, o servidor cria no máximo um item por `(tenant, occurrence, transition, recipient)`. Afastamento retrospectivo de viagem encerrada, alerta médio/informativo e pessoa sem permissão não criam item.

## Processamento

A função servidora reclama lote com lock curto, revalida elegibilidade e chama `EmailProvider.send`. Timeout/erro transitório agenda retry com backoff; erro permanente vira `failed`; nenhuma falha modifica o alerta. Repetir claim/report é idempotente.

Segredos do provedor vivem somente no ambiente/Vault. A implantação permanece bloqueada até o responsável selecionar e autorizar um provedor; o contrato e os testes usam porta/fake sem criar conta externa.

## Conteúdo mínimo

Assunto identifica categoria e empresa. Corpo contém instante, severidade/estado, tipo do alerta de lacre por extenso (as mesmas palavras da tela; tipo desconhecido é omitido), identificador operacional mínimo e link para autenticação/detalhe. Não contém coordenadas, endereço preciso, token, URL assinada, observação privada nem dump do evento. Opt-out direciona às preferências autenticadas.

## Observabilidade

O detalhe autorizado do alerta ou da ocorrência mostra `pending | sent | retry | failed | cancelled`, instante e código sanitizado para quem pode consultar o evento. Uma falha permanece visível ali e nunca muda, encerra ou duplica o alerta original. Logs usam IDs internos e código; auditoria registra mudança de categoria, não o corpo. Referência do provedor deve ser opaca.

## Erros

`CATEGORY_NOT_ALLOWED`, `ACCESS_DENIED`, `NOT_FOUND`, `VERSION_CONFLICT`, `PROVIDER_UNAVAILABLE`, `DELIVERY_REJECTED`.
