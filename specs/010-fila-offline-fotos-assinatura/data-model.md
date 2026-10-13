# Modelo de dados: Fila offline, fotos e assinatura de entrega

**Feature**: `010-fila-offline-fotos-assinatura` | **Data**: 12/10/2026

Extensão do modelo das Specs 006, 008 e 009. Tudo é por `organization_id`, com RLS. Nada é excluído fisicamente. Sem permissão nova.

## 1. Servidor

### 1.1 `public.trip_delivery_attachments` (nova)

Um anexo (foto ou assinatura) de uma entrega. Imutável: só `insert`; `update` e `delete` negados a qualquer papel de cliente.

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid | **chave**; é o `attachment_id` gerado no aparelho (idempotência) |
| `organization_id` | uuid | `not null`, referência da organização |
| `delivery_id` | uuid | `not null`, referência de `trip_deliveries (id)`, mesma organização (chave composta) |
| `trip_id`, `stop_id` | uuid | `not null`, redundantes para consulta e caminho |
| `kind` | text | `check in ('photo', 'signature')` |
| `position` | smallint | foto: 1 a 3; assinatura: 0 |
| `storage_path` | text | caminho canônico `<organization_id>/<trip_id>/<delivery_id>/<id>.<jpg|png>`, `check` por expressão regular |
| `content_type` | text | `check in ('image/jpeg', 'image/png')`; foto só JPEG, assinatura só PNG |
| `size_bytes` | integer | `check between 1 and 2097152` |
| `sha256` | text | 64 hexadecimais; usado na comparação de reenvio |
| `captured_at` | timestamptz | hora do aparelho (evidência auxiliar), não no futuro |
| `added_later` | boolean | verdadeiro quando o anexo chega depois do registro da entrega (RF-021a); o registro da entrega não muda |
| `created_by` | uuid | ator |
| `created_at` | timestamptz | hora de recebimento no servidor |

- Índice único `(delivery_id, kind, position)`: no máximo 3 fotos (`position` 1 a 3) e 1 assinatura (`position` 0) por entrega.
- **Idempotência**: reenviar o mesmo `id` com o mesmo `sha256` devolve o registro existente; o mesmo `id` com outro `sha256` é `ATTACHMENT_CONFLICT`.
- **RLS**:
  - `select` de `photo`: sessão ativa e `private.has_permission(organization_id, 'trip.read')`.
  - `select` de `signature`: sessão ativa e `private.has_permission(organization_id, 'trip.recipient')`.
  - Sem política de `insert`, `update` e `delete` para `authenticated`; a escrita é só da função servidor (`service_role`).
- **Contagem na entrega**: `get_trip` devolve `photo_count` e `has_signature` da entrega a quem tem `trip.read`; a lista dos anexos (identificadores, sem caminho) só a quem pode ver aquele tipo.

### 1.2 Bucket `trip-evidence` (novo)

- Privado, limite de objeto de 2 MB, tipos permitidos `image/jpeg` e `image/png`.
- Política de `select` em `storage.objects` espelha a da tabela (foto: `trip.read`; assinatura: `trip.recipient`), pela pasta da organização; **sem** política de `insert`, `update` e `delete` para `authenticated`.
- O objeto é gravado pela função `trip-attachments` e lido por URL assinada de vida curta, só depois de a permissão ser conferida no servidor.

### 1.3 `private.trip_sync_events` (nova, privada)

Trilha imutável das operações vindas da fila.

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | bigserial | chave |
| `organization_id` | uuid | `not null` |
| `request_id` | uuid | o `request_id` da operação (igual à chave da outbox) |
| `operation` | text | `check_item`, `uncheck_item`, `arrive_stop`, `register_delivery`, `attachment`, `resolve_conflict` |
| `trip_id` | uuid | `not null` |
| `outcome` | text | `check in ('applied', 'replayed', 'conflict', 'discarded', 'resubmitted')` |
| `reason_code` | text | código sanitizado do conflito ou da decisão; nunca dado sensível |
| `queued_at` | timestamptz | hora do aparelho (evidência auxiliar) |
| `received_at` | timestamptz | hora de recebimento (`now()`) |
| `actor_id` | uuid | quem enviou ou decidiu |
| `justification` | text | só em `discarded`, 5 a 500 caracteres |

- Índice por `(organization_id, trip_id, received_at)`; imutável (gatilho nega `update` e `delete`).
- **Sem** coordenadas, nome do recebedor, caminho de anexo ou valor lido. A leitura é pela consulta `list_sync_events`, com permissão de ver o histórico da viagem (`trip.history`).

### 1.4 Funções alteradas

- `arrive_stop` e `register_delivery` (já recriadas na Spec 009):
  - novo argumento opcional `p_queued_at timestamptz default null`;
  - a **referência de horário** do registro é `coalesce(p_arrived_at, p_queued_at, now())` na chegada e `p_delivered_at` na entrega;
  - a validade da posição (`position_read_at` não no futuro e com no máximo 10 minutos antes) passa a ser medida contra essa referência e não contra `now()`;
  - com `p_queued_at` presente, referência com **mais de 7 dias** antes de `now()` devolve `STALE_OFFLINE_OPERATION` (409);
  - sem `p_queued_at` nada muda para o uso online.
  - Antes de recriar: `drop function` da assinatura anterior (uma só assinatura de cada, conferida em teste, como na Spec 009).
- `get_trip`: devolve, por entrega, `photo_count` e `has_signature`.
- Evento de viagem: a restrição de tipos de evento é **recriada com o conjunto completo** (os existentes mais os novos) em cada migration que acrescenta tipo (`sync_conflict_discarded` e `sync_conflict_resubmitted` na primeira; `evidence_attached` na quarta).
- Funções novas (todas `security definer`, `set search_path = ''`, `grant` só a `service_role`): `record_trip_sync_event`, `resolve_sync_conflict`, `query_trip_offline`, `query_attachment_target` (confere a permissão e devolve o caminho), `attach_trip_evidence` (grava a linha do anexo de forma idempotente) e `query_sync_events`.

### 1.5 Eventos e auditoria

- Eventos de viagem: `evidence_attached` (com `photo_count` e `has_signature`, sem caminho nem nome) e as decisões de conflito `sync_conflict_discarded` e `sync_conflict_resubmitted` (com o código do motivo e a justificativa).
- Auditoria (`audit_logs`): ações `trip.sync_conflict_resolve` e `trip.evidence_attach`, com ator, organização, viagem e contagem; **nunca** coordenada, nome do recebedor, caminho, foto ou assinatura.

## 2. Aparelho (IndexedDB `fluxid-local`, versão 2)

A versão 1 tem `local_outbox`, `local_sync_cursors` e `local_sync_conflicts` (chave `id`, índice `organization_id`). A versão 2 **mantém** essas três e **acrescenta** `local_trips` e `local_attachments`, e um índice composto `owner` = `actor_id + organization_id + endpoint_id` em todas as lojas, para a partição por conta, organização e destino.

### 2.1 `local_outbox` (existente, estendida)

Campos já existentes: `id`, `idempotency_key`, `organization_id`, `actor_id`, `device_id`, `operation`, `payload`, `version`, `dependencies`, `local_timestamp`, `server_timestamp`, `status`, `attempt_count`, `failure_reason`, `created_at`, `updated_at`.

Acrescenta: `endpoint_id` (destino de origem), `trip_id` (para ordem e dependência por viagem) e `queued_at` (igual a `local_timestamp`, enviado ao servidor).

- `operation` ∈ `trip.check_item`, `trip.uncheck_item`, `trip.arrive_stop`, `trip.deliver` (a política offline rejeita qualquer outra).
- `payload` guarda exatamente o corpo que `manage-trips` espera (inclui, quando houver, posição, método, recebedor, resultados por cilindro) **sem** o `request_id`, que é a `idempotency_key`.
- **Ao virar `synced`**, o item é **removido por inteiro** (`removeConfirmed`); nenhum `payload` sobrevive à confirmação.
- Estados e transições da Spec 002 mantidos (`pending` → `syncing` → `synced` | `conflict` | `failed` | `pending`; `conflict` e `failed` → `discarded`).

### 2.2 `local_attachments` (nova)

| Campo | Regra |
|---|---|
| `id` | o `attachment_id` (UUID) |
| `organization_id`, `actor_id`, `endpoint_id` | partição |
| `outbox_item_id` | item da entrega a que pertence, **opcional**: o envio começa depois de ele estar `synced`; fica nulo no anexo acrescentado depois (RF-021a), que usa o `delivery_id` já conhecido |
| `kind` | `photo` ou `signature` |
| `position` | 1 a 3 para foto; 0 para assinatura |
| `bytes` | o arquivo já reduzido e sem metadados, como `ArrayBuffer` (não como `Blob`: o armazenamento de `Blob` no IndexedDB não é confiável em todos os navegadores); o tipo vai em `content_type` |
| `sha256`, `size_bytes`, `content_type` | para reenvio idempotente |
| `captured_at` | hora do aparelho |
| `status` | `pending`, `uploading`, `uploaded`, `failed` |
| `delivery_id` | preenchido quando a entrega é confirmada e devolve `delivery_id`, ou conhecido de antemão (`get_trip_offline.deliveries[]`) no anexo posterior |

- Ao virar `uploaded`, o registro e os `bytes` são **removidos**.
- A soma dos `size_bytes` entra no limite de 50 MB; passando de 80% a tela avisa, e acima do limite novas fotos não são aceitas (o registro principal sempre é).

### 2.3 `local_trips` (nova)

| Campo | Regra |
|---|---|
| `id` | `trip_id` |
| `organization_id`, `actor_id`, `endpoint_id` | partição |
| `snapshot` | viagem como devolvida por `get_trip_offline`: situação, versão, paradas, itens e, por item, os identificadores ativos **normalizados** |
| `fetched_at` | hora da última atualização online |

- Só viagens abertas com conexão e em `loading` ou `in_progress`.
- Removida ao sair da conta (depois do aviso de pendências), quando a viagem encerra (`completed` ou `cancelled`) e sem itens pendentes, ou quando a conta perde acesso. **Só a cópia da viagem é removida**: a fila (`local_outbox`) e os anexos pendentes permanecem até a confirmação do servidor ou a decisão de descartar.
- **Nunca** guarda o nome do recebedor, coordenadas já registradas, fotos nem assinaturas.

### 2.4 `local_sync_conflicts` (existente, estendida)

Campos existentes: `outbox_item_id`, `entity`, `entity_id`, `kind`, `local_version`, `remote_version`, `status`, `decision`, `created_at`, `resolved_at`.

**Dado sensível**: `local_version` guarda só um **resumo sem dado sensível** (operação, número de série do cilindro, hora do aparelho, "posição informada: sim ou não" e "recebedor informado: sim ou não"); os dados originais completos ficam **só** no item da `local_outbox` que o conflito referencia. Ao descartar, o item da outbox é removido por inteiro e o `local_version` é limpo; ao reenviar, o item volta a `pending` e o resumo é limpo ao confirmar.

Acrescenta os tipos de conflito (`ConflictKind`): `trip_state_changed`, `item_already_checked`, `item_not_in_trip`, `trip_cancelled`, `stale_operation` e `validation_rejected`, cada um com o `reason_code` do servidor. A decisão `keep_local` significa **reenviar**, `discard_local` significa **descartar** e `keep_remote` fica sem uso nesta spec.

## 3. Estados e transições

### Item da fila (existente)

```text
pending ──▶ syncing ──▶ synced (removido)
   ▲            │──▶ conflict ──▶ discarded
   │            │──▶ failed   ──▶ discarded
   └────────────┘ (falha de rede, com espera)
conflict ──reenviar──▶ pending
```

### Anexo local

```text
pending ──▶ uploading ──▶ uploaded (removido)
   ▲            │
   └────────────┘ (falha de rede)
pending ──▶ failed (arquivo recusado pelo servidor)
```

## 4. Regras de validação (cliente e servidor repetem)

| Regra | Cliente | Servidor |
|---|---|---|
| Operações offline-safe | allowlist da política | operação desconhecida: `VALIDATION_FAILED` |
| Até 3 fotos e 1 assinatura por entrega | bloqueia na tela | índice único e `check` |
| Foto: JPEG, lado maior até 1.600 px, até 1,5 MB, sem metadados | recodifica por canvas | tipo e tamanho pelos bytes reais; recusa EXIF |
| Assinatura: PNG, até 200 KB, com traço | conta de pixels | tipo e tamanho pelos bytes reais |
| Horário informado de origem offline até 7 dias | aviso | `STALE_OFFLINE_OPERATION` |
| Posição válida pelo horário informado | 2 minutos no registro | 10 minutos antes do horário informado, não no futuro |
| Fila e anexos só da própria conta, organização e destino | partição e filtro | RLS e sessão |
