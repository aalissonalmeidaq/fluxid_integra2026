---
description: "Tarefas executáveis da Spec 009 — Leitura de identificadores e GPS no aplicativo de campo"
---

# Tarefas: Leitura de identificadores e GPS no aplicativo de campo

**Entrada**: artefatos em `specs/009-leitura-gps-campo/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD. Em cada incremento, escrever o teste, confirmar a falha esperada (RED), implementar (GREEN), refatorar e rodar a regressão antes de avançar. Testes de banco ficam em `supabase/tests/009_*.test.sql` (pgTAP); testes do cliente ficam ao lado do código (`*.test.ts` e `*.test.tsx`); E2E em `tests/e2e/campo-*.spec.ts`.

**Escopo protegido**:
- Fora desta spec: fila offline e sincronização, fotos e assinatura (Spec 010), trava física e IoT (Fase 6), rastreamento contínuo, gravação ou formatação de etiquetas NFC e login ou app próprio do motorista [spec, Objetivos e Premissas].
- **Nenhuma dependência nova** em `package.json` e nenhuma extensão nova no banco: câmera, NFC e GPS usam recursos nativos do navegador [plan.md].
- **Nenhuma tabela nova**; só colunas em `trip_stops` e `trip_deliveries`, uma restrição alterada em `trip_items` e uma consulta nova [data-model.md].
- **Nenhuma permissão nova** [RF-019].
- **Nenhuma coordenada, valor lido, número de série de etiqueta ou nome do recebedor** em evento, auditoria, log, URL, mensagem de erro ou armazenamento do aparelho (`localStorage`, `sessionStorage`, IndexedDB) [RF-015, RF-017, CA-004, CA-005]; todo dado de teste é fictício e `@example.invalid`.
- Nenhuma imagem de câmera é enviada, guardada ou registrada [RF-018].
- Nenhuma chave `service_role` ou credencial privilegiada no cliente [RF-016].
- Nenhuma operação de exclusão física [RF-023].
- Os testes das Specs 001 a 008 só mudam onde o catálogo de operações ganha `resolve` e os campos novos, e onde a restrição `check_source` deixa de aceitar só `'manual'`. A Spec 008 reservou `check_source = 'scan'` para esta fase; **esta spec usa os quatro métodos `manual`, `typed`, `camera` e `nfc`** (decisão da spec, Clarifications).
- Arquivos alheios à spec (`package.json`, `package-lock.json`, `vite.config.ts` e outros modificados fora desta spec) **não** entram nos commits; usar `git add` explícito.

**Convenções de interface** (AGENTS.md, Spec 005): usar a skill `ui-ux-pro-max` ao criar ou alterar telas; só tokens (nenhum valor arbitrário do Tailwind, cor literal ou transição que atrase o anel de foco; `tests/contract/escalas-no-codigo.test.ts` reprova); movimento respeita `prefers-reduced-motion`; capturas visuais regeneradas no Linux com `npm run test:visual:atualizar`, sem versionar `*-win32.png`; reconstruir o `dist` (`npm run build`) antes de rodar E2E.

**Nomes de migrations** (as três são independentes entre si, exceto que a de posição recria `register_delivery` e precisa vir depois da de método): `20261013100000_field_reading_source.sql` (US1), `20261013100100_field_position.sql` (US2) e `20261013100200_resolve_identifier.sql` (Fundação). Se já houver migration com carimbo posterior ao de `20261010100100`, manter a ordem relativa e ajustar só a data.

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode rodar em paralelo, porque não modifica os mesmos arquivos nem depende de tarefa incompleta.
- `[USN]`: história de usuário da spec (US1 a US4, na ordem das histórias 1 a 4).
- Referências entre colchetes ligam a tarefa aos requisitos e critérios da spec.

## Mapa das histórias

| História | Prioridade | Entrega |
|---|---|---|
| US1 Conferir o carregamento e a entrega lendo os cilindros | P1 | método em `check_item` e `register_delivery`, leitor na conferência e na entrega, histórico com o método |
| US2 Registrar chegada e entrega com a posição do GPS | P1 | colunas e RPCs de posição, bloco de posição, precisão, validade, geocerca na chegada |
| US3 Consultar um cilindro lendo o código | P2 | botão "Ler cilindro" na lista, no detalhe e nas viagens, para quem vê cilindros |
| US4 Leitura e GPS acessíveis e funcionando no celular instalado | P2 | teclado, anúncio de resultado, offline, PWA, 360 a 1920 px, capturas visuais |

---

## Fase 1 — Preparação

**Objetivo**: rastreabilidade e linha de base antes de qualquer mudança.

- [X] T001 Registrar em `specs/009-leitura-gps-campo/plan.md` (seção Rastreabilidade) o número da issue da Spec 009 e a branch `feat/009-leitura-gps-campo`; se a issue ainda não existir, **pedir confirmação da pessoa responsável antes de abri-la** (ação externa) com o título "Spec 009: leitura de identificadores e GPS no aplicativo de campo".
- [X] T002 Rodar `npm run lint`, `npm run typecheck`, `npm test` e `npx supabase test db` na branch e registrar em `specs/009-leitura-gps-campo/baseline.md` que as suítes das Specs 001 a 008 estão verdes antes da mudança (contagens de arquivos e testes).
- [X] T003 [P] Rodar `npm run build` e anotar em `baseline.md` o tamanho do pacote de entrada (referência para o limite de mais 5% [RNF-005]) e as medianas de `tests/e2e/medicao-shell.spec.ts`, se existirem.
- [X] T004 [P] Anotar em `baseline.md` o procedimento do Supabase local: funções novas exigem `npx supabase stop` e `npx supabase start`; as suítes pgTAP que contam linhas de `audit_logs` exigem base limpa (`npx supabase db reset` antes de `npx supabase test db`, depois de `test:live`).
- [X] T005 [P] Conferir com `git status` que os arquivos alheios à spec **não** entram nos commits desta spec e que os dois stashes antigos do repositório continuam intactos.

---

## Fase 2 — Fundação (bloqueia as histórias)

**Objetivo**: regras puras, adaptadores do navegador, a consulta `resolve` e o leitor compartilhado, usados por US1, US2 e US3.

### Domínio (puro, sem navegador)

- [X] T006 [P] RED e GREEN em `src/domain/field/identifier-candidates.test.ts` e `identifier-candidates.ts`: a partir do número de série da etiqueta e dos textos gravados, montar de **1 a 3 candidatos**, cada um com **1 a 200 caracteres, sem quebra de linha**; o número de série vira `serial` (maiúsculas, sem `:`, `-` nem espaços) e `serial_colon` (maiúsculas, com `:` entre bytes); texto gravado vira `text`, sem espaços nas pontas; descartar vazios e duplicados; serial inutilizável (vazio ou só zeros) não gera candidato [RF-007, plan.md].
- [X] T007 [P] RED e GREEN em `src/domain/field/position-quality.test.ts` e `position-quality.ts`: `band(accuracy_m)` devolve `low` acima de 100 m e `good` até 100 m; `isStale(readAt, now)` é verdadeiro **acima de 2 minutos**; constante `POSITION_TIMEOUT_MS = 15000`; precisão `0 a 100000`; sem posição, sem faixa [RF-009, RF-011, RF-014, RNF-002].
- [X] T008 [P] RED e GREEN em `src/domain/field/reading-source.test.ts` e `reading-source.ts`: os valores `manual`, `typed`, `camera` e `nfc`, com rótulos em português ("toque", "código digitado ou leitor", "câmera", "NFC") e a frase do histórico ("conferido por câmera") [RF-001, RN-002].
- [X] T009 [P] RED e GREEN em `src/domain/field/scan-debounce.test.ts` e `scan-debounce.ts`: o mesmo código em sequência curta conta como uma leitura (janela configurável, padrão 1,5 s, relógio injetável); códigos diferentes passam [RF-004].

### Adaptadores do navegador (finos, trocáveis nos testes)

- [X] T010 [P] RED e GREEN em `src/infrastructure/field/barcode-reader.test.ts` e `barcode-reader.ts`: extrair do `src/pages/cylinders/components/camera-scan-button.tsx` a consulta de formatos suportados (`qr_code`, `data_matrix`) e o ciclo da câmera, com uma interface `BarcodeReader` e uma implementação falsa para testes; falha na consulta vale como "sem suporte", e fora de contexto seguro (`isSecureContext` falso) também vale como "sem suporte", com teste. O adaptador devolve `multiple` quando o detector acha mais de um código no mesmo quadro, sem entregar nenhum valor; teste com detector falso que devolve 2 códigos [RF-008, RF-018].
- [X] T011 [P] RED e GREEN em `src/infrastructure/field/nfc-reader.test.ts` e `nfc-reader.ts`: interface `NfcReader` sobre o leitor NFC do navegador (só Chrome no Android, contexto seguro), que devolve número de série e textos gravados ao evento de leitura; sem o recurso, "sem suporte"; etiqueta ilegível ou sem número de série utilizável vira erro tipado `unreadable` (etiqueta de número aleatório não é detectável e cai em "não encontrado"); implementação falsa para testes [RF-007, RF-008].
- [X] T012 [P] RED e GREEN em `src/infrastructure/field/geolocation-reader.test.ts` e `geolocation-reader.ts`: **uma** chamada por pedido (alta precisão, limite de 15 s, sem posição em cache), **nunca** observação contínua; erros tipados `denied`, `unavailable` e `timeout`; devolve latitude, longitude, precisão e horário da leitura; nada é guardado em `localStorage`, `sessionStorage` nem IndexedDB; fora de contexto seguro (`isSecureContext` falso) vale como `unavailable`, com teste; implementação falsa para testes [RF-009, RF-012, RF-015, RN-004].

### Servidor: consulta `resolve`

- [X] T013 RED em `supabase/tests/009_resolve_identifier.test.sql` (pgTAP, **dois tenants**): `FOUND` para identificador ativo da organização; `NOT_FOUND` **igual** para código inexistente e para código do Tenant B; `deactivated: true` com `cylinder` mínimo para valor desativado; `VALIDATION_FAILED` para lista vazia, mais de 3 candidatos ou candidato com mais de 200 caracteres; o candidato que casa primeiro vale; `expected_kind` restringe o tipo; `trip` (`id`, `number`, `status`) só para quem tem `trip.read`; negado sem `cylinder.read`; nenhuma linha de auditoria com o valor lido [RF-002, RF-003, RN-005, CA-001, MS-004].
- [X] T014 GREEN em `supabase/migrations/20261013100200_resolve_identifier.sql`: `public.query_identifier_resolve(p_actor, p_session, p_organization, p_candidates text[], p_expected_kind text)`, `security definer`, `set search_path = ''`, procurando só identificadores **ativos** por `value_normalized` na organização ativa; `grant` só a `service_role`; códigos `FOUND`, `NOT_FOUND`, `VALIDATION_FAILED`, `AUTH_REQUIRED` e `ACCESS_DENIED` [data-model.md §6, contracts/operacoes-servidor.md].
- [X] T015 [P] RED e GREEN em `supabase/functions/query-cylinders/handler.ts` e `_shared/operations.ts` com testes em `tests/contract/query-cylinders-handler.test.ts`: operação `resolve` com `candidates` (1 a 3, cada um de 1 a 200 caracteres sem quebra de linha) e `expected_kind?`; `NOT_FOUND` byte a byte igual para código inexistente e de outra organização [RF-002, CA-001].
- [X] T016 [P] Atualizar o catálogo de operações e as verificações de contrato (`tests/contract/` que listam operações e permissões) para `resolve`, **sem permissão nova**, e acrescentar um teste de contrato que reprova coordenada, número de série de etiqueta ou valor lido em corpo de erro, log e auditoria [RF-017, RF-019, CA-004].

### Cliente: serviço e leitor compartilhado

- [X] T017 RED e GREEN em `src/application/field/field-service.test.ts` e `field-service.ts`: `resolveIdentifier(candidates, expectedKind?)` sobre o transporte de `query-cylinders`, com os resultados tipados (`found`, `not_found`, `deactivated`, `inactive`, `not_in_trip`, `invalid`, `offline`, `access_denied`, `session_expired`), sem guardar resposta em armazenamento local e sem chamar o servidor offline [RF-002, RF-016, RF-022].
- [X] T018 RED e GREEN em `src/pages/field/identifier-reader-dialog.test.tsx` e `identifier-reader-dialog.tsx` (skill `ui-ux-pro-max`): leitor contínuo em diálogo modal com os modos Câmera e NFC **só quando há suporte**, estados `opening`, `reading`, `unsupported`, `denied`, `error` e offline do contrato, foco preso, Escape devolve o foco ao botão, resultado anunciado em uma região `role="status"`, contagem ("3 de 10 conferidos"), anti-repetição de T009, estado `paused` após **2 minutos sem nenhuma leitura** (relógio injetável nos testes: desliga câmera e NFC, avisa em texto na região `status`, oferece "Continuar lendo" e preserva a janela e os resultados), nenhuma animação com `prefers-reduced-motion`, carregado sob demanda (`React.lazy`). O resultado `multiple` mostra "Há mais de um código no quadro. Aponte para um só." na região `status`, sem conferir nada e sem fechar a janela; teste de componente [RF-001, RF-004, RF-008, RF-018, RF-020, RNF-005, contracts/telas-e-fluxos.md].
- [X] T019 Refatorar `src/pages/cylinders/components/camera-scan-button.tsx` para usar `barcode-reader.ts`, mantendo o comportamento e **todos os testes da Spec 006 verdes** (`camera-scan-button.test.tsx`, `stock-in-page.test.tsx`) [RF-008].

**Ponto de verificação**: com a Fundação pronta, a resolução e o leitor existem e nenhuma tela de viagem mudou ainda.

---

## Fase 3 — US1: Conferir o carregamento e a entrega lendo os cilindros (P1) 🎯 MVP

**Objetivo**: a conferência e a entrega aceitam a leitura e registram o método. **Teste independente**: com uma viagem de quatro cilindros e leituras simuladas, ler os quatro, confirmar que cada um fica "conferido" com o método registrado, e que um código de outra viagem e um de outra organização são recusados; repetir na entrega.

### Servidor

- [X] T020 [US1] RED em `supabase/tests/009_reading_source.test.sql` (pgTAP, dois tenants): `check_item` com `source` em `manual`, `typed`, `camera` e `nfc` grava o método na linha e no evento `item_checked`; valor fora da lista dá `VALIDATION_FAILED` com `fields.source`; sem `source` vale `manual`; `uncheck_item` limpa o método; `register_delivery` aceita `results[].source` com os quatro valores e padrão `manual`, só para resultados "entregue"; a auditoria guarda o método e **nenhum** valor lido; Tenant B não confere item do Tenant A [RF-001, RF-001a, RF-005, RN-001, RN-002, CA-002, MS-005].
- [X] T021 [US1] GREEN em `supabase/migrations/20261013100000_field_reading_source.sql`: trocar `trip_items_source_check` de `check_source is null or check_source = 'manual'` para `check_source is null or check_source in ('manual','typed','camera','nfc')`; `check_item` ganha `p_source text default 'manual'` validado; `register_delivery` valida e grava `results[].source` (mantendo exclusividade de posição, justificativa de correção e demais regras da Spec 008); `grant` só a `service_role`; as linhas antigas continuam `manual`. Antes de recriar `check_item` (que ganha `p_source text default 'manual'`), fazer `drop function public.check_item(uuid, uuid, uuid, uuid, uuid, uuid);`; `register_delivery` **mantém a assinatura** (o método vai dentro de `results`) e é só substituída por `create or replace`, preservando o `grant`; o campo ausente na borda chega como `null` e vale "manual"; o teste de T020 confere que existe **uma só** assinatura de cada função (`pg_proc`) e que o `grant` é só da `service_role` [data-model.md §2 e §5].
- [X] T022 [P] [US1] RED e GREEN em `supabase/functions/manage-trips/handler.ts` e `tests/contract/manage-trips-handler.test.ts`: campo opcional `source` em `check_item` e `results[].source` em `register_delivery`, com a lista fechada e o erro `fields.source` [contracts/operacoes-servidor.md].

### Cliente

- [X] T023 [P] [US1] RED e GREEN em `src/application/trips/trip-service.test.ts` e `trip-service.ts`: `checkItem(tripId, itemId, source)` e `source` por cilindro em `registerDelivery`; erros mapeados como os existentes; nenhum valor lido guardado [RF-001, RF-001a].
- [X] T024 [US1] RED e GREEN em `src/pages/trips/components/loading-panel.test.tsx` e `loading-panel.tsx`: botão "Ler cilindro" que abre o leitor de T018; cada leitura resolvida por `resolveIdentifier` e casada com um item **previsto** da viagem chama `checkItem` com o método (`camera`, `nfc` ou `typed`); mensagens por resultado exatamente como em `contracts/telas-e-fluxos.md` (conferido, já conferido sem evento novo, não pertence a esta viagem com a viagem só para `trip.read`, não encontrado com a dica de formato no NFC); desfazer continua; conferir por toque continua `manual` [RF-001, RF-003, RF-005, RN-001, RN-005].
- [X] T025 [US1] RED e GREEN em `src/pages/trips/components/delivery-dialog.test.tsx` e `delivery-dialog.tsx`: a leitura marca "entregue" o cilindro **previsto na parada**, com o método por cilindro; cilindro não previsto na parada é recusado com o texto do contrato; "não entregue" e a justificativa continuam manuais; a entrega só vale ao salvar, uma vez, e a leitura nunca salva sozinha [RF-001a, Spec 008 RF-013, RF-014].
- [X] T026 [P] [US1] RED e GREEN em `src/domain/trips/trip-history-format.test.ts` e `trip-history-format.ts`, e em `src/pages/trips/components/trip-history-list.tsx`: o histórico mostra o método em texto ("conferido por câmera", "entregue por NFC") sem nunca mostrar o valor lido [RF-005, RF-017].
- [X] T027 [P] [US1] Criar o simulador de leitura para E2E em `tests/e2e/support/mock-field-reading.ts` (detector de código e leitor NFC falsos injetados antes da página, sem câmera real) e estender `tests/e2e/support/mock-trips*.ts` e o backend simulado com `resolve` e com `source`.
- [X] T028 [US1] E2E em `tests/e2e/campo-leitura.spec.ts` (Chromium e WebKit, 360, 768 e 1920 px): ler os quatro cilindros e ver "4 de 4"; recusas (outra viagem, já conferido, Tenant B igual a inexistente); desfazer e ler de novo; leitura repetida conta uma; na entrega marcar "entregue" por leitura e recusar cilindro não previsto; sem suporte, o botão de leitura não aparece e o texto explica, com a conferência manual completa [CA-001, CA-003, MS-001].

**Ponto de verificação**: US1 entregue e demonstrável sozinha (MVP).

---

## Fase 4 — US2: Registrar chegada e entrega com a posição do GPS (P1)

**Objetivo**: chegada e entrega com a posição lida do aparelho, com origem, precisão e horário. **Teste independente**: com posição simulada dentro e fora da geocerca da unidade, registrar a entrega, confirmar a origem `gps` e a precisão no evento, e repetir com permissão negada para confirmar o caminho manual.

### Servidor

- [X] T029 [US2] RED em `supabase/tests/009_position.test.sql` (pgTAP, dois tenants), cobrindo **verbatim** as regras de `data-model.md`: `arrival_latitude` e `arrival_longitude` `numeric(9,6)`, **ambas ou nenhuma**, dentro de -90 a 90 e -180 a 180; `arrival_accuracy_m numeric(8,1)`, nula sem posição, **0 a 100000**; `arrival_position_source` nula sem posição, `gps` ou `typed`, exige coordenadas; `arrival_position_read_at` só com `gps`, **não no futuro e com no máximo 10 minutos** no instante do registro; `arrival_outside_geofence` nulo sem posição ou sem geocerca ativa; em `trip_deliveries`, `accuracy_m`, `position_source` (`gps`, `typed` ou `site_address`, coerente com os campos de posição) e `position_read_at` com a mesma sanidade; a exclusividade de coordenadas e "no endereço da unidade" da Spec 008 continua; a auditoria guarda origem e faixa de precisão (`good` ou `low`) e **nenhuma coordenada**; chegada e entrega continuam imutáveis; Tenant B não lê nem grava posição do Tenant A [RF-010, RF-013, RF-014, RF-017, CA-001, MS-005].
- [X] T030 [US2] GREEN em `supabase/migrations/20261013100100_field_position.sql`: as 6 colunas novas de `trip_stops` e as 3 de `trip_deliveries` com as restrições de T029; `arrive_stop` recebe `p_latitude`, `p_longitude`, `p_accuracy_m`, `p_position_source` e `p_position_read_at` e grava `arrival_outside_geofence` com `private.point_inside_site_geofence`; `register_delivery` recebe `p_accuracy_m`, `p_position_source` e `p_position_read_at` e **preserva** a validação de `results[].source` de T021 (a função é recriada por inteiro); eventos `stop_arrived`, `delivery_registered` e `delivery_corrected` com `position_source` e `accuracy_band`, **sem coordenadas**; `grant` só a `service_role`. Antes de recriar, fazer `drop function public.arrive_stop(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz);` e o `drop function` de `register_delivery` com 15 argumentos (a assinatura que T021 manteve), porque aqui ela ganha `p_accuracy_m`, `p_position_source` e `p_position_read_at` e **preserva** a validação de `results[].source` e a contagem `sources` de T021; o teste de T029 confere uma só assinatura de cada e o `grant` apenas à `service_role` [data-model.md §3 a §5, research.md §6 e §7].
- [X] T031 [P] [US2] RED e GREEN em `supabase/functions/manage-trips/handler.ts` e `tests/contract/manage-trips-handler.test.ts`: campos opcionais de posição em `arrive_stop` e `register_delivery` com as mesmas regras do banco (`crossCheck`: coordenadas em par, origem coerente, precisão não negativa); a resposta de `arrive_stop` traz `outside_geofence` [contracts/operacoes-servidor.md].
- [X] T032 [US2] Estender `get_trip` (na mesma `supabase/migrations/20261013100100_field_position.sql`, mantendo o nome do recebedor só com `trip.recipient`) para devolver origem, precisão e `outside_geofence` da chegada e da entrega, **sem** devolver coordenadas a quem não tem `trip.read`, conforme a seção "`get_trip`" de `contracts/operacoes-servidor.md`; teste pgTAP em `supabase/tests/009_position.test.sql` e teste de contrato em `tests/contract/query-trips-handler.test.ts` [RF-013, RF-015].

### Cliente

- [X] T033 [P] [US2] RED e GREEN em `src/application/trips/trip-service.test.ts` e `trip-service.ts`: posição opcional em `arriveStop` e `registerDelivery`, com origem, precisão e horário [RF-010].
- [X] T034 [US2] RED e GREEN em `src/pages/field/position-field.test.tsx` e `position-field.tsx` (skill `ui-ux-pro-max`): botão "Usar minha posição" com **uma** leitura por toque via `geolocation-reader`; mostra latitude, longitude, precisão e hora, e a distância e "dentro" ou "fora da geocerca" quando houver geocerca; precisão pior que 100 m com aviso em texto sem bloquear; posição lida há mais de 2 minutos descartada ao salvar e lida de novo com aviso; coordenadas já digitadas pedem confirmação antes de serem substituídas, a origem é `gps` só sem edição manual e vira `typed` se a pessoa editar; permissão negada, tempo esgotado e posição indisponível com o texto do motivo, "Tentar de novo" e as alternativas (as coordenadas digitadas e, só na entrega, "no endereço da unidade"), sem perder os outros campos; nada guardado no aparelho e a posição é descartada ao sair da tela [RF-009 a RF-015, RN-003, RN-004, contracts/telas-e-fluxos.md].
- [X] T035 [US2] RED e GREEN em `src/pages/trips/components/arrive-stop-action.test.tsx` e `arrive-stop-action.tsx`, e em `src/pages/trips/components/delivery-dialog.tsx`: integrar `position-field` na chegada e na entrega, mantendo a posição **opcional** (a ausência não impede o registro) e a exclusividade de coordenadas e "no endereço da unidade"; a **chegada não oferece "no endereço da unidade"**, só a entrega; fora da geocerca aceito e destacado na tela e no evento [RF-010, RF-013, RF-014, Spec 008 RF-016].
- [X] T036 [P] [US2] RED e GREEN em `src/domain/trips/trip-history-format.ts` e `src/pages/trips/trip-detail-page.tsx`: o detalhe e o histórico mostram a origem da posição ("GPS", "informada", "no endereço da unidade") e a faixa de precisão em texto, **sem coordenadas** para quem não tem `trip.read` [RF-017].
- [X] T037 [P] [US2] Estender o backend simulado (`tests/e2e/support/mock-trips*.ts`) com os campos de posição e criar `tests/e2e/support/mock-geolocation.ts` (geolocalização controlada pelo Playwright: posição, precisão, atraso, negada e indisponível).
- [X] T038 [US2] E2E em `tests/e2e/campo-gps.spec.ts` (Chromium e WebKit, 360, 768 e 1920 px): usar a posição na chegada e na entrega e ver origem `gps` e precisão; dentro e fora da geocerca; precisão ruim com aviso e salvar; posição velha relida; permissão negada com as alternativas manuais completas e o formulário preservado; coordenadas digitadas com confirmação antes de substituir; posição só aproximada (precisão ruim) com aviso; **duplo toque em "Salvar"** resulta em uma só operação, por `request_id` da Spec 008; a posição permanece opcional [CA-003, CA-005, MS-002, MS-003].
- [X] T039 [P] [US2] Teste de contrato em `tests/contract/field-no-coordinates-in-logs.test.ts` (padrão de `trips-no-recipient-in-logs.test.ts`): nenhuma coordenada, valor lido ou número de série de etiqueta em `console.*`, log das funções, auditoria em texto aberto ou armazenamento do aparelho, no cliente e nas funções; e um segundo teste de contrato, `tests/contract/field-no-camera-frames-sent.test.ts`, que reprova no código de `src/infrastructure/field/` e `src/pages/field/` qualquer uso de `canvas.toBlob`, `canvas.toDataURL`, `FileReader`, `MediaRecorder`, `URL.createObjectURL` de quadro de vídeo ou `fetch`/`sendBeacon` com imagem, e confere que nenhum corpo de requisição de leitura contém dado de imagem [RF-015, RF-017, RF-018, RNF-004, CA-004, CA-005].

**Ponto de verificação**: US1 e US2 funcionam juntas; o fluxo manual da Spec 008 continua completo.

---

## Fase 5 — US3: Consultar um cilindro lendo o código (P2)

**Objetivo**: "Ler cilindro" abre o detalhe do cilindro certo. **Teste independente**: ler o identificador de um cilindro do Tenant A como pessoa do Tenant A e abrir o detalhe; repetir como pessoa do Tenant B e confirmar "não encontrado".

- [X] T040 [US3] RED e GREEN em `src/pages/field/read-cylinder-button.test.tsx` e `read-cylinder-button.tsx`: o botão aparece só para quem tem `cylinder.read` (inclusive o auditor, sem nenhuma ação de escrita); o leitor de T018 resolve o valor e navega ao detalhe do cilindro (Spec 006); identificador **desativado** informa "Este identificador foi desativado." e o cilindro a que valia; cilindro **inativo** informa "Cilindro inativo."; não encontrado inclui o de outra organização [RF-002, RF-006, RN-005].
- [X] T041 [US3] Integrar `read-cylinder-button` em `src/pages/cylinders/cylinder-list-page.tsx`, `cylinder-detail-page.tsx` e no cabeçalho de `src/pages/trips/trip-list-page.tsx`, com testes nas respectivas `*.test.tsx`, respeitando o menu por permissão da Spec 004; **sem entrada nova no menu** [RF-006, RF-019].
- [X] T042 [P] [US3] RED e GREEN em `src/application/field/field-service.ts` e testes: a viagem devolvida em `FOUND` só aparece a quem tem `trip.read`, e o texto "Está reservado na viagem n.º N" só é montado quando ela existe [RF-003].
- [X] T043 [US3] E2E em `tests/e2e/campo-consulta.spec.ts` (360, 768 e 1920 px): ler identificador ativo, desativado e de cilindro inativo; como auditor a consulta funciona sem ação de escrita; como Tenant B "não encontrado" [CA-001, MS-004, MS-007].

---

## Fase 6 — US4: Leitura e GPS acessíveis e funcionando no celular instalado (P2)

**Objetivo**: WCAG 2.2 AA, teclado, offline e PWA. **Teste independente**: conferir um cilindro e registrar uma entrega só com teclado em 360, 768 e 1920 px, com leitura e posição simuladas, e rodar o axe.

- [X] T044 [US4] E2E em `tests/e2e/campo-acessibilidade.spec.ts`: axe sem violação crítica ou grave nas telas de leitura e de posição em 360, 768 e 1920 px; foco preso na janela de leitura, Escape devolve o foco ao botão; resultado e erro anunciados em uma região `status`; operar conferência, entrega e GPS só com teclado onde há alternativa; sem rolagem horizontal, com zoom de 200% e em paisagem (740 por 360 px); `prefers-reduced-motion` sem animação; leitor parado: com o relógio simulado (clock do Playwright) avançado 2 minutos sem leitura, a câmera e o NFC desligam, o aviso e "Continuar lendo" aparecem na região `status`, a janela e os resultados continuam e o foco não é roubado, e ao ativar "Continuar lendo" a leitura volta [RF-018, RF-021, CA-006, MS-006].
- [X] T045 [US4] E2E em `tests/e2e/campo-offline.spec.ts`: offline, a leitura e a posição abrem, mas **confirmar, conferir e salvar ficam desabilitados com o motivo** e nenhuma escrita acontece; ao voltar, voltam a funcionar; a barra superior mostra "Sem conexão" (Spec 008) [RF-022, CA-007].
- [X] T046 [US4] Verificar a instalação PWA e o funcionamento no app instalado (estados de carregando, vazio, erro, sem suporte, permissão negada, offline e sincronização) e registrar em `validation.md`; ajustar `src/pages/field/*` onde o app instalado diferir do navegador [RF-021].
- [X] T047 [P] [US4] Capturas visuais em `tests/e2e/visual/campo.visual.spec.ts`: janela de leitura (aberta, sem suporte, permissão negada), bloco de posição (vazio, lida, precisão ruim, fora da geocerca, erro) e "Ler cilindro", em 360, 768 e 1920 px; gerar no Linux com `npm run test:visual:atualizar` e **nunca** versionar `*-win32.png` [RNF-003].

---

## Fase 7 — Acabamento e encerramento

- [X] T048 [P] Rodar `tests/contract/escalas-no-codigo.test.ts`, `tests/contract/no-external-assets.test.ts` e `tests/contract/client-secrets.test.ts` e corrigir qualquer valor arbitrário, recurso de terceiros ou segredo nas telas e nos serviços de campo; conferir que `tests/contract/trips-no-delete.test.ts` varre também as três migrations novas (`20261013*`) e reprova `delete` ou `truncate` nas tabelas de viagem, estendendo-o se não varrer [RNF-003, RF-016, RF-023].
- [X] T049 [P] Conferir o tamanho do pacote de entrada (`npm run build`): leitor, bloco de posição e adaptadores carregam sob demanda e o pacote não cresce mais que **5%** sobre a linha de base de T003; registrar em `validation.md` [RNF-005].
- [X] T050 [P] Medir em 4G (perfil Slow 4G) o tempo do código reconhecido até o cilindro conferido na tela (até 1 s) e a leitura de posição (limite de 15 s sem travar a tela), no padrão de `scripts/viagens/medir-desempenho-4g.mjs`; registrar os números reais em `validation.md` [RNF-001, RNF-002].
- [X] T051 [P] Atualizar `README.md`, `docs/prd.md` (nota "Situação da Fase 5, parte 1 (Spec 009)": o que foi entregue e o que fica para a Spec 010 e as Fases 6 e 7), `contracts/` e `quickstart.md` ao que foi realmente construído.
- [X] T052 Rodar a rodada completa: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (sem reduzir limites nem excluir arquivos), `npx supabase stop`, `npx supabase start`, `npx supabase db reset` e `npx supabase test db`, `npm run test:live`, `npm run build`, `npm run catalogo:build`, `npm run test:e2e` e `npm run test:visual:atualizar`; anotar os números **reais** em `validation.md`; investigar e documentar qualquer teste instável, sem aumentar prazo para esconder falha.
- [ ] T053 Rodar o roteiro completo de `quickstart.md` (passo a passo, credenciais e tabelas em `roteiro-android.md`) (passos 1 a 13) **em um aparelho Android com Chrome** e **medir com a pessoa responsável as métricas de sucesso**, registrando tempo e resultado de cada uma em `validation.md`: MS-001 (dez cilindros em até 3 minutos), MS-002 (chegada e entrega com GPS em até 90 segundos) e MS-007 (consulta lendo o código em até 20 segundos); confirmar no aparelho a leitura por câmera, a leitura NFC, a precisão do GPS, o formato dos valores NFC já cadastrados e a validade dos limites de 2 minutos, 15 segundos e 100 metros. **Não presumir**, inferir dos testes automatizados nem preencher em nome de ninguém.
- [X] T054 Conferir que nenhum segredo, token ou chave `service_role` entrou no cliente ou no repositório, que nenhum dado real foi usado em teste e que `git status` não contém `*-win32.png` a versionar [RF-016, RNF-004].
- [ ] T055 **Gate de registro de IA** (AGENTS.md): `git add` explícito do código, dos testes, das migrations e das funções (sem os arquivos alheios à spec), sem commit; `npm run ia:registro -- --spec 009 --ciclo 01 --titulo "Leitura de identificadores e GPS no aplicativo de campo"`; **entrevistar Natã Baracho** (quem validou; amostra de perfis, telas, larguras e fluxos; ambiente; duração; resultado e itens a corrigir; decisão `utilizado`, `adaptado` ou `descartado` com justificativa; confirmação de que as respostas podem ser gravadas em nome dele); gravar as respostas **sem inventar nada**; `git add docs/governanca-ia`; `npm run ia:validar`; se a pessoa não responder, interromper o encerramento e registrar a pendência.
- [ ] T056 Abrir o pull request da branch `feat/009-leitura-gps-campo` citando a issue da Spec 009, com o corpo atualizado com os resultados reais; aguardar todos os checks verdes e a revisão humana; **não** fazer merge sem aprovação, e usar a conta `equipefluxid` no `gh`.
- [ ] T057 Depois do merge do pull request aprovado e com a `main` verde, entregar o DOCX do RIA em uma branch `docs/ria-NNN-docx` (`python scripts/governanca-ia/exportar-docx.py ...`), apontar o índice para ele e abrir um pull request só de documentação.

---

## Pendências fora desta spec

- [ ] T058 Fila offline com sincronização idempotente, fotos e assinatura de entrega (Spec 010); reaproveitar o `request_id` já previsto na Spec 008. Essa spec **fecha o princípio V da constituição** ("tolerante a operação offline") para o aplicativo de campo; a Spec 009 só o atende em parte, com escritas que exigem conexão e leitura que abre offline.
- [ ] T059 Comando assíncrono à trava do lacre e confirmação pelo dispositivo (Fase 6).
- [ ] T060 Rastreamento contínuo do veículo, proximidade, alertas e relatórios (Fase 7); leitura por câmera em iOS e navegadores sem o detector nativo, com biblioteca de decodificação, se a validação pedir (spec futura).
- [ ] T061 Spec de privacidade das coordenadas: prazo de retenção e anonimização das coordenadas da chegada e da entrega, que hoje ficam guardadas enquanto a viagem existir (decisão desta spec, Clarifications de 12/10/2026); definir antes de o aplicativo de campo ir a produção, junto com a exceção à imutabilidade do histórico que isso exigir.

---

## Dependências e ordem de execução

- **Fase 1** não depende de nada.
- **Fase 2 (Fundação)** depende da Fase 1 e **bloqueia** as histórias; dentro dela, T006 a T012 são paralelos entre si; T013 antes de T014; T014 antes de T015 e T017; T018 depende de T009 a T011 e T017; T019 depende de T010.
- **US1** depende da Fundação; T020 antes de T021; T021 antes de T022 e T023; T024 e T025 dependem de T018, T023 e T021.
- **US2** depende da Fundação **e vem depois da US1**: no servidor, T030 recria `register_delivery` e **depende de T021** (para preservar `results[].source`); no cliente, T031, T033, T035 e T036 editam os mesmos arquivos que T022, T023, T025 e T026 (`handler.ts`, `trip-service.ts`, `delivery-dialog.tsx` e `trip-history-format.ts`), então não podem ser feitas em paralelo com elas; só T034 (`position-field`, arquivo novo, que depende de T012) e T039 (teste de contrato novo) podem começar antes; T037 também estende os `mock-trips*.ts` de T027 e segue depois dela.
- **US3** depende de T017 e T018, **não** depende de US1 nem de US2.
- **US4** depende das três histórias anteriores (testa as telas prontas).
- **Fase 7** depende de todas as histórias; T053 e T055 exigem pessoas reais.

```text
Fase 1 → Fase 2 → { US1 → US2 , US3 } → US4 → Fase 7
```

**Paralelismo**: na Fundação, T006 a T012 (domínio e adaptadores) correm juntos; após a Fundação, US3 pode ser feita por outra pessoa enquanto US1 e depois US2 avançam (US3 não toca nos arquivos delas); US2 só começa a editar arquivos compartilhados depois que a US1 os fechar; os testes E2E e as capturas (T028, T038, T043, T044, T045, T047) são paralelos entre si.

## Estratégia de implementação

1. **MVP**: Fases 1 e 2 e **US1** (leitura na conferência e na entrega). Entrega valor sozinha e prova a resolução, o leitor e o método.
2. **Incremento 2**: **US2** (GPS), que toca em colunas e RPCs já alteradas por US1, por isso vem depois.
3. **Incremento 3**: **US3** (consulta) e **US4** (acessibilidade, offline, PWA e capturas).
4. **Encerramento**: rodada completa, roteiro **em aparelho Android real**, entrevista de validação humana, RIA, pull request e DOCX.

## Notas

- Todo teste de domínio e de servidor nasce antes do código (RED), inclusive os de RLS com **dois tenants**, confirmando o acesso permitido **e** o bloqueado.
- Os recursos do navegador (câmera, NFC e GPS) entram por interfaces simuláveis; as regras que importam (normalização, precisão, validade e método) são puras. Câmera, NFC e GPS reais só entram na validação humana, em aparelho Android com Chrome.
- O método de conferência é **declarado pelo cliente** e só validado quanto ao valor no servidor; a spec assume isso e não promete prova de leitura [RN-002].
- A posição de 2 minutos é regra do cliente (os relógios divergem); o servidor só rejeita posição com mais de 10 minutos ou no futuro.
- Etiquetas NFC só casam se o valor cadastrado na Spec 006 estiver em hexadecimal; as demais seguem pela transferência ou desativação já prevista. Conferir os formatos reais na validação (T053).
