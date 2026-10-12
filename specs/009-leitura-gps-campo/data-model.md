# Modelo de dados: Leitura de identificadores e GPS no aplicativo de campo

**Feature**: `009-leitura-gps-campo` | **Data**: 12/10/2026

Esta spec **não cria tabelas**. Ela acrescenta colunas às tabelas da Spec 008, ajusta uma restrição e define valores e regras de domínio. Toda tabela já tem `organization_id` e RLS sem política de escrita (as escritas passam por RPC `security definer`). Nenhum dado é excluído.

## 1. Valores novos

| Conceito | Valores | Onde vive |
|---|---|---|
| Método de conferência ou de entrega por cilindro | `manual` (toque, já existente), `typed`, `camera`, `nfc` | `trip_items.check_source` e `source` de cada elemento de `trip_deliveries.results` |
| Origem da posição | `gps`, `typed`, `site_address` | `position_source` (entrega) e `arrival_position_source` (chegada) |
| Faixa de precisão (só na tela e na auditoria) | `good` (até 100 m), `low` (acima de 100 m) | calculada, não gravada |

`site_address` é derivado de `at_site_address = true`; `gps` e `typed` só existem com coordenadas.

## 2. `public.trip_items` (alteração)

| Mudança | Detalhe |
|---|---|
| Restrição `trip_items_source_check` | de `check_source is null or check_source = 'manual'` para `check_source is null or check_source in ('manual','typed','camera','nfc')` |
| Linhas existentes | nenhuma alteração; continuam `manual` |

## 3. `public.trip_stops` (posição da chegada)

| Coluna | Tipo | Regra |
|---|---|---|
| `arrival_latitude`, `arrival_longitude` | numeric(9,6) | ambas ou nenhuma, dentro do intervalo |
| `arrival_accuracy_m` | numeric(8,1) | nula sem posição; 0 a 100000 |
| `arrival_position_source` | text | nula sem posição; `gps` ou `typed`; exige coordenadas |
| `arrival_position_read_at` | timestamptz | só com origem `gps`; não pode estar no futuro nem ter mais de 10 minutos no instante do registro |
| `arrival_outside_geofence` | boolean | nulo sem posição ou sem geocerca ativa; verdadeiro quando fora |

A chegada continua uma só por parada e não pode ser editada nem apagada (Spec 008).

## 4. `public.trip_deliveries` (metadados da posição)

| Coluna | Tipo | Regra |
|---|---|---|
| `accuracy_m` | numeric(8,1) | nula sem posição; 0 a 100000 |
| `position_source` | text | nula sem posição; `gps`, `typed` ou `site_address`; coerente com os campos de posição |
| `position_read_at` | timestamptz | só com origem `gps`; mesma sanidade da chegada |

Mantém-se a restrição `trip_deliveries_position_exclusive_check` (coordenadas **ou** "no endereço da unidade", nunca as duas). `outside_geofence` continua como está.

## 5. Eventos e auditoria

| Evento da viagem (Spec 008) | O que a Spec 009 acrescenta ao conteúdo |
|---|---|
| `item_checked` | `source` (já existe como `manual`; passa a receber os quatro valores) |
| `stop_arrived` | `position_source` e `accuracy_band`; **sem coordenadas** |
| `delivery_registered` e `delivery_corrected` | `sources` (contagem por método, já na US1), `position_source` e `accuracy_band` (US2) e, por cilindro, `source` no resultado; **sem coordenadas e sem nome do recebedor** |

Os eventos são imutáveis. A auditoria (`write_audit_event`) recebe só método, origem e faixa de precisão.

## 6. Operação de consulta nova

`public.query_identifier_resolve(p_actor, p_session, p_organization, p_candidates text[], p_expected_kind text)` devolve:

| Código | Quando | Conteúdo |
|---|---|---|
| `FOUND` | um candidato casa com identificador **ativo** | `cylinder` (id, número de série, situação do cilindro, situação do estoque), `identifier` (id, tipo), `matched` (posição do candidato), e `trip` (id, número, situação) **só se** a pessoa tem `trip.read` e o cilindro está em viagem aberta |
| `NOT_FOUND` | nenhum candidato casa na organização ativa; vale também para código de outra organização | sem dados; `deactivated: true` com `cylinder` mínimo quando o valor pertencia a um identificador desativado, como no `lookup` |
| `VALIDATION_FAILED` | lista vazia, mais de 3 candidatos ou valor com mais de 200 caracteres | campos com erro |
| `AUTH_REQUIRED` / `ACCESS_DENIED` | sessão inválida ou falta `cylinder.read` | padrão das operações existentes |

## 7. Entidades de domínio (cliente, sem tabela)

| Entidade | Campos | Regras |
|---|---|---|
| Candidato de identificador | `value`, `origin` (`serial`, `serial_colon`, `text`, `scanned`) | até 3 por consulta; `serial` em maiúsculas sem separadores; `serial_colon` com dois-pontos entre bytes |
| Leitura de posição | `latitude`, `longitude`, `accuracy_m`, `read_at`, `source` | `isStale(now)` verdadeiro acima de 2 minutos; `band` = `low` acima de 100 m |
| Estado do leitor | `idle`, `opening`, `reading`, `paused` (2 minutos sem leitura), `unsupported`, `denied`, `error` | transições só pelo componente; sem estado guardado fora da tela |

## 8. Regras de negócio resumidas

- **RN-001**: ler **identifica**; a mudança de situação continua sendo da mesma RPC da Spec 008 (`check_item`, `register_delivery`).
- **RN-002**: o método é declarado pelo cliente e só validado quanto ao valor.
- **RN-003**: a posição do GPS é evidência declarada pelo aparelho; guarda-se precisão e horário e não se afirma autenticidade.
- **RN-004**: localização só é lida a pedido, uma vez, no momento do registro.
- **RN-005**: código que não existe na organização ativa é sempre "não encontrado", inclusive o de outra organização.

## 9. Retenção e visibilidade

As coordenadas de `trip_stops` e `trip_deliveries` ficam guardadas enquanto a viagem existir, sem exclusão física, e só saem do servidor para quem tem `trip.read` (ver `get_trip` em `contracts/operacoes-servidor.md`). Retenção por prazo e anonimização são de uma spec de privacidade futura.

## 10. Volumes

Nenhuma tabela nova. O crescimento é de 9 colunas em tabelas que já recebem uma linha por parada e por entrega; o índice único de identificadores ativos (`organization_id, value_normalized`) já cobre a resolução, com no máximo 3 buscas por chamada.
