---
description: "Tarefas executáveis da Spec 004 — Navegação por permissão"
---

# Tarefas: Navegação por permissão

**Entrada**: artefatos em `specs/004-navegacao-por-permissao/`

**Pré-requisitos**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/` e `quickstart.md`

**Método obrigatório**: TDD. Em cada incremento, escrever o teste, confirmar a falha esperada (RED), implementar (GREEN), refatorar e rodar a regressão antes de avançar.

**Escopo protegido**: esta Spec não cria, remove nem altera permissão, papel ou regra de acesso das telas (RN-002). Os testes das Specs 001 a 003 só podem mudar em seletores e textos de apoio, como o link "Meu perfil" do cabeçalho (CA-007). Nenhuma dependência nova entra no `package.json` (RNF-003).

## Formato

`- [ ] TNNN [P?] [USN?] Ação, requisitos e caminho exato`

- `[P]`: pode rodar em paralelo, porque não modifica os mesmos arquivos nem depende de tarefa incompleta.
- `[USN]`: história de usuário da spec (US1 a US6).
- Referências entre colchetes ligam a tarefa aos requisitos.

## Mapa das histórias

| História | Prioridade | Entrega |
|---|---|---|
| US1 Ver só as telas que posso usar | P1 | consulta no servidor, catálogo, provedor e menu com os itens por permissão |
| US2 Navegar no celular e no desktop, só com teclado | P1 | layout responsivo, botão do menu, foco e teclado |
| US3 O servidor continua decidindo | P1 | provas de que o menu nunca é a barreira (URL, permissão retirada, menu adulterado) |
| US4 Trocar de organização e ver o menu certo | P2 | limpeza antes do novo render, geração de consulta, itens globais |
| US5 Carregamento, erro e offline | P2 | estados do menu e cache offline |
| US6 Mudança de permissão refletida | P3 | atualização a cada 60 s e a cada navegação |

---

## Fase 1 — Preparação

**Objetivo**: registrar a rastreabilidade e a linha de base antes de qualquer mudança.

- [X] T001 Abrir a issue da Spec 004 em `aalissonalmeidaq/fluxid_integra2026` (título, link da spec e escopo) e registrar o número em `specs/004-navegacao-por-permissao/plan.md`, na seção Rastreabilidade, antes de qualquer commit da implementação [constituição VI].
- [X] T002 Rodar `npm run lint`, `npm run typecheck`, `npm test` e `npm run test:e2e` na branch atual e registrar em `specs/004-navegacao-por-permissao/baseline.md` que as suítes das Specs 001 a 003 estão verdes antes da mudança, com data, ambiente e comando [CA-007].
- [X] T003 [P] Rodar `npx playwright test tests/e2e/medicao-shell.spec.ts` e registrar em `specs/004-navegacao-por-permissao/baseline.md` a mediana do carregamento do shell (referência da Spec 003: 132 ms; limite desta spec: 158 ms) [RNF-001, MS-006].

---

## Fase 2 — Fundação (bloqueia todas as histórias)

**Objetivo**: catálogo de telas, consulta no servidor e serviço do cliente. Sem isso nenhum item de menu pode ser decidido.

### Testes primeiro (RED)

- [X] T004 [P] Escrever `supabase/tests/004_actor_permissions.test.sql` (pgTAP, dois tenants, mesmo estilo de `supabase/tests/002_audit_access.test.sql`) cobrindo: administrador do Tenant A (conjunto exato em A e `[]` em B); operador técnico sem `tenant.manage` nem `audit.read`; pessoa administradora em A e operadora em B com conjuntos distintos; Master com `global` igual a todas as permissões ativas (RF-039 da Spec 002) e `tenant` `[]` em um tenant em que não tem vínculo; Administrador FluxID com `global` igual a `platform.manage`, `audit.read` e `profile.read`, sem `tenant.manage`; caso em que `p_organization` é a organização proprietária (`tenant` e `global` coincidem e `audit.read`, de escopo `tenant`, continua em `global`); vínculo bloqueado, tenant suspenso, papel inativado e permissão inativa devolvendo `[]`; sessão expirada, revogada ou de outra pessoa devolvendo `access_denied`; JSON sem chaves além de `kind`, `tenant` e `global`; `anon` e `authenticated` sem permissão de execução e `service_role` executando. Confirmar a falha (função inexistente) [RF-001 a RF-004, CA-002, CA-009, MS-005].
- [X] T005 [P] Escrever `tests/contract/navigation-permissions.test.ts` com o `createQueryPermissionsHandler` e um gateway falso, no estilo de `tests/contract/audit-query.test.ts`: sem `Authorization` e token inválido → 401 `AUTH_REQUIRED`; `organization_id` que não é UUID → 400 `VALIDATION_FAILED`; método diferente de POST → 405; sucesso → 200 `PERMISSIONS_LISTED` com somente `code`, `tenant` e `global`; falha do gateway → 500 `INTERNAL_ERROR` sem detalhe; o gateway de auditoria nunca é chamado no sucesso; campos extras do pedido são ignorados. Confirmar a falha [RF-002, RF-003, RF-023, contrato da consulta].
- [X] T006 [P] Escrever `src/domain/navigation/visible-screens.test.ts` para a regra pura `visibleScreens(permissions)`: administrador de tenant (Início, Meu perfil, Pessoas do tenant, Papéis e permissões, Auditoria do tenant), operador (só Início e Meu perfil), Master e Administrador FluxID (Início, Meu perfil, Organizações e Auditoria da plataforma, e nenhum item do tenant se a lista `tenant` está vazia, mesmo com `tenant.manage` na lista `global`), pessoa com dois tenants, conjunto vazio, códigos desconhecidos ignorados, ordem e nomes iguais aos de [data-model.md](./data-model.md). Escrever também `src/domain/navigation/screens.test.ts` conferindo a ordem, a unicidade e as exigências do catálogo, e `src/app/admin-routes.test.ts` conferindo que cada caminho do catálogo existe em `ADMIN_ROUTES` ou nas rotas fixas (`/`, `/perfil`) e que `tenantScoped` e `requireAal2` coincidem com a tabela anterior de `src/app/App.tsx` (a conferência fica em `app/` para o domínio não importar a aplicação) [RF-005, RF-006, RF-008, RN-003, CA-001].
- [X] T007 [P] Escrever `src/application/identity/permissions-service.test.ts`: resposta válida vira `{ kind: 'success', value: { tenant, global } }`; campo ausente, tipo errado ou status inesperado viram `{ kind: 'unavailable' }`; exceção do transporte vira `unavailable`; 401 vira `unavailable` (a sessão é tratada pelo `AuthProvider`); códigos que não são texto são descartados; nenhum item restrito pode resultar de resposta inválida [RF-007, contrato da consulta].

### Implementação (GREEN)

- [X] T008 Criar a migração `supabase/migrations/<AAAAMMDDHHMMSS>_actor_permissions_query.sql` (usar `npx supabase migration new actor_permissions_query`) com `public.get_actor_permissions(p_actor uuid, p_session uuid, p_organization uuid) returns jsonb`: `security definer`, `set search_path = ''`, `stable`; sessão vigente pelo mesmo critério de `public.tenant_actor_authorized` (ativa, não expirada, atividade em até 30 minutos), senão `{"kind":"access_denied"}`; `tenant` = códigos distintos e ordenados das permissões ativas, de papéis ativos, do vínculo ativo da pessoa em `p_organization` ativa (ou `[]` se `p_organization` é nulo ou sem vínculo ativo); `global` = idem na organização `kind='owner'` ativa; retorno `{"kind":"listed","tenant":[...],"global":[...]}` e nada mais; `revoke all ... from public, anon, authenticated` e `grant execute ... to service_role`. Sem auditoria. Rodar `npx supabase db reset` e `npx supabase test db` até T004 ficar verde [RF-001 a RF-004, RF-023].
- [X] T009 Criar `supabase/functions/query-permissions/{handler.ts,index.ts,deno.json}` no molde de `supabase/functions/query-audit/`: `createQueryPermissionsHandler(gateway)` com `PermissionsGateway { authenticate(token); query({ actorId, sessionId, organizationId? }) }`, validação de `organization_id` opcional com `UUID_PATTERN` de `../_shared/http.ts`, `OPTIONS`/`POST`, respostas do contrato; `index.ts` chama `admin.rpc('get_actor_permissions', ...)` com `service_role` só no servidor e traduz `access_denied` em `AUTH_REQUIRED`. Nenhum log de token, chave ou corpo. Ver em `supabase/config.toml` se as demais funções autenticadas declaram `verify_jwt` e seguir o mesmo padrão. T005 passa a verde [RF-001 a RF-003, RF-022, RF-023].
- [X] T010 [P] Criar `src/domain/navigation/screens.ts` com o catálogo tipado `SCREENS` (id, `label`, `path`, `requires?: { scope: 'tenant' | 'global'; code: string }`, `tenantScoped`, `requireAal2`) na ordem e com os nomes de [data-model.md](./data-model.md): Início `/`, Meu perfil `/perfil`, Pessoas do tenant `/admin/membros` (`tenant.manage`), Papéis e permissões `/admin/papeis` (`tenant.manage`), Auditoria do tenant `/admin/auditoria` (`audit.read`), Organizações `/admin/tenants` (`platform.manage` global), Auditoria da plataforma `/admin/auditoria-global` (`audit.read` global). Sem importar React, Supabase nem nada de `app/` [RF-005, RN-003].
- [X] T011 Criar `src/domain/navigation/visible-screens.ts` com `visibleScreens(permissions: { tenant: readonly string[]; global: readonly string[] } | null)`: `null` devolve só os itens sem `requires`; item restrito só entra se o código consta na lista do escopo. T006 passa a verde [RF-006, RF-007].
- [X] T012 Criar `src/application/identity/permissions-service.ts` com `PermissionsService` (transporte `call(body)`, mesmo estilo de `AuditService`) e o tipo `PermissionsOutcome`; validar a resposta com guardas de tipo, sem `any`. T007 passa a verde [RF-001, RF-007].
- [X] T013 Em `src/app/App.tsx`, fazer `ADMIN_ROUTES` derivar `tenantScoped` e `requireAal2` do catálogo `SCREENS` (mantendo `Page` por caminho), sem alterar a tabela de rotas, os `requireAal2`, o `TenantGate` nem o `ProtectedRoute`. Rodar `src/app/App.test.tsx` e a suíte de rotas existente para provar que nada mudou [RF-008, RN-002, CA-007].

**Ponto de verificação**: `npx supabase test db`, `npm run lint`, `npm run typecheck` e `npm test` verdes.

---

## Fase 3 — US1: Ver só as telas que posso usar (P1)

**Meta**: o shell mostra o menu com os itens permitidos para administrador, operador e Master.

**Teste independente**: entrar com cada perfil e comparar os itens com [data-model.md](./data-model.md).

### Testes primeiro (RED)

- [X] T014 [P] [US1] Escrever `src/app/navigation/permissions-provider.test.tsx`: sem sessão e com a sessão em `mfa_required` não consulta; autenticada consulta com o `activeOrganizationId` do `TenantProvider` (ou sem `organization_id` quando não há tenant); `ready` expõe as permissões; enquanto `loading` e em `error` expõe `null` (só itens sem exigência); respostas fora do contrato não geram itens. Usar serviço falso injetado, no estilo de `src/app/tenant/tenant-provider.test.tsx` [RF-004, RF-006, RF-007].
- [X] T015 [P] [US1] Escrever `src/app/shell/navigation-menu.test.tsx`: `nav` com nome acessível "Navegação principal", `ul`/`li`/`a` com `href` do catálogo, item atual com `aria-current="page"` e o texto "(página atual)", três perfis (administrador, operador, Master) com os itens exatos, nenhum item restrito em `loading` e `error`, sem sessão o menu não é renderizado [RF-005, RF-006, RF-009, RA-002, RA-003, CA-001, AC 1 a 4 da US1].

### Implementação (GREEN)

- [X] T016 [US1] Criar `src/app/navigation/permissions-context.ts` (contexto, tipo discriminado de estado `loading | ready | error | offline` e `usePermissions()`, no estilo de `src/app/tenant/tenant-context.ts`) e `src/app/navigation/permissions-provider.tsx` com a consulta ao autenticar, usando `createFunctionTransport` e `useConnectivity` como em `useAuditService` de `src/pages/admin/tenant-audit-log-page.tsx`, e o `activeOrganizationId` de `useTenant()`. Estado inicial `loading`; `error` quando o serviço devolve `unavailable`. T014 passa a verde [RF-001, RF-004, RF-007, RF-022].
- [X] T017 [US1] Criar `src/app/shell/navigation-menu.tsx`: lê `usePermissions()` e `visibleScreens`, renderiza o `nav` com os itens, ícone existente do catálogo da Spec 003 (escolher entre os 30 de `src/design-system/icons/`, sem criar ícone novo), marca do item atual (barra e peso, nunca só cor) e `aria-current`; usar só classes dos tokens da Spec 003. T015 passa a verde [RF-005, RF-006, RF-009, RF-010].
- [X] T018 [US1] Estender `tests/e2e/support/mock-backend.ts` com `POST /functions/v1/query-permissions` configurável por perfil e por estado de autenticação (administrador do Tenant A em `aal1` e em `aal2`, operador, Master em `aal2`, Master com a sessão limitada à verificação `mfa_required`, pessoa com dois tenants, sem vínculo), com atraso e falha injetáveis, respondendo o contrato de [contracts/consulta-de-permissoes.md](./contracts/consulta-de-permissoes.md), e gravando as chamadas em `backend.calls`. Atualizar os testes E2E existentes para que o backend simulado responda a nova consulta por padrão (como administrador) [CA-001, CA-007].
- [X] T019 [US1] Compor o provedor e o menu: envolver o conteúdo com `PermissionsProvider` em `src/main.tsx` (dentro do `TenantProvider`, depois do `AuthProvider`) e renderizar `NavigationMenu` em `src/app/shell/app-shell.tsx` apenas para sessão autenticada. Atualizar `src/app/providers.test.tsx` e `src/app/shell/app-shell.test.tsx` [RF-005].
- [X] T020 [US1] Remover o link "Meu perfil" de `src/app/shell/header.tsx` (agora está no menu) e ajustar só os seletores dos testes que o usam em `src/app/shell/app-shell.test.tsx`, `tests/e2e/app-shell.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/profile.spec.ts`, `tests/e2e/pwa.spec.ts`, `tests/e2e/responsive.spec.ts` e `tests/e2e/support/telas.ts`, sem alterar nenhuma verificação de comportamento [CA-007].
- [X] T021 [US1] Escrever `tests/e2e/navegacao-menu.spec.ts` (parte US1): para cada perfil do mock, o menu em 1920 px mostra exatamente os itens esperados; sem sessão não há menu; o arquivo roda nos cinco projetos de `npm run test:e2e` [CA-001, MS-001].
- [X] T022 [US1] Escrever `tests/integration/navigation-permissions.live.test.ts` (parte US1) contra o Supabase local, com usuários semeados por suíte (ver `tests/support/auth-harness.ts` e `tests/integration/audit-access.live.test.ts`): chamar `query-permissions` com a sessão de cada perfil e conferir o conjunto exato; conferir que a leitura não cria evento em `audit_logs` [RF-023, CA-001].

**Ponto de verificação**: US1 funciona e é testável sozinha: `npm test`, `npm run test:e2e`, `npm run test:live`.

---

## Fase 4 — US2: Navegar no celular e no desktop, só com teclado (P1)

**Meta**: menu recolhido abaixo de 768 px e fixo a partir de 768 px, operável só pelo teclado.

**Teste independente**: percorrer o menu com Tab, Enter e Escape em 360, 768 e 1920 px, sem rolagem horizontal.

### Testes primeiro (RED)

- [X] T023 [P] [US2] Escrever `src/app/shell/menu-toggle.test.tsx` e ampliar `src/app/shell/navigation-menu.test.tsx`: botão "Menu" com `aria-expanded` e `aria-controls`; abrir leva o foco ao primeiro item; Escape fecha e devolve o foco ao botão; painel fechado com `hidden` (fora da ordem de Tab); o link "Pular para o conteúdo principal" continua o primeiro Tab; cada controle com alvo mínimo de 44 px e classe de foco dos tokens; um só landmark `main`; tocar ou clicar fora do painel aberto o fecha e devolve o foco ao botão (e um clique no próprio botão ou dentro do painel não o fecha por esse caminho); o painel inicia fechado a cada montagem do shell (a navegação é por carga de página) [RF-012, RF-013, RF-014, RA-005, RA-006, AC 1 a 4 da US2].
- [X] T024 [P] [US2] Escrever a parte US2 de `tests/e2e/navegacao-menu.spec.ts`: em 360 px o menu inicia fechado, abre pelo botão, percorre com Tab e fecha com Escape com o foco no botão; em 768 e 1920 px o menu é visível e o botão não existe; sem rolagem horizontal de 320 a 1920 px e com zoom de 200% (`scrollWidth <= clientWidth`); texto longo quebra dentro do item; retrato e paisagem; foco visível de 3:1 ou mais; axe sem violação crítica ou grave em 360, 768 e 1920 px (usar os projetos `mobile-360-chromium`, `tablet-768` e `desktop-1920`); com `prefers-reduced-motion: reduce` o menu não tem animação (`transition-duration` e `animation-duration` efetivos de 0) e nada pisca [RA-007]; em 360 px, ao ativar um item o menu da tela de destino começa fechado e o foco está no título (`h2`) da tela de destino, e em 768 e 1920 px o foco também está no título [RF-011, RF-013, CA-004, CA-005, MS-003, MS-004, AC 2 da US2].

### Implementação (GREEN)

- [X] T025 [US2] Criar `src/app/shell/menu-toggle.tsx` (botão "Menu" com `aria-expanded`, `aria-controls`, nome acessível e alvo de 44 px, componente `Button` da Spec 003) e ampliar `src/app/shell/navigation-menu.tsx` e `src/app/shell/app-shell.tsx`: abaixo de `tablet` (768 px, prefixo `tablet:` e `pontosDeQuebra.tablet` de `src/design-system/tokens.ts`) painel sob o cabeçalho com rolagem vertical própria e altura máxima da janela; a partir de 768 px coluna fixa à esquerda do `main`. Foco ao primeiro item ao abrir, Escape fecha e devolve o foco ao botão, painel fechado com `hidden`. O botão entra depois do link de pular na ordem de Tab. Sem animação com movimento reduzido. T023 passa a verde [RF-011 a RF-014, RA-005 a RA-007].
- [X] T026 [US2] Garantir no `AppShell` e no CSS do menu: `min-w-0` e quebra de texto nos itens, nenhuma rolagem horizontal de 320 a 1920 px e com zoom de 200%, e que o conteúdo não fica coberto quando o painel está fechado. T024 passa a verde [RF-011, RF-014, CA-005].
- [X] T027 [P] [US2] Rodar `npx vitest run src/design-system/escalas.test.ts tests/contract/escalas-no-codigo.test.ts` e `tests/e2e/escalas-no-navegador.spec.ts` e corrigir qualquer cor, tamanho ou espaçamento do menu fora dos tokens da Spec 003 [RF-010, RNF-006 da Spec 003].

**Ponto de verificação**: US1 e US2 verdes; o menu opera só pelo teclado nas três larguras.

---

## Fase 5 — US3: O servidor continua decidindo (P1)

**Meta**: provar que esconder um link não protege nada e que nenhuma alteração no cliente concede acesso.

**Teste independente**: abrir cada tela restrita pela URL sem permissão, retirar uma permissão e repetir.

### Testes de caracterização (devem passar sem mudar nenhuma regra de acesso; um teste que falhar revela um defeito, não trabalho de implementação)

- [X] T028 [P] [US3] Escrever a parte US3 de `tests/e2e/navegacao-menu.spec.ts`: operador técnico abre `/admin/papeis`, `/admin/membros`, `/admin/auditoria`, `/admin/tenants` e `/admin/auditoria-global` pela URL e vê "Acesso negado" sem nenhum dado do tenant nas respostas; administrador que perde `tenant.manage` depois de o menu carregar aciona Pessoas e a tela informa o acesso negado; com o menu alterado no DOM (item restrito inserido por script) o clique continua resultando em "Acesso negado"; Master com a sessão limitada ao fluxo de verificação (`mfa_required`) não vê o menu e só o vê depois do segundo fator confirmado; administrador de tenant em `aal1`, sem `mfa_required`, vê Pessoas do tenant e, ao abri-la, é conduzido ao fluxo de verificação em duas etapas, sem dado algum antes disso [RF-021, RN-004, CA-003, AC 1 a 3 da US3, MS-002].
- [X] T029 [US3] Completar `tests/integration/navigation-permissions.live.test.ts` com a paridade (RF-008): para cada perfil semeado, abrir cada função de servidor que protege uma tela (`list_tenant_members`, `list_tenant_access`, `query_audit_events` em escopo tenant e global, `list_managed_organizations`) e comparar permitido × negado com `visibleScreens` aplicado à consulta; incluir a retirada de uma permissão no meio do teste (o servidor recusa imediatamente, mesmo com o menu antigo) e confirmar que as negativas continuam gerando os eventos de auditoria definidos pela Spec 002. Divergência falha o teste [RF-008, RF-021, RF-023, CA-001, CA-003, MS-002].
- [X] T030 [P] [US3] Escrever `tests/contract/navigation-permissions.test.ts` (acréscimo) provando que o cliente só usa a chave publicável e a sessão da pessoa na consulta: o código de `src/app/navigation/` e `src/application/identity/permissions-service.ts` não referencia `service_role` nem chave secreta e nenhum log inclui token; rodar `tests/contract/client-secrets.test.ts` [RF-022].

**Ponto de verificação**: nenhuma tela depende do menu para ser protegida; paridade menu × servidor verde.

---

## Fase 6 — US4: Trocar de organização e ver o menu certo (P2)

**Meta**: o menu reflete o tenant ativo, sem sobras do anterior.

**Teste independente**: pessoa administradora do Tenant A e operadora do Tenant B alternando entre os dois.

### Testes primeiro (RED)

- [X] T031 [P] [US4] Ampliar `src/app/navigation/permissions-provider.test.tsx`: ao mudar o `activeOrganizationId` o estado vira `loading` **antes** de qualquer render do novo contexto e as permissões anteriores são descartadas; uma resposta atrasada do tenant anterior (geração antiga) é descartada; trocar a pessoa também descarta; perfil global mantém `global` e atualiza `tenant` pelo novo tenant; perfil global sem tenant ativo consulta sem `organization_id` [RF-015, RF-017, AC 1 a 3 da US4].
- [X] T032 [P] [US4] Escrever a parte US4 de `tests/e2e/navegacao-menu.spec.ts`: pessoa com dois tenants troca de A para B e o menu perde Pessoas do tenant, Papéis e permissões e Auditoria do tenant antes de a tela de B aparecer; durante a troca mostra só Início e Meu perfil com indicador de carregamento; Master troca de tenant e mantém Organizações e Auditoria da plataforma; pessoa sem nenhum vínculo ativo vê só Início e Meu perfil, a consulta é feita sem `organization_id` e a escolha de organização segue o fluxo da Spec 002; sessão expirada com o menu aberto faz o menu sumir e conduz a pessoa à entrada com o aviso da Spec 002, sem permissão nem cache restantes em `sessionStorage` [RF-015, RF-017, MS-005, casos de borda da spec].
- [X] T033 [P] [US4] Completar `tests/integration/navigation-permissions.live.test.ts` com dois tenants: a mesma sessão consulta com `organization_id` do Tenant A e do Tenant B e recebe conjuntos distintos; consulta com o identificador de um tenant sem vínculo ativo devolve `tenant: []` e nenhum código nem identificador do outro tenant em lugar algum da resposta [RF-002, RF-004, CA-002, MS-005].

### Implementação (GREEN)

- [X] T034 [US4] Em `src/app/navigation/permissions-provider.tsx`: chavear o estado por (pessoa, tenant ativo), reiniciar para `loading` na mudança da chave durante o render (padrão de descarte já usado em `src/app/tenant/tenant-provider.tsx`), numerar cada consulta com uma geração e descartar respostas de gerações antigas, e limpar tudo ao sair, ao expirar a sessão e ao trocar de pessoa. T031 passa a verde [RF-015, RF-017].

**Ponto de verificação**: nenhum teste com dois tenants encontra vazamento de menu.

---

## Fase 7 — US5: Carregamento, erro e offline (P2)

**Meta**: o menu informa seus estados sem esconder a navegação básica e sem mostrar item restrito sem confirmação.

**Teste independente**: forçar atraso, falha e perda de rede e observar o menu e o anúncio.

### Testes primeiro (RED)

- [X] T035 [P] [US5] Escrever `src/app/navigation/permissions-cache.test.ts`: grava `{ codes, savedAt }` em `sessionStorage` na chave `fluxid.menu.<hash curto de pessoa+tenant>` sem identificador em claro; lê só da mesma pessoa e do mesmo tenant; nunca devolve dado de outra chave; remove tudo no logout, na expiração e na troca de pessoa; tolera `sessionStorage` indisponível ou com conteúdo corrompido (devolve nada, sem lançar) [RF-017, RF-020].
- [X] T036 [P] [US5] Ampliar `src/app/navigation/permissions-provider.test.tsx` e `src/app/shell/navigation-menu.test.tsx`: `loading` mostra Início, Meu perfil e o indicador anunciado uma vez em `role="status"`, sem mover o foco e sem bloquear o teclado; `error` mostra Início, Meu perfil, o aviso "Parte das telas não pôde ser listada." e o botão "Tentar de novo", que refaz a consulta; consulta que nunca responde cai para `error` em 5 segundos (limite de espera registrado no plano, constante nomeada e injetável; relógio falso) sem bloquear a navegação, e uma resposta tardia da geração atual substitui o erro; offline com cache da mesma sessão e tenant mostra as últimas telas com "Sem conexão. As telas podem estar desatualizadas."; offline sem cache mostra só Início e Meu perfil; o cache nunca é usado enquanto online para exibir item antes da confirmação [RF-007, RF-018 a RF-020, CA-006, AC 1 a 3 da US5].
- [X] T037 [P] [US5] Escrever a parte US5 de `tests/e2e/navegacao-menu.spec.ts`: atraso na consulta, falha (500) com "Tentar de novo" e perda de rede (`context.setOffline(true)`) com e sem cache; verificar que nenhum item restrito aparece, que o foco não se move e o axe sem violação crítica ou grave em cada estado; com o aplicativo instalado (service worker ativo, como em `tests/e2e/pwa.spec.ts`) recarregar a página offline e confirmar que o menu abre com Início e Meu perfil e, havendo cache da mesma sessão e tenant, as últimas telas [RNF-002]; tenant suspenso ou vínculo bloqueado depois de o menu carregar: a consulta seguinte devolve `tenant` vazio e o menu se corrige sem mostrar item restrito [RNF-002, CA-004, CA-006, casos de borda da spec].

### Implementação (GREEN)

- [X] T038 [US5] Criar `src/app/navigation/permissions-cache.ts` (leitura, escrita e limpeza do cache conforme T035) e integrá-lo a `src/app/navigation/permissions-provider.tsx`: gravar após cada sucesso, ler **somente** quando offline (`useOnlineStatus` de `src/app/use-online-status.ts`) ou quando a consulta falha por rede, e limpar no logout, na expiração e na troca de pessoa. T035 passa a verde [RF-017, RF-020].
- [X] T039 [US5] Em `src/app/shell/navigation-menu.tsx`: renderizar `Loading`, `Alert`/`ErrorState` com "Tentar de novo" e o aviso offline com `SyncStatus` ou texto equivalente, usando o vocabulário e os componentes de `src/design-system/components/`; uma única região `role="status"` anuncia uma vez; limite de espera da consulta de 5 segundos no provedor (constante `QUERY_TIMEOUT_MS`, injetável, conforme o plano). T036 passa a verde [RF-018, RF-019, RA-004].

**Ponto de verificação**: carregamento, falha e offline exercitados em teste sem item restrito e sem mover o foco.

---

## Fase 8 — US6: Mudança de permissão refletida no menu (P3)

**Meta**: o menu se atualiza em até 60 segundos ou na próxima navegação, sem novo login.

**Teste independente**: atribuir e remover um papel de uma pessoa logada e observar o menu dela.

### Testes primeiro (RED)

- [X] T040 [P] [US6] Ampliar `src/app/navigation/permissions-provider.test.tsx` com relógio falso: nova consulta a cada 60 s com `document.visibilityState === 'visible'` e online; sem consulta com a aba oculta; pausa offline e retoma ao voltar a rede; ao receber `audit.read` o item Auditoria do tenant aparece e ao perdê-lo some no mesmo prazo; o temporizador é limpo ao desmontar e ao sair [RF-016, RF-017, AC 1 e 2 da US6].
- [X] T041 [P] [US6] Escrever a parte US6 de `tests/e2e/navegacao-menu.spec.ts`: o mock muda as permissões e, ao avançar 60 s (relógio do Playwright) ou recarregar a página, o item Auditoria do tenant aparece ou some; o servidor simulado já recusa a tela no momento da retirada [RF-016, CA-006].
- [X] T042 [P] [US6] Completar `tests/integration/navigation-permissions.live.test.ts` atribuindo e removendo um papel de uma pessoa logada e conferindo que a consulta seguinte reflete a mudança e que o servidor recusa a tela imediatamente [RF-016, RF-021].

### Implementação (GREEN)

- [X] T043 [US6] Em `src/app/navigation/permissions-provider.tsx`: atualizar a cada 60 s enquanto a aba está visível e online (`visibilitychange` e `use-online-status`), pausar offline e refazer ao voltar a rede, e consultar em cada carga de página (a navegação é por âncora e recarrega o shell). Constante nomeada para os 60 segundos, com `refreshMs` injetável para teste, como em `src/app/tenant/tenant-provider.tsx`. T040 passa a verde [RF-016].

**Ponto de verificação**: todas as histórias funcionam de forma independente.

---

## Fase 9 — Convergência, qualidade e entrega

**Objetivo**: regressão visual, desempenho, documentação viva e governança.

- [X] T044 [P] Registrar o menu no catálogo da Spec 003: atualizar `src/design-system/docs/shell.ts` e `catalogo/paginas/` com a descrição, os estados e o exemplo do menu, e rodar `src/design-system/docs/catalogo-completo.test.ts` e `tests/e2e/catalogo.spec.ts` [constituição VIII].
- [X] T045 Gerar as capturas de referência do menu em 360, 768 e 1920 px (estados pronto, carregando, erro e offline) em `tests/e2e/visual/menu.spec.ts` e atualizar as capturas existentes afetadas pela nova coluna do shell e pela remoção do link do cabeçalho, no Linux do CI ou no contêiner oficial do Playwright (`npm run test:visual:atualizar`); a aprovação humana acontece na revisão do PR [CA-008].
- [X] T046 [P] Medir o shell com o menu com `npx playwright test tests/e2e/medicao-shell.spec.ts` e o p95 da consulta com o backend simulado; registrar em `specs/004-navegacao-por-permissao/validation.md` com data, ambiente e comando, e confirmar o limite de 158 ms (mediana do shell) e de 1 s (p95 da consulta) [RNF-001, MS-006].
- [X] T047 [P] Rodar `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage`, `npx supabase test db`, `npm run test:live`, `npm run test:e2e`, `npm run test:visual` e `npm run build`, confirmar que nenhuma dependência nova entrou em `package.json` e que as suítes das Specs 001 a 003 mudaram só em seletores (revisar `git diff` dos testes antigos) [RNF-003, CA-007, constituição VII].
- [X] T048 [P] Atualizar `docs/prd.md` e `README.md` com o menu por permissão e a nova função e Edge Function (`query-permissions`), sem alterar regra de acesso [constituição VIII].
- [X] T049 Preparar a validação humana com o roteiro 6 de [quickstart.md](./quickstart.md) e registrar em `specs/004-navegacao-por-permissao/validation.md` o que Alisson Almeida validou (amostra, ambiente, duração e resultado) sem inventar informação; se não houver validação ou resultado de testes, interromper e solicitar [MS-007, `AGENTS.md`].
- [X] T050 Cumprir o gate de registro de IA do `AGENTS.md`: `git add` de código, testes e especificações sem criar o commit; `npm run ia:registro -- --spec 004 --ciclo 01 --titulo "Navegação por permissão"`; preencher o RIA em linguagem natural, com link da branch e a pendência obrigatória de trocá-lo pelo link do PR antes do merge; `git add docs/governanca-ia`; `npm run ia:validar`; um único commit com código, testes, `docs/governanca-ia/indice.md` e o novo RIA, sem `--no-verify` [constituição VI, `AGENTS.md`].

---

## Dependências e ordem de execução

```text
Fase 1 ─▶ Fase 2 ─▶ US1 ─▶ US2 ─▶ US3
                      │
                      ├──────────▶ US4 ─▶ US5 ─▶ US6
                      ▼
                 (US3 e US4 dependem só de US1; US5 e US6 dependem do provedor de US1 e US4)
US1..US6 ─▶ Fase 9
```

- **Fase 2 bloqueia tudo**: a função de banco, a Edge Function, o catálogo e o serviço são pré-requisito de qualquer item de menu.
- **US1** entrega o MVP: consulta, provedor e menu com os itens por permissão.
- **US2** depende de US1 (o menu existe) e altera `navigation-menu.tsx` e `app-shell.tsx`; **US3** depende de US1 e de Fase 2 e não altera código de produção (só testes).
- **US4, US5 e US6** editam `permissions-provider.tsx` em sequência; fazer na ordem US4 → US5 → US6 para evitar conflito.
- T013 (`App.tsx`) depende de T010. T018 (mock) deve vir antes de qualquer E2E novo e antes de T019 (composição do provedor e do menu no shell), para os E2E existentes não rodarem contra uma consulta sem resposta. T020 (cabeçalho) depende de T019.

## Oportunidades de paralelismo

- Fase 2: T004, T005, T006 e T007 (arquivos distintos); depois T010, T011 e T012 em paralelo com T008 e T009, desde que T004 a T007 estejam vermelhos.
- US1: T014 e T015 em paralelo; T021 e T022 em paralelo depois de T018.
- US2: T023 e T024 em paralelo; T027 em paralelo com T026.
- US3: T028 e T030 em paralelo.
- US4: T031, T032 e T033 em paralelo.
- US5: T035, T036 e T037 em paralelo.
- US6: T040, T041 e T042 em paralelo.
- Fase 9: T044, T046, T047 e T048 em paralelo.
- **Cuidado**: `tests/e2e/navegacao-menu.spec.ts` e `tests/integration/navigation-permissions.live.test.ts` recebem tarefas de várias histórias; por serem o mesmo arquivo, essas tarefas não rodam em paralelo entre si.

## Estratégia de implementação

1. **MVP (US1)**: Fases 1 e 2 e US1 entregam a consulta no servidor e o menu com os itens por permissão em desktop. É o menor incremento que torna o aplicativo navegável.
2. **Incremento 2 (US2 e US3)**: responsividade, teclado e as provas de que o servidor continua decidindo.
3. **Incremento 3 (US4 e US5)**: isolamento entre tenants e estados de rede.
4. **Incremento 4 (US6 e Fase 9)**: atualização periódica, regressão visual, desempenho, documentação e o gate de IA.
5. Em cada incremento: RED, GREEN, REFACTOR e a regressão das Specs 001 a 003 antes de avançar.

## Notas de implementação (desvios do plano)

- **T001**: a issue já existia (#9); o número foi registrado em `plan.md`, sem abrir outra.
- **T006 e T013**: a tabela de rotas saiu de `src/app/App.tsx` para `src/app/admin-routes.ts` (evita o aviso de fast refresh do React) e a conferência catálogo × rotas ficou em `src/app/admin-routes.test.ts`, para o domínio não importar `app/`. `screens.test.ts` cobre o catálogo sozinho.
- **T008**: além da função pública, a migração cria `private.actor_permission_codes` (reaproveitada para `tenant` e `global`).
- **T019**: o `PermissionsProvider` é composto em `src/main.tsx` (onde `AuthProvider` e `TenantProvider` já são montados), não em `providers.tsx`, que só trata a conectividade.
- **T021, T024, T028, T032, T037, T041**: `navegacao-menu.spec.ts` entra também nos projetos `tablet-768` e `desktop-1920` (`playwright.config.ts`); os casos de Tab e de offline ignoram o WebKit pelo mesmo motivo das especificações transversais.
- **RF-013 (T025)**: as telas de destino **não** moviam o foco ao título, ao contrário do que o plano supunha. Foi acrescentado `menu-navigation-focus.ts`: ao ativar um item, o menu deixa um aviso curto em `sessionStorage` e a tela seguinte leva o foco ao primeiro `h2`. Carregar a página por outro caminho não move o foco.
- **T025**: o painel fechado usa `hidden` abaixo de 768 px; a partir de 768 px o atributo é removido por `matchMedia` (`use-min-width.ts`), porque o `display: none` do `hidden` não pode ser sobrescrito por classe do Tailwind. Toque ou clique fora fecha no evento `click` (não em `pointerdown`), para o foco devolvido ao botão não ser desfeito pelo próprio navegador.
- **T022, T029, T033, T042**: a suíte ao vivo usa tenants e usuários próprios no `seed.sql` (Tenants C e D e `nav-admin`, `nav-operator`, `nav-fluxid`), para não alterar contagens nem disputar sessões das outras suítes. Todas as sessões sobem a AAL2 para a paridade comparar permissão e não o pedido de segundo fator.
- **Backend simulado**: os perfis do `mock-backend.ts` seguem o que o servidor realmente devolve (o papel de administrador não inclui `profile.read`).
- **T020/T047**: além de `app-shell.spec.ts`, só um seletor mudou nos testes antigos: `audit-log.spec.ts` usa `getByLabel('Ação', { exact: true })`, porque o nome "Navegação principal" do menu também contém "ação". `test:visual` só é verde no Linux (as referências foram geradas e comparadas no contêiner do Playwright, 93 aprovados); no Windows ele falha por desenho.
