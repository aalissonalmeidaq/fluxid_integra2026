---
description: "Tarefas executáveis da Spec 002 — Autenticação, multitenancy, RBAC e conectividade cloud-first"
---

# Tarefas: Autenticação, multitenancy e controle de acesso RBAC

**Entrada**: artefatos em `specs/002-autenticacao-multitenancy-rbac/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD estrito. Em cada incremento, concluir RED e confirmar a falha esperada antes de GREEN; executar REFACTOR e regressão antes de avançar.

**Escopo protegido**: esta Spec não cria funcionalidades operacionais de cilindros, estoque, frota, motorista ou IoT. Em modo degradado, operações de identidade, sessão, convite, RBAC, auditoria sensível e administração permanecem bloqueadas; a allowlist de operações `offline-safe` da outbox é vazia nesta Spec; tipos futuros exigem homologação por Specs de domínio.

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode ser executada em paralelo porque não modifica os mesmos arquivos nem depende de tarefa incompleta.
- `[USN]`: história de usuário correspondente.
- Referências entre colchetes ligam a tarefa aos requisitos da spec.

---

## Fase 1 — Preparação e convergência dos contratos

**Objetivo**: eliminar contradições documentais antes do primeiro teste RED.

- [X] T001 Validar e congelar em `spec.md`, `research.md`, `data-model.md` e `contracts/auth-sessions.md` o contrato em que o quarto login lista as três sessões ativas e exige encerramento explícito, sem revogação automática [RF-036].
- [X] T002 [P] Validar `organization_id` como identificador canônico nos campos locais e payloads de `specs/002-autenticacao-multitenancy-rbac/data-model.md` e `contracts/synchronization.md` [ISO-001].
- [X] T003 [P] Validar em `specs/002-autenticacao-multitenancy-rbac/research.md` a decisão por IndexedDB, incluindo transações, disponibilidade na PWA, descarte seguro e alternativas avaliadas [RF-051, RF-059].
- [X] T004 Validar em `specs/002-autenticacao-multitenancy-rbac/data-model.md` e `contracts/synchronization.md` que `organizations`, `memberships` e `roles` não geram mutações offline nesta Spec e que a allowlist de comandos `offline-safe` começa vazia [RF-058].
- [X] T005 Validar o ledger servidor de idempotência, escopo `(organization_id, idempotency_key)`, resultado estável e retenção em `specs/002-autenticacao-multitenancy-rbac/data-model.md` e `contracts/synchronization.md` [RF-053, RNF-012, MS-012].
- [X] T006 [P] Validar entre `spec.md`, `plan.md`, `research.md` e contratos a topologia Auth independente, sem portabilidade de sessão ou sincronização de segredos, e a ausência de questões bloqueantes já resolvidas [RF-050].
- [X] T007 [P] Adicionar somente uma nota de supersessão, sem reescrever requisitos ou validações históricas, em `specs/001-fundacao-tecnica/contracts/connectivity.md`, apontando para `docs/decisoes-arquiteturais/ADR-001-prioridade-cloud-e-sincronizacao-segura.md` [RF-045].

**Checkpoint**: contratos, modelo, ADR e plano descrevem uma única arquitetura antes da implementação.

---

## Fase 2 — Fundação bloqueante: ambiente, schema, RLS e auditoria

**Objetivo**: estabelecer os contratos compartilhados por todas as histórias.

**Bloqueio**: nenhuma história começa antes desta fase.

### RED — ambiente e schema

- [X] T008 [P] Criar testes de contrato para `VITE_SUPABASE_CLOUD_URL`, `VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY`, `VITE_SUPABASE_LAN_URL`, `VITE_SUPABASE_LAN_PUBLISHABLE_KEY`, `VITE_SUPABASE_LOCAL_URL`, `VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY` e timeout, rejeitando pares parciais e qualquer chave privilegiada, em `tests/contract/environment.test.ts` [RF-047, RS-002, RS-013].
- [X] T009 [P] Criar testes SQL para `organizations`: `kind` em `owner|tenant`, uma única owner, `legal_name` obrigatório com 2–160 caracteres, `display_name` obrigatório com 2–100, `status` em `active|suspended|inactive` e `version bigint not null default 1`, em `supabase/tests/002_organizations.test.sql` [RF-007, RF-010].
- [X] T010 [P] Criar testes SQL para `profiles`: FK de `auth.users`, `display_name` obrigatório com 2–100 caracteres, `locale` padrão `pt-BR` e campos de autorização ausentes, em `supabase/tests/002_profiles.test.sql` [RF-028].
- [X] T011 [P] Criar testes SQL para `memberships`: unicidade `(organization_id,user_id)`, estados `invited|active|blocked|inactive`, transições permitidas, invariante do último Administrador do tenant e recusa de transição do tenant para `active` sem administrador ativo, em `supabase/tests/002_memberships.test.sql` [RF-009, RF-014, RF-015, RF-016].
- [X] T012 [P] Criar testes SQL para `permissions`, `roles`, `role_permissions` e `membership_roles`: código `resource.action`, escopo `global|tenant`, delegabilidade `non_delegable|tenant_delegable`, nome 2–80, descrição até 300, seis papéis oficiais imutáveis e vínculo/papel na mesma organização, em `supabase/tests/002_rbac_schema.test.sql` [RF-017–RF-025].
- [X] T013 [P] Criar testes SQL para `invitations`: estados contratados, validade de 72 horas, uso único, papel compatível, unicidade parcial por organização/e-mail e revogação dos anteriores no reenvio, em `supabase/tests/002_invitations.test.sql` [RF-011–RF-013A].
- [X] T014 [P] Criar testes SQL para `user_sessions`: estados `active|revoked|expired`, AAL `aal1|aal2`, máximo de 8 horas, inatividade de 30 minutos, índice de sessões ativas e serialização do limite de três, em `supabase/tests/002_user_sessions.test.sql` [RF-002–RF-004, RF-035–RF-037].
- [X] T015 [P] Criar testes SQL para `audit_logs`: resultado `success|denied|failed`, justificativa até 500 caracteres, metadata em allowlist, imutabilidade, retenção e ausência de credenciais, em `supabase/tests/002_audit_logs.test.sql` [AUD-001–AUD-010].
- [X] T016 [P] Criar testes SQL para o ledger de idempotência, comprovando unicidade concorrente por `(organization_id,idempotency_key)`, repetição com mesmo resultado e rejeição entre tenants, em `supabase/tests/002_idempotency.test.sql` [RF-053, RNF-012, MS-012, MS-013].
- [X] T017 Criar matriz RED de grants e RLS para SELECT, INSERT, UPDATE e DELETE em cada tabela exposta, com Tenant A permitido, Tenant B negado, `organization_id` adulterado, ator sem vínculo, vínculo bloqueado, tenant suspenso e Master FluxID, em `supabase/tests/002_rls_matrix.test.sql` [RF-023, CA-001–CA-003, CA-007, ISO-001–ISO-006].
- [X] T018 [P] Criar testes RED dos helpers privados de autorização, `search_path` fixo, EXECUTE revogado de `PUBLIC`, AAL2, sessão vigente e autorização atual sem depender de metadata editável, em `supabase/tests/002_private_helpers.test.sql` [RF-022–RF-024, RS-003–RS-008, RS-014].

### GREEN — schema compartilhado

- [X] T019 Executar `npx supabase migration new identity_rbac_schema` e implementar no arquivo gerado em `supabase/migrations/` os tipos, tabelas, constraints, FKs e índices aprovados por T009–T016 [RF-007–RF-025, RF-035–RF-038].
- [X] T020 Implementar no mesmo arquivo gerado de `supabase/migrations/` grants mínimos, RLS, policies com `USING`/`WITH CHECK`, helpers privados e ledger de idempotência aprovados por T017–T018 [RNF-001, ISO-001–ISO-006].
- [X] T021 Criar seeds determinísticos de FluxID owner, Tenant A, Tenant B, Master FluxID, administradores, vínculos, permissões e seis papéis oficiais em `supabase/seed.sql`, com o Master detendo todas as permissões e o Administrador FluxID `platform.manage`, `audit.read` e `profile.read` [RF-039, RF-040, RF-021B]; o catálogo e os papéis globais são instalados pela migration `rbac_invariants_and_catalog` (dados de referência, não de teste), e o seed mantém só massa sintética, sem dados pessoais ou credenciais reais [CA-001, RF-017, RS-013].

### REFACTOR e regressão

- [X] T022 Revisar nomes, índices de FKs/RLS, transações curtas e comentários do schema em `supabase/migrations/` sem alterar comportamento, e executar `npx supabase db reset` e `npx supabase test db` [RNF-009].

**Checkpoint**: schema reproduzível, RLS deny-by-default e testes com dois tenants aprovados.

---

## Fase 3 — História 9: Inicializar e sincronizar a PWA com segurança (P1)

**Objetivo**: resolver `cloud → LAN → local`, preparar a PWA e promover cloud somente após sincronização segura.

**Teste independente**: cloud saudável impede probes posteriores; falhas técnicas avançam sequencialmente; falhas de segurança bloqueiam; push precede pull; troca de cliente só ocorre após os gates.

### RED

- [X] T023 [P] [US9] Criar testes do `EndpointConfiguration` para prioridade cloud, LAN, local, timeout padrão de 3 s, pares públicos, versão esperada do contrato/schema, LAN configurável e configuração inválida bloqueante em `src/infrastructure/connectivity/endpoint-configuration.test.ts` [RF-047, RF-048].
- [X] T024 [P] [US9] Criar testes do `EndpointHealthCheck` e `EndpointCompatibilityCheck` para sucesso, DNS/rede, recusa, timeout, 5xx elegível, cancelamento, versão ausente/incompatível bloqueante e resposta não elegível em `src/infrastructure/connectivity/endpoint-health-check.test.ts` e `endpoint-compatibility-check.test.ts` [RF-046–RF-048].
- [X] T025 [P] [US9] Criar testes do `ConnectionFailureClassifier` cobrindo autenticação, sessão expirada, autorização, RLS, tenant, validação, integridade e configuração sem fallback em `src/infrastructure/connectivity/connection-failure-classifier.test.ts` [RF-046, RNF-008].
- [X] T026 [US9] Criar testes do `CloudFirstConnectionResolver` para cloud saudável e compatível, LAN após cloud indisponível, local após cloud/LAN indisponíveis, bloqueio imediato sem fallback por incompatibilidade, todos indisponíveis, uma passagem finita, cancelamento, exclusão mútua e novos ciclos novamente pela cloud em `src/infrastructure/connectivity/cloud-first-connection-resolver.test.ts` [RF-045–RF-049, MS-011].
- [X] T027 [P] [US9] Criar testes do backoff automático limitado a 3 ciclos, intervalos 2 s/4 s/8 s, tentativa manual e logs sem URL/chave/token em `src/infrastructure/connectivity/retry-policy.test.ts` [RF-048, RF-049, RNF-013].
- [X] T028 [P] [US9] Criar testes do `SupabaseClientManager` para exatamente um cliente, invalidação do anterior, sessão independente emitida pelo destino, reautenticação em LAN/local e ausência de cópia de refresh token, senha ou segredo MFA em `src/infrastructure/connectivity/supabase-client-manager.test.ts` [RF-050, RS-001, RS-002].
- [X] T029 [P] [US9] Criar testes IndexedDB para stores `local_outbox`, `local_sync_cursors` e `local_sync_conflicts`, transações, restauração, segregação por `organization_id` e preservação bloqueada da outbox após logout até reautenticação equivalente ou descarte autorizado em `src/infrastructure/local-database/local-database.test.ts` [RF-051, RF-059, ISO-008].
- [X] T030 [P] [US9] Criar testes da `SyncOutbox` para UUID, chave idempotente, ator, dispositivo, versões, dependências, cinco tentativas e estados `pending|syncing|synced|conflict|failed|discarded` em `src/infrastructure/synchronization/sync-outbox.test.ts` [RF-053, RF-054, RNF-013].
- [X] T031 [US9] Criar testes para allowlist vazia nesta Spec, rejeitando enfileiramento offline de identidade, sessão, convite, RBAC, auditoria e administração em `src/infrastructure/synchronization/offline-operation-policy.test.ts` [RF-032, RF-058].
- [X] T032 [P] [US9] Criar testes de contrato do endpoint servidor idempotente para sucesso inicial com operação sintética exclusiva do harness, repetição, payload divergente, tenant adulterado e concorrência real no PostgreSQL; comprovar que a operação sintética não integra a allowlist nem pode ser enfileirada pela PWA, em `tests/contract/synchronization-idempotency.live.test.ts` e `supabase/tests/002_idempotency.test.sql` [RF-053, RF-058, RNF-012, MS-012, MS-013].
- [X] T033 [US9] Criar testes do `PushSynchronizer` para ordem de dependências, confirmação antes da remoção, validação servidor, queda de rede, sessão expirada, tenant suspenso e proibição de envio simultâneo em `src/infrastructure/synchronization/push-synchronizer.test.ts` [RF-052–RF-054].
- [X] T034 [US9] Criar testes do `PullSynchronizer`/`SyncCursor` para pull posterior ao push, cursor por organização/coleção/origem, aplicação atômica, RLS, cache obsoleto e cursor imóvel em falha/conflito em `src/infrastructure/synchronization/pull-synchronizer.test.ts` [RF-052, RF-055].
- [X] T035 [US9] Criar testes do `ConflictResolver` para alteração concorrente, remoção remota, permissão removida, tenant suspenso, sessão expirada, duplicidade, dependência e troca de endpoint, preservando versões; resolução manual exige sessão vigente, justificativa, `tenant.manage` ou `platform.manage` conforme o escopo e auditoria `sync.conflict.resolve`, em `src/infrastructure/synchronization/conflict-resolver.test.ts` [RF-056, AUD-003–AUD-006].
- [X] T036 [US9] Criar testes do `SyncCoordinator` para exclusão mútua, push antes de pull, retomada após fechamento, pausa de novas mutações, cancelamento seguro e gates de liberação em `src/infrastructure/synchronization/sync-coordinator.test.ts` [RF-051, RF-052, RNF-011].
- [X] T037 [US9] Criar testes do `EndpointPromotionCoordinator` para reavaliação periódica, operação em andamento, push/pull, sessão, tenant, consistência e invalidação do cliente anterior em `src/infrastructure/synchronization/endpoint-promotion-coordinator.test.ts` [RF-057].
- [X] T038 [P] [US9] Criar testes do `AuditLogger` para endpoint, falha, duração, transição e item sanitizados, rejeitando URL completa, chave, token, PII e payload livre em `src/infrastructure/observability/audit-logger.test.ts` [RF-049, RS-001, RNF-002].
- [X] T039 [US9] Criar testes de componente da tela de inicialização para todos os estados, teto de 30 s, nova tentativa, foco, teclado, `aria-live` e movimento reduzido em `src/components/system/app-initialization-screen.test.tsx` [RF-031, RF-060, RA-001–RA-007, RA-009].
- [X] T040 [P] [US9] Criar testes do indicador de endpoint/modo degradado sem depender somente de cor e com alvo de 44×44 px em `src/components/system/connectivity-status.test.tsx` [RF-058, RA-003, RA-004].
- [X] T041 [US9] E2E de inicialização em `tests/e2e/app-initialization.spec.ts`: cenários de conexão e, com outbox real semeada no IndexedDB, sem pendência, envio idempotente, isolamento Tenant A/B, perda de conexão com nova tentativa, erro do servidor sem laço, conflito, retomada após fechamento, sessão expirada e troca de tenant [MS-009–MS-013].

### GREEN

- [X] T042 [P] [US9] Implementar configuração pública ordenada, incluindo versão esperada do contrato/schema, em `src/infrastructure/connectivity/endpoint-configuration.ts` e adaptar `src/config/environment.ts` [RF-047, RF-048].
- [X] T043 [P] [US9] Implementar probe cancelável e verificação pública de compatibilidade em `src/infrastructure/connectivity/endpoint-health-check.ts` e `endpoint-compatibility-check.ts` [RF-046–RF-048].
- [X] T044 [P] [US9] Implementar classificação fail-closed em `src/infrastructure/connectivity/connection-failure-classifier.ts` [RF-046].
- [X] T045 [US9] Implementar resolvedor e política de retry em `src/infrastructure/connectivity/cloud-first-connection-resolver.ts` e `retry-policy.ts` [RF-045, RF-048, RF-049].
- [X] T046 [US9] Implementar gerenciador de cliente único em `src/infrastructure/connectivity/supabase-client-manager.ts` [RF-050].
- [X] T047 [US9] Implementar adapter IndexedDB transacional em `src/infrastructure/local-database/local-database.ts` [RF-051, RF-059].
- [X] T048 [P] [US9] Implementar política de operações offline com allowlist vazia em `src/infrastructure/synchronization/offline-operation-policy.ts` [RF-032, RF-058].
- [X] T049 [US9] Implementar outbox e transições em `src/infrastructure/synchronization/sync-outbox.ts` [RF-053, RF-054].
- [X] T050 [US9] Criar migration via `npx supabase migration new sync_command_idempotency` e implementar RPC transacional com `search_path` fixo, privilégio exclusivo de `service_role`, validação de ator/tenant, reserva atômica e replay estável em `supabase/migrations/`; integrar a RPC à Edge Function autenticada em `supabase/functions/sync-command/index.ts`, sem expor segredo ao cliente e sem habilitar a operação sintética fora do harness [RF-053, RF-058, RNF-012, RS-002, RS-007].
- [X] T051 [US9] Implementar push em `src/infrastructure/synchronization/push-synchronizer.ts` [RF-052–RF-054].
- [X] T052 [US9] Implementar pull e cursor em `src/infrastructure/synchronization/pull-synchronizer.ts` e `sync-cursor.ts` [RF-052, RF-055].
- [X] T053 [US9] Implementar conflitos em `src/infrastructure/synchronization/conflict-resolver.ts`, exigindo sessão vigente, justificativa, `tenant.manage` no tenant ou `platform.manage` no escopo global e emissão do evento append-only `sync.conflict.resolve` na resolução manual [RF-056, AUD-003–AUD-006].
- [X] T054 [US9] Implementar coordenação serial em `src/infrastructure/synchronization/sync-coordinator.ts` [RF-051, RF-052].
- [X] T055 [US9] Implementar promoção controlada em `src/infrastructure/synchronization/endpoint-promotion-coordinator.ts` [RF-057].
- [X] T056 [P] [US9] Implementar logging sanitizado em `src/infrastructure/observability/audit-logger.ts` [RF-049, RS-001].
- [X] T057 [US9] Tela e estados de inicialização: fase de conexão em `src/app/initialization-gate.tsx` e fases de push, pull, preparação, conflito, sessão expirada e acesso negado no `SyncGate` (`src/app/sync-gate.tsx`, `src/app/sync-context.ts`), dentro do `AuthProvider`, com o `SyncCoordinator` anunciando as fases. O executor real (outbox, push e pull do tenant ativo) é fornecido via `SyncContext.createRunner` pela T107; até lá a allowlist vazia dispensa sincronização e o portão libera [RF-031, RF-051, RF-052, RF-060].
- [X] T058 [P] [US9] Adaptar `src/components/system/ConnectivityStatus.tsx` para indicar cloud/LAN/local e modo degradado [RF-058].

### REFACTOR e regressão

- [X] T059 [US9] Remover ou adaptar os caminhos legados da Spec 001 em `src/infrastructure/supabase/` preservando modos explícitos e executar testes unitários, integração e E2E da US9 [RF-033, RF-045].
- [X] T143 [US9] Criar `supabase/functions/public-compatibility/index.ts` (verify_jwt desativado em `supabase/config.toml`) expondo somente `contractVersion`, com teste de contrato em `tests/contract/public-compatibility.live.test.ts`; documentar `VITE_SUPABASE_CONTRACT_VERSION` em `.env.example` [RF-047]. Tarefa residual descoberta na implementação: sem ela todo destino real seria bloqueado por configuração.

**Checkpoint**: US9 funciona isoladamente sem liberar operações de identidade em modo degradado.

---

## Fase 4 — História 1: Entrar e manter sessão segura (P1) — MVP funcional

**Teste independente**: usuário ativo entra, cumpre MFA quando exigida, respeita limites/expiração e encerra apenas a sessão escolhida.

### RED

- [X] T060 [P] [US1] Criar testes de contrato do login para credencial inválida genérica, conta indisponível, rate limit, MFA e sessão aceita em `tests/contract/auth-sessions.live.test.ts` [RF-001, RS-009, RS-010].
- [X] T061 [P] [US1] Criar testes concorrentes do limite de três sessões, listagem sanitizada e encerramento escolhido antes do quarto login em `tests/integration/session-limit.live.test.ts` [RF-036].
- [X] T062 [P] [US1] Criar testes de timebox de 8 horas, inatividade de 30 minutos, JWT de 1 hora, renovação, bloqueio e revogação em `tests/integration/session-lifecycle.live.test.ts` [RF-002–RF-004, RF-035, RF-037, RS-012].
- [X] T063 [P] [US1] Criar testes de TOTP/AAL2 para perfis globais e para as ações críticas de RF-021C em `tests/integration/mfa.live.test.ts` [RF-034, RS-014].
- [X] T064 [US1] Criar testes de rotas privadas, tenant vigente, autorização atual e foco acessível em sessão expirada/acesso negado em `src/app/routing/protected-route.test.tsx` [RF-006, RF-022, RA-007].
- [X] T065 [US1] Criar E2E de login, MFA, quarta sessão, expiração, acesso negado e logout atual em `tests/e2e/auth-session.spec.ts` [CA-008].

### GREEN

- [X] T066 [US1] Implementar login governado, limite/listagem/revogação e auditoria em `supabase/functions/session-login/index.ts`, `session-logout/index.ts` e `session-status/index.ts` [RF-001–RF-004, RF-036, RF-037, AUD-001].
- [X] T067 [P] [US1] Implementar casos de uso de sessão fora do React em `src/application/identity/session-service.ts` [RF-003, RF-004].
- [X] T068 [US1] Implementar login e seleção de sessão a encerrar em `src/pages/auth/login-page.tsx` e `active-sessions-dialog.tsx` [RF-001, RF-036, RA-001–RA-006].
- [X] T069 [US1] Implementar matrícula/desafio TOTP em `src/pages/auth/mfa-page.tsx` e validação confiável nas funções sensíveis [RF-034].
- [X] T070 [US1] Implementar proteção de rotas em `src/app/routing/protected-route.tsx` [RF-006].

### REFACTOR e regressão

- [X] T071 [US1] Refatorar `src/domain/identity/` e `src/application/identity/session-service.ts`, executar testes T060–T065 e confirmar que falhas Auth nunca acionam fallback [RF-033].

---

## Fase 5 — História 2: Recuperar acesso (P1)

**Teste independente**: respostas equivalentes não enumeram contas; link expira em uma hora, é de uso único e reenvio invalida anteriores.

### RED

- [X] T072 [P] [US2] Criar testes de contrato para resposta equivalente, validade de 1 hora, uso único, reenvio, intervalo de 60 s e auditoria sanitizada em `tests/contract/password-recovery.test.ts` [RF-005, RF-013A, RF-044, RS-009, RS-010].
- [X] T073 [P] [US2] Criar testes de integração para captura local, serviço padrão somente em homologação e SMTP homologado em produção em `tests/integration/transactional-email.test.ts` [RF-043].
- [X] T074 [US2] Criar E2E acessível de solicitação, mensagem genérica, redefinição, expiração e reenvio em `tests/e2e/password-recovery.spec.ts` [CA-008, RA-001–RA-007].

### GREEN

- [X] T075 [US2] Implementar casos de uso e estado de entrega em `src/application/identity/password-recovery-service.ts` e fronteira servidor correspondente em `supabase/functions/password-recovery/index.ts` [RF-005, RF-044].
- [X] T076 [US2] Implementar páginas acessíveis em `src/pages/auth/recovery-request-page.tsx` e `recovery-confirm-page.tsx` [RF-005, RA-001–RA-007].
- [X] T077 [US2] Configurar templates transacionais em português em `supabase/templates/recovery.html` e documentar variáveis SMTP sem valores em `.env.example` [RF-043, RS-013].

### REFACTOR e regressão

- [X] T078 [US2] Refatorar `src/application/identity/password-recovery-service.ts` e executar T072–T074 garantindo ausência de enumeração e segredos [MS-005, MS-007].

---

## Fase 6 — História 3: Administrar tenants e responsáveis (P1)

**Teste independente**: ator global autorizado cria e altera tenant; administrador de tenant é bloqueado; último administrador permanece protegido.

### RED

- [X] T079 [P] [US3] Criar testes de contrato para criar, consultar, suspender, inativar e reativar organizações com MFA, justificativa e auditoria, incluindo estado inicial `inactive` e recusa de ativação sem administrador ativo [RF-009], em `tests/contract/organizations.test.ts` [RF-007–RF-010, RF-039, RF-040].
- [X] T080 [P] [US3] Criar testes de integração para convite do primeiro administrador, ativação do tenant após a aceitação e bloqueio de ator de tenant em `tests/integration/organization-administration.test.ts` [RF-009, RF-011].
- [X] T081 [US3] Criar E2E responsivo da administração global em `tests/e2e/organizations.spec.ts` [CA-008, CA-010].

### GREEN

- [X] T082 [US3] Implementar operações globais autorizadas em `supabase/functions/manage-organizations/index.ts` [RF-008–RF-011].
- [X] T083 [P] [US3] Implementar casos de uso fora do React em `src/application/identity/organization-service.ts` [RF-007–RF-010].
- [X] T084 [US3] Implementar UI responsiva em `src/pages/admin/tenants-dashboard-page.tsx` [RF-008, RF-031, RA-008].

### REFACTOR e regressão

- [X] T085 [US3] Refatorar `src/application/identity/organization-service.ts` e executar T079–T081, incluindo negações auditadas e isolamento A/B [MS-001–MS-003].

---

## Fase 7 — História 4: Gerenciar usuários do tenant (P2)

**Teste independente**: Administrador A gerencia somente membros e convites A; estados, último administrador, validade e reenvio são respeitados.

### RED

- [X] T086 [P] [US4] Criar testes de contrato para convite, estados de entrega, expiração de 72 horas, uso único, reenvio após 5 minutos e conflito em `tests/contract/invitations.test.ts` [RF-012–RF-016, RF-044].
- [X] T087 [P] [US4] Criar testes de integração para ativar, bloquear, inativar e reativar vínculo sem afetar outro tenant nem remover último administrador em `tests/integration/membership-management.test.ts` [RF-009, RF-014–RF-016].
- [X] T088 [US4] Criar E2E responsivo de convite e gestão de membros em `tests/e2e/tenant-members.spec.ts` [CA-008, CA-010].

### GREEN

- [X] T089 [US4] Implementar convite e gestão transacional em `supabase/functions/invite-user/index.ts` e `manage-membership/index.ts` [RF-012–RF-016].
- [X] T090 [P] [US4] Implementar casos de uso em `src/application/identity/membership-service.ts` [RF-014–RF-016].
- [X] T091 [US4] Implementar UI em `src/pages/admin/tenant-members-page.tsx` [RF-012, RF-031, RA-008].
- [X] T092 [US4] Criar template em `supabase/templates/invitation.html` sem segredo persistido e com estados reais de entrega [RF-043, RF-044].

### REFACTOR e regressão

- [X] T093 [US4] Refatorar `src/application/identity/membership-service.ts` e executar T086–T088 com Tenant A/B, escopo exclusivo do Administrador do tenant e auditoria de sucesso/negação [RF-041, MS-001, MS-003, MS-006].

---

## Fase 8 — História 5: Administrar papéis e permissões (P2)

**Teste independente**: somente permissões delegáveis compõem papel personalizado do tenant; papéis oficiais e escopos globais permanecem imutáveis.

### RED

- [X] T094 [P] [US5] Criar testes unitários de união de permissões, delegabilidade, revogação imediata e negação por padrão em `src/domain/identity/authorization.test.ts` [RF-018–RF-024].
- [X] T095 [P] [US5] Criar testes de contrato para criar/inativar papel, associar permissão e atribuir/remover papel, incluindo concorrência, último administrador e papéis Operador técnico/estoque/Motorista limitados ao próprio perfil, em `tests/contract/rbac.test.ts` [RF-017–RF-021A, RF-042].
- [X] T096 [US5] Criar testes de integração que alteram permissão sem renovar JWT e comprovam bloqueio imediato e isolamento A/B em `tests/integration/rbac-authorization.test.ts` [RF-020–RF-024, RN-012].
- [X] T097 [US5] Criar E2E responsivo de papéis, permissões e acesso negado em `tests/e2e/rbac.spec.ts` [CA-008, CA-010].

### GREEN

- [X] T098 [P] [US5] Implementar cálculo de autorização em `src/domain/identity/authorization.ts` [RF-018, RF-022–RF-024].
- [X] T099 [US5] Implementar mutações RBAC autorizadas em `supabase/functions/manage-access/index.ts` [RF-019–RF-021A].
- [X] T100 [US5] Implementar casos de uso em `src/application/identity/rbac-service.ts` [RF-018–RF-024].
- [X] T101 [US5] Implementar UI adaptável em `src/pages/admin/tenant-roles-page.tsx` [RF-019, RF-020, RA-008].

### REFACTOR e regressão

- [X] T102 [US5] Refatorar `src/domain/identity/authorization.ts` e executar T094–T097 com cobertura mínima de 95% em linhas, funções e branches do domínio/autorização [CA-004, CA-012].

---

## Fase 9 — História 6: Selecionar tenant ativo (P2)

**Teste independente**: usuário com múltiplos vínculos escolhe um tenant; adulteração, contexto inelegível e resíduos do tenant anterior são bloqueados.

### RED

- [X] T103 [P] [US6] Criar testes unitários para vínculo único, múltiplos vínculos, suspenso/bloqueado e `organization_id` adulterado em `src/domain/identity/tenant-selection.test.ts` [RF-026, ISO-003].
- [X] T104 [US6] Criar testes de integração para limpar/isolar cache, cursor, estado e outbox na troca de tenant sem perder pendência autorizada em `tests/integration/tenant-switch.test.ts` [RF-027, RF-059, ISO-008, MS-009].
- [X] T105 [US6] Criar E2E da seleção e troca de tenant em `tests/e2e/tenant-selection.spec.ts` [CA-008].

### GREEN

- [X] T106 [P] [US6] Implementar domínio de seleção em `src/domain/identity/tenant-selection.ts` [RF-026, RF-027].
- [X] T107 [US6] Implementar coordenação da troca em `src/application/identity/tenant-context-service.ts` e fornecer o `SyncContext.createRunner` real (base local desbloqueada no tenant ativo, `SyncOutbox`, push, pull e gates de sessão, tenant e consistência) consumido pelo `SyncGate` [RF-027, RF-051, RF-052, RF-059].
- [X] T108 [US6] Implementar UI em `src/pages/auth/tenant-selection-page.tsx` [RF-026, RA-001–RA-007].

### REFACTOR e regressão

- [X] T109 [US6] Refatorar `src/domain/identity/tenant-selection.ts` e executar T103–T105 comprovando zero dados ou comandos cruzados entre Tenant A e B [MS-009, MS-013].

---

## Fase 10 — História 7: Manter perfil e avatar (P3)

**Teste independente**: titular altera apenas campos próprios e avatar válido; MIME, bytes, tamanho, caminho e acesso de terceiro são protegidos.

### RED

- [X] T110 [P] [US7] Criar testes de contrato de perfil para `display_name` 2–100, `locale=pt-BR` e campos de autorização não editáveis em `tests/contract/profile.test.ts` [RF-028].
- [X] T111 [P] [US7] Criar testes de Storage/RLS para bucket privado, caminho `<user_id>/<object_id>.<extensão-normalizada>`, JPEG/PNG/WebP, 2 MB, bytes reais e isolamento A/B em `supabase/tests/002_avatars.test.sql` [RF-029, RF-030, RS-011, ISO-007].
- [X] T112 [US7] Criar testes de integração para substituição compensada e URL assinada curta em `tests/integration/profile-avatar.test.ts` [RF-029, RF-030].
- [X] T113 [US7] Criar E2E responsivo e acessível de perfil/avatar em `tests/e2e/profile.spec.ts` [CA-008–CA-010].

### GREEN

- [X] T114 [US7] Implementar policies/bucket no arquivo de migration criado via `npx supabase migration new private_avatars` em `supabase/migrations/` [RF-030].
- [X] T115 [P] [US7] Implementar validação de perfil/avatar em `src/domain/identity/profile.ts`, que reexporta as regras de `supabase/functions/_shared/profile-rules.ts` (fonte única usada pelo app e pela função `profile-avatar`, pois o runtime local só enxerga `supabase/functions/`) [RF-028, RF-029].
- [X] T116 [US7] Implementar fluxo compensado em `src/application/identity/profile-service.ts` [RF-029, RF-030].
- [X] T117 [US7] Implementar UI em `src/pages/profile/profile-page.tsx` [RF-028–RF-031].

### REFACTOR e regressão

- [X] T118 [US7] Refatorar `src/domain/identity/profile.ts` e executar T110–T113, confirmando ausência de objetos públicos e acesso cruzado [MS-001, MS-007].

---

## Fase 11 — História 8: Auditar autenticação e gestão de acesso (P3)

**Teste independente**: toda ação sensível produz evento sanitizado, imutável e visível somente no escopo autorizado; retenção é aplicada.

### RED

- [X] T119 [P] [US8] Criar testes de integração para eventos de login, recuperação, tenant, convite, vínculo, RBAC, sessão e negação crítica em `tests/integration/audit-events.test.ts` [AUD-001–AUD-006, AUD-010].
- [X] T120 [P] [US8] Criar testes SQL de `audit.read`, paginação `(occurred_at,id)`, filtros, imutabilidade e escopo global/tenant em `supabase/tests/002_audit_access.test.sql` [RF-038, AUD-004, AUD-007].
- [X] T121 [P] [US8] Criar testes de retenção para auditoria 5 anos, convite terminal 90 dias, perfil inativo 2 anos, hold legal e anonimização em `supabase/tests/002_retention.test.sql` [RN-013, AUD-008, AUD-009].
- [X] T122 [US8] Criar E2E responsivo e acessível da consulta de auditoria em `tests/e2e/audit-log.spec.ts` [CA-008–CA-010].

### GREEN

- [X] T123 [US8] Implementar escrita controlada e consulta paginada em `src/application/identity/audit-service.ts` e função `supabase/functions/query-audit/index.ts` [RF-038, AUD-001–AUD-007].
- [X] T124 [US8] Criar migration via `npx supabase migration new identity_retention` e implementar rotinas efetivas de retenção/anonimização em `supabase/migrations/`, sem alternativa meramente documental [RN-013, AUD-008, AUD-009].
- [X] T125 [US8] Implementar UI em `src/pages/admin/tenant-audit-log-page.tsx` [RF-031, RF-038, RA-008].

### REFACTOR e regressão

- [X] T126 [US8] Refatorar `src/application/identity/audit-service.ts` e executar T119–T122 confirmando 100% das ações sensíveis auditadas sem segredos [MS-003, MS-007].
- [X] T144 [US8] Criar a função `supabase/functions/retention-storage-cleanup/`, as funções SQL `take_storage_cleanup_batch`/`complete_storage_cleanup` e o contrato `contracts/retention-cleanup.md` para remover do Storage os avatares anonimizados, com testes em `tests/contract/retention-cleanup.test.ts`, `supabase/tests/002_storage_cleanup.test.sql` e `tests/contract/retention-cleanup.live.test.ts` [AUD-009, RN-013]. Tarefa retroativa: foi implementada sem registro prévio e adicionada na convergência.

---

## Fase 12 — Validação transversal, documentação e governança

**Objetivo**: executar todos os gates antes de encerrar o ciclo.

- [X] T127 [P] Criar/ajustar testes responsivos de 360 px, tablet e desktop para todos os fluxos em `tests/e2e/responsive.spec.ts` [RNF-005, RNF-010, CA-010].
- [X] T128 [P] Criar/ajustar testes axe, teclado, foco, contraste, nomes, anúncios e movimento reduzido em `tests/e2e/accessibility.spec.ts` [RNF-006, CA-009, RA-001–RA-009, MS-008].
- [X] T129 [P] Criar/ajustar testes PWA para instalação, app shell offline, retomada, cache sem Auth/Data/Storage e nenhuma confirmação falsa em `tests/e2e/pwa.spec.ts` [RNF-007, CA-011].
- [X] T130 [P] Criar testes de segurança do bundle, variáveis, logs e artefatos para impedir `service_role`, segredo, senha, token e chave administrativa em `tests/contract/client-secrets.test.ts` [RS-001, RS-002, RS-013, MS-007].
- [X] T131 Criar testes de desempenho reproduzíveis para p95 de login até 3 s e confirmação de recuperação até 2 s em `tests/e2e/performance.spec.ts`, documentando ambiente de referência em `specs/002-autenticacao-multitenancy-rbac/validation.md` [RNF-003, RNF-004].
- [X] T132 Executar validação humana controlada de MS-004–MS-006 e registrar em `specs/002-autenticacao-multitenancy-rbac/validation.md` amostra, ambiente, duração e resultados reais; se participantes ou resultados não estiverem disponíveis, registrar a pendência e bloquear o encerramento sem inventar evidências [MS-004–MS-006].
- [X] T133 Atualizar `specs/002-autenticacao-multitenancy-rbac/quickstart.md` com configuração cloud-first, IndexedDB, outbox, idempotência servidor, push/pull, conflitos, promoção e comandos reais de validação [RF-045–RF-060].
- [X] T134 [P] Atualizar `README.md`, `.env.example` e `docs/arquitetura-conectividade-supabase.md` sem valores sensíveis e com `cloud → LAN → local` [RF-045, RF-047].
- [X] T135 Executar `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:coverage`, `npm run test:e2e` e `npm run build`, registrar resultados reais em `specs/002-autenticacao-multitenancy-rbac/validation.md` e corrigir regressões antes de prosseguir [RNF-009, CA-012].
- [X] T136 Executar `npx supabase db reset`, `npx supabase test db`, `npx supabase db lint` e `npx supabase db advisors` no ambiente local e registrar os resultados sanitizados em `specs/002-autenticacao-multitenancy-rbac/validation.md` [RF-047, CA-001–CA-007].
- [X] T137 Executar varredura de segredos e revisão de dependências/lockfile, documentando qualquer exceção com responsável e prazo em `specs/002-autenticacao-multitenancy-rbac/validation.md` [RS-001, RS-002, RS-013].
- [X] T138 Executar `/speckit.converge` ou análise equivalente contra código, `spec.md`, `plan.md` e `tasks.md`, acrescentar e concluir toda tarefa residual antes da governança e registrar a ausência de lacunas em `specs/002-autenticacao-multitenancy-rbac/validation.md` [Governança, RNF-009].
- [X] T145 Criar `tests/integration/performance.live.test.ts` medindo p95 de `session-login` e `password-recovery` contra o Supabase local (20 amostras por cenário) e registrar ambiente e resultado em `specs/002-autenticacao-multitenancy-rbac/validation.md` §2.1 [RNF-003, RNF-004].
- [ ] T146 Comprovar a mesma versão pública de contrato/schema, migrations, RLS e catálogo em um destino cloud ou LAN homologado e registrar o resultado sanitizado em `specs/002-autenticacao-multitenancy-rbac/validation.md` §6. Se não houver destino disponível, manter a pendência registrada e levá-la ao RIA [RF-047, RS-013].
- [ ] T147 Repetir a medição de p95 de login e de confirmação de recuperação contra um destino cloud ou LAN homologado, nas condições de referência, e registrar ambiente e resultado em `specs/002-autenticacao-multitenancy-rbac/validation.md` §2; sem destino disponível, manter a pendência registrada e levá-la ao RIA [RNF-003, RNF-004].
- [X] T148 [US8] Criar `.github/workflows/retention-cleanup.yml` (agenda diária e sob demanda, segredo só pelo bloco `env`, permissões mínimas) que aciona `retention-storage-cleanup` no projeto cloud, com teste de contrato em `tests/contract/retention-workflow.test.ts` [AUD-009].
- [ ] T149 [US8] Configurar no repositório as variáveis `SUPABASE_CLOUD_URL` e `SUPABASE_CLOUD_PUBLISHABLE_KEY` e o segredo `RETENTION_JOB_SECRET` (o mesmo das Edge Functions), executar o workflow por `workflow_dispatch` e registrar o resultado sanitizado em `specs/002-autenticacao-multitenancy-rbac/validation.md` §8; em instalações LAN, configurar um agendador equivalente [AUD-009].
- [X] T139 Preparar com `git add` somente implementação, testes, `specs/002-autenticacao-multitenancy-rbac/` e documentação aprovada, revisar `git diff --cached` para dados sensíveis e não criar commit [Governança].
- [X] T140 Gerar o RIA do primeiro ciclo da Spec 002 com `npm run ia:registro -- --spec 002 --ciclo 01 --titulo "Autenticação, multitenancy e RBAC"` em `docs/governanca-ia/registros/`, incluindo a ADR-001 e síntese sanitizada [Governança].
- [X] T141 Solicitar e aguardar validação humana real no novo RIA, registrar decisão `utilizado|adaptado|descartado`, preparar `docs/governanca-ia` e não inventar aprovação, testes ou fontes [Governança].
- [X] T142 Executar `npm run ia:validar` somente após T141, registrar o resultado em `specs/002-autenticacao-multitenancy-rbac/validation.md` e interromper o encerramento se o gate falhar; commit, push e PR permanecem fora desta geração [Governança].

---

## Dependências e ordem de execução

### Grafo de fases

```text
Fase 1 — contratos
  → Fase 2 — schema/RLS compartilhados
    → US9 — conectividade e inicialização
      → US1 — autenticação/sessões
        ├→ US2 — recuperação
        ├→ US3 — tenants
        │   → US4 — membros/convites
        │      → US5 — RBAC
        │         → US6 — tenant ativo
        └→ US7 — perfil/avatar
    US1 + US3 + US4 + US5 → US8 — auditoria completa
Todas as histórias → Fase 12 — validação e governança
```

### Dependências por história

- **US9** depende das Fases 1–2 e bloqueia as demais porque fornece cliente e inicialização.
- **US1** depende de US9 e da tabela `user_sessions`.
- **US2** depende de US1 para sessão/recuperação, mas pode evoluir paralelamente após seus contratos.
- **US3** depende de US1 e do RBAC fundacional global.
- **US4** depende de US3 para organizações e primeiro administrador.
- **US5** depende de US4 para vínculos válidos.
- **US6** depende de US4/US5 para vínculos e permissões efetivas.
- **US7** depende de US1 e pode ser paralela a US3–US6.
- **US8** fecha a auditoria das histórias anteriores e depende de seus eventos.

### Oportunidades de paralelismo

- T008–T016 podem ser escritos em paralelo; T017–T018 também, depois da definição de atores.
- Na US9, T023–T025, T027–T030 e T038 podem avançar em paralelo; T033–T037 dependem das abstrações anteriores.
- Em cada história, tarefas RED marcadas `[P]` podem ser distribuídas, mas GREEN só começa após a falha esperada correspondente.
- US2 e US7 podem avançar em paralelo após US1; documentação transversal T127–T134 pode ser preparada após estabilização dos contratos.

## Critérios independentes por história

| História | Critério independente |
|---|---|
| US9 | Resolve cloud-first, bloqueia falhas de segurança, sincroniza push→pull e promove cloud sem duplicação/vazamento. |
| US1 | Login, MFA, limite de três, expiração e logout atual funcionam sem fallback indevido. |
| US2 | Recuperação não enumera contas e respeita validade, reenvio e canal por ambiente. |
| US3 | Ator global administra tenants; ator de tenant é negado e auditado. |
| US4 | Administrador A gerencia apenas membros/convites A e preserva último administrador. |
| US5 | Permissões atuais e delegáveis governam acesso; papéis oficiais permanecem imutáveis. |
| US6 | Um tenant fica ativo e a troca não deixa cache, comando ou permissão do anterior. |
| US7 | Perfil próprio e avatar privado respeitam validações e isolamento. |
| US8 | Eventos sensíveis são sanitizados, imutáveis, retidos e consultados no escopo correto. |

## Estratégia de entrega

1. Concluir contratos e fundação.
2. Entregar US9 como incremento técnico independente.
3. Entregar US1 como primeiro MVP funcional.
4. Acrescentar US2 e US3; depois US4, US5 e US6.
5. US7 pode avançar após US1; US8 fecha a rastreabilidade completa.
6. Executar todos os gates e a governança sem commit automático.

## Regras de execução

- Confirmar RED antes do GREEN e registrar a evidência no acompanhamento da tarefa.
- Não fazer fallback em autenticação, autorização, RLS, tenant, validação, integridade ou configuração.
- Nunca colocar `service_role`, senha, token, chave secreta ou dado pessoal desnecessário no cliente, log, teste ou RIA.
- Toda policy RLS deve provar permissão e bloqueio com Tenant A e Tenant B.
- Não habilitar comandos de identidade/RBAC na outbox; `offline-safe` para domínios futuros exige nova spec.
- Não iniciar escrita simultânea em endpoints diferentes.
- Não criar commit, push ou PR automaticamente ao concluir estas tarefas.
