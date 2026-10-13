# Contrato: operações do servidor

**Feature**: `010-fila-offline-fotos-assinatura` | **Data**: 12/10/2026

Todas as operações exigem sessão ativa, `organization_id` da organização ativa e permissão conferida no banco. Respostas de erro seguem o padrão existente (`code`, `fields`) e **nunca** trazem coordenada, nome de recebedor, caminho de anexo, foto, assinatura ou valor lido.

## 1. `manage-trips`: envelope das operações de origem offline

As quatro operações da fila continuam as mesmas das Specs 008 e 009 (`check_item`, `uncheck_item`, `arrive_stop`, `register_delivery`), com os mesmos campos, e ganham **um campo opcional**:

| Campo | Tipo | Regra |
|---|---|---|
| `queued_at` | instante ISO 8601 | hora do aparelho em que a operação entrou na fila; não no futuro; **presente só quando o pedido vem da fila** |
| `request_id` | uuid | é a `idempotency_key` da outbox; repetir o mesmo pedido devolve o mesmo resultado |

Comportamento:

- Com `queued_at`, a operação grava um registro em `private.trip_sync_events` (`applied` ou `replayed`) na mesma chamada; sem ele, nada muda para o uso online.
- Em `arrive_stop` e `register_delivery`, a validade da posição é medida contra o horário informado do registro, e horário informado com mais de 7 dias antes de agora devolve `STALE_OFFLINE_OPERATION`.
- Resposta repetida (`replayed: true`) é 200 e idêntica à original.

Códigos que a fila trata como **conflito** (409 ou 422, o item fica preservado):

| Código | Quando |
|---|---|
| `TRIP_CLOSED` | a viagem foi concluída ou cancelada |
| `INVALID_TRANSITION` | a situação mudou e o servidor não aceita mais a operação (inclui cilindro já conferido por outra pessoa) |
| `STOP_CLOSED` | a parada já foi encerrada |
| `NOT_FOUND` | o item ou a parada saiu da viagem |
| `VERSION_CONFLICT` | versão divergente |
| `STALE_OFFLINE_OPERATION` | horário informado de origem offline com mais de 7 dias |
| `VALIDATION_FAILED` | regra de domínio não satisfeita (vira conflito com o motivo, porque repetir não adianta) |
| `MISSING_DEPENDENCY` | só no aparelho: depende de um registro que foi descartado (vira conflito, não vai ao servidor) |

`TRIP_STATE_INVALID` é a recusa de `get_trip_offline` (viagem fora de `loading` e `in_progress`) e não é um conflito da fila.

`AUTH_REQUIRED` (401) e `ACCESS_DENIED` (403) **não** são conflito: interrompem o envio e pedem nova entrada. Falha de rede e 5xx voltam o item a `pending`.

## 2. `manage-trips`: `resolve_sync_conflict` (novo)

Registra a decisão sobre uma operação em conflito.

| Campo | Tipo | Regra |
|---|---|---|
| `request_id` | uuid | idempotência da decisão |
| `trip_id` | uuid | a viagem |
| `source_request_id` | uuid | o `request_id` da operação em conflito |
| `decision` | texto | `discard` ou `resubmit` |
| `justification` | texto | de 5 a 500 caracteres depois de juntar os espaços; **obrigatória** em `discard` |

- Permissão: `trip.operate`.
- Grava `private.trip_sync_events` (`discarded` ou `resubmitted`), o evento de viagem `sync_conflict_discarded` ou `sync_conflict_resubmitted` e a auditoria `trip.sync_conflict_resolve`.
- `resubmit` não executa a operação: apenas registra a decisão; o reenvio acontece pela fila com o mesmo `request_id`.
- Respostas: `RESOLVED`, `REPLAYED`, `VALIDATION_FAILED` (`fields.justification`), `NOT_FOUND`, `ACCESS_DENIED`.

## 3. `query-trips`: `get_trip_offline` (novo)

Devolve a viagem para guardar no aparelho.

- Entrada: `trip_id`.
- Permissão: `trip.operate` (quem pode conferir e chegar). Quem só vê viagens não recebe os identificadores.
- Saída: `trip` (o mesmo de `get_trip`, **sem** nome do recebedor, coordenadas registradas e anexos), `items[]` com, por item previsto, os `identifiers[]` **ativos e normalizados** (`value_normalized`) e `fetched_at`.
- Só viagens em `loading` ou `in_progress`; outra situação devolve `TRIP_STATE_INVALID`.
- Também devolve `deliveries[]` com o `id` e o `stop_id` das entregas já registradas (sem recebedor, coordenadas nem anexos), para acrescentar foto ou assinatura depois mesmo offline.

## 4. `query-trips`: `get_attachment_url` (novo)

- Entrada: `attachment_id`.
- Permissão: foto, `trip.read`; assinatura, `trip.recipient`.
- Saída: `url` assinada com vida de **60 segundos** e `expires_at`. Anexo de outra organização ou sem permissão: `NOT_FOUND` (igual ao inexistente).
- Não é registrado em auditoria com o caminho; só a contagem de leituras por ator e viagem.

## 5. `query-trips`: `list_sync_events` (novo)

- Entrada: `trip_id`, paginação.
- Permissão: `trip.history`.
- Saída: lista de `operation`, `outcome`, `reason_code`, `queued_at`, `received_at`, `actor` (nome de exibição) e, em `discarded`, a justificativa. Sem dado sensível.

## 6. `query-trips`: `get_trip` (alterado)

Por entrega, passa a devolver `photo_count` (inteiro) e `has_signature` (booleano) a quem tem `trip.read`. A lista dos anexos (`id`, `kind`, `position`, `captured_at`) só vai a quem pode ver aquele tipo: fotos a `trip.read`, assinatura a `trip.recipient`.

## 7. Edge Function `trip-attachments` (nova)

`POST /functions/v1/trip-attachments`

| Item | Regra |
|---|---|
| Autenticação | token da sessão; sessão ativa; organização ativa |
| Permissão | `trip.operate` |
| Corpo | `multipart/form-data` com `organization_id`, `delivery_id`, `attachment_id` (uuid), `kind` (`photo` ou `signature`), `position`, `captured_at`, `sha256` e o arquivo |
| Validação | entrega existente, da mesma organização e já registrada; viagem em `in_progress` ou `completed` há até 7 dias (senão `ATTACHMENT_WINDOW_CLOSED`, 409; viagem cancelada também); assinatura de arquivo (`FFD8FF` para JPEG, `89504E47` para PNG) e não o tipo informado; tamanho real até 2 MB (foto até 1,5 MB e assinatura até 200 KB); `sha256` confere com o corpo; máximo de 3 fotos e 1 assinatura por entrega |
| Efeito | grava o objeto em `trip-evidence/<organization>/<trip>/<delivery>/<attachment_id>.<ext>`, a linha em `trip_delivery_attachments`, o evento `evidence_attached` e a auditoria `trip.evidence_attach`, de forma **idempotente** por `attachment_id` |
| Repetição | mesmo `attachment_id` e mesmo `sha256`: 200 com `replayed: true`, sem novo objeto, linha ou evento; mesmo `attachment_id` com outro `sha256`: 409 `ATTACHMENT_CONFLICT` |
| Respostas | `ATTACHED`, `REPLAYED`, `VALIDATION_FAILED` (`fields.file`, `fields.kind`, `fields.position`), `ATTACHMENT_LIMIT` (409), `ATTACHMENT_WINDOW_CLOSED` (409), `DELIVERY_NOT_FOUND` (404), `ACCESS_DENIED`, `AUTH_REQUIRED`, `PAYLOAD_TOO_LARGE` (413) |
| Privacidade | a resposta traz só `id`, `kind` e `position`; nada de caminho, nome do arquivo ou conteúdo |

O cliente **nunca** escreve no bucket; o corpo recusado por tamanho é descartado com teto (padrão do avatar).

## 8. Invariantes de segurança

- Todo acesso passa por funções servidor com `security definer`, `search_path` vazio e `grant` só a `service_role`.
- Tenant B nunca lê, grava nem resolve nada do Tenant A (resposta igual à de inexistente).
- Nenhuma operação de exclusão física: não há `delete` em nenhuma das tabelas novas.
- Nenhuma credencial privilegiada no cliente.
