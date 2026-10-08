---
description: "Tarefas executáveis da Spec 007 — Clientes, unidades, geocercas, veículos e motoristas"
---

# Tarefas: Clientes, unidades, geocercas, veículos e motoristas

**Entrada**: artefatos em `specs/007-clientes-geocercas-frota/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD. Em cada incremento, escrever o teste, confirmar a falha esperada (RED), implementar (GREEN), refatorar e rodar a regressão antes de avançar. Testes de banco ficam em `supabase/tests/007_*.test.sql` (pgTAP); testes de domínio, serviço, funções e páginas em Vitest ao lado do código; E2E em `tests/e2e/`.

**Escopo protegido**:
- Nenhum dado desta spec vem de dados de exemplo; a Visão geral e sua fonte (`src/infrastructure/overview/`) **não mudam** [RF-042].
- Sem dependência nova de execução no `package.json` do cliente [RNF-006]. A única extensão nova é o PostGIS, no banco [research.md, decisão 1].
- Sem fila offline: toda escrita e a busca de CEP exigem conexão; `sync-outbox` e `local-database` não são usados [RF-045].
- Nenhuma operação de exclusão em lugar algum [RF-033, CA-002]. A anonimização **sobrescreve** campos pessoais no próprio registro, é irreversível, exige permissão crítica, MFA, motivo, justificativa e confirmação, e **não apaga linha alguma** [RF-054 a RF-063, CA-015 a CA-017].
- Nenhuma chave `service_role` ou credencial privilegiada no cliente [RF-051]. Nenhum dado de cadastro, documento ou resposta de CEP no cache do service worker [RF-046].
- **CPF, CNH, CNPJ de pessoa física e nome, telefone e e-mail de pessoa física nunca aparecem em log, evento, auditoria, mensagem de erro, URL ou cache** [RF-031, CA-005, CA-015]. Todo documento de teste é fictício e gerado pela suíte; **nunca** usar documento real.
- Só o CEP sai para terceiros, e só pela função `lookup-postal-code` [RF-009, CA-006]. O CI nunca chama o ViaCEP real.
- Os testes das Specs 001 a 006 só mudam onde o catálogo de telas ganha as quatro entradas novas (contagens e listas de telas) e onde a borda genérica das funções é extraída sem mudar comportamento.

**Convenções de interface** (AGENTS.md, Spec 005): usar a skill `ui-ux-pro-max` ao criar ou alterar telas; só tokens (nenhum valor arbitrário do Tailwind, cor literal ou transição que atrase o anel de foco; `tests/contract/escalas-no-codigo.test.ts` reprova); movimento respeita `prefers-reduced-motion`; capturas regeneradas no Linux com `npm run test:visual:atualizar`, nunca versionar `*-win32.png`; rodar `npm run build` antes dos E2E, porque o Playwright reaproveita um servidor aberto na porta 4173.

**Nomes de migrations**: o plano previa 8 arquivos por área; aqui as RPCs entram junto da história que as usa, para cada incremento ser testável sozinho (`*_registry_extensions.sql` e `*_registry_schema.sql` e `*_registry_permissions.sql` na Fundação; `*_registry_customers_write.sql`, `*_registry_customers_read.sql`, `*_registry_geofences.sql`, `*_registry_vehicles.sql`, `*_registry_drivers.sql`, `*_registry_inactivation.sql`, `*_registry_anonymization.sql` e `*_registry_history.sql` nas histórias). A tarefa de documentação atualiza o `plan.md` com os nomes finais. Prefixo de data `2026100700xxxx` em ordem crescente.

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode rodar em paralelo, porque não modifica os mesmos arquivos nem depende de tarefa incompleta.
- `[USN]`: história de usuário da spec (US1 a US9, na ordem das histórias 1 a 9).
- Referências entre colchetes ligam a tarefa aos requisitos e critérios da spec.

## Mapa das histórias

| História | Prioridade | Entrega |
|---|---|---|
| US1 Cadastrar um cliente com uma unidade, endereço pelo CEP | P1 | RPCs de cliente, contatos e unidade; função `lookup-postal-code`; formulários e campo de CEP |
| US2 Consultar clientes e unidades | P1 | RPCs de consulta; lista (tabela e cartões), busca, filtros, detalhe do cliente e da unidade |
| US3 Definir a geocerca de uma unidade | P1 | RPCs de geocerca e consulta espacial; formulário, pré-visualização, "Testar um ponto", lista e detalhe |
| US4 Cadastrar e manter veículos | P1 | RPCs de veículo; formulário, lista, detalhe, situação operacional e do licenciamento |
| US5 Cadastrar e manter motoristas, com proteção de dados | P1 | RPCs de motorista, vínculo e revelação; máscaras; formulário, lista, detalhe |
| US6 Inativar e reativar, sem apagar nada | P2 | RPCs de inativação com cascata e prévia; diálogo de cascata; ações nas cinco áreas |
| US7 Consultar o histórico de cada cadastro | P2 | `history` paginado, filtros, ordem estável, bloco de histórico nas cinco áreas |
| US8 Anonimizar dados pessoais, sem apagar o cadastro | P2 | RPCs de anonimização de motorista, cliente pessoa física e contato; MFA; diálogo; registro anonimizado bloqueado |
| US9 Usar em celular, tablet e desktop, só com teclado | P2 | verificação transversal de responsividade, acessibilidade, PWA e offline |

---

## Fase 1 — Preparação

**Objetivo**: rastreabilidade e linha de base antes de qualquer mudança.

- [X] T001 Registrar em `specs/007-clientes-geocercas-frota/plan.md` (seção Rastreabilidade) o número da issue da Spec 007 e a branch `feat/007-clientes-geocercas-frota`; se a issue ainda não existir, **pedir confirmação da pessoa responsável antes de abri-la** (ação externa) e abri-la com o título "Spec 007: clientes, unidades, geocercas, veículos e motoristas".
- [X] T002 Rodar `npm run lint`, `npm run typecheck`, `npm test` e `npx supabase test db` na branch e registrar em `specs/007-clientes-geocercas-frota/baseline.md` que as suítes das Specs 001 a 006 estão verdes antes da mudança (contagens de arquivos e testes).
- [X] T003 [P] Rodar `npm run build` e confirmar em `specs/007-clientes-geocercas-frota/baseline.md` o tamanho do pacote de entrada (579,54 kB; limite 593,95 kB) e as medianas de `tests/e2e/medicao-shell.spec.ts`, se existirem.
- [X] T004 [P] Anotar em `baseline.md` o procedimento do Supabase local para esta spec: funções novas exigem `npx supabase stop` e `npx supabase start`; as suítes pgTAP `006_*` e `007_*` contam linhas de `audit_logs` e exigem base limpa (`npx supabase db reset` antes de `npx supabase test db`, depois de `test:live`); conferir em `supabase/config.toml` que as três funções novas seguem o padrão das de cilindros (sem bloco `verify_jwt = false`, que só as funções públicas têm).
- [X] T005 [P] Confirmar com `git status` que `package.json`, `package-lock.json`, `vite.config.ts` e `docs/arquitetura-conectividade-supabase.md` modificados fora desta spec **não** entram nos commits desta spec (adicionar só arquivos desta spec com `git add` explícito).

---

## Fase 2 — Fundação (bloqueia as histórias)

**Objetivo**: PostGIS, esquema com RLS e imutabilidade, permissões, regras de domínio puras, borda genérica das funções, transporte, catálogo de telas e base do backend simulado. Sem isso nenhuma história pode ser montada.

### Banco: testes primeiro (RED)

- [X] T006 [P] Escrever `supabase/tests/007_rls.test.sql`: para cada tabela (`customers`, `customer_contacts`, `customer_sites`, `geofences`, `vehicles`, `drivers`, `registry_events`), com os Tenants A e B, confirmar que o A lê o que é dele e grava por inserção privilegiada na preparação do teste (as RPCs de escrita só existem a partir de US1 e têm asserções de RLS próprias nos testes de cada história), que **não vê** nada do B (e o inverso), que `anon` não acessa nada, que membro sem a permissão `*.read` não lê e que `insert`, `update` e `delete` diretos de `authenticated` são recusados, e que organização suspensa tem leitura e escrita negadas como nas specs anteriores [RF-048, CA-001].
- [X] T007 [P] Escrever `supabase/tests/007_documents_rls.test.sql`: `customer_documents` e `driver_documents` têm RLS ligada **sem nenhuma política** e privilégios revogados; nenhum papel (`anon`, `authenticated`, membro com `*.read`, administrador do tenant) lê pelo acesso direto, nem o Tenant A lê o do B; só a RPC de revelação devolve o valor [RF-029 a RF-031, CA-005; research.md, decisão 4].
- [X] T008 [P] Escrever `supabase/tests/007_immutability.test.sql`: `update` e `delete` em `registry_events` recusados para `authenticated` **e** `service_role`; `delete` recusado em `customers`, `customer_sites`, `geofences`, `vehicles`, `drivers`, `customer_documents` e `driver_documents` para qualquer papel; em `customer_contacts`, `delete` direto recusado a `authenticated` **e** `service_role`, aceito **somente** dentro de `update_customer` pela variável de sessão local `app.registry_contacts_replace` (a única exceção ao RF-033) [RF-033, CA-002, CA-003].
- [X] T009 [P] Escrever `supabase/tests/007_constraints.test.sql` com as restrições do `data-model.md`, citadas literalmente: `customers.person_type` ∈ `legal`, `individual`; `legal_name` de 2 a 160 caracteres; `trade_name` até 160; `segment` ∈ `hospital`, `clinic`, `laboratory`, `industry`, `distributor`, `other`; `segment_detail` até 60, obrigatório quando `segment = 'other'` e nulo nos demais; `notes` até 500; `status` ∈ `active`, `inactive`; `customer_contacts.name` de 2 a 120, `role` até 80, `phone` só dígitos (10 ou 11), `email` válido até 160 em minúsculas, no máximo um `is_primary` por cliente (índice único parcial); `customer_sites.name` de 2 a 120 e único por cliente sem diferenciar caixa, `postal_code` com 8 dígitos, `street` até 120, `number` até 20, `complement` até 80, `district` até 80, `city` até 80, `state` uma das 27 UFs, `ibge_code` com 7 dígitos, `latitude` e `longitude` `numeric(9,6)` informadas juntas e nos intervalos −90..90 e −180..180, `receiving_days` com dias 0 a 6 sem repetição, `receiving_to > receiving_from` e, havendo horário, ao menos um dia, `access_instructions` até 500; `geofences.name` de 2 a 120 e único por unidade sem diferenciar caixa, `shape` ∈ `circle`, `polygon`, círculo exige `center` e `radius_m` (25 a 5000) e proíbe `vertices`, polígono exige `vertices` (3 a 100) e proíbe `center` e `radius_m`; `vehicles.plate` normalizada de 7 caracteres maiúsculos `AAA9999` ou `AAA9A99`, única por organização, `vehicle_type` ∈ `truck`, `van`, `utility`, `other` (com `vehicle_type_detail` até 60, obrigatório em `other`), `manufacture_year` de 1980 até o ano seguinte ao atual, `capacity_cylinders` de 1 a 9999, `max_load_kg` maior que 0, `status` ∈ `available`, `maintenance`, `inactive`; `drivers.full_name` de 2 a 160, `phone` de 10 ou 11 dígitos, `cnh_category` ∈ `A`, `B`, `C`, `D`, `E`, `AB`, `AC`, `AD`, `AE`, `cnh_valid_until` obrigatória, `linked_user_id` único por organização quando não nulo; `driver_documents` com `unique (organization_id, cpf)` e `unique (organization_id, cnh_number)`; `customer_documents` com `unique (organization_id, document_key)`; `registry_events` com `unique (entity_type, entity_id, sequence)` e `entity_type` ∈ `customer`, `site`, `geofence`, `vehicle`, `driver`; `anonymized_at` e `anonymized_by` em `customers`, `customer_contacts` e `drivers`; `anonymized_at` também em `customer_documents` e `driver_documents`, com `check` de linha única: `customer_documents.document_key` nulo se e só se a própria linha tem `anonymized_at`, e `driver_documents.cpf` e `cnh_number` nulos se e só se a própria linha tem `anonymized_at` (nenhum `check` consulta outra tabela), e `unique` aceitando vários nulos [data-model.md].
- [X] T010 [P] Escrever `supabase/tests/007_permissions.test.sql`: as 20 permissões existem (escopo `tenant`, `tenant_delegable`; `customer.anonymize` e `driver.anonymize` com `critical = true` e as demais não críticas); `tenant_admin` tem todas; `stock_operator` tem só `customer.read`, `geofence.read`, `vehicle.read` e `driver.read`; `technical_operator` só `customer.read` e `vehicle.read`; `tenant_auditor` só `read` e `history` das quatro áreas e **nenhuma** `*.document` nem `*.anonymize`; `driver` nenhuma; `master_fluxid` todas; nenhum papel existente perdeu permissão; as concessões a tenants existentes são idempotentes [RF-049, contracts/permissoes-e-papeis.md].
- [X] T011 [P] Escrever `supabase/tests/007_limits_contract.test.sql`: `private.geofence_limits()` devolve raio mínimo 25, raio máximo 5000, vértices mínimo 3 e máximo 100; `private.document_expiring_days()` devolve o mesmo valor de `private.hydrostatic_expiring_days()` (30) [RF-014, RF-015, RF-022].
- [X] T012 [P] Escrever `supabase/tests/007_validators.test.sql`: `private.validate_cpf`, `private.validate_cnpj` (numérico e alfanumérico, incluindo `12ABC34501DE35`, que deve ser válido, e a mesma base com dígito errado, que deve ser inválida) e `private.validate_cnh` com a mesma tabela de casos do TypeScript; letra nas posições 13 e 14 do CNPJ é inválida; todos os caracteres iguais é inválido; `private.normalize_plate` aceita `abc-1234` e `ABC1D23` e rejeita `AB12345` e `ABCD123` [CA-008, research.md, decisão 3].

### Banco: implementação (GREEN)

- [X] T013 Criar `supabase/migrations/2026100700xxxx_registry_extensions.sql`: `create extension if not exists postgis with schema extensions;` e nada mais [research.md, decisão 1].
- [X] T014 Criar `supabase/migrations/2026100700xxxx_registry_schema.sql` com as 9 tabelas do `data-model.md` (colunas, tipos, `check`, índices únicos e trigrama, `organization_id` com `on delete restrict`, `version bigint not null default 1`), RLS ligada em todas, política de `select` só nas sete tabelas de dados e **nenhuma** em `customer_documents` e `driver_documents`, `revoke` de `insert`, `update` e `delete` de `anon` e `authenticated`, gatilhos `before update or delete` em `registry_events` e de recusa de `delete` nas demais, e as funções `private.geofence_limits()`, `private.document_expiring_days()`, `private.validate_cpf/cnpj/cnh(text)`, `private.normalize_plate(text)` e `private.append_registry_event(...)` (sequência por `(entity_type, entity_id)` sob `for update` da linha da entidade, escolhida por tipo) e as colunas `anonymized_at` e `anonymized_by` (e `anonymized_at` nas duas tabelas de documentos) com os `check` de anonimização **de linha única** (um `CHECK` não consulta outra tabela); o gatilho de exclusão de `customer_contacts` aceita `delete` só com a variável de sessão local `app.registry_contacts_replace`; um gatilho `before update` recusa qualquer mudança de `customers.person_type` (tipo de pessoa fixo, RF-001); o gatilho que recusa `update` nas tabelas de documentos aceita a mudança para nulo só dentro das funções de anonimização (variável de sessão local, no padrão de `app.system_bootstrap`) [data-model.md, research.md, decisões 4, 6, 9, 15].
- [X] T015 Criar `supabase/migrations/2026100700xxxx_registry_permissions.sql`: inserir as 20 permissões do contrato (ids `40000000-0000-0000-0000-0000000000NN` a partir de `...020`; `customer.anonymize` e `driver.anonymize` com `critical = true`), substituir `private.bootstrap_tenant_roles` de forma idempotente conforme `contracts/permissoes-e-papeis.md`, conceder às organizações existentes e ao `master_fluxid` (`insert ... on conflict do nothing`), sem remover nada [RF-049].
- [X] T016 Rodar `npx supabase db reset` e `npx supabase test db`: as suítes `007_rls`, `007_documents_rls`, `007_immutability`, `007_constraints`, `007_permissions`, `007_limits_contract` e `007_validators` passam e as `001` a `006` continuam verdes.

### Domínio (TypeScript), testes primeiro

- [X] T017 [P] Escrever `src/domain/shared/validity-status.test.ts` e criar `src/domain/shared/validity-status.ts` com `EXPIRING_DAYS = 30` e `validityStatus(dueOn, today)` devolvendo `em_dia` (mais de 30 dias), `a_vencer` (30 dias ou menos), `vencido` ou `sem_data`, usando o dia de `America/Sao_Paulo`; testar 31, 30, 1, 0 e −1 dia; alterar `src/domain/cylinders/hydrostatic-status.ts` para importar a constante e confirmar que `hydrostatic-status.test.ts` continua verde [RF-022, CA-009].
- [X] T018 [P] Escrever `src/domain/registry/document-validation.test.ts` e criar `src/domain/registry/document-validation.ts`: `validateCpf`, `validateCnpj` (uma função para numérico e alfanumérico: normaliza para maiúsculas sem `.`, `/`, `-`; 14 caracteres; valor de cada caractere = código ASCII menos 48; pesos 5,4,3,2,9,8,7,6,5,4,3,2 e 6,5,4,3,2,9,8,7,6,5,4,3,2; resto menor que 2 → dígito 0, senão 11 − resto; dígitos verificadores numéricos; rejeita 14 caracteres iguais) e `validateCnh` (11 dígitos, dígitos verificadores, rejeita sequências iguais); casos de teste com `12.ABC.345/01DE-35`, CNPJs numéricos válidos, dígito errado, letra nas posições 13 e 14, tamanho errado e valores fictícios gerados pela própria suíte; mesma tabela de casos de `007_validators.test.sql` [RF-002, RF-025, CA-008].
- [X] T019 [P] Escrever `src/domain/registry/masks.test.ts` e criar `src/domain/registry/masks.ts`: `maskCpf` mostra só os dois últimos dígitos (`***.***.***-XY`), `maskCnh` só os três últimos (`*********XYZ`), `formatCnpj` devolve o CNPJ completo; nenhuma função devolve o CPF ou a CNH inteiros a partir de entrada mascarada [RF-029].
- [X] T020 [P] Escrever `src/domain/registry/plate.test.ts` e criar `src/domain/registry/plate.ts`: `normalizePlate` (maiúsculas, sem hífen e sem espaços) e `validatePlate` para `AAA9999` e `AAA9A99`; rejeita outros formatos [RF-020, CA-008].
- [X] T021 [P] Escrever `src/domain/registry/phone-and-postal-code.test.ts` e criar `src/domain/registry/phone-and-postal-code.ts`: `normalizePhone` (só dígitos, 10 ou 11), `normalizePostalCode` (8 dígitos, aceita hífen e espaços; 7 e 9 dígitos recusados) [CA-008].
- [X] T022 [P] Escrever `src/domain/registry/geofence-geometry.test.ts` e criar `src/domain/registry/geofence-limits.ts` (raio 25 a 5000; vértices 3 a 100; coordenadas −90..90 e −180..180) e `src/domain/registry/geofence-geometry.ts` (`validateCircle`, `validatePolygon`: vértice repetido em sequência, cruzamento de arestas incluindo toque em vértice, área zero, sentido horário e anti-horário aceitos; motivos `radius_range`, `vertex_count`, `self_intersection`, `zero_area`, `duplicate_vertex`, `coordinate_range`); mesma tabela de casos de `007_geofences.test.sql` [RF-014, RF-015, CA-007].
- [X] T023 [P] Escrever `src/domain/registry/registry-vocabulary.test.ts` e criar `src/domain/registry/registry-vocabulary.ts` com os vocabulários literais do `data-model.md` (situações, segmentos, tipos de veículo, categorias de CNH, tipos de entidade, tipos de evento) e rótulos em português; teste de contrato com as listas do SQL.
- [X] T024 Escrever `src/domain/registry/registry-validation.test.ts` e criar `src/domain/registry/registry-validation.ts` (zod) com as regras de formulário de cliente, contato, unidade, janela de recebimento, geocerca, veículo e motorista, usando os validadores acima e os limites do `data-model.md` (textos 2 a 160, 120, 80, 60, 20 e 500 conforme o campo; ano de fabricação de 1980 até o ano seguinte ao atual; capacidade de 1 a 9999; até 10 contatos com um principal) [RF-001 a RF-007, RF-019 a RF-025].

### Funções e serviço, base

- [X] T025 Extrair a borda genérica de `supabase/functions/_shared/cylinders.ts` para `supabase/functions/_shared/operations.ts` **sem mudar comportamento** (regras de validação, mapeamento de HTTP, autenticação, auditoria de negação) e fazer `cylinders.ts` reexportá-la; acrescentar à tabela de HTTP os códigos novos (`DOCUMENT_CONFLICT`, `PLATE_CONFLICT`, `NAME_CONFLICT`, `INACTIVE_RECORD`, `PARENT_INACTIVE`, `CASCADE_CHANGED`, `USER_NOT_ELIGIBLE`, `GEOMETRY_INVALID`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`) e novas regras de campo (`array`, `object`, `time`, `date-nullable`) estender `Identity` com `aal` (`'aal1'` ou `'aal2'`, vindo das claims do token como em `supabase/functions/_shared/gateways.ts`) e fazer `authenticate` devolvê-lo, para a anonimização exigir `aal2` (`MFA_REQUIRED`) como o `manage-membership` já faz; traduzir a exceção do banco `anonymized_record` em `ANONYMIZED_RECORD` (409) no mesmo ponto da borda que traduz os erros do banco; tudo com testes em `tests/contract/registry-handlers.test.ts`; confirmar que `tests/contract/cylinders-handlers.test.ts` continua verde [plan.md, decisão de estrutura, RF-055, RF-058].
- [X] T026 [P] Criar o esqueleto de `src/application/registry/registry-service.ts` sobre `createFunctionTransport`, com mapeamento dos códigos de erro de `contracts/operacoes-servidor.md` para estados de tela, e o esqueleto de `src/application/registry/registry-service.test.ts`; o serviço nunca guarda resposta em armazenamento local.
- [X] T027 [P] Atualizar `src/domain/navigation/screens.ts` com `clientes` (`/clientes`, `customer.read`), `geocercas` (`/geocercas`, `geofence.read`), `veiculos` (`/veiculos`, `vehicle.read`) e `motoristas` (`/motoristas`, `driver.read`), todos `tenantScoped: true` e `requireAal2: false`, com os ícones oficiais `entrega`, `geocerca`, `caminhao` e `rota`; atualizar `screens.test.ts` e os testes da Spec 004 que contam telas; nenhuma regra de visibilidade muda [RF-039].
- [X] T028 Criar `src/app/registry/registry-routes.ts` e `registry-routes.test.ts` (resolver das 19 rotas de `contracts/telas-e-rotas.md`, permissão da ação por rota, `React.lazy` por tela, rota desconhecida cai no estado "não encontrado") e ligar o resolvedor ao roteamento por `window.location.pathname`, no padrão de `src/app/cylinders/cylinder-routes.ts`. **Na Fundação o resolvedor nasce só com a tabela de rotas e as permissões de ação, sem `import()` de página**; cada história registra as suas rotas e o `React.lazy` da página no mesmo passo em que cria a página (US1 e US2: clientes e unidades; US3: geocercas; US4: veículos; US5: motoristas), de modo que `typecheck` e `build` nunca ficam quebrados por página inexistente [RF-047].
- [X] T029 [P] Criar `src/pages/registry/components/status-badge.tsx` e `status-badge.test.tsx`: situação cadastral, situação do documento e situação operacional do veículo, sempre com **texto e ícone**, nunca só cor; só tokens [RF-044].
- [X] T030 [P] Criar `tests/e2e/support/mock-registry.ts` (base do backend simulado das três funções, com isolamento por organização, permissões e sequência de histórico, no padrão de `mock-cylinders.ts`) e acoplá-lo ao `mock-backend.ts`; as histórias estendem o simulado com suas operações.
- [X] T031 [P] Criar `tests/support/sql/registry-volume-semear.sql` e `registry-volume-limpar.sql` (10 mil clientes, 50 mil unidades, 50 mil geocercas, 5 mil veículos e 5 mil motoristas em organização própria, com `generate_series`, documentos fictícios) para as medições de desempenho [RNF-001 a RNF-003].

---

## Fase 3 — US1: Cadastrar um cliente com uma unidade, endereço pelo CEP (P1) 🎯 MVP

**Objetivo**: cadastrar cliente com documento validado e contatos, acrescentar unidade preenchendo o endereço pelo CEP (e digitando quando o serviço falhar).

**Teste independente**: com o administrador do Tenant A, cadastrar um cliente com uma unidade usando um CEP válido, ver o endereço preenchido, salvar e abrir o detalhe; com o administrador do Tenant B, confirmar que nada aparece.

### Testes primeiro (RED)

- [X] T032 [P] [US1] Escrever `supabase/tests/007_customers.test.sql`: `create_customer` cria ativo com evento `customer_created` e auditoria `customer.create` **sem documento em texto aberto**; documento único por organização (e repetido em outra organização é aceito); CNPJ numérico e alfanumérico aceitos e dígito errado recusado; pessoa física exige CPF; `person_type` não muda por `update_customer` nem por `update` direto (gatilho) e a correção de documento só vale dentro do mesmo tipo (CNPJ por CNPJ, CPF por CPF); `segment = 'other'` exige detalhe; até 10 contatos com um principal; `update_customer` substitui os contatos não anonimizados (acrescenta, atualiza e remove os que não vieram na lista, com `contacts_changed` só com contagens) e preserva os anonimizados; `update_customer` com `expected_version` (segunda gravação sobre dado antigo → `VERSION_CONFLICT`); correção de documento exige justificativa e gera `document_changed` sem valor para CPF e com valor antigo e novo para CNPJ; edição de `legal_name`, `trade_name` e `notes` de cliente pessoa física gera evento só com `changed_sensitive` (sem valores), enquanto a de cliente pessoa jurídica traz valor antigo e novo; edição de cliente inativo → `INACTIVE_RECORD`; `DOCUMENT_CONFLICT` indica o nome do dono e nunca o documento [RF-001 a RF-004a, RF-032, RF-038, CA-004].
- [X] T033 [P] [US1] Escrever `supabase/tests/007_sites.test.sql`: `create_site` e `update_site` com nome único por cliente sem diferenciar caixa (`NAME_CONFLICT`), CEP de 8 dígitos, UF válida, coordenadas juntas e nos intervalos, janela de recebimento válida (`receiving_to` depois de `receiving_from`, ao menos um dia, dias 0 a 6 sem repetição); unidade criada sem nenhuma chamada ao serviço de CEP; criar unidade sob cliente inativo → `PARENT_INACTIVE`; `VERSION_CONFLICT` em `update_site`; eventos `site_created` e `site_updated` e auditoria [RF-005 a RF-007, RF-038].
- [X] T034 [P] [US1] Escrever `tests/contract/lookup-postal-code-handler.test.ts` com porta falsa do provedor: encontrado; `erro` como `true` e como `"true"` → `NOT_FOUND`; CEP malformado → `VALIDATION_FAILED` **sem chamar o provedor**; tempo esgotado (4 s), 5xx, JSON inválido e UF fora das 27 → `SERVICE_UNAVAILABLE`; campos extras e `complemento` do provedor descartados; textos limitados (logradouro 120, bairro 80, cidade 80, UF 2 letras, IBGE 7 dígitos); sem permissão `customer.write` → `ACCESS_DENIED` sem consultar; limite de 10 por minuto por pessoa e 100 por minuto por organização com `RATE_LIMITED` e `retry_after_seconds`; log sem CEP e sem identificação da pessoa [RF-009 a RF-012, RNF-004].
- [X] T035 [P] [US1] Escrever `tests/contract/viacep-provider.test.ts`: o adaptador monta `GET https://viacep.com.br/ws/{8 dígitos}/json/` com só `accept` e `user-agent: FluxID/1.0`, sem query, sem corpo e sem cookie, e interpreta as respostas reais observadas (200 com dados, 200 com `{"erro":"true"}`, 400 em HTML) [contracts/consulta-de-cep.md, CA-006].
- [X] T036 [P] [US1] Escrever `tests/contract/postal-code-egress.test.ts`: executa o manipulador com um `fetch` capturado e confere que a **única** chamada de saída é `GET /ws/{8 dígitos}/json/`, sem outros dados do formulário, mesmo que o corpo da requisição traga campos extras (número, complemento, nome, documento) [CA-006, RF-009].
- [X] T037 [P] [US1] Escrever `src/application/registry/postal-code-service.test.ts`: estados `buscando`, `encontrado`, `nao_encontrado`, `indisponivel`, `limite` (com `retry_after_seconds`) e `offline` (sem chamar a função); nenhuma resposta em `localStorage`, `sessionStorage` ou IndexedDB [RF-011, RF-012, RF-045].
- [X] T038 [P] [US1] Escrever `tests/contract/manage-registry-handler.test.ts` (parte clientes e unidades): autenticação, método, operação desconhecida (`VALIDATION_FAILED` e auditoria `denied`), corpo inválido, `organization_id` divergente da sessão, mapeamento HTTP e nenhuma operação de exclusão [RF-053, CA-002].
- [X] T039 [P] [US1] Escrever `src/pages/registry/components/document-field.test.tsx`, `postal-code-field.test.tsx`, `contact-list-editor.test.tsx` e `receiving-window-field.test.tsx`: troca de máscara por tipo de pessoa; CEP com os seis estados, foco em "Número" após o preenchimento e **nenhum campo digitado é apagado**; contatos (acrescentar, remover, um principal, limite de 10); dias e faixa de horário com erros junto dos campos [RF-003, RF-008, RF-011].
- [X] T040 [P] [US1] Escrever `src/pages/registry/customers/customer-form-page.test.tsx` e `site-form-page.test.tsx`: erros junto dos campos e foco no primeiro erro, um único envio, rota de cadastro sem permissão nega sem exibir o formulário, envio direto negado, conflito de documento com mensagem que indica o cliente existente sem mostrar o documento, endereço digitado inteiro quando o CEP falha, escrita desabilitada com motivo sem conexão [RF-041, RF-045].
- [X] T041 [P] [US1] Escrever `tests/e2e/registro-clientes.spec.ts` (parte cadastro): cliente pessoa jurídica e pessoa física → unidade com CEP (provedor simulado: encontrado, inexistente, indisponível, limite atingido e offline) → salvar e abrir o detalhe; Tenant B não vê nada; CEP genérico (sem logradouro nem bairro: preenche o que veio e deixa o resto para digitação); perda de conexão no meio do envio (tela mostra "estado desconhecido" e permite repetir sem duplicar) [História 1, casos de borda].

### Implementação (GREEN)

- [X] T042 [US1] Criar `supabase/migrations/2026100700xxxx_registry_customers_write.sql` com `create_customer`, `update_customer`, `create_site` e `update_site` (`security definer`, `set search_path = ''`, `private.actor_has_permission` primeiro, `grant` só ao `service_role`), normalização e validação de documento (`private.validate_*`), unicidade com `pg_advisory_xact_lock` por (organização, valor normalizado), escrita de `document_display` (CNPJ completo ou CPF mascarado) e do documento em `customer_documents`, substituição atômica dos contatos não anonimizados (o único `delete` permitido no cadastro, feito dentro da RPC com a variável de sessão local `app.registry_contacts_replace`; os anonimizados são preservados), eventos por `private.append_registry_event` e `private.write_audit_event` na mesma transação, com `metadata` sem dado pessoal e eventos `contacts_changed` e `document_changed` conforme o vocabulário [contracts/operacoes-servidor.md].
- [X] T043 [US1] Criar `supabase/functions/lookup-postal-code/{deno.json,handler.ts,provider.ts,viacep-provider.ts,index.ts}`: porta `PostalCodeProvider`, adaptador do ViaCEP, normalização do CEP antes de qualquer chamada, `AbortController` de 4 s, limite por `public.take_rate_limit_token` nos baldes `postal_code:user` (10 por 60 s) e `postal_code:org` (100 por 60 s), autenticação e permissão `customer.write` pelo banco, resposta padronizada, log só com resultado e duração [contracts/consulta-de-cep.md].
- [X] T044 [US1] Criar `supabase/functions/manage-registry/{deno.json,handler.ts,index.ts}` com as operações `create_customer`, `update_customer`, `create_site` e `update_site` sobre `_shared/operations.ts`, regras de campo iguais às restrições do `data-model.md`, e `Cache-Control: no-store` onde couber.
- [X] T045 [US1] Carregar as funções novas (`npx supabase stop` e `npx supabase start`), rodar `npx supabase db reset`, `npx supabase test db` e os testes de função; todas as suítes desta fase passam.
- [X] T046 [US1] Implementar em `src/application/registry/registry-service.ts` os comandos de cliente e unidade e em `src/application/registry/postal-code-service.ts` a busca de CEP com os estados do contrato, sem armazenamento local.
- [X] T047 [P] [US1] Criar os componentes `document-field.tsx`, `postal-code-field.tsx`, `contact-list-editor.tsx` e `receiving-window-field.tsx` em `src/pages/registry/components/`, com a skill `ui-ux-pro-max`, só tokens, rótulos visíveis, ajuda e erros associados, anúncio do resultado da busca de CEP em `role="status"` uma vez e foco em "Número" após o preenchimento.
- [X] T048 [US1] Criar `src/pages/registry/customers/customer-form-page.tsx` (cadastro e edição, seções na mesma página, um único envio, documento mascarado na edição e alterado só se a pessoa digitar novo valor com justificativa) e `site-form-page.tsx` (endereço, coordenadas, responsável, janela de recebimento, instruções), ligadas às rotas `/clientes/novo`, `/clientes/<id>/editar`, `/clientes/<id>/unidades/nova` e `/clientes/<id>/unidades/<siteId>/editar` [RF-041].
- [X] T049 [US1] Estender `tests/e2e/support/mock-registry.ts` com `create_customer`, `update_customer`, `create_site`, `update_site` e `lookup-postal-code` (cenários encontrado, inexistente, indisponível, limite e offline) e rodar `npm run build` e `npx playwright test tests/e2e/registro-clientes.spec.ts` nos projetos desktop e mobile; conferir a captura da tela no celular.
- [X] T050 [US1] Rodar a regressão: `npm run lint`, `npm run typecheck`, `npm test`, `npx supabase test db`; conferir que `tests/contract/postal-code-egress.test.ts` passa.

**Ponto de verificação**: cadastro de cliente e unidade com CEP completo, isolado por tenant.

---

## Fase 4 — US2: Consultar clientes e unidades (P1)

**Objetivo**: encontrar e conferir clientes e unidades por busca e filtros, com documento mascarado.

**Teste independente**: com 60 clientes de exemplo de duas organizações, buscar um nome na primeira e confirmar que só os dela aparecem, com paginação e total anunciado.

### Testes primeiro (RED)

- [X] T051 [P] [US2] Escrever `supabase/tests/007_customer_queries.test.sql`: `list_customers`, `get_customer`, `list_sites` e `get_site` — busca por nome, nome fantasia, cidade e nome da unidade (trecho, sem diferenciar caixa); documento só por igualdade do valor completo; filtros de situação (padrão `active`), segmento, UF e "tem geocerca"; ordenação e paginação por cursor com `total`; CPF mascarado e CNPJ completo; itens de lista **sem** CPF, telefone ou e-mail completos; `get_customer` devolve telefone e e-mail dos contatos **só** a quem tem `customer.write`, e `tenant_auditor`, `stock_operator` e `technical_operator` recebem só nome e função (arquivo próprio `supabase/tests/007_contacts_visibility.test.sql`) [RF-003]; Tenant B não vê nada do A (`NOT_FOUND` igual ao inexistente); papéis `stock_operator`, `technical_operator` e `tenant_auditor` leem, `driver` não [RF-040, RF-052].
- [X] T052 [P] [US2] Escrever `tests/contract/query-registry-handler.test.ts` (parte clientes e unidades): autenticação, operação desconhecida, corpo inválido, `organization_id` divergente, mapeamento HTTP, `limit` de 1 a 100 com padrão 25.
- [X] T053 [P] [US2] Escrever `src/pages/registry/customers/customer-list-page.test.tsx`: busca, filtros, paginação mantendo filtros, total anunciado em região de status, estado vazio com e sem permissão de cadastro, tabela a partir de 768 px e cartões abaixo, CPF mascarado, situação com texto e ícone [RF-040, RF-044].
- [X] T054 [P] [US2] Escrever `src/pages/registry/customers/customer-detail-page.test.tsx` e `site-detail-page.test.tsx`: blocos de dados, contatos, unidades (com contagem de geocercas ativas), cliente sem unidades com ação de acrescentar a primeira (só com permissão), estados de carregamento, erro e offline [História 2].
- [X] T055 [P] [US2] Estender `tests/e2e/registro-clientes.spec.ts` (parte consulta): 60 clientes de duas organizações, busca, filtros, paginação e isolamento; lista em cartões em 360 px sem rolagem horizontal.

### Implementação (GREEN)

- [X] T056 [US2] Criar `supabase/migrations/2026100700xxxx_registry_customers_read.sql` com `list_customers`, `get_customer`, `list_sites` e `get_site` (trigrama, cursor, `total`, `has_geofence`), sem tocar nas tabelas de documentos e com `get_customer` devolvendo telefone e e-mail dos contatos só a quem tem `customer.write` [RF-003] [contracts/operacoes-servidor.md].
- [X] T057 [US2] Criar `supabase/functions/query-registry/{deno.json,handler.ts,index.ts}` com as operações de consulta de clientes e unidades.
- [X] T058 [US2] Implementar em `registry-service.ts` as consultas de cliente e unidade e criar `customer-list-page.tsx`, `customer-detail-page.tsx` e `site-detail-page.tsx` (tabela e cartões, filtros, paginação, estados, ações condicionadas à permissão), ligadas a `/clientes`, `/clientes/<id>` e `/clientes/<id>/unidades/<siteId>`; estender o simulado e rodar os E2E.
- [X] T059 [US2] Rodar a regressão da fase (lint, tipagem, `npm test`, `npx supabase test db`, E2E de clientes).

**Ponto de verificação**: consultar clientes e unidades; com US1, o ciclo cadastro → consulta funciona.

---

## Fase 5 — US3: Definir a geocerca de uma unidade (P1)

**Objetivo**: criar, editar e consultar geocercas circulares e poligonais por unidade, com a decisão "ponto dentro" única no servidor.

**Teste independente**: criar um círculo de 200 m e um polígono de 4 vértices para a mesma unidade, informar um ponto dentro e um fora de cada um e conferir; tentar um polígono que se cruza e confirmar a recusa.

### Testes primeiro (RED)

- [X] T060 [P] [US3] Escrever `supabase/tests/007_geofences.test.sql`: `create_geofence` e `update_geofence` — raio em 24, 25, 5000 e 5001 m; vértices em 2, 3, 100 e 101; polígono com cruzamento, área zero, vértice repetido em sequência e coordenada fora do intervalo → `GEOMETRY_INVALID` com o `reason` correto; círculo e polígono (sentido horário e anti-horário) aceitos; nome único por unidade (`NAME_CONFLICT`); unidade inativa → `PARENT_INACTIVE`; sobreposição com geocerca ativa da mesma unidade devolve `overlaps` e **salva**; `area` calculada só no servidor; evento `geofence_created` e `geofence_updated` (forma anterior e nova) e auditoria; edição de inativa → `INACTIVE_RECORD`; `VERSION_CONFLICT`; geocerca que cruza o antimeridiano ou fica fora do Brasil é aceita se as coordenadas forem válidas; geocercas de unidades diferentes que se sobrepõem são aceitas sem aviso [RF-013 a RF-018, RF-016a, CA-007].
- [X] T061 [P] [US3] Escrever `supabase/tests/007_geofence_query.test.sql`: `geofences_containing_point` e `point_in_geofence` — ponto dentro, fora e **na borda** (conta como dentro) para círculo e polígono; só geocercas **ativas** e da organização da sessão; Tenant B não encontra geocerca do A (`NOT_FOUND`); geocerca inativa → `INACTIVE_RECORD`; nada é gravado; o plano de execução usa o índice GiST com 50 mil geocercas [RF-016, RNF-003].
- [X] T062 [P] [US3] Escrever `src/pages/registry/components/geofence-shape-editor.test.tsx`, `geofence-preview.test.tsx` e `point-tester.test.tsx`: escolha de círculo ou polígono, atalho "usar as coordenadas da unidade", vértices adicionados e removidos **só com teclado** com rótulo e erro por vértice, pré-visualização em SVG com alternativa em texto (forma, tamanho e vértices), "Testar um ponto" com resultado "dentro" ou "fora" em texto [RF-017, História 9, cenário 3].
- [X] T063 [P] [US3] Escrever `src/pages/registry/geofences/geofence-form-page.test.tsx`, `geofence-list-page.test.tsx` e `geofence-detail-page.test.tsx`: erros da geometria junto dos campos com os limites, aviso de sobreposição com o nome da outra geocerca após salvar, lista com filtros (situação, forma, cliente), tabela e cartões, rota de cadastro sem permissão [História 3].
- [X] T064 [P] [US3] Escrever `tests/e2e/registro-geocercas.spec.ts`: unidade → círculo e polígono → "Testar um ponto" dentro e fora → polígono cruzado recusado → sobreposição avisa e salva → Tenant B não vê.

### Implementação (GREEN)

- [X] T065 [US3] Criar `supabase/migrations/2026100700xxxx_registry_geofences.sql` com `private.build_geofence_area(...)` (validação em `geometry` com `ST_IsValid` e área maior que zero antes da conversão para `geography`; círculo com `ST_Buffer` circunscrito para o pré-filtro; coordenadas sempre `(longitude, latitude)` convertidas em um só lugar), `create_geofence`, `update_geofence`, `list_geofences`, `get_geofence`, `geofences_containing_point` e `point_in_geofence` (pré-filtro `area && ponto`, depois círculo por `ST_DWithin(center, ponto, radius_m)` e polígono por `ST_Covers(area, ponto)`), `overlaps` por `ST_Intersects` entre geocercas ativas da mesma unidade, sempre qualificando as funções do PostGIS com `extensions.` [research.md, decisões 1 e 2].
- [X] T066 [US3] Acrescentar às funções `manage-registry` e `query-registry` as operações de geocerca com as regras de campo (`center`, `radius_m`, `vertices[]`), o motivo `GEOMETRY_INVALID` e o `overlaps` na resposta; estender os testes de manipulador.
- [X] T067 [US3] Implementar em `registry-service.ts` as operações de geocerca e criar `geofence-shape-editor.tsx`, `geofence-preview.tsx` (SVG simples e acessível, só tokens), `point-tester.tsx`, `geofence-form-page.tsx`, `geofence-list-page.tsx` e `geofence-detail-page.tsx`, ligadas a `/geocercas`, `/geocercas/nova?unidade=<siteId>`, `/geocercas/<id>` e `/geocercas/<id>/editar`; mostrar a lista de geocercas no detalhe da unidade; usar a skill `ui-ux-pro-max`.
- [X] T068 [US3] Estender o simulado com as operações de geocerca (a decisão "dentro" no simulado reproduz a regra dos limites e da borda) e rodar `npm run build` e os E2E de geocercas.
- [X] T069 [US3] Rodar a regressão da fase e `npx supabase test db` com as suítes `007_geofences` e `007_geofence_query`.

**Ponto de verificação**: geocercas válidas, consulta de ponto correta e isolada por tenant.

---

## Fase 6 — US4: Cadastrar e manter veículos (P1)

**Objetivo**: cadastrar veículos com placa única, acompanhar o licenciamento e a situação operacional.

**Teste independente**: cadastrar um veículo com placa antiga e outro com placa Mercosul, repetir uma placa, mudar um veículo para "em manutenção" e conferir lista, filtros, situação do documento e histórico.

### Testes primeiro (RED)

- [X] T070 [P] [US4] Escrever `supabase/tests/007_vehicles.test.sql`: `create_vehicle` cria `available` com evento e auditoria; placas `abc-1234` e `ABC1D23` aceitas e normalizadas, `AB12345` e `ABCD123` recusadas; `PLATE_CONFLICT` com ativos e inativos; `manufacture_year` de 1980 até o ano seguinte ao atual; `capacity_cylinders` de 1 a 9999; `vehicle_type = 'other'` exige detalhe de até 60; correção de placa exige justificativa e o evento traz placa antiga e nova; `change_vehicle_status` registra `from` e `to`, exige justificativa de e para `inactive`; situação do licenciamento calculada em 31, 30, 0 e −1 dia; `VERSION_CONFLICT` em `update_vehicle` e `change_vehicle_status`; veículo em manutenção é editável, veículo inativo não é (`INACTIVE_RECORD`) e de `inactive` só se vai para `available` (para `maintenance` é recusado); `list_vehicles` com filtros e `get_vehicle`; Tenant B não vê o veículo do A [RF-019 a RF-023, RF-038, CA-009].
- [X] T071 [P] [US4] Escrever `src/pages/registry/vehicles/vehicle-form-page.test.tsx`, `vehicle-list-page.test.tsx` e `vehicle-detail-page.test.tsx`: placa normalizada ao sair do campo, conflito com indicação do veículo existente, situação do licenciamento com texto e ícone, mudança de situação com diálogo e justificativa quando exigida, lista com filtros, tabela e cartões, estados [História 4].
- [X] T072 [P] [US4] Escrever `tests/e2e/registro-frota.spec.ts` (parte veículos): cadastro das duas placas, conflito, mudança de situação, filtros e isolamento.

### Implementação (GREEN)

- [X] T073 [US4] Criar `supabase/migrations/2026100700xxxx_registry_vehicles.sql` com `create_vehicle`, `update_vehicle`, `change_vehicle_status`, `list_vehicles` e `get_vehicle` (filtro de licenciamento por faixas de data com o dia de `America/Sao_Paulo`, sem coluna derivada), evento e auditoria na mesma transação, bloqueio consultivo da placa normalizada.
- [X] T074 [US4] Acrescentar as operações de veículo às funções `manage-registry` e `query-registry` e aos testes de manipulador.
- [X] T075 [US4] Implementar em `registry-service.ts` as operações de veículo e criar `vehicle-form-page.tsx`, `vehicle-list-page.tsx` e `vehicle-detail-page.tsx` em `src/pages/registry/vehicles/`, ligadas a `/veiculos`, `/veiculos/novo`, `/veiculos/<id>` e `/veiculos/<id>/editar`; estender o simulado e rodar os E2E.
- [X] T076 [US4] Rodar a regressão da fase.

**Ponto de verificação**: veículos cadastrados, filtrados e com situações corretas.

---

## Fase 7 — US5: Cadastrar e manter motoristas, com proteção de dados (P1)

**Objetivo**: cadastrar motoristas com CPF e CNH protegidos, vincular a um usuário elegível e revelar documentos só com permissão e auditoria.

**Teste independente**: cadastrar um motorista com CNH válida, vincular a um usuário do papel `driver`, tentar vincular usuário de outra organização e confirmar a recusa; conferir que CPF e CNH aparecem mascarados e que revelar gera auditoria.

### Testes primeiro (RED)

- [X] T077 [P] [US5] Escrever `supabase/tests/007_drivers.test.sql`: `create_driver` com CPF e CNH válidos grava `cpf_display` e `cnh_display` mascarados e os valores em `driver_documents`; evento e auditoria **sem CPF nem CNH**; `DOCUMENT_CONFLICT` por CPF e por CNH na organização (e aceito em outra), indicando o nome do dono e nunca o documento [RF-032]; `VERSION_CONFLICT` em `update_driver` [RF-038]; categoria e validade obrigatórias; CNH calculada em 31, 30, 0 e −1 dia; edição de CPF ou CNH só com valor novo e justificativa, evento `document_changed` sem valor; edição de `full_name` e `phone` gera evento só com `changed_sensitive`; `link_driver_user` só para usuário ativo da organização com o papel `driver`, único por motorista e por usuário, `USER_NOT_ELIGIBLE` para papel ausente, vínculo existente e usuário de outra organização **sem revelar se ele existe noutra**; `list_linkable_users` só devolve elegíveis, sem e-mail; `unlink_driver_user` exige justificativa e funciona com o motorista **inativo**, enquanto `link_driver_user` recusa motorista inativo (`INACTIVE_RECORD`); usuário desativado depois aparece como "usuário inativo" sem apagar o vínculo [RF-024 a RF-028, História 5].
- [X] T078 [P] [US5] Escrever `supabase/tests/007_document_reveal.test.sql`: `reveal_document` exige `customer.document` ou `driver.document` (só `tenant_admin`); `tenant_auditor` e `stock_operator` → `ACCESS_DENIED`; devolve o valor completo, grava `document_revealed` e auditoria `driver.document_reveal` / `customer.document_reveal` **sem o valor**; documento de outra organização → `NOT_FOUND`; revelar não sobe `version` [RF-030].
- [X] T079 [P] [US5] Escrever `tests/contract/registry-no-sensitive-output.test.ts`: cadastra e edita cliente pessoa física e motorista com nome, CPF, CNH e telefone conhecidos (fictícios) e procura esses valores em `audit_logs`, `registry_events`, respostas de erro, logs capturados dos manipuladores e em toda resposta de lista e de detalhe; só `reveal_document` pode devolver o valor [CA-005, MS-006].
- [X] T080 [P] [US5] Escrever `src/pages/registry/components/reveal-document.test.tsx`: botão "Revelar" só com a permissão; ao revelar, mostra o valor com "Ocultar" e anúncio para leitores de tela; o valor **some** ao ocultar, ao sair da tela, ao trocar de organização, ao recarregar e ao perder a sessão; nunca vai para `localStorage`, `sessionStorage`, URL nem histórico de navegação [RF-030, RF-031].
- [X] T081 [P] [US5] Escrever `src/pages/registry/drivers/driver-form-page.test.tsx`, `driver-list-page.test.tsx` e `driver-detail-page.test.tsx`: CPF e CNH mascarados em lista e detalhe, formulário de edição sem pré-preencher documento, vínculo com escolha entre usuários vinculáveis, situação da CNH com texto e ícone, conflito sem mostrar o documento, lista com filtros [História 5].
- [X] T082 [P] [US5] Estender `tests/e2e/registro-frota.spec.ts` (parte motoristas): cadastro, vínculo, vínculo recusado, revelar e ocultar, auditor sem o botão, isolamento.

### Implementação (GREEN)

- [X] T083 [US5] Criar `supabase/migrations/2026100700xxxx_registry_drivers.sql` com `create_driver`, `update_driver`, `list_drivers`, `get_driver`, `link_driver_user`, `unlink_driver_user`, `list_linkable_users` e `reveal_document` (cliente e motorista), escrita dos documentos em `driver_documents` e `customer_documents`, máscaras geradas no banco, bloqueio consultivo por CPF e CNH, eventos e auditoria sem valor, `Cache-Control: no-store` tratado no manipulador.
- [X] T084 [US5] Acrescentar as operações de motorista e de revelação às funções `manage-registry` e `query-registry` (`reveal_document` com `Cache-Control: no-store`) e aos testes de manipulador; confirmar que nenhum manipulador registra corpo de requisição.
- [X] T085 [US5] Implementar em `registry-service.ts` as operações de motorista e criar `reveal-document.tsx` (valor só em estado de componente), `driver-form-page.tsx`, `driver-list-page.tsx` e `driver-detail-page.tsx` em `src/pages/registry/drivers/`, ligadas a `/motoristas`, `/motoristas/novo`, `/motoristas/<id>` e `/motoristas/<id>/editar`; usar `reveal-document` também no detalhe de cliente pessoa física; estender o simulado e rodar os E2E.
- [X] T086 [US5] Rodar a regressão da fase e `tests/contract/registry-no-sensitive-output.test.ts` com `npm test`.

**Ponto de verificação**: motoristas com documentos protegidos; nenhuma saída traz CPF ou CNH em claro.

---

## Fase 8 — US6: Inativar e reativar, sem apagar nada (P2)

**Objetivo**: inativação com justificativa nas cinco áreas, cascata atômica no cliente e na unidade e reativação sem cascata.

**Teste independente**: inativar um cliente com duas unidades e uma geocerca, conferir a inativação em conjunto e o histórico; reativar o cliente e conferir que as unidades continuam inativas; tentar excluir por qualquer via e confirmar a recusa.

### Testes primeiro (RED)

- [X] T087 [P] [US6] Escrever `supabase/tests/007_inactivation.test.sql`: `preview_customer_inactivation` e `preview_site_inactivation` devolvem as quantidades; `inactivate_customer` inativa o cliente, as unidades ativas e as geocercas ativas na mesma operação, com um evento por registro (`data.cascade_of`) e **uma** auditoria com as contagens; **atomicidade** (falha injetada no meio desfaz tudo); `CASCADE_CHANGED` quando `expected_counts` não confere; `reactivate_customer` reativa **só** o cliente; `reactivate_site` exige cliente ativo e `reactivate_geofence` exige unidade ativa (`PARENT_INACTIVE`); `inactivate_site` inativa as geocercas dela; justificativa ausente → `JUSTIFICATION_REQUIRED`; segunda inativação → `ALREADY_INACTIVE`; veículo e motorista com justificativa; inativar motorista **mantém** o vínculo com o usuário e reativar não o altera; edição de inativo → `INACTIVE_RECORD`; nenhum `delete` aceito pelas funções (operação de exclusão → `VALIDATION_FAILED` e auditoria `denied`) [RF-033 a RF-035, CA-002, CA-010].
- [X] T088 [P] [US6] Escrever `src/pages/registry/components/cascade-confirm-dialog.test.tsx`: mostra as quantidades da prévia antes de confirmar, exige justificativa, devolve o foco ao acionador, reabre com os números novos em `CASCADE_CHANGED`, Escape e fundo fecham sem inativar.
- [X] T089 [P] [US6] Escrever testes de ação de inativar e reativar nas páginas de detalhe (`customer-detail-page.test.tsx`, `site-detail-page.test.tsx`, `geofence-detail-page.test.tsx`, `vehicle-detail-page.test.tsx`, `driver-detail-page.test.tsx`): ação só com `*.deactivate`, motivo e justificativa, situação atualizada e anunciada uma vez.
- [X] T090 [P] [US6] Escrever `tests/contract/registry-no-delete.test.ts`: nenhuma operação de exclusão nas funções, nos serviços nem nas telas [CA-002].
- [X] T091 [P] [US6] Estender os E2E com a jornada de inativação em cascata (prévia, confirmação, histórico de cada item, reativação só do cliente, reativação manual de unidade e geocerca) [História 6].

### Implementação (GREEN)

- [X] T092 [US6] Criar `supabase/migrations/2026100700xxxx_registry_inactivation.sql` com `inactivate_customer`, `reactivate_customer`, `inactivate_site`, `reactivate_site`, `inactivate_geofence`, `reactivate_geofence`, `inactivate_driver`, `reactivate_driver`, `preview_customer_inactivation` e `preview_site_inactivation` (transação única, bloqueio `for update` em ordem estável cliente → unidades → geocercas, `expected_counts`, eventos por registro, uma auditoria por ação) [research.md, decisão 7].
- [X] T093 [US6] Acrescentar as operações de inativação, reativação e prévia às funções, ao serviço e aos testes de manipulador; criar `src/pages/registry/components/cascade-confirm-dialog.tsx` (reaproveitando `reason-dialog` da Spec 006 quando couber) e ligar as ações às cinco páginas de detalhe, com a mudança de situação do veículo da US4.
- [X] T094 [US6] Estender o simulado e rodar os E2E e a regressão da fase.

**Ponto de verificação**: nada é apagado; cascata atômica e reativação manual funcionam.

---

## Fase 9 — US7: Consultar o histórico de cada cadastro (P2)

**Objetivo**: histórico imutável, ordenado e paginado das cinco áreas, sem dado sensível.

**Teste independente**: executar uma sequência conhecida de ações sobre um veículo e comparar o histórico exibido, ordem e conteúdo, com a sequência executada.

### Testes primeiro (RED)

- [X] T095 [P] [US7] Escrever `supabase/tests/007_history.test.sql`: sequência contínua por `(entity_type, entity_id)`; ordem estável com eventos no mesmo instante; filtros por tipo e período; paginação por cursor; cada área exige a permissão `*.history` própria (auditor lê, estoquista não); histórico de outra organização → `NOT_FOUND`; edições mostram `changes` só dos campos não sensíveis e, para os campos pessoais (CPF, CNH, telefone, e-mail, contatos, `full_name` do motorista e, em cliente pessoa física, `legal_name`, `trade_name`, `notes` e campos pessoais das unidades), só `changed_sensitive` [RF-036, RF-037, História 7].
- [X] T096 [P] [US7] Escrever `supabase/tests/007_audit.test.sql`: uma asserção por ação sensível (cadastro, edição, inativação, reativação, mudança de situação do veículo, vínculo e desvínculo, revelação) confirmando o par evento + auditoria na mesma transação e a falha de ambos juntos; **nenhum CPF, CNH, CNPJ de pessoa física, nome, telefone nem e-mail de pessoa física** em `audit_logs.metadata` nem em `registry_events.data` [RF-050, CA-004, CA-005].
- [X] T097 [P] [US7] Escrever `src/pages/registry/components/registry-history.test.tsx`: lista paginada com filtro por tipo e período, ordem estável, edições com campos e valores não sensíveis e "alterado" para os sensíveis, estado vazio, carregamento e erro, anúncio do total.

### Implementação (GREEN)

- [X] T098 [US7] Criar `supabase/migrations/2026100700xxxx_registry_history.sql` com a operação `history` (paginada por `sequence`, filtros, permissão por `entity_type`) e acrescentá-la a `query-registry`, ao serviço e aos testes de manipulador.
- [X] T099 [US7] Criar `src/pages/registry/components/registry-history.tsx` (reaproveitando `history-list.tsx` da Spec 006 quando o formato permitir) e ligá-lo às páginas de detalhe de cliente, unidade, geocerca, veículo e motorista, visível só com a permissão `*.history`.
- [X] T100 [US7] Estender o simulado, rodar os E2E, `npx supabase test db` e a regressão da fase.

**Ponto de verificação**: um auditor reconstrói o que mudou só pela tela.

---

## Fase 10 — US8: Anonimizar dados pessoais, sem apagar o cadastro (P2)

**Objetivo**: anonimização irreversível de motorista, cliente pessoa física e contato, com permissão crítica, MFA, justificativa e confirmação, sem apagar linha alguma e sem deixar valor pessoal em tabela, evento ou auditoria.

**Teste independente**: cadastrar um motorista com nome, CPF, CNH e telefone fictícios, inativá-lo, anonimizá-lo e confirmar que nenhum desses valores existe mais em tabela, evento, auditoria nem resposta, e que o motorista continua listado como "anonimizado"; repetir para um cliente pessoa física e para um contato de cliente pessoa jurídica.

### Testes primeiro (RED)

- [X] T101 [P] [US8] Escrever `supabase/tests/007_anonymization.test.sql`: `anonymize_driver`, `anonymize_customer` e `anonymize_contact` com o efeito do `data-model.md` (campos substituídos: `full_name = 'Motorista anonimizado'`, `legal_name = 'Cliente anonimizado'`, `name = 'Contato anonimizado'`, documentos, telefone, e-mail, `notes`, `trade_name`, `receiving_*`, `access_instructions`, coordenadas e `complement` nulos, `number = 'S/N'`, nome da unidade `'Unidade anonimizada ' || left(id::text, 8)`; campos mantidos: identificadores, `status`, `cnh_category`, `cnh_valid_until`, CEP, logradouro, bairro, cidade, UF e geocercas); motorista e cliente pessoa física **ativos** → `ACTIVE_RECORD` e contato ativo aceito; cliente `legal` só aceita `anonymize_contact`; permissão `driver.anonymize` e `customer.anonymize` só do `tenant_admin` (`stock_operator`, `technical_operator`, `tenant_auditor` e `driver` → `ACCESS_DENIED`); `VERSION_CONFLICT`; segunda chamada → `ALREADY_ANONYMIZED`; edição, reativação, vínculo e `reveal_document` sobre anonimizado → `ANONYMIZED_RECORD`; vínculo de usuário removido com `driver_user_unlinked`; **contagem de linhas igual antes e depois em todas as tabelas de cadastro** (os contatos de cliente pessoa jurídica anonimizados também permanecem, e documento e pai são anonimizados juntos); CPF, CNH e documento liberados para novo cadastro (o mesmo CPF cadastrado de novo é aceito como registro novo); busca pelo nome, documento, telefone e e-mail antigos não encontra nada; atomicidade (falha injetada no meio desfaz tudo); evento `person_anonymized` ou `contact_anonymized` e auditoria `driver.anonymize`, `customer.anonymize` e `customer.contact_anonymize` só com `reason`, justificativa e lista de campos, nunca valores; Tenant B → `NOT_FOUND` igual ao inexistente [RF-054 a RF-061, CA-016, CA-017].
- [X] T102 [P] [US8] Escrever `tests/contract/registry-anonymization-leak.live.test.ts` (suíte `.live`): cadastra e **edita** motorista, cliente pessoa física e contato com nome, CPF, CNH, telefone e e-mail conhecidos (fictícios), anonimiza e procura todos os valores antigos, inclusive os de edições anteriores, em todas as tabelas de cadastro, em `registry_events`, em `audit_logs` e em toda resposta de lista, detalhe e histórico [CA-015, MS-009].
- [X] T103 [P] [US8] Escrever os testes de manipulador de anonimização em `tests/contract/manage-registry-handler.test.ts`: sem sessão `aal2` → `MFA_REQUIRED` (403) e auditoria `denied` com motivo `mfa_required` (como em `manage-membership`); falta de `confirmed: true` → `CONFIRMATION_REQUIRED`; `reason` fora de `data_subject_request`, `retention_expired` e `other` → `VALIDATION_FAILED`; justificativa de 5 a 500 caracteres; mapeamento HTTP de `ACTIVE_RECORD`, `ALREADY_ANONYMIZED` e `ANONYMIZED_RECORD`; nenhum corpo registrado em log [RF-055, RF-056, RF-061].
- [X] T104 [P] [US8] Escrever `src/pages/registry/components/anonymize-dialog.test.tsx`: lista do que será removido e do que permanece, aviso de irreversível, motivo e justificativa obrigatórios, confirmação digitada (palavra ANONIMIZAR) com erro associado, `MFA_REQUIRED` tratado com a orientação de confirmar o segundo fator, Escape e fundo fecham sem anonimizar, foco devolvido ao acionador [RF-062].
- [X] T105 [P] [US8] Estender `driver-detail-page.test.tsx`, `customer-detail-page.test.tsx` e o componente de contatos: botão "Anonimizar dados pessoais" só com `driver.anonymize` ou `customer.anonymize`; desabilitado com o motivo "inative antes" para motorista e cliente pessoa física ativos; depois de anonimizar, aviso "Dados pessoais anonimizados em <data>", nome trocado pelo texto fixo e editar, reativar, vincular e revelar desabilitados; registro anonimizado na lista como inativo, com o nome fixo e o selo "anonimizado", **só** nas visões "inativos" e "todos" (o filtro padrão "ativos" não o mostra) e fora da busca pelos valores antigos; contato anonimizado permanece na lista de contatos do cliente com o nome fixo [RF-058, RF-062].
- [X] T106 [P] [US8] Estender `tests/e2e/registro-frota.spec.ts` e `registro-clientes.spec.ts` com a jornada: tentar anonimizar motorista ativo (recusa), inativar, anonimizar com MFA, conferir a lista do que será removido, o resultado, as ações bloqueadas, o CPF liberado para novo cadastro; repetir para cliente pessoa física e para contato de cliente pessoa jurídica; auditor sem a ação; Tenant B sem acesso [História 8].

### Implementação (GREEN)

- [X] T107 [US8] Criar `supabase/migrations/2026100700xxxx_registry_anonymization.sql` com `anonymize_driver`, `anonymize_customer` e `anonymize_contact` (`security definer`, `set search_path = ''`, `private.actor_has_permission` primeiro, `grant` só ao `service_role`) e as funções privadas `private.anonymize_driver`, `private.anonymize_customer_person` e `private.anonymize_contact`: conferem inativo (exceto contato), versão, repetição e confirmação; sobrescrevem os campos conforme o `data-model.md` (seção *Anonimização*) na mesma transação; anulam `document_key`, `cpf` e `cnh_number` e preenchem `anonymized_at` nas linhas de `customer_documents` e `driver_documents` **na mesma transação** em que marcam o pai; preenchem `anonymized_at` e `anonymized_by`; removem o vínculo de usuário; sobem a `version`; gravam o evento e a auditoria só com `reason`, justificativa e a lista de campos; e criam gatilhos `before update` em `customers`, `customer_contacts`, `customer_sites` (consultando o cliente pai), `drivers`, `customer_documents` e `driver_documents` que recusam qualquer alteração de registro anonimizado com a exceção `anonymized_record` (traduzida pela borda em `ANONYMIZED_RECORD`, T025), contornados **só** pelas funções de anonimização por variável de sessão local `app.registry_anonymizing`; **sem reescrever as RPCs das fases anteriores**, que passam a recusar edição, reativação, vínculo e revelação de registro anonimizado por causa dos gatilhos [research.md, decisão 15, RF-058].
- [X] T108 [US8] Acrescentar a `manage-registry` as operações `anonymize_driver`, `anonymize_customer` e `anonymize_contact` com as regras de campo (`reason`, `justification`, `expected_version`, `confirmed: literal-true`) e a **exigência de sessão `aal2`** (`MFA_REQUIRED` com auditoria `denied`, no padrão de `manage-membership`); incluir os códigos novos (`ANONYMIZED_RECORD`, `ALREADY_ANONYMIZED`, `ACTIVE_RECORD`, `CONFIRMATION_REQUIRED`) na tabela de HTTP de `_shared/operations.ts` [contracts/operacoes-servidor.md].
- [X] T109 [US8] Carregar as funções (`npx supabase stop` e `npx supabase start`), rodar `npx supabase db reset`, `npx supabase test db`, os testes de função e `npm run test:live` com o teste de vazamento; tudo da fase passa.
- [X] T110 [US8] Implementar em `registry-service.ts` as operações de anonimização e criar `src/pages/registry/components/anonymize-dialog.tsx` (reaproveitando `reason-dialog` quando couber; só tokens; diálogo acessível) e integrá-lo aos detalhes de motorista, cliente pessoa física e contato; mostrar o aviso e desabilitar as ações bloqueadas em registro anonimizado; usar a skill `ui-ux-pro-max`.
- [X] T111 [US8] Estender o simulado `tests/e2e/support/mock-registry.ts` com as operações de anonimização (inclusive `MFA_REQUIRED` sem segundo fator) e rodar `npm run build` e os E2E de motoristas e clientes; rodar a regressão da fase.

**Ponto de verificação**: nada identificável resta depois de anonimizar, e nenhuma linha foi apagada.

---

## Fase 11 — US9: Usar em celular, tablet e desktop, só com teclado (P2)

**Objetivo**: verificar a responsividade, a acessibilidade, o PWA e o offline em todas as telas novas.

**Teste independente**: percorrer cadastro, lista, detalhe e histórico de cada área em 360, 768 e 1920 px só com Tab, sem rolagem horizontal; rodar axe e a captura visual.

- [X] T112 [P] [US9] Estender `tests/e2e/registro-clientes.spec.ts`, `registro-geocercas.spec.ts` e `registro-frota.spec.ts` com acessibilidade (axe sem violação crítica ou grave), um só `h1` e um só `main`, foco visível, primeiro erro focado, teclado completo (incluindo vértices do polígono e a busca de CEP), sem rolagem horizontal de 320 a 1920 px e com zoom de 200%, alvos de 44 px (inclusive o diálogo de anonimização); e os casos de borda de sessão: pessoa que perde a permissão com a tela aberta (a ação seguinte é recusada pelo servidor e a tela atualiza o que mostra), organização ativa trocada com a tela aberta (a tela recarrega sem mostrar dado da anterior) e tenant suspenso (leitura e escrita negadas) [RF-043, RF-044, RF-052, CA-011].
- [X] T113 [P] [US9] Estender os E2E com offline: a estrutura das telas abre, escritas e busca de CEP ficam desabilitadas com o motivo, nada é enfileirado, e nenhum dado de cadastro ou resposta de CEP fica no cache do service worker (teste novo em `tests/contract/pwa-config.test.ts` ou arquivo irmão: nenhuma resposta de `/functions/v1` é guardada) [RF-045, RF-046, CA-012].
- [X] T114 [P] [US9] Criar `tests/e2e/visual/registro.visual.spec.ts` com capturas das listas, dos formulários (cliente, unidade, geocerca, veículo, motorista), dos detalhes e do diálogo de anonimização em 360, 768 e 1920 px; gerar no Linux com `npm run test:visual:atualizar`; não versionar `*-win32.png` [CA-013].
- [X] T115 [US9] Rodar `npx playwright test tests/e2e/registro-*.spec.ts` nos projetos desktop, tablet e mobile e corrigir o que falhar (sem aumentar `timeout` nem remover asserção); conferir o menu em 360 px com os quatro itens novos.

---

## Fase 12 — Cadastro e edição em modal (decisão de 07/10/2026, RF-064)

**Objetivo**: os formulários de cliente, unidade, geocerca, veículo e motorista abrem em modal sobre a lista ou o detalhe, sem recarregar, mantendo o endereço como link direto.

- [X] T127 [P] `src/app/registry/registry-navigation.ts` (+ teste): `navigateInApp`, `closeModal`, `useLocationKey` e `isPlainClick`; o `App` passa a reagir à navegação interna [RF-064].
- [X] T128 [P] `Dialog` com a propriedade `size` (`compacto` ou `padrao`) e teste de largura [RF-064].
- [X] T129 `src/pages/registry/components/form-modal.tsx` e `form-modal-context.ts` (+ teste): `RegistryFormModal`, `FormHeader`, `FormCard`, `FormActions` (botão de salvar fixo ao pé) e `FormCancel`; fora do modal o formulário segue como página inteira [RF-064].
- [X] T130 Os cinco formulários (`customer`, `site`, `geofence`, `vehicle`, `driver`) usam os componentes do modal e navegam pelo contexto depois de salvar [RF-064].
- [X] T131 `registry-area.tsx`: cada rota de ação renderiza a tela de trás (inerte e sem remontar) com o modal por cima; clique simples em "Cadastrar" e "Editar" abre o modal sem recarregar; os detalhes valem também com a edição aberta [RF-064].
- [X] T132 `tests/e2e/registro-modal.spec.ts` (abrir sem recarregar, Escape, Cancelar, Voltar, link direto, salvar na edição e no cadastro, validação no modal, botão à vista e 360 px) e ajuste dos seletores dos demais E2E ao diálogo [RF-064].
- [X] T133 Atualizar `spec.md` (clarificação, RF-041 e RF-064), `contracts/telas-e-rotas.md`, `quickstart.md` e o `README.md`.
- [X] T134 Regenerar as capturas visuais no Linux (`npm run test:visual:atualizar`) com os formulários em modal e rodar a regressão completa (lint, typecheck, `npm test`, pgTAP, `.live` e E2E nos três projetos).

---

## Fase 12b — Coordenadas pelo endereço, com confirmação (decisão de 07/10/2026, RF-065 a RF-069)

**Objetivo**: o servidor busca latitude e longitude pelo endereço da unidade, a pessoa confirma o endereço e o ponto antes de gravar, e o marcador da primeira entrega fica pronto para a Fase 4. Contrato em `contracts/geocodificacao-de-endereco.md`.

- [X] T135 [P] RED/GREEN: `tests/contract/nominatim-provider.test.ts` e `supabase/functions/geocode-address/{provider,nominatim-provider}.ts` (só campos de endereço na query, GET sem corpo, `user-agent` fixo, precisão por `addresstype`, falhas lançam) [RF-065, CA-018].
- [X] T136 [P] RED/GREEN: `tests/contract/geocode-address-handler.test.ts` e `supabase/functions/geocode-address/{handler,index}.ts` e `deno.json` (validação antes da chamada, permissão `customer.write`, limites 10/min por pessoa, 100/min por organização e 1/s global, prazo de 4 s, log só com código e duração) [RF-065, RF-067, RF-068].
- [X] T137 RED/GREEN: `supabase/tests/007_site_geocoding.test.sql` e `supabase/migrations/20261007121100_registry_site_geocoding.sql` (colunas `coordinates_source`, `coordinates_confirmed_at`, `coordinates_confirmed_by`, `first_delivery_confirmed`, gatilho que limpa origem sem coordenadas, `create_site` e `update_site` com `p_coordinates_source`, `site_json` com os campos novos) [RF-066, RF-068, RF-069].
- [X] T138 [P] `manage-registry`: campo `coordinates_source` (enum, opcional) em `siteFields` e teste de contrato; `_shared/operations.ts` aceita `nullable` em `enum`.
- [X] T139 [P] RED/GREEN: `src/application/registry/geocoding-service.ts` (+ teste), `RegistryFunction` com `geocode-address`, `SiteView` e `SiteFormValue` com a origem das coordenadas, `useRegistryService` com `geocoder` [RF-045, RF-065 a RF-067].
- [X] T140 RED/GREEN: `coordinates-field.tsx` e `geocode-suggestion.ts` (+ teste): busca, endereço normalizado, precisão com aviso, caixa "Confirmo que o endereço e o ponto encontrados estão corretos.", sugestão invalidada se o endereço mudar, mensagens de falha em região de status; integração em `site-form-page.tsx` (+ testes: confirmação obrigatória, edição à mão não vira geocodificada, falha não trava o cadastro) [RF-066, RF-067].
- [X] T141 [P] `site-detail-page.tsx` (+ teste): origem das coordenadas, data da confirmação e situação da primeira entrega [RF-069].
- [X] T142 [P] Backend simulado: `geocode-address` em `mock-registry.ts` e `mock-backend.ts`, origem e confirmação em `create_site`/`update_site`; E2E em `registro-clientes.spec.ts` (busca, recusa sem confirmar, confirmação, detalhe, e os três cenários de falha) e `registry-no-delete.test.ts` cobrindo a função nova [CA-018].
- [X] T143 [P] Atualizar `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` e `README.md`.
- [X] T147 [P] Mapas: `leaflet` e `@types/leaflet`; `src/components/maps/{osm-map,map-view,map-types}` (+ teste) com carga sob demanda, marcadores vetoriais e aviso offline; mapa no formulário (`coordinates-field`) e no detalhe da unidade [RF-070].
- [X] T148 RED/GREEN: `supabase/migrations/20261007121200_registry_site_points.sql` (`list_site_points`) e `supabase/tests/007_site_points.test.sql` (dois tenants, limite, total, cliente inativo); `query-registry` (`list_site_points`), `RegistryService.listSitePoints` e `toSitePoints`.
- [X] T149 Visão geral: `overview-page.tsx` com mapa em 80% e indicadores empilhados em 20% (abaixo de 1024 px, indicadores acima); `map-block.tsx` com as unidades reais (permissão `customer.read`), lista alternativa, aviso de total e região de exemplo sem a permissão; `OverviewBlock` com `example`; testes unitários e E2E (`visao-geral.spec.ts`, `registro-clientes.spec.ts`) e rota dos blocos do mapa no backend simulado.
- [X] T150 Exceção em `tests/contract/no-external-assets.test.ts` só para `tile.openstreetmap.org` e `www.openstreetmap.org`.
- [X] T144 Regenerar no Linux as capturas visuais do formulário de unidade (`npm run test:visual:atualizar`), que mudou com o campo de coordenadas; nunca versionar `*-win32.png`.
- [X] T151 Revisão final do conjunto: controles do Leaflet nas escalas dos tokens (`map-view.css`, margens, fonte, entrelinha e alvo de 44 px) e `telas-transversais.spec.ts` admitindo só `tile.openstreetmap.org`; rodada completa (lint, tipos, 2850 testes unitários, 1607 pgTAP, 108 ao vivo, E2E e capturas Linux) [RF-070, CA-013].
- [ ] T145 Reconfirmação do motorista na primeira entrega (marca `first_delivery_confirmed` e registra no histórico da unidade): requisito da **Fase 4**, fora desta spec.
- [ ] T146 Pedir à pessoa responsável e à equipe jurídica a decisão sobre enviar o endereço de pessoa física ao Nominatim (premissa 14) e sobre o uso em produção de grande volume.

### Fase 12c — Uso controlado do Nominatim no protótipo (ajuste de 08/10/2026)

**Objetivo**: manter a integração **temporária e exclusiva do protótipo**, atrás de configuração no servidor, com consulta só por clique, aviso e confirmação explícita, sem pessoa física, com cache por organização e sem endereço nos registros. Detalhes em `docs/geocodificacao-prototipo.md`. Não substitui T146.

- [X] T152 [P] RED/GREEN: `supabase/functions/geocode-address/config.ts` e `tests/contract/geocoding-config.test.ts`: `GEOCODING_ENABLED`, `GEOCODING_PROVIDER`, `GEOCODING_ALLOW_PERSONAL_ADDRESSES`, `GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION` e `GEOCODING_RATE_LIMIT_PER_SECOND` com padrões seguros e teto de 1 requisição por segundo; reconhecimento do ambiente de testes automatizados.
- [X] T153 [P] RED/GREEN: `provider.ts` (`name`, `GeocodingProviderError`, `GeocodingBlockedError`, consulta só com logradouro, número, cidade, UF e CEP), `nominatim-provider.ts` (país na consulta, erro de rede com código fixo, chamada real bloqueada em testes) e `registry.ts` (provedor escolhido por configuração) com os testes de contrato.
- [X] T154 RED/GREEN: `handler.ts` e `index.ts` (+ `geocode-address-handler.test.ts`): funcionalidade desligada, confirmação explícita (428), endereço incompleto, bloqueio de pessoa física pelo tipo lido do banco, cache antes do limite global, balde global com teto configurável e registro de operação só com identificador, provedor, duração, status e código de erro sanitizado.
- [X] T155 RED/GREEN: `supabase/migrations/20261008120000_geocode_cache.sql` e `supabase/tests/007_geocode_cache.test.sql`: cache por organização (`private.geocode_cache`, RLS ligada, retenção de 30 dias, limpeza na escrita) com teste de dois tenants.
- [X] T156 [P] RED/GREEN: `geocoding-service.ts` (+ teste): `locate` exige a confirmação, envia `customer_id` e `consent_confirmed` e não envia o bairro; novos resultados `disabled`, `personal_blocked`, `confirmation_required` e `blocked`.
- [X] T157 RED/GREEN: `coordinates-field.tsx` (+ teste) e `site-form-page.tsx`: botão "Buscar coordenadas", aviso exigido com "Concordo e buscar coordenadas" e "Cancelar", endereço incompleto sem consulta, mensagens de bloqueio, correção do ponto por clique no mapa (`osm-map.tsx` e `map-view.tsx` com `onPick`, mantendo o zoom) e ponto corrigido gravado como manual [RF-066].
- [X] T158 [P] Proteção dos testes: `src/test/setup.ts` recusa `fetch` ao host do Nominatim; backend simulado dos E2E (`mock-registry.ts`) e `registro-clientes.spec.ts` com aviso, confirmação, correção no mapa e os cenários de funcionalidade desligada e pessoa física.
- [X] T159 [P] Documentação: `docs/geocodificacao-prototipo.md` (variáveis, cache, retenção, logs, troca de provedor), `.env.example`, `supabase/config.toml`, `README.md`, `contracts/geocodificacao-de-endereco.md`, `contracts/verificacoes-automaticas.md`, `research.md`, `validation.md` e RIA-024, todos marcando a integração como temporária e exclusiva do protótipo.
- [X] T161 RED/GREEN: o servidor valida o cliente no banco antes de qualquer consulta externa (`findCustomer` em `handler.ts` e `index.ts`): pertence à organização informada (senão `NOT_FOUND`), é pessoa jurídica (senão `PERSONAL_ADDRESS_NOT_ALLOWED`, salvo `GEOCODING_ALLOW_PERSONAL_ADDRESSES=true`) e está ativo e não anonimizado (senão `CUSTOMER_NOT_OPERABLE`); nada vem do corpo da requisição.
- [X] T162 RED/GREEN: variáveis `GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION` e `GEOCODING_CACHE_TTL_DAYS` (1 a 90 dias, padrão 30; `write_geocode_cache(..., p_ttl_days)` e teste pgTAP do prazo), provedor instanciado só com `GEOCODING_ENABLED=true`; nenhuma dessas decisões é lida pelo frontend.
- [X] T163 Textos exigidos na tela: aviso de transmissão ("O endereço será enviado ao serviço externo OpenStreetMap/Nominatim para obtenção das coordenadas. Use esta função apenas com endereços fictícios ou de unidades comerciais.") com confirmação explícita antes da chamada, separado da confirmação posterior do resultado ("Confirmo que o endereço e o ponto encontrados estão corretos.").
- [X] T164 Cobertura: testes de comportamento para `registry-views.ts`, `registry-service.ts` (todas as operações e detalhes das falhas), `registry-area.tsx`, `map-block.tsx` e as ramificações de `src/domain/**` (geometria, validações, histórico), sem alterar thresholds, sem excluir arquivos da cobertura e sem desabilitar testes. O limite de 5 s de duas varreduras de arquivos (`escalas-no-codigo`) passou a 30 s, como já havia em `no-external-assets`.
- [X] T165 Documentação: `docs/geocodificacao-prototipo.md`, `.env.example`, `supabase/config.toml`, contrato de geocodificação, `tasks.md`, `validation.md` e RIA-024 registram que o Nominatim é temporário e exclusivo do protótipo, só para dados fictícios ou endereços comerciais, que a pessoa física permanece bloqueada, que a produção exigirá nova avaliação jurídica, contratual e de capacidade, que o provedor é substituível e que a cobertura anterior foi reprovada.
- [ ] T160 Repetir a validação humana (entrevista) sobre o fluxo novo da busca de coordenadas (aviso, confirmação, bloqueio de pessoa física e correção no mapa): a validação registrada no RIA-024 é anterior a este ajuste e não o cobre.

---

## Fase 13 — Acabamento e encerramento

**Objetivo**: desempenho, contratos, bundle, documentação, validação humana e o gate de registro de IA.

- [X] T116 [P] Criar `tests/contract/registry-volume.live.test.ts` (suíte `.live`, sem navegador): gerar o volume de referência com `tests/support/sql/registry-volume-semear.sql`, medir no servidor a busca de cada lista (p95 ≤ 1 s), a primeira página de cada lista e a consulta "geocercas que contêm um ponto" com 50 mil geocercas (p95 ≤ 200 ms); limpar com `registry-volume-limpar.sql`; confirmar pelo plano de execução o uso do índice GiST [RNF-001, RNF-003].
- [X] T117 [P] Criar `tests/e2e/desempenho-lista-registro.spec.ts` (Playwright, `--project=desktop-chromium`, com limitação de rede equivalente a 4G e a mesma massa) medindo a primeira página de cada lista (p95 ≤ 2 s) e registrar o resultado em `validation.md` [RNF-002].
- [X] T118 [P] Criar `tests/contract/registry-concurrency.live.test.ts`: duas sessões cadastrando o mesmo documento, a mesma placa e o mesmo CPF (uma vence, a outra recebe o conflito, sem duplicar); duas edições simultâneas (`VERSION_CONFLICT`); duas inativações simultâneas do mesmo cliente (`ALREADY_INACTIVE`) e criação de unidade concorrente com a cascata sem deixar unidade ativa sob cliente inativo [RNF-007, RF-038, CA-010].
- [X] T119 [P] Criar `tests/contract/registry-permissions.test.ts` e `tests/contract/registry-limits.test.ts`: códigos de permissão iguais na migration, no catálogo de telas, nas rotas e nos manipuladores; mapeamento dos papéis padrão; limite de 30 dias e limites de geocerca iguais no TypeScript e no SQL [RF-049, RF-022].
- [X] T120 Rodar `npm run build`, comparar com `baseline.md` e registrar em `validation.md` o pacote de entrada (limite 593,95 kB) e a lista de chunks novos; se passar do limite, mover código para `React.lazy` antes de qualquer outra ação [RF-047, RNF-005, CA-014]. Conferir também que o `dependencies` do `package.json` não ganhou pacote em relação à linha de base (ignorar `devDependencies` e alterações alheias a esta spec) [RNF-006], e que a Visão geral e a sua fonte de exemplo (`src/infrastructure/overview/`) não mudaram e nenhuma tela desta spec importa delas, com dados só reais da organização ativa [RF-042].
- [X] T121 [P] Atualizar `docs/prd.md` (Fase 3: RF007 e RF008), `README.md`, `docs/arquitetura-conectividade-supabase.md` somente se a consulta de CEP exigir menção (sem tocar nas alterações alheias do arquivo, usando `git add -p`), o catálogo da Spec 003 (se houver componente novo) e o `plan.md` com os nomes finais das migrations; registrar também em `validation.md` os **limites da anonimização** (cópias de segurança e logs da plataforma não são reescritos, e endereço e geocercas de cliente pessoa física permanecem) [constituição VIII, RF-063].
- [ ] T122 **(aberta em 08/10/2026 até `npm run test:coverage` passar, o roteiro completo do quickstart ser executado e MS-001 a MS-008 terem resultados e tempos reais registrados)** Rodar o roteiro completo de `quickstart.md` (itens 1 a 12) e registrar resultados e desvios em `validation.md`; rodar `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npx supabase db reset` + `npx supabase test db`, `npm run test:live`, `npm run build` e `npm run test:e2e` e anotar os números. Na mesma rodada, **medir com a pessoa responsável as métricas de sucesso** e registrar tempo e resultado de cada uma em `validation.md`: MS-001 (cliente com unidade pelo CEP em até 3 minutos), MS-002 (endereço em até 3 segundos e 100% das falhas simuladas concluídas digitando), MS-003 (círculo, polígono e dois pontos em até 4 minutos), MS-004 (veículo e motorista em até 2 minutos cada), MS-005 e MS-006 (0 vazamento entre organizações e 0 documento em saída), MS-007 (auditor reconstrói o histórico em até 2 minutos) e MS-008 (0 violações críticas ou graves de acessibilidade e 0 rolagem horizontal).
- [X] T123 Conferir que nenhum segredo, token ou chave `service_role` entrou no cliente ou no repositório (`tests/contract/client-secrets.test.ts`), que nenhum documento real foi usado em teste e que `git status` não contém `*-win32.png` a versionar [RF-051].
- [ ] T124 **(reaberta em 08/10/2026: o RIA-024 registra validação de Natã Baracho, esta tarefa determina entrevista com Alisson Almeida e o `validation.md` declarava a validação pendente; aguardando a confirmação do responsável pelo projeto de quem é o validador oficial, se a validação registrada pode ser usada e se esta tarefa deve ser corrigida ou ter nova entrevista)** **Gate de registro de IA** (AGENTS.md): `git add` explícito do código, dos testes, das migrations e das funções (sem os arquivos alheios à spec), sem commit; `npm run ia:registro -- --spec 007 --ciclo 01 --titulo "Clientes, unidades, geocercas, veículos e motoristas"`; **entrevistar Alisson Almeida** (quem validou; amostra de perfis, telas e larguras, incluindo a revelação de documentos e a busca de CEP; ambiente; duração; resultado; itens a corrigir; decisão `utilizado`, `adaptado` ou `descartado` com justificativa; e a confirmação de que as respostas podem ser gravadas em nome da pessoa; incluir também a **confirmação das decisões assumidas** da spec: retenção e eliminação de dados pessoais fora do escopo (premissa 14), telefone e e-mail dos contatos só para `customer.write` e as regras de edição do veículo) e a **anonimização** (amostra: motorista, cliente pessoa física e contato; o que permanece e o que não é alcançado, conforme a premissa 14 e o RF-063: cópias de segurança, logs, endereço e geocercas), **sem presumir nem inferir dos testes**; se houver itens a corrigir, corrigir, repetir os testes e perguntar de novo; preencher o RIA com as respostas, trocar o link de revisão pelo do pull request, incluir `docs/governanca-ia/indice.md`, rodar `npm run ia:validar` e só então commitar, sem `--no-verify`.
- [ ] T125 **(aberta até todos os checks da PR ficarem verdes e a revisão ser aprovada)** Abrir o pull request da branch `feat/007-clientes-geocercas-frota` citando a issue da Spec 007, aguardar todos os checks verdes e a revisão humana; **não** fazer merge sem aprovação.
- [ ] T126 Depois do merge do PR aprovado e com a `main` verde, entregar o DOCX do RIA em branch `docs/ria-NNN-docx` com `python scripts/governanca-ia/exportar-docx.py --source docs/governanca-ia/registros/RIA-NNN-<slug>.md --output docs/governanca-ia/registros/NN_<Titulo>.docx`, abrir o DOCX no Word e conferir a renderização (rodapé do próprio RIA, caixas de seleção, tabelas e layout do modelo), apontar o índice para o DOCX e abrir PR só de documentação.

---

## Dependências e ordem de execução

- **Fase 1** não tem dependência. **Fase 2** depende da Fase 1 e **bloqueia todas as histórias**.
- **US1 (Fase 3)** depende só da Fundação e entrega o MVP de cadastro. **US2** depende de US1 para ter dados de ponta a ponta, mas as RPCs de consulta (RED e migration) podem andar em paralelo com US1.
- **US3 (geocercas)** depende de US1 (unidade) e da Fundação. **US4 (veículos)** e **US5 (motoristas)** dependem só da Fundação e são independentes entre si e de US1 a US3; US5 usa o componente `reveal-document` também no cliente pessoa física (integração em US5).
- **US6 (inativação)** depende de US1, US3, US4 e US5 (precisa das entidades) e de US2 para a tela de detalhe; **US7 (histórico)** depende das entidades que lê e dos eventos que as histórias já gravam.
- **US8 (anonimização)** depende de US1 e US2 (cliente e contatos), US5 (motorista e vínculo), US6 (inativação, pré-condição) e US7 (eventos sem valores); **US9** e as Fases 12 e 13 dependem das histórias que verificam.
- Em cada história: testes (RED) → migration → função → serviço/página (GREEN) → regressão. Funções novas exigem `npx supabase stop` e `npx supabase start`, e o `db reset` antes do `supabase test db`.

## Oportunidades de paralelismo

- Fundação: os sete testes de banco (RED) em paralelo; as sete tarefas de domínio (`validity-status`, `document-validation`, `masks`, `plate`, `phone-and-postal-code`, `geofence-geometry`, `registry-vocabulary`) em paralelo, porque são arquivos distintos.
- Após a Fundação, **US1, US4 e US5 podem andar juntas** (áreas diferentes: cliente, veículo, motorista); US3 começa quando a unidade de US1 existir.
- Dentro de cada história, os testes `[P]` rodam em paralelo (SQL, função, serviço e React em arquivos diferentes).

```text
# Exemplo: Fundação, testes de banco juntos
Task: "supabase/tests/007_rls.test.sql"
Task: "supabase/tests/007_documents_rls.test.sql"
Task: "supabase/tests/007_immutability.test.sql"
Task: "supabase/tests/007_constraints.test.sql"
Task: "supabase/tests/007_permissions.test.sql"
Task: "supabase/tests/007_validators.test.sql"
```

## Estratégia de implementação

1. **MVP**: Fases 1 e 2, depois US1 e US2 (cadastro e consulta de clientes e unidades, com CEP). Parar e validar: cadastrar, consultar, isolado por tenant, CEP com falhas simuladas.
2. **Incremental**: US3 (geocercas) → US4 (veículos) → US5 (motoristas, que traz a proteção de dados) → US6 (inativação) → US7 (histórico), cada uma validada sozinha.
3. **Fechamento**: US8 (anonimização), US9, desempenho com o volume de referência, concorrência, capturas, bundle, documentação, entrevista de validação humana e RIA.

## Notas

- Nenhuma tarefa inclui `delete` de dado; toda correção é um novo registro ou uma edição com evento.
- **Nenhum documento real em testes**: CPF, CNH e CNPJ são fictícios e gerados pela suíte.
- O CI usa provedor de CEP falso; só a pessoa responsável testa o ViaCEP real, em sua máquina.
- Funções novas do Supabase local exigem `npx supabase stop` e `npx supabase start` para carregar.
- O Playwright reaproveita a porta 4173: rodar `npm run build` antes dos E2E.
- Arquivos alheios à spec (`package.json`, `package-lock.json`, `vite.config.ts` e o doc de conectividade) não entram nos commits desta spec.
- Dados de teste: e-mails `@example.invalid`; nenhum dado real.
