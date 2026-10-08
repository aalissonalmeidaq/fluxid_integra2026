# Contrato: operações do servidor

**Atende**: RF-001 a RF-053, CA-001 a CA-010

Duas Edge Functions de domínio, ambas `POST` com `authorization: Bearer <token da sessão>` e `apikey` publicável (padrão de `createFunctionTransport`). Corpo JSON com `operation` e `organization_id` (contexto; a RPC confere o vínculo, o corpo nunca prova acesso). Resposta JSON `{ code, ... }`. **Nenhuma operação de exclusão existe.** A consulta de CEP é uma terceira função, descrita em [consulta-de-cep.md](./consulta-de-cep.md).

## Convenções

| Código | HTTP | Significado |
|---|---|---|
| `AUTH_REQUIRED` | 401 | sem token válido, sessão vencida ou ator sem vínculo na organização |
| `ACCESS_DENIED` | 403 | autenticado, mas sem a permissão da operação |
| `NOT_FOUND` | 404 | registro inexistente **ou de outra organização** (mesma resposta, RF-052) |
| `VALIDATION_FAILED` | 400 | corpo inválido; traz `fields: [{ field, message }]` |
| `JUSTIFICATION_REQUIRED` | 400 | justificativa ausente onde obrigatória |
| `DOCUMENT_CONFLICT` | 409 | CNPJ, CPF ou CNH já cadastrado na organização; traz `entity_id` e o **nome** do dono, nunca o documento |
| `PLATE_CONFLICT` | 409 | placa já cadastrada; traz `vehicle_id` e a placa do dono |
| `NAME_CONFLICT` | 409 | nome de unidade (no cliente) ou de geocerca (na unidade) já usado |
| `VERSION_CONFLICT` | 409 | `expected_version` antigo; orienta recarregar |
| `ALREADY_INACTIVE` | 409 | já estava inativo (inativação simultânea) |
| `INACTIVE_RECORD` | 409 | operação exige registro ativo (edição de inativo) |
| `PARENT_INACTIVE` | 409 | reativar ou criar sob cliente ou unidade inativa |
| `CASCADE_CHANGED` | 409 | as quantidades da prévia mudaram; a tela refaz a confirmação |
| `MFA_REQUIRED` | 403 | a operação exige sessão com segundo fator (`aal2`); só a anonimização exige |
| `ANONYMIZED_RECORD` | 409 | o registro foi anonimizado e não aceita edição, reativação, vínculo nem revelação |
| `ALREADY_ANONYMIZED` | 409 | a anonimização já foi feita (repetição) |
| `ACTIVE_RECORD` | 409 | motorista ou cliente pessoa física precisa estar inativo para ser anonimizado |
| `CONFIRMATION_REQUIRED` | 400 | falta `confirmed: true` |
| `USER_NOT_ELIGIBLE` | 409 | usuário sem vínculo ativo, sem o papel `driver`, ou já vinculado a outro motorista |
| `GEOMETRY_INVALID` | 400 | forma fora dos limites ou polígono inválido; traz `reason` (`radius_range`, `vertex_count`, `self_intersection`, `zero_area`, `duplicate_vertex`, `coordinate_range`) |
| `METHOD_NOT_ALLOWED` | 405 | método diferente de `POST` |
| `INTERNAL_ERROR` | 500 | falha inesperada, sem detalhe |

Negações e falhas de comando são auditadas como `denied` ou `failed` pelo manipulador, sem alvo de outra organização. Sucessos são auditados **na mesma transação** da RPC. Respostas que contêm documento revelado levam `Cache-Control: no-store`.

## `query-registry` (somente leitura, sem auditoria de sucesso)

| `operation` | Permissão | Entrada | Saída |
|---|---|---|---|
| `list_customers` | `customer.read` | `search?`, `status?` (`active` padrão, `inactive`, `all`), `segment?`, `state?`, `has_geofence?`, `sort?`, `cursor?`, `limit?` (1–100, padrão 25) | `{ code: 'LISTED', items[], total, next }` |
| `get_customer` | `customer.read` | `customer_id` | `{ code: 'FOUND', customer, contacts[], sites[] }` (cada unidade com contagem de geocercas ativas); `contacts[]` traz `phone` e `email` **só para quem tem `customer.write`**, e para os demais papéis só `name` e `role` |
| `list_sites` | `customer.read` | `customer_id?`, `search?`, `status?`, `cursor?`, `limit?` | `{ code: 'LISTED', items[], total, next }` |
| `get_site` | `customer.read` | `site_id` | `{ code: 'FOUND', site, geofences[] }` |
| `list_geofences` | `geofence.read` | `site_id?`, `customer_id?`, `search?`, `shape?`, `status?`, `cursor?`, `limit?` | `{ code: 'LISTED', items[], total, next }` |
| `get_geofence` | `geofence.read` | `geofence_id` | `{ code: 'FOUND', geofence }` (círculo: centro e raio; polígono: vértices) |
| `geofences_containing_point` | `geofence.read` | `latitude`, `longitude`, `site_id?` | `{ code: 'FOUND', geofences: [{ id, name, shape, site_id }] }`; só ativas da organização, nada gravado |
| `point_in_geofence` | `geofence.read` | `geofence_id`, `latitude`, `longitude` | `{ code: 'FOUND', inside: boolean }`; geocerca inativa responde `INACTIVE_RECORD` |
| `list_vehicles` | `vehicle.read` | `search?`, `status?`, `vehicle_type?`, `licensing_status?`, `sort?`, `cursor?`, `limit?` | `{ code: 'LISTED', items[], total, next }` (cada item com `licensing_status`) |
| `get_vehicle` | `vehicle.read` | `vehicle_id` | `{ code: 'FOUND', vehicle, licensing_status }` |
| `list_drivers` | `driver.read` | `search?`, `status?`, `cnh_status?`, `linked?`, `sort?`, `cursor?`, `limit?` | `{ code: 'LISTED', items[], total, next }` (documentos **mascarados**, `cnh_status`) |
| `get_driver` | `driver.read` | `driver_id` | `{ code: 'FOUND', driver, cnh_status, linked_user? }` (`linked_user: { id, display_name, active }`) |
| `list_linkable_users` | `driver.write` | `search?`, `limit?` | `{ code: 'LISTED', users: [{ id, display_name }] }`; só usuários ativos da organização com o papel `driver` e sem vínculo, sem e-mail |
| `history` | `<área>.history` | `entity_type`, `entity_id`, `event_type?`, `from?`, `to?`, `order?` (`desc` padrão), `cursor?`, `limit?` | `{ code: 'LISTED', events[], next }` |
| `preview_customer_inactivation` | `customer.deactivate` | `customer_id` | `{ code: 'FOUND', sites: n, geofences: n }`; `preview_site_inactivation` devolve `{ geofences: n }` |

`search` casa, por trecho (trigrama) e sem diferenciar caixa, cliente (nome, nome fantasia, cidade de unidade, nome de unidade), geocerca (nome, unidade, cliente), veículo (placa, marca, modelo) e motorista (nome); documento só por **igualdade do valor completo digitado**. Itens de lista nunca trazem CPF, CNH, telefone ou e-mail completos.

## `manage-registry` (comando, auditado, exige conexão)

| `operation` | Permissão | Entrada principal | Evento / auditoria |
|---|---|---|---|
| `create_customer` | `customer.write` | `person_type`, `document`, `legal_name`, `trade_name?`, `segment`, `segment_detail?`, `contacts[]?`, `notes?` | `customer_created` / `customer.create` |
| `update_customer` | `customer.write` (não aceita `person_type`, que é fixo) | `customer_id`, `expected_version`, campos, `contacts[]?` (substitui os contatos não anonimizados; os anonimizados permanecem), e, se o documento mudar, `document` + `justification` | `customer_updated` (+ `document_changed`, `contacts_changed`) / `customer.update` |
| `inactivate_customer` | `customer.deactivate` | `customer_id`, `justification`, `expected_counts { sites, geofences }` | `customer_inactivated` + um evento por unidade e geocerca afetada / `customer.inactivate` (uma auditoria com as contagens) |
| `reactivate_customer` | `customer.deactivate` | `customer_id`, `justification` | `customer_reactivated` (só o cliente) / `customer.reactivate` |
| `create_site` | `customer.write` | `customer_id`, `name`, endereço, `latitude?`, `longitude?`, `coordinates_source?` (`manual` ou `geocoded`, ver `geocodificacao-de-endereco.md`), responsável, janela, instruções | `site_created` / `site.create` |
| `update_site` | `customer.write` | `site_id`, `expected_version`, campos | `site_updated` / `site.update` |
| `inactivate_site` | `customer.deactivate` | `site_id`, `justification`, `expected_counts { geofences }` | `site_inactivated` + eventos das geocercas / `site.inactivate` |
| `reactivate_site` | `customer.deactivate` | `site_id`, `justification` | `site_reactivated` / `site.reactivate` |
| `create_geofence` | `geofence.write` | `site_id`, `name`, `shape`, `center` + `radius_m` ou `vertices[]` | `geofence_created` / `geofence.create`; resposta traz `overlaps: [{ id, name }]` |
| `update_geofence` | `geofence.write` | `geofence_id`, `expected_version`, campos da forma | `geofence_updated` (forma anterior e nova, sem dado pessoal) / `geofence.update`; resposta traz `overlaps` |
| `inactivate_geofence` / `reactivate_geofence` | `geofence.deactivate` | `geofence_id`, `justification` | `geofence_inactivated` / `geofence_reactivated` |
| `create_vehicle` | `vehicle.write` | `plate`, `vehicle_type`, `vehicle_type_detail?`, `brand?`, `model?`, `manufacture_year?`, `capacity_cylinders`, `max_load_kg?`, `licensing_due_on?` | `vehicle_created` / `vehicle.create` |
| `update_vehicle` | `vehicle.write` | `vehicle_id`, `expected_version`, campos e, se a placa mudar, `justification` | `vehicle_updated` (placa antiga e nova) / `vehicle.update` |
| `change_vehicle_status` | `vehicle.deactivate` | `vehicle_id`, `expected_version`, `status`, `justification?` (obrigatória ao ir para ou sair de `inactive`; de `inactive` só se vai para `available`) | `vehicle_status_changed` / `vehicle.status_change` |
| `create_driver` | `driver.write` | `full_name`, `cpf`, `cnh_number`, `cnh_category`, `cnh_valid_until`, `phone?` | `driver_created` / `driver.create` |
| `update_driver` | `driver.write` | `driver_id`, `expected_version`, campos; CPF ou CNH só se enviados novos, com `justification` | `driver_updated` (+ `document_changed` sem valor) / `driver.update` |
| `inactivate_driver` / `reactivate_driver` | `driver.deactivate` | `driver_id`, `justification` | `driver_inactivated` / `driver_reactivated` |
| `link_driver_user` | `driver.write` | `driver_id`, `user_id` | `driver_user_linked` / `driver.user_link` |
| `unlink_driver_user` | `driver.write` | `driver_id`, `justification` (permitido também com o motorista inativo; `link_driver_user` exige motorista ativo) | `driver_user_unlinked` / `driver.user_unlink` |
| `anonymize_driver` | `driver.anonymize` + `aal2` | `driver_id`, `expected_version`, `reason` (`data_subject_request`, `retention_expired`, `other`), `justification`, `confirmed: true` | `person_anonymized` (+ `driver_user_unlinked` se havia vínculo) / `driver.anonymize`; resposta `{ code: 'ANONYMIZED', anonymized_at }` |
| `anonymize_customer` | `customer.anonymize` + `aal2` | `customer_id`, `expected_version`, `reason`, `justification`, `confirmed: true`; só `person_type = 'individual'` e inativo | `person_anonymized` do cliente e `contact_anonymized` de cada contato / `customer.anonymize`; resposta traz `affected: { contacts, sites }` |
| `anonymize_contact` | `customer.anonymize` + `aal2` | `contact_id`, `reason`, `justification`, `confirmed: true`; cliente de qualquer tipo, mesmo ativo | `contact_anonymized` / `customer.contact_anonymize` |
| `reveal_document` | `customer.document` ou `driver.document` | `entity_type` (`customer`, `driver`), `entity_id`, `document` (`cpf` ou `cnh`) | `document_revealed` (sem valor) / `<área>.document_reveal`; a resposta traz o valor com `Cache-Control: no-store` |

## Regras comuns

- Ator, sessão e organização são resolvidos no servidor; o corpo nunca escolhe o ator (RF-053).
- Toda RPC confere `private.actor_has_permission` primeiro e filtra por organização; recurso de outra organização responde `NOT_FOUND`, igual ao inexistente (RF-052).
- `version` de cada entidade sobe a cada `update_*`, inativação, reativação e mudança de situação do veículo; não sobe ao vincular ou desvincular usuário nem ao revelar documento.
- Justificativa de 5 a 500 caracteres em: inativar e reativar qualquer entidade, mudar a situação do veículo de ou para `inactive`, corrigir documento ou placa e desvincular usuário.
- Anonimização: sempre exige `aal2` (sem ele, `MFA_REQUIRED` e auditoria `denied`), confere o registro inativo (`ACTIVE_RECORD`), a versão (`VERSION_CONFLICT`), a confirmação (`CONFIRMATION_REQUIRED`) e a repetição (`ALREADY_ANONYMIZED`); sobe a `version`; evento e auditoria só com motivo, justificativa e a lista de campos afetados, nunca valores. Operações de escrita, de revelação e de vínculo sobre registro anonimizado respondem `ANONYMIZED_RECORD`.
- Leituras devolvem `anonymized_at` (e `null` quando não anonimizado); campos removidos voltam nulos e o nome vem como texto fixo. Registro anonimizado é sempre inativo e, por isso, só aparece nas listas com `status = 'inactive'` ou `'all'`; a busca não o encontra pelos valores antigos; o contato anonimizado continua em `contacts[]` de `get_customer` com o nome fixo.
- Nada de CPF, CNH, CNPJ de pessoa física, nome, telefone ou e-mail de pessoa física em log, evento, auditoria, mensagem de erro ou URL; os manipuladores não registram corpo de requisição.
- Nenhuma operação aceita `delete`; operação desconhecida → `VALIDATION_FAILED` e auditoria `denied`.
- A consulta de permissões do ator (`query-permissions`, Spec 004) é o que cada tela usa para negar a abertura sem permissão; as operações de comando negam sempre pelo servidor.
