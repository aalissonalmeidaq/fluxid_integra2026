# Modelo de dados: Clientes, unidades, geocercas, veículos e motoristas

**Feature**: `007-clientes-geocercas-frota` | **Spec**: [spec.md](./spec.md) | **Pesquisa**: [research.md](./research.md)

Todas as tabelas ficam em `public`, têm `organization_id`, RLS ligada, nenhuma política de escrita (toda escrita passa por RPC `security definer`) e **nenhum `delete`** (a única exceção são os contatos do cliente, abaixo). Colunas `created_at`, `updated_at` e `version bigint not null default 1` existem em todas as tabelas principais. As migrations seguem a ordem da seção final.

## Visão geral das relações

```text
organizations 1─* customers 1─* customer_sites 1─* geofences
                    │ 1─* customer_contacts
                    └ 0..1 customer_documents (só pessoa física)
organizations 1─* vehicles
organizations 1─* drivers 1─1 driver_documents ; drivers *─0..1 auth.users (vínculo)
organizations 1─* registry_events (todas as áreas, por entity_type + entity_id)
```

## Extensão

`create extension if not exists postgis with schema extensions;` (migration própria, antes das tabelas). Nenhum dado.

## `customers`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `organization_id` | uuid not null | FK `organizations`, `on delete restrict` |
| `person_type` | text not null | `legal` ou `individual`; **imutável** depois do cadastro (gatilho `before update` recusa a mudança) |
| `document_display` | text not null | CNPJ completo (`legal`) ou CPF mascarado (`individual`); nunca o CPF inteiro |
| `legal_name` | text not null | 2 a 160 caracteres |
| `trade_name` | text null | até 160 |
| `segment` | text not null | `hospital`, `clinic`, `laboratory`, `industry`, `distributor`, `other` |
| `segment_detail` | text null | até 60; obrigatório quando `segment = 'other'`, nulo nos demais |
| `notes` | text null | até 500 |
| `status` | text not null default `active` | `active` ou `inactive` |
| `inactivated_at`, `inactivated_by` | timestamptz, uuid null | preenchidos ao inativar |
| `anonymized_at`, `anonymized_by` | timestamptz, uuid null | preenchidos ao anonimizar (só `individual`); ver *Anonimização* |
| `version`, `created_at`, `updated_at` | | padrão |

- Índice único `(organization_id, document_key)` em `customer_documents` (ver abaixo) garante o documento único por organização, ativos e inativos (RF-002).
- Índices: `(organization_id, status, lower(legal_name))`; trigrama em `legal_name` e `trade_name`.
- O CNPJ de pessoa jurídica **não é dado pessoal**: `document_display` guarda o valor completo e a unicidade usa o mesmo valor normalizado (maiúsculas, 14 caracteres) em `customer_documents.document_key`.

## `customer_documents` (acesso só por RPC)

| Coluna | Tipo | Regra |
|---|---|---|
| `customer_id` | uuid pk | FK `customers`, 1:1 |
| `organization_id` | uuid not null | FK |
| `kind` | text not null | `cnpj` ou `cpf` (coerente com `person_type`) |
| `document_key` | text null | valor normalizado completo (CNPJ de 14 caracteres ou CPF de 11 dígitos); nulo só se `anonymized_at` não é nulo |
| `anonymized_at` | timestamptz null | preenchido pela anonimização do cliente |

- `unique (organization_id, document_key)`. `document_key` fica nulo **somente** quando o cliente foi anonimizado, garantido por `check ((document_key is null) = (anonymized_at is not null))` **na própria linha** (um `CHECK` não pode consultar outra tabela), e a anonimização grava `anonymized_at` no documento e no cliente na mesma transação, o que libera o documento para novo cadastro (RF-059).
- **Sem política de `select`**, privilégios revogados de `anon` e `authenticated` (pesquisa, decisão 4). O valor do CPF só sai pela operação de revelação.

## `customer_contacts`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | |
| `organization_id`, `customer_id` | uuid not null | FKs |
| `name` | text not null | 2 a 120 |
| `role` | text null | até 80 |
| `phone` | text null | só dígitos, 10 ou 11 (DDD + número), já normalizado |
| `email` | text null | formato válido, até 160, minúsculas |
| `is_primary` | boolean not null default false | no máximo um por cliente (índice único parcial) |
| `position` | smallint not null | ordem de exibição |
| `anonymized_at`, `anonymized_by` | timestamptz, uuid null | preenchidos ao anonimizar o contato (ou o cliente pessoa física) |

- No máximo 10 contatos por cliente (RF-003), conferido na RPC. A edição substitui o conjunto de contatos **não anonimizados** de forma atômica: acrescenta os novos, atualiza os existentes e **remove os que não vieram na lista**; os anonimizados nunca são alterados nem removidos.
- **Única tabela de cadastro que aceita `delete`**, e só dentro de `update_customer`: o gatilho de bloqueio de exclusão de `customer_contacts` aceita a remoção apenas quando a RPC liga a variável de sessão local `app.registry_contacts_replace`; qualquer `delete` direto, de qualquer papel (inclusive `service_role`), continua recusado. A remoção gera o evento `contacts_changed` com contagens, sem os dados do contato.
- Telefone e e-mail são dados pessoais: `get_customer` só os devolve a quem tem `customer.write` (os demais papéis recebem nome e função) e eles nunca aparecem em eventos nem auditoria (o evento registra `contacts_changed` com a contagem) [RF-003].

## `customer_sites` (unidades)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | |
| `organization_id`, `customer_id` | uuid not null | FKs |
| `name` | text not null | 2 a 120; único por cliente sem diferenciar caixa |
| `postal_code` | text not null | 8 dígitos |
| `street` | text not null | até 120 |
| `number` | text not null | até 20 (aceita "S/N") |
| `complement` | text null | até 80 |
| `district` | text null | até 80 |
| `city` | text not null | até 80 |
| `state` | text not null | UF, 2 letras maiúsculas, uma das 27 |
| `ibge_code` | text null | 7 dígitos, vindo da consulta de CEP quando houver |
| `latitude`, `longitude` | numeric(9,6) null | informadas juntas; −90..90 e −180..180 |
| `receiving_contact_name`, `receiving_contact_phone` | text null | responsável pelo recebimento |
| `receiving_days` | smallint[] null | dias 0 a 6 (domingo a sábado), sem repetição |
| `receiving_from`, `receiving_to` | time null | `receiving_to > receiving_from`; se houver horário, ao menos um dia |
| `access_instructions` | text null | até 500 |
| `coordinates_source` | text null | `manual` ou `geocoded`; nulo quando não há coordenadas (RF-066) |
| `coordinates_confirmed_at`, `coordinates_confirmed_by` | timestamptz / uuid null | só com origem `geocoded`; quem confirmou o endereço e o ponto e quando; descartados se o endereço mudar sem nova confirmação |
| `first_delivery_confirmed` | boolean not null default false | reconfirmação do motorista na primeira entrega (Fase 4, RF-069) |
| `status`, `inactivated_*`, `version`, datas | | como em `customers` |

- Na anonimização do cliente pessoa física, a unidade passa a ter `name = 'Unidade anonimizada ' || left(id::text, 8)`, `number = 'S/N'`, `complement`, `receiving_contact_name`, `receiving_contact_phone`, `receiving_days`, `receiving_from`, `receiving_to`, `access_instructions`, `latitude` e `longitude` nulos; CEP, logradouro, bairro, cidade, UF e `ibge_code` permanecem (RF-057).
- Índices: `(organization_id, customer_id, status)`; trigrama em `name` e `city`; único `(customer_id, lower(name))`.
- Um gatilho `before insert or update` limpa origem e confirmação quando `latitude` é nula (cobre a anonimização, que remove as coordenadas). Migration `*_registry_site_geocoding.sql`.
- A unidade não depende do serviço de CEP nem da geocodificação: todos os campos de endereço são aceitos por digitação (RF-006, RF-011).

## `geofences`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | |
| `organization_id`, `site_id` | uuid not null | FKs (a organização da geocerca é a da unidade, conferida por restrição composta) |
| `name` | text not null | 2 a 120; único por unidade sem diferenciar caixa |
| `shape` | text not null | `circle` ou `polygon` |
| `center` | `extensions.geography(Point,4326)` null | só no círculo |
| `radius_m` | integer null | só no círculo; 25 a 5000 |
| `vertices` | jsonb null | só no polígono; lista ordenada `[{lat,lng}]`, 3 a 100 itens, sem repetir o primeiro no fim |
| `area` | `extensions.geography(Polygon,4326)` not null | círculo: polígono circunscrito para o pré-filtro; polígono: o próprio contorno |
| `status`, `inactivated_*`, `version`, datas | | como acima |

- Restrições: círculo exige `center` e `radius_m` e proíbe `vertices`; polígono exige `vertices` e proíbe `center` e `radius_m`.
- Índice GiST em `area`; B-tree `(organization_id, site_id, status)`.
- `area` e a validade do polígono (sem cruzamento, área > 0) são calculadas **só na RPC**, nunca aceitas do cliente.

## `vehicles`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid not null | FK |
| `plate` | text not null | normalizada: 7 caracteres maiúsculos, `AAA9999` ou `AAA9A99`; único por organização |
| `vehicle_type` | text not null | `truck`, `van`, `utility`, `other` |
| `vehicle_type_detail` | text null | até 60; obrigatório quando `other` |
| `brand`, `model` | text null | até 60 |
| `manufacture_year` | smallint null | 1980 até o ano seguinte ao atual |
| `capacity_cylinders` | integer not null | 1 a 9999 |
| `max_load_kg` | numeric(9,2) null | maior que 0 |
| `licensing_due_on` | date null | vencimento do licenciamento |
| `status` | text not null default `available` | `available`, `maintenance`, `inactive` |
| `inactivated_at`, `inactivated_by` | | ao ir para `inactive` |
| `version`, datas | | padrão |

- Índices: `unique (organization_id, plate)`; `(organization_id, status, licensing_due_on)`.
- A situação do licenciamento **não é coluna**: é calculada (pesquisa, decisão 9).

## `drivers`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid not null | FK |
| `full_name` | text not null | 2 a 160 |
| `phone` | text null | 10 ou 11 dígitos normalizados |
| `cpf_display`, `cnh_display` | text not null | só mascarados (RF-029) |
| `cnh_category` | text not null | `A`, `B`, `C`, `D`, `E`, `AB`, `AC`, `AD`, `AE` |
| `cnh_valid_until` | date not null | validade da CNH |
| `linked_user_id` | uuid null | FK `auth.users`; único por organização quando não nulo |
| `status` | text not null default `active` | `active` ou `inactive` |
| `anonymized_at`, `anonymized_by` | timestamptz, uuid null | preenchidos ao anonimizar; ver *Anonimização* |
| `inactivated_*`, `version`, datas | | como acima |

- Índices: `(organization_id, status, lower(full_name))`; trigrama em `full_name`; único parcial `(organization_id, linked_user_id)`.
- **Vínculo e situação**: inativar o motorista **não altera** `linked_user_id`, e reativar também não. O usuário só se liga a outro motorista depois de ser desvinculado, e `unlink_driver_user` funciona com o motorista inativo (exceção a "só se edita registro ativo"). Só a anonimização zera `linked_user_id` sozinha (RF-027).

## `driver_documents` (acesso só por RPC)

| Coluna | Tipo | Regra |
|---|---|---|
| `driver_id` | uuid pk | FK `drivers`, 1:1 |
| `organization_id` | uuid not null | FK |
| `cpf` | text null | 11 dígitos; nulo só se `anonymized_at` não é nulo |
| `cnh_number` | text null | 11 dígitos; nulo só se `anonymized_at` não é nulo |
| `anonymized_at` | timestamptz null | preenchido pela anonimização do motorista |

- `unique (organization_id, cpf)` e `unique (organization_id, cnh_number)` (RF-025). `cpf` e `cnh_number` ficam nulos **somente** quando o motorista foi anonimizado, garantido por `check ((cpf is null) = (anonymized_at is not null) and (cnh_number is null) = (anonymized_at is not null))` **na própria linha** (um `CHECK` não pode consultar outra tabela), e a anonimização grava `anonymized_at` no documento e no motorista na mesma transação, o que libera os documentos (RF-059). Sem política de `select`, privilégios revogados de `anon` e `authenticated`.

## `registry_events` (imutável)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid not null | FK |
| `entity_type` | text not null | `customer`, `site`, `geofence`, `vehicle`, `driver` |
| `entity_id` | uuid not null | id da entidade (sem FK, para servir às cinco tabelas; a RPC garante a existência) |
| `sequence` | integer not null | por `(entity_type, entity_id)`, atribuída sob `for update` da linha da entidade; `unique (entity_type, entity_id, sequence)` |
| `event_type` | text not null | vocabulário abaixo |
| `actor_user_id`, `actor_session_id` | uuid not null | quem fez, da sessão do token |
| `justification` | text null | 5 a 500 quando exigida |
| `data` | jsonb not null default `{}` | dados do fato, **sem** CPF, CNH, telefone nem e-mail |
| `occurred_at` | timestamptz not null default `now()` | |

- Gatilhos `before update or delete` recusam qualquer alteração, inclusive de `service_role` (CA-003).
- Índice `(organization_id, entity_type, entity_id, sequence)`; consulta pagina por `sequence`.

### Vocabulário de eventos

`person_anonymized`, `contact_anonymized`, `customer_created`, `customer_updated`, `customer_inactivated`, `customer_reactivated`, `contacts_changed`, `document_changed`, `site_created`, `site_updated`, `site_inactivated`, `site_reactivated`, `geofence_created`, `geofence_updated`, `geofence_inactivated`, `geofence_reactivated`, `vehicle_created`, `vehicle_updated`, `vehicle_status_changed`, `driver_created`, `driver_updated`, `driver_inactivated`, `driver_reactivated`, `driver_user_linked`, `driver_user_unlinked`, `document_revealed`.

`customer_inactivated` e `site_inactivated` aplicados por cascata levam `data.cascade_of = <id do pai>`. Em `vehicle_status_changed`, `data` traz `from` e `to`. Em edições, `data.changes` lista `{ field, old, new }` **só** dos campos não pessoais (placa e CNPJ de pessoa jurídica incluem valores). Os **campos pessoais** só listam o nome do campo em `data.changed_sensitive`: CPF, CNH, telefone, e-mail, contatos, `full_name` do motorista e, em cliente pessoa física, `legal_name`, `trade_name`, `notes` e os campos pessoais das unidades. `person_anonymized` e `contact_anonymized` trazem `data.reason` e `data.fields` (nomes dos campos afetados e contagens de contatos e unidades), **nunca valores** (RF-060).

## Estados e transições

| Entidade | Estados | Transições | Exigências |
|---|---|---|---|
| Cliente | `active` ⇄ `inactive` | inativar (cascata sobre unidades e geocercas ativas), reativar (só o cliente) | justificativa 5 a 500 |
| Unidade | `active` ⇄ `inactive` | inativar (cascata sobre geocercas ativas), reativar | justificativa; reativar exige cliente ativo |
| Geocerca | `active` ⇄ `inactive` | inativar, reativar | justificativa; reativar exige unidade ativa |
| Veículo | `available` ⇄ `maintenance`; qualquer → `inactive`; `inactive` → `available` | mudança de situação | justificativa ao ir para ou sair de `inactive` |
| Motorista | `active` ⇄ `inactive` | inativar, reativar | justificativa |

### Anonimização

Não é um estado: é uma marca (`anonymized_at`) sobre um registro que já estava inativo (motorista e cliente pessoa física) ou sobre um contato. Efeito, em uma única transação e sem excluir linha alguma (RF-057, RF-058):

| Entidade | Substituído por | Mantido |
|---|---|---|
| Motorista | `full_name = 'Motorista anonimizado'`; `phone`, `linked_user_id`, `cpf` e `cnh_number` nulos; `cpf_display` e `cnh_display` = `anonimizado` | id, organização, `status` (inativo), `cnh_category`, `cnh_valid_until`, versão, datas |
| Cliente pessoa física | `legal_name = 'Cliente anonimizado'`; `trade_name`, `notes` e `document_key` nulos; `document_display = 'anonimizado'`; contatos e unidades como abaixo | id, organização, `person_type`, `segment`, `status` (inativo), versão, datas |
| Contato | `name = 'Contato anonimizado'`; `role`, `phone` e `email` nulos; `is_primary = false` | id, cliente, `position` |
| Unidade de cliente pessoa física | ver a seção de `customer_sites` | CEP, logradouro, bairro, cidade, UF, geocercas |

Um registro com `anonymized_at` não aceita edição, reativação, vínculo nem revelação: gatilhos `before update` (em `customers`, `customer_contacts`, `customer_sites`, `drivers` e nas duas tabelas de documentos) recusam a alteração com a exceção `anonymized_record`, contornados só pelas funções de anonimização por variável de sessão local; a borda das funções traduz a exceção em `ANONYMIZED_RECORD`; a operação é irreversível porque os valores antigos não existem mais em nenhuma tabela, evento nem auditoria (eventos e auditorias anteriores nunca os guardaram).

Só são editados registros ativos e, no veículo, os que não estão `inactive` (`available` e `maintenance` são editáveis); do estado `inactive` o veículo só volta para `available` (RF-021, RF-034). A situação do documento (licenciamento e CNH) é independente e calculada.

## Funções SQL privadas e públicas

| Função | Papel |
|---|---|
| `private.geofence_limits()` | limites únicos (raio mínimo e máximo, vértices mínimo e máximo) |
| `private.document_expiring_days()` | devolve `private.hydrostatic_expiring_days()` (limite único de 30 dias) |
| `private.append_registry_event(...)` | grava o evento com a sequência sob bloqueio, por tipo de entidade |
| `private.anonymize_driver/customer_person/contact(...)` | substituição irreversível dos campos pessoais, marca `anonymized_at` e libera os documentos; chamadas só pelas RPCs de anonimização |
| `private.validate_cnpj/cpf/cnh(text)` | validadores de dígitos, mesma tabela de casos do TypeScript |
| `private.normalize_plate(text)` | maiúsculas, sem hífen e espaços, valida os dois padrões |
| `private.build_geofence_area(...)` | monta e valida `area` a partir de círculo ou vértices |
| RPCs de consulta e comando | listadas em [contracts/operacoes-servidor.md](./contracts/operacoes-servidor.md); todas `security definer`, `set search_path = ''`, com `private.actor_has_permission` primeiro e `grant` só a `service_role` |

## Ordem das migrations

1. `*_registry_extensions.sql`: PostGIS.
2. `*_registry_schema.sql`: tabelas, índices, RLS, gatilhos (imutabilidade, exclusão, `person_type`, registro anonimizado) e funções de limite e validação.
3. `*_registry_permissions.sql`: 20 permissões, concessões aos papéis, `bootstrap_tenant_roles`, `master_fluxid`.
4. `*_registry_customers_write.sql` (US1): RPCs de cliente, contatos e unidade.
5. `*_registry_customers_read.sql` (US2): consultas de clientes e unidades.
6. `*_registry_geofences.sql` (US3): RPCs de geocerca e consulta espacial.
7. `*_registry_vehicles.sql` (US4): RPCs de veículo.
8. `*_registry_drivers.sql` (US5): RPCs de motorista, vínculo e revelação.
9. `*_registry_inactivation.sql` (US6): inativação e reativação, cascata e prévia.
10. `*_registry_history.sql` (US7): consulta de histórico.
11. `*_registry_anonymization.sql` (US8): RPCs de anonimização e gatilhos de registro anonimizado.

## RLS (segunda barreira)

- `customers`, `customer_contacts`, `customer_sites`, `geofences`, `vehicles`, `drivers`, `registry_events`: política de `select` para membro ativo da organização com a permissão `*.read` (ou `*.history` para eventos); `anon` sem acesso; `insert`, `update` e `delete` revogados de `anon` e `authenticated`.
- `customer_documents` e `driver_documents`: RLS ligada **sem nenhuma política** e privilégios revogados.
- Cada tabela é testada com dois tenants (CA-001): o Tenant A lê e grava o que é dele e não vê, não busca, não testa ponto nem altera nada do Tenant B, e o inverso.
