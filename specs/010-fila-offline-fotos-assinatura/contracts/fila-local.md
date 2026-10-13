# Contrato: fila local e sincronização no aparelho

**Feature**: `010-fila-offline-fotos-assinatura` | **Data**: 12/10/2026

Regras que a fila, os executores e a tela cumprem. Estende `src/infrastructure/local-database` e `src/infrastructure/synchronization` (Spec 002); **não** altera o contrato de conectividade (`docs/arquitetura-conectividade-supabase.md`).

## 1. Política offline (`OfflineOperationPolicy`)

A lista de operações offline passa de vazia para exatamente:

| Operação | Chama no servidor | Permissão exigida na tela |
|---|---|---|
| `trip.check_item` | `manage-trips` `check_item` | `trip.operate` |
| `trip.uncheck_item` | `manage-trips` `uncheck_item` | `trip.operate` |
| `trip.arrive_stop` | `manage-trips` `arrive_stop` | `trip.operate` |
| `trip.deliver` | `manage-trips` `register_delivery` | `trip.operate` |

Anexos (foto e assinatura) **não** são itens da outbox: seguem pela loja `local_attachments` e pela função `trip-attachments`, só depois de a entrega estar `synced`. Qualquer outra operação (planejar, iniciar o carregamento, iniciar a viagem, cancelar, concluir, desbloquear, devolver, corrigir entrega, consulta geral de cilindros) é recusada pela política com o motivo "exige conexão" e **nunca entra na fila**.

## 2. Enfileirar

1. Conferir a permissão da pessoa para a operação e a existência da viagem em `local_trips` com a situação que aceita a operação.
2. Validar o corpo com as mesmas regras do cliente (Spec 008 e Spec 009).
3. Criar o item da outbox com `idempotency_key` novo, `trip_id`, `endpoint_id`, `queued_at` e as **dependências lógicas**: a operação anterior sobre o **mesmo cilindro** (conferir antes de desfazer), a chegada anterior da **mesma parada** (para a entrega) e a conferência pendente dos cilindros da parada. O envio segue a ordem em que foram feitas dentro da viagem, mas um conflito **bloqueia só as dependentes**, não a viagem inteira.
4. Gravar numa transação; só então mostrar "pendente" na tela. Falha de gravação (espaço) mostra erro e **não** mostra a operação como feita.
5. Atualizar a viagem guardada de forma otimista (cilindro "conferido, pendente") sem marcar nada como confirmado.

Desfazer a conferência de um item ainda `pending` e sem dependentes **remove** o item da fila (nenhum evento é criado no servidor). Se o item já foi enviado, o desfazer vira uma operação `trip.uncheck_item` nova.

## 3. Envio

- **Disparo**: ao abrir o aplicativo, ao voltar a conexão (`online` mais verificação de saúde do destino), a cada 30 segundos com pendência e em "Enviar agora".
- **Trava de aba**: o envio roda dentro de `navigator.locks.request('fluxid-sync:<conta>:<organização>')`; sem o recurso, eleição por `BroadcastChannel` (a aba mais antiga envia).
- **Destino**: antes de enviar um item, compara `endpoint_id` com o destino ativo; se diferir, **não envia**, mantém o item e avisa em texto. A troca de destino com fila pendente é adiada pelo `EndpointPromotionCoordinator`.
- **Ordem**: itens `pending` cujas dependências estão todas `synced`; viagens diferentes podem ir em paralelo; dentro de uma viagem, um de cada vez.
- **Sessão**: `AUTH_REQUIRED` ou `ACCESS_DENIED` interrompem o envio, mantêm a fila e pedem nova entrada; a fila só é enviada pela **mesma conta e organização**.
- **Espera**: falha de rede ou 5xx → item volta a `pending`, com espera crescente (`retry-policy`) e limite de tentativas da outbox; passado o limite vira `failed` e aparece com "Tentar de novo".

## 4. Resposta do servidor → estado do item

| Resposta | Estado | Efeito local |
|---|---|---|
| 200 `applied` ou `replayed` | `synced` | remove o item inteiro (e seus dados sensíveis); atualiza a viagem guardada; libera os anexos da entrega |
| 409 ou 422 com código de conflito | `conflict` | cria registro em `local_sync_conflicts` com as duas versões; bloqueia só os dependentes |
| 400 `VALIDATION_FAILED` | `conflict` (`validation_rejected`) | idem; a pessoa decide |
| 401 ou 403 | `pending` | interrompe o envio; pede nova entrada |
| rede ou 5xx | `pending` | espera crescente; conta a tentativa |

## 5. Anexos

1. Aparecem em `local_attachments` com `status: pending`, vinculados ao item da entrega (`outbox_item_id`); o anexo **acrescentado depois** de uma entrega já registrada não tem item da outbox e usa o `delivery_id` já conhecido (`get_trip_offline.deliveries[]`).
2. Só começam a enviar quando o item da entrega está `synced` e a resposta trouxe o `delivery_id` (ou, no anexo posterior, quando o `delivery_id` já é conhecido).
3. Um anexo por vez por entrega; cada envio leva `attachment_id`, `sha256` e o arquivo.
4. `ATTACHED` ou `REPLAYED` → `uploaded`: o registro e os `bytes` são removidos. Falha de rede → volta a `pending`. Recusa do servidor (`VALIDATION_FAILED`, `ATTACHMENT_LIMIT`) → `failed`, com o motivo e a opção de remover o anexo ou tirar outra foto.
5. O atraso ou a falha de um anexo **nunca** reverte nem bloqueia o registro da entrega.

## 6. Conflitos

- O registro do conflito guarda só um **resumo sem dado sensível**; os dados originais ficam apenas no item da fila que ele referencia e saem do aparelho junto com o item (ao descartar ou ao confirmar).
- Mostram o que a pessoa fez (sem dado sensível em texto aberto na lista), o motivo, o estado atual do servidor e as decisões:
  - **Descartar**: exige conexão, permissão `trip.operate` e justificativa de 5 a 500 caracteres; chama `resolve_sync_conflict` (`discard`) e **só depois** de o servidor confirmar o item vai para `discarded`.
  - **Reenviar**: disponível quando a causa foi corrigida; chama `resolve_sync_conflict` (`resubmit`) e devolve o item a `pending`, com o mesmo `idempotency_key`.
- Nada é descartado em silêncio por tempo, sessão ou limite.
- Itens sem confirmação há mais de 24 horas ganham destaque em texto na tela e no indicador.

## 6a. Sessão local offline

- A tela guarda a hora da última confirmação da sessão pelo servidor (`last_session_confirmed_at`, só o instante, sem token).
- Offline: registrar é permitido enquanto `agora - last_session_confirmed_at < 8 horas`; a inatividade de 30 minutos não bloqueia.
- Passado o teto: novas operações ficam bloqueadas ("Sessão offline expirada. Conecte-se para entrar de novo."), a fila continua guardada e a tela mostra só a contagem de pendentes.
- Ao voltar a conexão: o gate de sessão do coordenador confirma a sessão antes do envio; falha de sessão interrompe o envio e pede nova entrada da mesma conta, mantendo a fila.

## 7. Espaço e limites

| Limite | Valor | Comportamento |
|---|---|---|
| Operações pendentes | 200 | aviso a 160; acima do limite, novas operações **continuam aceitas** (o registro principal tem prioridade) e a tela alerta |
| Anexos pendentes | 50 MB | aviso a 40 MB; acima do limite, **novas fotos deixam de ser aceitas** (a entrega segue sem elas) |
| Fotos por entrega | 3 | botão desabilitado ao chegar no limite |
| Armazenamento persistente | pedido ao iniciar (`navigator.storage.persist()`) | se negado, a tela avisa em texto que o navegador pode limpar os dados |

## 8. O que nunca acontece

- Posição, nome do recebedor, foto ou assinatura em `localStorage`, `sessionStorage`, cache de rede ou URL, ou copiados para o registro do conflito (`local_sync_conflicts`).
- Enviar a mesma operação a dois destinos, ou a um destino diferente do de origem.
- Uma conta ver ou enviar a fila de outra, ou de outra organização.
- Mostrar uma operação como "enviada" antes da confirmação do servidor.
- Excluir dado do aparelho sem confirmação do servidor ou decisão registrada.
