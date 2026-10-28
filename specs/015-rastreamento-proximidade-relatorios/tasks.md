# Tarefas: Rastreamento, proximidade e relatórios

**Entrada**: artefatos em `specs/015-rastreamento-proximidade-relatorios/`

**Pré-requisitos**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Organização**: tarefas agrupadas por história de usuário, com testes RED antes do código de produção. Cada descrição aponta o arquivo principal a criar ou alterar.

## Formato: `[ID] [P?] [Story] Descrição`

- **[P]**: pode ser executada em paralelo porque atua em arquivos diferentes e não depende de tarefa incompleta.
- **[USn]**: história de usuário da spec.
- Testes de RLS sempre cobrem acesso permitido e bloqueado com pelo menos dois tenants.

## Fase 1 — Preparação

**Objetivo**: preparar rastreabilidade, dependências e esqueleto técnico sem implementar regras de negócio.

- [X] T001 Registrar a issue da Spec 015 e substituir “a abrir” pelo link em `specs/015-rastreamento-proximidade-relatorios/plan.md`
- [X] T002 Adicionar e fixar as dependências Capacitor 8 compatíveis e scripts Android em `package.json`
- [X] T003 Configurar a casca com `webDir=dist`, identificador FluxID e nenhuma credencial em `capacitor.config.ts`
- [X] T004 Inicializar o projeto Android e declarar minSdk compatível com Android 10 em `android/app/build.gradle`
- [X] T005 [P] Criar os diretórios e barrels vazios das camadas de rastreamento em `src/domain/tracking/index.ts`
- [X] T006 [P] Criar os diretórios e barrels vazios das camadas de relatórios em `src/application/reports/index.ts`
- [X] T007 [P] Registrar variáveis públicas permitidas e impedir segredos de e-mail/Storage no cliente em `src/vite-env.d.ts`

---

## Fase 2 — Fundação bloqueadora

**Objetivo**: estabelecer tipos, autorização e fronteiras compartilhadas por todas as histórias.

**⚠️ CRÍTICO**: nenhuma história começa antes desta fase.

- [X] T008 Escrever testes RED do catálogo para quatro permissões independentes `tracking.read`, `report.export`, `notification_category.manage` e `proximity_rule.manage`, sem implicação automática entre elas, em `tests/contract/tracking-permissions.test.ts`
- [X] T009 Criar migration do catálogo e atribuições padrão explícitas das quatro permissões (`proximity_rule.manage` somente ao administrador) em `supabase/migrations/20261022090000_tracking_permissions.sql`
- [X] T010 Escrever testes pgTAP RED que provem sessão/JWT, escrita direta negada, `security definer set search_path=''` e isolamento permitido/bloqueado entre dois tenants em `supabase/tests/015_tracking_foundation.test.sql`
- [X] T011 Criar helpers privados comuns de ator, sessão, tenant, erro sanitizado e auditoria sem coordenadas em `supabase/migrations/20261022090100_tracking_foundation.sql`
- [X] T012 [P] Definir tipos compartilhados de origem, frescor, validade, retrospectividade, erro e cursor em `src/domain/tracking/tracking-types.ts`
- [X] T013 [P] Escrever testes RED dos parsers de filtros canônicos, cursor e descarte de contexto ao trocar tenant em `src/domain/tracking/tracking-filters.test.ts`
- [X] T014 Implementar parsers puros de filtros e cursor, sem coordenadas ou dados pessoais livres na URL, em `src/domain/tracking/tracking-filters.ts`
- [X] T015 [P] Definir portas `LocationTrackingPort`, `TrackingQueuePort`, `TrackingGateway` e relógio injetável em `src/application/tracking/tracking-ports.ts`
- [X] T016 [P] Definir views únicas para alimentar mapa, lista, contadores e relatórios sem regra em React em `src/application/tracking/tracking-views.ts`
- [X] T017a [P] Escrever testes RED dos handlers `query-tracking` e `manage-tracking` (operações registradas, validação de envelope, prefixo de erro e RPCs executáveis só por `service_role`) em `tests/contract/tracking-handlers.test.ts`
- [X] T017b Criar as Edge Functions `query-tracking` e `manage-tracking` com `createOperationsHandler`, inicialmente sem operações, que cada história registra ao criar sua RPC, em `supabase/functions/query-tracking/handler.ts` e `supabase/functions/manage-tracking/handler.ts`
- [X] T017 Implementar transporte Supabase base, via `query-tracking`/`manage-tracking`, com um único endpoint ativo e sem fallback em erro de autenticação, autorização, validação ou RLS em `src/infrastructure/supabase/tracking-adapter.ts`

**Checkpoint**: catálogo, segurança e contratos internos permitem iniciar as histórias.

---

## Fase 3 — História 1: Acompanhar uma viagem em andamento (P1) 🎯 MVP

**Objetivo**: gestor autorizado acompanha posições recentes de celular e lacres no mapa e em lista equivalente, com estado honesto e isolamento por tenant.

**Teste independente**: abrir uma viagem ativa com posições atuais/degradadas, validar origem, instante, precisão e frescor no mapa/lista, desligar tiles/rede e tentar acessar a viagem do segundo tenant.

### Testes RED

- [X] T018 [P] [US1] Escrever testes de aplicação RED para projeção comum, frescor `current|delayed|missing|inconclusive`, motivo e início da degradação (`denied|foreground_only|unavailable|notifications_denied`) na view, atualização sem perder seleção e segmentação de mapa em `src/application/tracking/trip-tracking-service.test.ts`
- [X] T019 [P] [US1] Escrever testes pgTAP RED de `list_active_trip_tracking` e `get_trip_tracking`, com `tracking.read`, dois tenants, paginação e payload sem coordenadas no Broadcast, em `supabase/tests/015_tracking_queries.test.sql`
- [X] T020 [P] [US1] Escrever testes RED do cliente Realtime privado `tracking:<organization_id>` e polling de recuperação de 30 s em `src/application/tracking/tracking-realtime.test.ts`
- [X] T021 [P] [US1] Escrever testes de componentes RED para mapa/lista sincronizados, lacunas, loading, vazio, erro, offline, informação anterior, permissão negada e foco preservado em `src/pages/tracking/trip-tracking-page.test.tsx`
- [X] T022 [P] [US1] Escrever cenário Playwright RED do acompanhamento em 360, 768 e 1920 px, teclado, axe e tentativa cross-tenant em `tests/e2e/trip-tracking.spec.ts`

### Implementação

- [X] T023 [US1] Criar RPCs paginadas por cursor `(occurred_at,id)` para listar viagens ativas e obter acompanhamento, exigindo `tracking.read`, em `supabase/migrations/20261022091000_tracking_queries.sql`
- [X] T024 [US1] Criar Broadcast sanitizado e política privada de `tracking:<organization_id>` sem alterar o schema interno do Realtime em `supabase/migrations/20261022091100_tracking_realtime.sql`
- [X] T025 [P] [US1] Implementar serviço que combina celular/lacres e gera uma única view de mapa/lista sem estimar posições ausentes em `src/application/tracking/trip-tracking-service.ts`
- [X] T026 [P] [US1] Implementar assinatura privada, invalidação e fallback de 30 s sem coordenadas no evento em `src/application/tracking/tracking-realtime.ts`
- [X] T027 [US1] Estender `MapPoint` e `MapShape` para origem, estado acessível, segmentos e seleção sem estilização arbitrária em `src/components/maps/map-types.ts`
- [X] T028 [US1] Renderizar múltiplos segmentos, marcadores e seleção bidirecional sem ligar lacunas em `src/components/maps/map-view.tsx`
- [X] T029 [P] [US1] Criar lista/timeline semântica permanente com origem, instante, precisão, frescor, retrospectividade e itens de início/fim da degradação em `src/pages/tracking/components/tracking-timeline.tsx`
- [X] T030 [US1] Criar página full-width com mapa e lista sincronizados, filtros na URL, indicador de viagens degradadas na lista de ativas (texto e ícone, não só cor) e estados completos usando somente tokens em `src/pages/tracking/trip-tracking-page.tsx`
- [X] T031 [US1] Criar resolvedor puro e área lazy para `/rastreamento` e `/rastreamento/viagens/:id` protegidos por `tracking.read` em `src/app/tracking/tracking-routes.ts`
- [X] T032 [US1] Registrar a navegação de Rastreamento conforme permissão e shell responsivo das Specs 003/005 em `src/domain/navigation/screens.ts`

**Checkpoint**: US1 opera de forma independente como MVP, inclusive sem mapa externo.

---

## Fase 4 — História 2: Detectar afastamento durante o transporte (P1)

**Objetivo**: coletar posições do celular, inclusive via Android em segundo plano, sincronizar offline e confirmar afastamento somente com três comparações válidas consecutivas.

**Teste independente**: iniciar viagem, coletar online/offline, repetir lote sem duplicação, testar 480 posições/8 horas e confirmar que apenas três pares válidos acima do limite geram uma ocorrência.

### Testes RED

- [X] T033 [P] [US2] Escrever testes RED para limites padrão 100 m/120 s/50 m, faixas 50–500 m/60–300 s/20–100 m, sequência fixa de três e inconclusivos em `src/domain/tracking/proximity-evaluator.test.ts`
- [X] T034 [P] [US2] Escrever testes RED da fila com proprietário imutável, ordem, retry idempotente, capacidade mínima de 480 itens e pausa após oito horas em `src/infrastructure/tracking/tracking-queue.test.ts`
- [X] T035 [P] [US2] Escrever testes pgTAP RED das entidades, FKs compostas, constraints, append-only, ingestão de 1–100 itens, dois tenants e replay idempotente em `supabase/tests/015_mobile_tracking.test.sql`
- [X] T036 [P] [US2] Escrever testes pgTAP RED de pareamento, PostGIS, regra versionada, três `outside`, reinício por `inside`, inconclusivo neutro, retrospectivo ativo/encerrado, leitura presencial pontual sem alterar `outside_streak`, entrega encerrando o par, entrega com leitura `manual` sem gerar presença, regressão verde de `register_delivery` e do destravamento (Specs 008 e 012) e auditoria sanitizada da abertura em `supabase/tests/015_proximity.test.sql`
- [X] T037 [P] [US2] Escrever testes RED do adaptador web para `watchPosition` somente visível e degradação ao ocultar/negar permissão em `src/infrastructure/tracking/web-location-adapter.test.ts`
- [X] T038 [P] [US2] Escrever testes Android RED para FGS `location`, notificação contínua, concessão/recusa de `POST_NOTIFICATIONS` no Android 13+, permissões Android 10–14, cadência best effort, stop e ausência de reinício silencioso em `android/app/src/androidTest/java/br/com/fluxid/tracking/TrackingServiceTest.java` (o projeto gerado é Java; testes locais de buffer e cadência em `android/app/src/test/java/br/com/fluxid/tracking/`)
- [X] T039 [P] [US2] Escrever E2E RED do motorista em 360 px para ativo, negado, offline, sincronizando, fila preservada e autenticação requerida em `tests/e2e/driver-tracking.spec.ts`

### Implementação

- [X] T040 [P] [US2] Implementar avaliação pura de idade, precisão, distância, sequência e retrospectividade fora do React em `src/domain/tracking/proximity-evaluator.ts`
- [X] T041 [US2] Criar `proximity_rules` com versão/vigência e checks literais “distância 50–500 m; idade 60–300 s; precisão 20–100 m”, além de defaults 100/120/50, em `supabase/migrations/20261022090200_proximity_rules.sql` (antecipada para a US1 ler a regra vigente)
- [X] T041a [P] [US2] Escrever testes pgTAP RED de `get_proximity_rule`/`set_proximity_rule`: faixas, justificativa obrigatória, nova versão sem alterar comparações anteriores, negação sem `proximity_rule.manage`, auditoria antigo/novo e dois tenants em `supabase/tests/015_proximity_rule_management.test.sql`
- [X] T041b [US2] Implementar `get_proximity_rule` e `set_proximity_rule` com versionamento e auditoria na mesma transação em `supabase/migrations/20261022092010_proximity_rule_management.sql`
- [X] T041c [P] [US2] Escrever testes de UI RED do formulário da regra (faixas, justificativa, erro de permissão, teclado) em `src/pages/tracking/proximity-rule-settings.test.tsx` (rota `/rastreamento/regra`)
- [X] T041d [US2] Criar serviço e tela de configuração da regra com validação de faixas fora do React em `src/application/tracking/proximity-rule-service.ts` e `src/pages/tracking/proximity-rule-settings.tsx`
- [X] T042 [US2] Criar `tracking_sessions` com `status active|completed|cancelled|paused_auth_expired`, `platform android_native|web_visible` e `capability full|foreground_only|denied|unavailable` em `supabase/migrations/20261022090300_tracking_sessions.sql` (antecipada para a US1)
- [X] T043 [US2] Criar `mobile_positions`, `proximity_pairs`, `proximity_comparisons` append-only, `proximity_occurrences` e `proximity_presence_evidences`, com chaves idempotentes, FKs compostas e índices do modelo, em `supabase/migrations/20261022092200_proximity_schema.sql` (`mobile_positions` antecipada em `20261022090400_mobile_positions.sql`)
- [X] T044 [US2] Implementar funções transacionais de iniciar/pausar/encerrar sessão e ingestão ordenada (`ingest_driver_positions`) de lotes 1–100, validando motorista, instalação, tenant e janela online em `supabase/migrations/20261022092300_mobile_position_ingestion.sql`
- [X] T045 [US2] Implementar pareamento temporal/PostGIS e máquina de três comparações; registrar leitura presencial como evidência pontual sem modificar `outside_streak`; encerrar o par entregue mantendo a geocerca; criar ocorrência/alerta retrospectivo só com viagem ativa e auditar a abertura sem coordenadas em `supabase/migrations/20261022092400_proximity_evaluation.sql`
- [X] T045a [US2] Criar gatilho `after insert` em `trip_deliveries` que registra a presença pontual (`register_proximity_presence`) para itens entregues lidos por `camera|nfc|typed` com sessão ativa — `check_item` só roda no carregamento, antes da coleta — em `supabase/migrations/20261022092410_proximity_delivery_hooks.sql`
- [X] T045b [US2] No mesmo gatilho, encerrar o par do item entregue (`end_proximity_for_delivery`) e reabri-lo numa correção para "não entregue", sem alterar `seal_on_delivery_recorded` (destravamento e geocerca da Spec 012) em `supabase/migrations/20261022092410_proximity_delivery_hooks.sql`
- [X] T046 [US2] Estender `seal_alerts.kind` com `proximity_separation` e garantir alerta único por par/sessão sem alterar custódia ou trava em `supabase/migrations/20261022092500_proximity_alerts.sql`
- [X] T047 [P] [US2] Implementar store IndexedDB dedicado sem tokens, preso a conta, tenant, endpoint, viagem e sessão de origem em `src/infrastructure/tracking/tracking-queue.ts`
- [X] T048 [US2] Implementar coordenador em lotes ordenados que remove somente itens aceitos/duplicados e nunca redireciona em fallback em `src/application/tracking/tracking-sync-service.ts`
- [X] T049 [P] [US2] Implementar adaptador web visível e estado degradado quando oculto/indisponível em `src/infrastructure/tracking/web-location-adapter.ts`
- [X] T050 [US2] Implementar plugin Capacitor local, solicitação contextual de `POST_NOTIFICATIONS` no Android 13+ e contrato JS que exponha visibilidade reduzida sem regra de proximidade em `src/infrastructure/tracking/capacitor-location-adapter.ts`
- [X] T051 [US2] Implementar Android Foreground Service tipo `location`, iniciado em tela visível, com intervalo preferencial de 60 s e parada explícita em `android/app/src/main/java/br/com/fluxid/tracking/TrackingService.java` (com `TrackingPlugin.java`, `PositionBuffer.java` e `IntervalGate.java`, sem biblioteca externa de localização)
- [X] T052 [US2] Declarar `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS` e serviço, sem `ACCESS_BACKGROUND_LOCATION`, em `android/app/src/main/AndroidManifest.xml`
- [X] T053 [US2] Criar painel do motorista com indicação contínua, aviso de notificações recusadas/visibilidade reduzida, permissão, capacidade, pendências, limite offline, recuperação e distinção textual da presença pontual em `src/pages/tracking/driver-tracking-panel.tsx`

**Checkpoint**: US2 detecta e registra proximidade independentemente da UI de relatórios.

---

## Fase 5 — História 3: Investigar trajeto e ocorrências (P2)

**Objetivo**: reconstruir cronologia por viagem ou cilindro sem inventar trajetos nas lacunas.

**Teste independente**: consultar período com posições/eventos/lacunas, paginar sem reordenar e comparar cada item textual ao segmento do mapa.

### Testes RED

- [X] T054 [P] [US3] Escrever testes RED de agregação cronológica determinística, empate por ID, lacunas e segmentos separados em `src/domain/tracking/tracking-timeline.test.ts`
- [X] T055 [P] [US3] Escrever testes pgTAP RED de `query_tracking_history` por viagem/cilindro, filtros, cursor estável e invisibilidade cross-tenant em `supabase/tests/015_tracking_history.test.sql`
- [X] T056 [P] [US3] Escrever testes de página RED para filtros na URL, carregamento progressivo, mapa indisponível e alternativa textual completa em `src/pages/tracking/tracking-history-page.test.tsx`
- [X] T057 [P] [US3] Escrever E2E RED para reconstruir uma ocorrência em até dois minutos por teclado em `tests/e2e/tracking-history.spec.ts`

### Implementação

- [X] T058 [P] [US3] Implementar agregador puro que intercala posições, avaliações, alertas, custódia e lacunas por `(occurred_at,id)` em `src/domain/tracking/tracking-timeline.ts`
- [X] T059 [US3] Implementar RPC histórica por viagem/cilindro com filtros e cursor opaco, sem unir intervalos sem evidência em `supabase/migrations/20261022093000_tracking_history.sql`
- [X] T060 [P] [US3] Implementar serviço de histórico com carregamento progressivo e descarte ao trocar tenant em `src/application/tracking/tracking-history-service.ts`
- [X] T061 [US3] Criar página full-width de histórico com filtros, segmentos, lista permanente e estados completos em `src/pages/tracking/tracking-history-page.tsx`
- [X] T062 [US3] Adicionar `/rastreamento/historico` ao resolvedor e preservar filtros canônicos na URL em `src/app/tracking/tracking-routes.ts`

**Checkpoint**: US3 reconstrói evidências mesmo sem tiles ou conexão atual.

---

## Fase 6 — História 4: Tratar uma ocorrência de proximidade (P2)

**Objetivo**: reconhecer e encerrar afastamentos com autorização, observação e auditoria imutável.

**Teste independente**: abrir uma ocorrência, reconhecer, encerrar com nota e provar negação sem permissão e ausência de alteração em custódia/trava.

### Testes RED

- [X] T063 [P] [US4] Escrever testes pgTAP RED de reconhecimento/encerramento, versão, nota obrigatória, idempotência, dois tenants e auditoria sem coordenadas em `supabase/tests/015_proximity_occurrence_management.test.sql`
- [X] T064 [P] [US4] Escrever testes RED do serviço para conflitos, negação, retry e preservação do histórico original em `src/application/tracking/proximity-occurrence-service.test.ts`
- [X] T065 [P] [US4] Escrever testes de UI RED para reconhecer/encerrar por teclado, exigir nota e não inferir mudança física em `src/pages/tracking/proximity-occurrence-page.test.tsx`

### Implementação

- [X] T066 [US4] Implementar `acknowledge_proximity_occurrence` e `close_proximity_occurrence` com permissão de alerta, versão e auditoria na mesma transação em `supabase/migrations/20261022094000_proximity_occurrence_management.sql`
- [X] T067 [P] [US4] Implementar serviço de aplicação com request ID e mapeamento sanitizado de erros em `src/application/tracking/proximity-occurrence-service.ts`
- [X] T068 [US4] Criar detalhe acessível da ocorrência, evidências, estado e diálogos de reconhecimento/encerramento em `src/pages/tracking/proximity-occurrence-page.tsx` (rota `/rastreamento/ocorrencias/:id`)
- [X] T069 [US4] Integrar ocorrência de proximidade à lista existente de alertas sem mudar estado de custódia/trava em `src/pages/alerts/alert-detail-page.tsx`

**Checkpoint**: US4 fecha o ciclo operacional com trilha verificável.

---

## Fase 7 — História 5: Consultar e exportar relatórios essenciais (P2)

**Objetivo**: consultar seis relatórios coerentes e exportar o mesmo snapshot com autorização independente e CSV seguro.

**Teste independente**: gerar recorte conhecido, comparar resumo/linhas/CSV, negar exportação a quem só consulta e percorrer estados de job.

### Testes RED

- [X] T070 [P] [US5] Escrever testes RED de filtros, snapshot, estados medido/agregado/indisponível/inconclusivo e matriz exata `trips→trip.read`, `telemetry_availability|proximity→tracking.read`, `alerts→seal.read`, `deliveries→trip.read`, `custody→cylinder.history`, sem `report.export` ampliar leitura, em `src/application/reports/report-service.test.ts`
- [X] T071 [P] [US5] Escrever testes RED de CSV UTF-8 que neutralize valores iniciados por `=`, `+`, `-`, `@`, tab ou CR e preserve o recorte em `tests/contract/report-export-csv.test.ts`
- [X] T072 [P] [US5] Escrever testes pgTAP RED de `report_exports`, snapshot, cursor, dois tenants e revalidação de `report.export` mais a permissão de consulta do tipo na solicitação, claim/processamento, status e download, inclusive após revogação, em `supabase/tests/015_reports.test.sql`
- [X] T073 [P] [US5] Escrever testes live RED de job, objeto privado completo e URL curta reautorizada em `tests/integration/report-exports.live.test.ts`
- [X] T074 [P] [US5] Escrever testes de página RED para filtros na URL, resumo, tabela, vazio e `queued|processing|ready|failed|expired` em `src/pages/reports/report-page.test.tsx`
- [X] T075 [P] [US5] Escrever E2E RED dos seis relatórios, exportação negada/permitida e equivalência do CSV em `tests/e2e/reports.spec.ts`

### Implementação

- [X] T076 [US5] Criar `report_exports` com estados `queued|processing|ready|failed|expired`, idempotência por solicitante/request ID e índices parciais de fila/expiração em `supabase/migrations/20261022095000_report_exports.sql`
- [X] T077 [US5] Criar bucket privado `report-exports` e políticas que bloqueiem acesso direto cross-tenant/cross-user em `supabase/migrations/20261022095100_report_storage.sql`
- [X] T078 [US5] Implementar consultas canônicas de resumo/linhas por snapshot e cursor `(occurred_at,id)` para os seis tipos, aplicando no servidor a matriz de permissões do contrato, em `supabase/migrations/20261022095200_report_queries.sql`
- [X] T079 [US5] Implementar solicitação, claim/processamento, status, conclusão/falha, expiração e download revalidando `report.export`, solicitante/vínculo e a permissão de consulta da matriz do tipo em `supabase/migrations/20261022095300_report_export_jobs.sql`
- [X] T080 [P] [US5] Implementar serializador CSV seguro e determinístico sem conteúdo ativo em `supabase/functions/report-export/csv.ts`
- [X] T081 [US5] Implementar Edge Function idempotente que materializa em caminho temporário e publica somente arquivo completo em `supabase/functions/report-export/index.ts`
- [X] T082 [P] [US5] Implementar serviço de consulta/exportação e polling de job fora do React em `src/application/reports/report-service.ts`
- [X] T083 [P] [US5] Criar catálogo e filtros acessíveis dos seis relatórios com URL como fonte em `src/pages/reports/report-filters.tsx`
- [X] T084 [US5] Criar página full-width com critérios, geração, totais, tabela paginada e estados de exportação em `src/pages/reports/report-page.tsx`
- [X] T085 [US5] Criar resolvedor/área lazy de `/relatorios`, `/relatorios/:tipo` e `/relatorios/exportacoes/:id` em `src/app/reports/report-routes.ts`
- [X] T086 [US5] Registrar Relatórios na navegação sem conceder exportação pela visibilidade da tela em `src/domain/navigation/screens.ts`

**Checkpoint**: US5 produz tela e arquivo coerentes sem expor localização indevida.

---

## Fase 8 — História 6: Receber avisos operacionais por e-mail (P3)

**Objetivo**: permitir liberação administrativa e opt-in individual, com entrega mínima, deduplicada e desacoplada do alerta.

**Teste independente**: começar com tudo desligado, habilitar categoria+opt-in, abrir/recuperar eventos elegíveis, repetir processamento e confirmar ausência para eventos/pessoas inelegíveis.

### Testes RED

- [X] T087 [P] [US6] Escrever testes pgTAP RED das categorias `proximity_confirmed|seal_high_critical|seal_recovered`, defaults desligados, preferências, dois tenants e deduplicação por ocorrência/transição/destinatário em `supabase/tests/015_email_notifications.test.sql`
- [X] T088 [P] [US6] Escrever testes RED de elegibilidade exigindo `tracking.read` para `proximity_confirmed`, `seal.read` para `seal_high_critical|seal_recovered`, além de liberação, opt-in, vínculo, severidade e retrospectivo histórico em `src/domain/tracking/email-notification-eligibility.test.ts`
- [X] T089 [P] [US6] Escrever testes RED do handler com fake `EmailProvider`, retry, erro permanente e payload sem coordenadas/endereço/token em `supabase/functions/email-notifications/handler.test.ts`
- [X] T090 [P] [US6] Escrever testes de UI RED para administração/preferência em `src/pages/settings/email-notification-settings.test.tsx` e para falha de entrega visível sem alterar/duplicar o alerta em `src/pages/alerts/alert-detail-page.test.tsx`
- [X] T091 [P] [US6] Escrever teste live RED de claim/report idempotente e falha sem alterar alerta em `tests/integration/email-notifications.live.test.ts`

### Implementação

- [X] T092 [P] [US6] Implementar avaliador puro de elegibilidade sem dados de entrega no React em `src/domain/tracking/email-notification-eligibility.ts`
- [X] T093 [US6] Criar categorias, preferências e outbox com `pending|processing|sent|retry|failed|cancelled`, defaults false e índices parciais em `supabase/migrations/20261022100000_email_notifications.sql`
- [X] T094 [US6] Implementar RPCs de liberação administrativa, preferência própria, claim e report com revalidação e auditoria sanitizada em `supabase/migrations/20261022100100_email_notification_operations.sql`
- [X] T095 [US6] Integrar enqueue deduplicado para abertura/recuperação elegível sem incluir coordenadas e sem participar da entrega externa em `supabase/migrations/20261022100200_email_notification_enqueue.sql`
- [X] T096 [P] [US6] Definir porta `EmailProvider` e template mínimo autenticado sem coordenadas, endereço preciso ou observação privada em `supabase/functions/email-notifications/email-provider.ts`
- [X] T097 [US6] Implementar handler idempotente em lotes curtos com backoff e códigos sanitizados em `supabase/functions/email-notifications/handler.ts`
- [X] T098 [US6] Criar entrada da Edge Function que lê segredos somente do ambiente/Vault em `supabase/functions/email-notifications/index.ts`
- [X] T099 [P] [US6] Implementar serviço cliente de categorias e preferências com permissões separadas em `src/application/tracking/email-notification-service.ts`
- [X] T100 [US6] Criar tela de liberação/opt-in em `src/pages/settings/email-notification-settings.tsx` e mostrar estado, instante e código sanitizado de falha no detalhe autorizado em `src/pages/alerts/alert-detail-page.tsx`, sem alterar o alerta

**Checkpoint**: US6 funciona com fake; implantação real permanece dependente de escolha/autorização explícita do provedor.

---

## Fase 9 — Polimento e preocupações transversais

**Objetivo**: convergir histórias, endurecer segurança, validar desempenho, documentação, UI e gates de entrega.

- [x] T101 [P] Adicionar teste contratual que proíba coordenadas, tokens, URLs assinadas e dados pessoais em Broadcast, auditoria, logs e e-mail em `tests/contract/tracking-data-minimization.test.ts`
- [x] T102 [P] Adicionar teste contratual de tokens visuais, ausência de cores/valores arbitrários e foco sem atraso nas novas telas em `tests/contract/escalas-no-codigo.test.ts`
- [x] T103 [P] Criar ensaio de 480 posições, atualização em até 10 s e exportação de 10.000 linhas do pedido até `ready` em até 30 s em `scripts/tracking/medir-desempenho.mjs`
- [x] T104 Validar e otimizar índices com `EXPLAIN (ANALYZE, BUFFERS)` sem remover isolamento por tenant em `specs/015-rastreamento-proximidade-relatorios/performance.md`
- [x] T105 [P] Atualizar arquitetura de conectividade para fila presa ao endpoint e modo nativo/degradado em `docs/arquitetura-conectividade-supabase.md`
- [x] T106 [P] Atualizar PRD e documentação operacional de permissões, Android, relatórios, Storage e e-mail em `docs/PRD.md`
- [x] T107 Executar lint, tipagem, cobertura, reset/pgTAP, live, testes Android, build, E2E e visual, registrando comandos/resultados sanitizados em `specs/015-rastreamento-proximidade-relatorios/validation-results.md`
- [x] T108 Executar `npm run build` antes do E2E e atualizar capturas somente no Linux, sem versionar `*-win32.png`, em `tests/e2e/visual/`
- [x] T109 Conduzir o roteiro humano completo de `quickstart.md`, incluindo dez tentativas de CS-004 com pelo menos 9 conclusões corretas em até 30 s, e registrar apenas resultados factuais em `specs/015-rastreamento-proximidade-relatorios/validation-results.md`
- [x] T110 Preparar código e testes com Git, sem commit, e consolidar resultados sanitizados de convergência/testes em `specs/015-rastreamento-proximidade-relatorios/validation-results.md`, sem gerar RIA ainda
- [x] T111 Entrevistar a pessoa responsável após convergência/testes, obter todas as respostas e a confirmação para gravação, sem presumir dados, e registrar temporariamente a evidência sanitizada em `specs/015-rastreamento-proximidade-relatorios/validation-results.md`

### Correções da validação humana (T109, 27/10/2026)

- [x] T113 Desligar o backup automático do Android (`allowBackup="false"`), que encerrava o processo e abria lacunas de coleta, com teste em `tests/contract/capacitor-config.test.ts`
- [x] T114 Abrir o app nativo direto na entrada, sem a página pública, tratando o shell nativo como app instalado em `src/app/use-effective-path.ts`
- [x] T115 Trocar "Idade máxima da posição" por "Tempo máximo da posição" na tela da regra em `src/pages/tracking/proximity-rule-settings.tsx`
- [x] T116 Auditar o reconhecimento e o encerramento da ocorrência feitos pelo alerta, sem duplicar registros, em `supabase/migrations/20261022100400_proximity_alert_path_audit.sql`
- [x] T117 Parar a coleta no celular quando o servidor avisa que a sessão terminou ou que a viagem não está mais em andamento em `src/application/tracking/tracking-sync-service.ts`
- [x] T118 Escrever os critérios do relatório por extenso, no horário de Brasília, em `supabase/migrations/20261022100500_report_criteria_text.sql`
- [x] T119 Quebrar a tabela do relatório só entre palavras no desktop e permitir rolagem horizontal acessível em `src/design-system/components/data-table.tsx` e `src/pages/reports/report-page.tsx`
- [x] T120 Baixar o CSV pelo endereço do destino ativo, e não pelo host interno do contêiner, em `src/infrastructure/supabase/storage-url.ts`
- [x] T121 Gerar o CSV com datas no horário de Brasília, coluna `Fuso horário` e códigos por extenso, como na tela, em `supabase/functions/report-export/values.ts`
- [x] T122 Incluir no e-mail o tipo do alerta de lacre, com as palavras da tela, compartilhando a lista com o CSV em `supabase/functions/_shared/alert-kinds.ts` (teste de sincronia em `tests/contract/alert-kinds-shared.test.ts`)
- [x] T123 Desligar a escolha de e-mail de quem optou quando a liberação da categoria é retirada, com auditoria da contagem, em `supabase/migrations/20261022100600_email_category_withdraw_preferences.sql`
- [x] T124 Dar nome acessível aos pontos do mapa, que recebem foco pelo teclado, e permitir escolhê-los com Enter ou Espaço em `src/components/maps/map-view.tsx`
- [x] T125 Impedir que a caixa de seleção das categorias de aviso encolha abaixo de 24 px em `src/pages/settings/email-notification-settings.tsx`
- [x] T126 Manter o pacote de entrada no orçamento da Spec 011: preferências de e-mail do perfil e serviço do menu "Minha viagem" carregados sob demanda, e a casca nativa reconhecida pelo global do Capacitor, em `src/pages/profile/profile-page.tsx`, `src/pages/tracking/use-my-driver-trips.ts` e `src/app/use-effective-path.ts`
- [x] T127 Quebrar o texto dos contadores do acompanhamento sem rolagem horizontal no WebKit em 768 px em `src/pages/tracking/active-trips-page.tsx`
- [x] T128 Fixar o wrapper do Gradle em 8.14.3 (o plugin Android 8.13 não roda a partir do Gradle 9.6) em `android/gradle/wrapper/gradle-wrapper.properties`
- [x] T129 Atualizar as expectativas de regressão às permissões e telas novas (`tests/integration/navigation-permissions.live.test.ts`), ao link assinado real do Storage e a `list_my_driver_trips` no backend simulado (`tests/e2e/support/`)
- [x] T130 Recuperar o LCP da landing (decisão da pessoa responsável em 28/10/2026): o `index.html` pede o módulo da landing junto com o pacote de entrada (`scripts/landing/pre-carregar-modulo.ts`, plugin em `vite.config.ts`) e a fila e o envio de campo só carregam com a conta autenticada (`src/app/field/`), com testes em `tests/contract/landing-pre-carregamento.test.ts`, `src/app/field/field-providers-carga.test.tsx` e `tests/e2e/medicao-landing.spec.ts`
- [x] T131 Cobrir o cenário 3g (RF-017): depois da entrega prevalece a vigilância da geocerca do destino, sem proximidade, em `supabase/tests/015_delivery_geofence_handoff.test.sql`
- [x] T132 Abrir um alerta próprio por afastamento confirmado, mantendo a regra da Spec 012 para os alertas do lacre, em `supabase/migrations/20261022100800_proximity_alert_per_occurrence.sql` e `supabase/tests/015_proximity_alert_per_occurrence.test.sql`
- [x] T133 Manter a coleta e o envio da viagem em andamento do motorista em qualquer tela, com uma coordenação única por viagem, em `src/pages/tracking/driver-tracking-registry.ts`, `src/pages/tracking/driver-tracking-keeper.tsx`, `src/pages/tracking/use-driver-tracking.ts` e `src/app/shell/navigation-menu.tsx`
- [x] T134 Esperar a verificação de sessão da abertura antes de simular a expiração em `tests/e2e/navegacao-menu.spec.ts` (a T130 mudou o momento em que ela acontece)
- [x] T135 Abrir no Excel um CSV com valores perigosos gerado pelo código da exportação e registrar o resultado em `validation-results.md`

- [ ] T112 Somente após T111, gerar `docs/governanca-ia/registros/RIA-NNN-rastreamento-proximidade-relatorios.md` com todos os parâmetros humanos, atualizar `docs/governanca-ia/indice.md`, executar `npm run ia:validar`, criar o commit sem `--no-verify`, abrir o PR usando inicialmente o link da branch/repositório no RIA e substituir pelo link do PR antes do merge

---

## Dependências e ordem de execução

### Dependências de fases

- **Fase 1** inicia imediatamente.
- **Fase 2** depende da Fase 1 e bloqueia todas as histórias.
- **US1 e US2** começam após a fundação e podem avançar em paralelo; juntas formam o núcleo P1.
- **US3** depende das projeções da US1 e dos fatos persistidos pela US2.
- **US4** depende das ocorrências da US2, mas não depende da US3.
- **US5** depende da fundação e das fontes das histórias que participam dos relatórios; pode iniciar pelas estruturas próprias enquanto US1–US4 evoluem.
- **US6** depende dos alertas/ocorrências da US2 e pode avançar em paralelo com US3–US5.
- **Fase 9** depende de todas as histórias escolhidas para entrega; RIA e commit só ocorrem após convergência, testes e validação humana confirmada.

### Grafo de histórias

```text
Fundação ─┬─> US1 ─> US3 ─┐
          └─> US2 ─┬─> US3 ├─> Polimento/encerramento
                   ├─> US4 ┤
                   └─> US6 ┤
Fundação ─────────────> US5 ┘
```

### Ordem dentro de cada história

1. Escrever testes e confirmar RED.
2. Criar/alterar modelo e constraints.
3. Implementar domínio e serviços.
4. Implementar RPC/Edge Function/adaptador.
5. Compor UI e integração.
6. Confirmar testes GREEN e refatorar sem mover regra para React.

## Oportunidades de paralelismo

- Na fundação, T012, T013, T015 e T016 atuam em arquivos distintos após os contratos de segurança.
- Na US1, testes T018–T022 podem ser escritos em paralelo; T025 e T026 também.
- Na US2, testes de domínio, fila, SQL, web e Android T033–T039 são paralelos; após schema/RPC, adaptadores T047 e T049 avançam em paralelo.
- US3 e US4 podem ser implementadas simultaneamente após US2.
- Na US5, testes T070–T075 e, depois, T080/T082/T083 são paralelos.
- Na US6, testes T087–T091 e implementações puras T092/T096/T099 são paralelos.
- Documentação T105/T106 e testes transversais T101–T103 podem ocorrer em paralelo depois que os contratos estabilizarem.

## Exemplos de execução paralela

### US1

```text
T018 aplicação/projeção
T019 pgTAP/RPC/RLS
T020 Realtime/polling
T021 componentes/acessibilidade
T022 E2E/responsividade
```

### US2

```text
T033 domínio de proximidade
T034 fila offline
T035 schema/ingestão pgTAP
T036 avaliação pgTAP
T037 adaptador web
T038 Android instrumentado
T039 jornada E2E
```

### US5 e US6 após o núcleo

```text
Trilha A: T070–T086 relatórios/exportações
Trilha B: T087–T100 avisos por e-mail
```

## Estratégia de implementação

### MVP primeiro

1. Concluir Preparação e Fundação.
2. Entregar US1 como acompanhamento somente leitura com mapa/lista e isolamento.
3. Parar e validar o MVP independentemente.
4. Acrescentar US2 para transformar o acompanhamento em rastreamento/proximidade operacional.

### Entrega incremental

1. **MVP**: US1 — acompanhamento atual e degradado.
2. **Núcleo de segurança**: US2 — coleta, offline e afastamento confirmado.
3. **Investigação/operação**: US3 + US4.
4. **Saída operacional**: US5.
5. **Canal complementar**: US6, inicialmente com fake até autorização do provedor.
6. Polimento, convergência, validação humana, RIA, commit e PR.

## Notas de execução

- Não iniciar código de produção de uma fatia antes de observar os testes RED correspondentes.
- Não usar `service_role` ou segredo no React/Android; Edge Functions são a fronteira privilegiada quando necessária.
- Não introduzir plugin comunitário de background location nem provedor de e-mail sem nova autorização e revisão de segurança.
- Não concluir a spec, gerar RIA ou criar commit de encerramento sem entrevista humana real e confirmação para gravar as respostas.
- O DOCX do RIA é produzido somente depois do merge, em branch e PR exclusivos de documentação, conforme `AGENTS.md`.
