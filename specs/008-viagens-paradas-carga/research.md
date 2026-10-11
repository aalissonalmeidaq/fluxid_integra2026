# Pesquisa e decisões: Viagens, paradas, carga e entrega

**Feature**: `008-viagens-paradas-carga` | **Data**: 08/10/2026

Nenhum `NEEDS CLARIFICATION` ficou aberto depois de `/speckit-clarify`. Cada decisão abaixo segue o padrão já provado nas Specs 002, 006 e 007, salvo onde indicado.

## 1. Onde fica a regra: banco ou função

**Decisão**: transições, reserva, elegibilidade e permissões são **funções SQL** `security definer`; as Edge Functions só autenticam, validam o formato do corpo e chamam a RPC. O cliente repete as regras puras (capacidade, resumo, rótulos) só para evitar ida e volta.

**Motivo**: é o padrão das Specs 006 e 007 e a única forma de a regra valer também contra pedido direto (CA-003). A atomicidade (reserva, evento, auditoria e custódia na mesma transação) só existe no banco.

**Alternativas descartadas**: regra na Edge Function (perde atomicidade e duplica a regra) e regra só no cliente (contorna-se com pedido direto).

## 2. Reserva de cilindro sem duplicidade

**Decisão**: `trip_items.is_open` (coluna gerada: item em `planned`, `checked`, `in_transit` ou `not_delivered`) e **índice único parcial** `(cylinder_id) where is_open`. A RPC ordena os cilindros por `id`, trava as linhas com `for update` nessa ordem e só então insere; a violação do índice vira `CYLINDER_RESERVED` com a viagem que o reservou.

**Motivo**: o índice é a garantia final (vale até para um erro de código); a ordem fixa evita deadlock entre duas viagens que disputam os mesmos cilindros.

**Alternativas descartadas**: coluna `reserved_trip_id` em `cylinders` (mistura dois ciclos de vida e exige atualizar duas tabelas em cada transição) e trava de aplicação (não resiste a duas instâncias).

## 2b. Veículo e motorista ocupados

**Decisão** (clarificação de 08/10/2026): dois **índices únicos parciais** em `trips` (`vehicle_id` e `driver_id` onde `status in ('loading', 'in_progress')`) garantem uma viagem aberta por vez; a RPC confere antes para devolver `RESOURCE_BUSY` com a viagem que ocupa o recurso. O planejamento não bloqueia: viagens "planejadas" podem repetir veículo e motorista, com aviso de data coincidente. A conferência roda em `start_loading` e de novo em `start_trip`.

**Motivo**: o caminhão e a pessoa só podem estar numa saída por vez, mas o escritório precisa planejar com antecedência.

## 3. Estados independentes

**Decisão**: seis colunas independentes, cada uma com `check` e função de transição própria:

| Estado | Valores |
|---|---|
| Viagem (`trips.status`) | `planned`, `loading`, `in_progress`, `completed`, `cancelled` |
| Parada (`trip_stops.status`) | `pending`, `on_site`, `delivered`, `with_divergence` |
| Item de carga (`trip_items.item_status`) | `planned`, `checked`, `in_transit`, `delivered`, `not_delivered`, `removed`, `released`, `returned` |
| Bloqueio (`trip_items.lock_status`) | `none`, `locked`, `unlocked` |
| Estoque (`cylinders.stock_status`, já existe) | `in_stock`, `out_of_stock` |
| Custódia (`cylinders.custody_status`, nova) | `in_organization`, `in_transit`, `at_customer` |

`removed` é o item retirado no carregamento; `released` é o item cuja reserva acabou porque a viagem foi cancelada antes de sair; `returned` é o item que voltou ao estoque depois de ficar em trânsito.

**Motivo**: Constituição, princípio IV, e regra do PRD de que entrega e desbloqueio são independentes. `lock_status = locked` é só "bloqueado (lógico)"; a Fase 6 acrescenta a confirmação da trava em coluna própria, sem mexer nesta.

**Alternativa descartada**: um único `status` composto por item (impede entrega e desbloqueio independentes).

## 4. Custódia do cilindro

**Decisão**: duas colunas novas em `cylinders` (`custody_status` com padrão `in_organization` e `custody_site_id` nulo fora de `at_customer`) e cinco tipos novos no `check` de `cylinder_events.event_type`: `trip_reserved`, `trip_released`, `trip_departed`, `trip_delivered`, `trip_returned`. A saída do estoque ao iniciar reaproveita `stock_status = out_of_stock` e o evento `trip_departed` guarda o `stock_out` implícito.

**Motivo**: lista, filtro e detalhe do cilindro precisam saber onde ele está sem consultar viagens; o evento imutável continua sendo a fonte da história.

**Riscos tratados**: `cylinders_inactive_out_of_stock_check` continua valendo (inativo é sempre fora do estoque); a migration recria o `check` de tipos de evento e é testada com os eventos já existentes.

## 5. Idempotência

**Decisão**: todo comando recebe `request_id` (UUID gerado pela tela). `private.trip_requests (organization_id, request_id, operation, trip_id, result, created_at)` tem chave única por organização e requisição; a RPC consulta antes de agir e, se achar, devolve o `result` gravado com `replayed: true`. O mesmo `request_id` com outra operação ou outra viagem é `REQUEST_REUSED` (409).

**Motivo**: duplo clique e queda de rede (spec, casos de borda) e a fila offline da Fase 5, que reenviará pedidos.

**Alternativa descartada**: depender só de `expected_version` (cobre edição concorrente, mas não a repetição do mesmo comando de criação).

## 6. Número sequencial da viagem

**Decisão**: `private.trip_counters (organization_id, last_number)` incrementado com `update ... returning` na mesma transação da criação; `unique (organization_id, number)`. Números não são reaproveitados, mesmo com a criação desfeita por falha (a transação inteira volta, então não há buraco por falha).

**Alternativa descartada**: `max(number) + 1` (disputa entre duas criações) e sequência global (vaza volume entre organizações).

## 7. Posição da entrega e geocerca

**Decisão**: a entrega guarda `latitude`, `longitude` (ambas ou nenhuma) e `at_site_address` (booleano). Se houver posição e a unidade tiver geocerca ativa, a RPC chama a função de ponto-dentro da Spec 007 e grava `outside_geofence` (verdadeiro, falso ou nulo se não houve comparação). Fora da geocerca é aceito e destacado.

**Motivo**: a spec manda aceitar e avisar (RF-016); o GPS capturado é da Fase 5.

## 8. Recebedor e dado pessoal

**Decisão**: `recipient_name` (2 a 120) e `recipient_role` (até 80) só em `trip_deliveries`. Eventos e auditoria guardam apenas `has_recipient: true`. As RPCs de leitura devolvem o nome só a quem tem `trip.recipient`, e `"(restrito)"` aos demais. Nenhum documento é coletado.

**Motivo**: minimização (RF-017) e CA-007. O nome não entra em log porque o manipulador nunca registra corpo nem resposta.

## 9. Permissões

**Decisão**: oito permissões novas (`trip.read`, `trip.write`, `trip.operate`, `trip.cancel`, `trip.unlock`, `trip.exception`, `trip.history`, `trip.recipient`) e um papel padrão novo, **Gestor logístico** (`logistics_manager`). `trip.exception` é **crítica** (delegação restrita ao administrador do tenant). A exigência de `aal2` vale **só** para o desbloqueio excepcional, conforme a spec.

**Alternativas descartadas**: reaproveitar `cylinder.*` (mistura quem mexe no cadastro com quem opera a carga) e uma permissão única de viagem (impede separar planejar, operar e aprovar exceção).

## 10. Retirada de cilindro no carregamento e retorno ao estoque

**Decisão**: `remove_item` (exceção) leva o item a `removed` e libera a reserva; o evento `trip_released` aponta a viagem. O **retorno ao estoque** (`return_item`) só vale para item `in_transit` ou `not_delivered` e leva o cilindro a `in_stock` e `custody_status = in_organization`, com evento `trip_returned` e justificativa; o item vira `returned`.

**Motivo**: RF-012 e RF-023. Nada some sozinho: cilindro em trânsito de viagem cancelada fica aberto até uma decisão registrada.

## 11. Desbloqueio

**Decisão**: `register_unlock` grava uma linha em `trip_unlocks` e passa `lock_status` de `locked` para `unlocked`. Normal: item `delivered`, permissão `trip.unlock`. Excepcional: item `in_transit` ou `not_delivered`, exige `trip.unlock` **e** `trip.exception`, `aal2` conferido no servidor e justificativa. Não existe operação de refazer o bloqueio nesta spec (novo bloqueio é nova viagem).

**Motivo**: regra do PRD (desbloqueio excepcional com MFA e auditoria) e RF-018 a RF-020.

## 12. Cliente: telas e modais

**Decisão**: lista `/viagens`, detalhe `/viagens/:id` com abas "Paradas e carga" e "Histórico", e formulário `/viagens/nova` e `/viagens/:id/editar` em modal pelo padrão da Spec 007. Conferência, entrega, desbloqueio, retirada, retorno e cancelamento são painéis e diálogos dentro do detalhe, sem rota própria. Escolha de cilindros por busca paginada com contagem e seleção por teclado.

**Motivo**: padrão visual da Spec 005 e do cadastro da Spec 007; evita rotas que a Fase 5 trocaria.

## 13. Desempenho

**Decisão**: índices `trips (organization_id, status, planned_date desc)`, `trips (organization_id, number desc)`, `trip_stops (trip_id, position)`, `trip_items (trip_id, stop_id)`, `trip_items (cylinder_id) where is_open` (único), `trip_items (cylinder_id, created_at desc)` e `trip_events (trip_id, sequence desc)`. A lista usa paginação por cursor e conta o total em consulta separada, como a Spec 007.

**Verificação**: medição em 4G com o volume de referência (10 mil viagens e 200 mil itens) no mesmo roteiro das Specs 006 e 007.

## 14. O que fica para depois (e como o desenho já o aceita)

| Item futuro | Gancho já previsto |
|---|---|
| Leitura por QR, Data Matrix e NFC (Fase 5) | `check_item` ganha `source` (`manual` agora, `scan` depois), sem mudar o modelo |
| GPS do celular e do lacre (Fase 5) | a entrega já tem posição e comparação com a geocerca |
| Fila offline (Fase 5) | todo comando já é idempotente por `request_id` |
| Comando e confirmação da trava (Fase 6) | `lock_status` independente; coluna `lock_confirmed_by_device` virá em spec própria |
| Proximidade e alertas (Fase 7) | eventos de viagem e de custódia já imutáveis e ordenados |
