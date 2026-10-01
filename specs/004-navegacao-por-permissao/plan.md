# Plano de implementação: Navegação por permissão

**Feature**: `004-navegacao-por-permissao` | **Data**: 01/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/004-navegacao-por-permissao/spec.md`

## Resumo

Adicionar ao shell um menu de navegação que mostra só as telas que a pessoa pode usar. Para isso o servidor ganha **uma** consulta somente leitura das próprias permissões (função de banco `get_actor_permissions` atrás da Edge Function `query-permissions`), no mesmo padrão de `query-audit`: sessão vigente, vínculo, organização, papel e permissão ativos, avaliados a cada chamada. No cliente, um catálogo de telas em `domain/` (fonte única dos nomes, caminhos e exigências) decide os itens a partir das permissões; um provedor mantém o estado (carregando, pronto, erro, offline) e atualiza a cada navegação e a cada 60 s; o componente do menu usa os componentes e tokens da Spec 003. Nenhuma regra de acesso, papel ou permissão muda: o servidor continua sendo a única barreira (RN-001, RN-002).

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; CSS com Tailwind CSS 4.3.3; SQL (PostgreSQL do Supabase) e Deno nas Edge Functions

**Dependências principais**: as já existentes. **Nenhuma dependência nova** (RNF-003): sem biblioteca de roteamento, de menu ou de ícones. O aplicativo navega por âncoras comuns (`window.location.pathname`), e essa arquitetura é mantida

**Armazenamento**: nenhuma tabela, coluna ou política RLS nova. Uma **função de banco nova** (`public.get_actor_permissions`, só `service_role`, `security definer`) em uma migração. No cliente, `sessionStorage` com os códigos de permissão (RF-020), nunca `localStorage` nem IndexedDB

**Testes**: Vitest 5.0.2 + React Testing Library (domínio, serviço, provedor, menu); pgTAP em `supabase/tests/` (função com dois tenants); `*.live.test.ts` contra o Supabase local (Edge Function ponta a ponta e paridade menu × servidor); Playwright com axe e backend simulado (`tests/e2e/support/mock-backend.ts`) para responsividade, teclado, estados e capturas

**Plataforma alvo**: navegadores modernos, PWA responsiva de 360 px a desktop amplo, retrato e paisagem

**Tipo de projeto**: aplicação web cliente única + funções Supabase (migração e Edge Function)

**Metas de desempenho**: consulta em até 1 s no p95 com o backend simulado; shell autenticado com menu no máximo 20% pior que o mesmo shell antes do menu medido na mesma máquina (referência da Spec 003: 132 ms de mediana na tela de entrada, limite de 158 ms) (RNF-001, MS-006), medido por `tests/e2e/medicao-shell.spec.ts`

**Restrições**: WCAG 2.2 AA; só chave publicável e sessão no cliente; sem escrita nem auditoria na leitura (RF-023); menu fixo a partir de 768 px (`pontosDeQuebra.tablet`); funciona offline com o aplicativo instalado; sem tema escuro

**Escala/escopo**: 7 itens de menu (5 restritos), 4 códigos de permissão existentes (`tenant.manage`, `audit.read`, `platform.manage` e `profile.read`, esta última sem uso no menu), 3 larguras de referência (360, 768 e 1920 px), 1 função de banco, 1 Edge Function

## Verificação da constituição

*GATE inicial: aprovado. Reavaliado após o desenho da Fase 1: aprovado.*

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| I Especificação antes do código | Spec esclarecida (5 decisões) antes deste plano | Aprovado |
| II TDD obrigatório | Função de banco, Edge Function, catálogo, serviço, provedor e menu nascem com testes RED antes do código | Aprovado |
| III Multitenancy e segurança | A consulta devolve só as permissões da própria pessoa; tenant validado no banco; nenhuma credencial no cliente; a função só é executável pelo `service_role`; teste pgTAP com dois tenants (CA-002, CA-009) | Aprovado |
| IV Estados explícitos | Estados do menu (`loading`, `ready`, `error`, `offline`) modelados em tipo discriminado, com o vocabulário da Spec 003 | Aprovado |
| V Experiência e acessibilidade | Design system, Tailwind, WCAG 2.2 AA, 360 px a desktop amplo, PWA offline | Aprovado |
| VI Rastreabilidade | Branch `feat/004-navegacao-por-permissao`, spec 004, issue **a abrir** antes do PR (número registrado aqui e no PR) e RIA de encerramento | Aprovado, com a issue pendente |
| VII Qualidade verificável | Lint, tipagem, testes, cobertura, RLS/pgTAP, live, E2E, axe, build PWA e revisão humana (Alisson Almeida) | Aprovado |
| VIII Documentação viva | Contratos desta spec; `docs/prd.md` e o catálogo da Spec 003 recebem o menu na convergência | Aprovado |

Nenhuma violação a justificar.

## Decisões de arquitetura

- **Catálogo de telas como fonte única** (`src/domain/navigation/screens.ts`): cada tela declara id, nome, caminho, escopo (`tenant` ou `global`), permissão exigida, `requireAal2` e `tenantScoped`. O menu e a tabela `ADMIN_ROUTES` de `src/app/App.tsx` leem o mesmo catálogo, de modo que nome, ordem e exigência não divergem na interface (RF-005, RF-008). A regra pura `visibleScreens(permissions)` é testada sem React. A exigência no servidor continua nas funções existentes; a **paridade** entre as duas é provada por teste ao vivo (CA-001), não por duplicação de regra.
- **Consulta única, formato mínimo**: `get_actor_permissions(p_actor, p_session, p_organization)` devolve `{ kind: 'listed', tenant: string[], global: string[] }` — apenas códigos. `tenant` vale para a organização informada, só se a pessoa tem vínculo ativo, organização ativa, papel e permissão ativos; caso contrário é `[]`. `global` reúne as permissões da pessoa na organização proprietária (`platform.manage`, `audit.read`). O formato não contém papéis, pessoas, nomes nem identificadores de outros tenants (RF-002). Reaproveita `private.actor_has_permission` e o critério de sessão de `public.tenant_actor_authorized`.
- **Recusa de tenant alheio sem oráculo**: uma organização sem vínculo ativo da pessoa recebe `tenant: []`, indistinguível de uma organização inexistente. Isso satisfaz CA-002 ("o identificador de outro tenant é recusado") sem confirmar a existência do tenant e sem exigir tratamento de erro no menu; o teste afirma que nenhum código do outro tenant aparece.
- **Edge Function `query-permissions`** (`supabase/functions/query-permissions/`): mesmo molde de `query-audit` (`handler.ts` testável com gateway injetado, `index.ts` com `service_role` só no servidor). Exige `Authorization: Bearer`, valida UUID opcional de `organization_id`, devolve `PERMISSIONS_LISTED`; sem sessão, `AUTH_REQUIRED` (401). **Não grava auditoria** (RF-023): a leitura é da própria pessoa e sem efeito. `verify_jwt` segue o padrão das demais funções autenticadas.
- **Tenant ativo vindo do contexto, validado no banco** (RF-004): o cliente envia o `activeOrganizationId` do `TenantProvider`; o banco só o honra se a pessoa tem vínculo ativo. Sem tenant ativo, o cliente omite o campo e recebe só `global`.
- **Serviço de aplicação** (`src/application/identity/permissions-service.ts`): traduz o contrato da fronteira em `{ kind: 'success', value } | { kind: 'access_denied' | 'unavailable' }` e valida o formato da resposta (qualquer resposta fora do contrato vira `unavailable`, nunca um item). Mesmo estilo de `AuditService` e `RbacService`.
- **Provedor de permissões** (`src/app/navigation/permissions-provider.tsx` + `permissions-context.ts`): estado discriminado `loading | ready | error | offline-stale`, chaveado por (pessoa, organização ativa). Dispara a consulta ao autenticar, ao mudar o tenant ativo, a cada carregamento de página (a navegação é por âncora, então cada tela recarrega o shell) e a cada 60 s com `document.visibilityState === 'visible'`; pausa offline e retoma ao voltar a rede, pelo `use-online-status` existente (RF-016). Ao trocar de tenant ou de pessoa, o estado vira `loading` **antes** de qualquer render do novo contexto, descartando as permissões anteriores (RF-015, RF-017). Corridas: cada consulta carrega um número de geração, e respostas de gerações antigas são descartadas.
- **Cache offline só da mesma sessão e do mesmo tenant** (RF-020): `sessionStorage` com chave `fluxid.menu.<hash curto de pessoa+tenant>` e valor `{ codes, savedAt }`. Lido **somente** quando offline ou quando a consulta falha por rede; nunca para exibir itens antes da confirmação online (RF-007). Removido no logout, na expiração e na troca de pessoa (RF-017). Os códigos de permissão não são segredo nem dado pessoal. O hash evita escrever o identificador da pessoa em claro.
- **Menu**: `src/app/shell/navigation-menu.tsx` (lista) e `menu-toggle.tsx` (botão). `<nav aria-label="Navegação principal">` com `<ul>`; item atual com `aria-current="page"` e texto "(página atual)" visível só a leitores de tela (RA-003) mais marca visual não dependente de cor (barra lateral e peso). Cada item é `<a>` com alvo mínimo de 44 px, ícone existente do catálogo da Spec 003 (nenhum ícone novo) e texto.
- **Layout do shell**: o `AppShell` passa a ter, a partir de 768 px, duas colunas (menu fixo + `main`); abaixo, o menu vira um painel sob o cabeçalho, aberto por um botão com `aria-expanded` e `aria-controls`. O painel fechado fica `hidden`, fora da ordem de Tab. Abrir leva o foco ao primeiro item; Escape e o toque ou clique fora do painel fecham e devolvem o foco ao botão; ativar um item navega (carregamento de página) e o menu inicia fechado. As telas de destino não moviam o foco ao título por conta própria; por isso, ao ativar um item, o menu deixa um aviso curto na aba (`sessionStorage`, válido por 10 s) e o shell, na carga seguinte, leva o foco ao primeiro `h2` da área principal, uma única vez (`menu-navigation-focus.ts`, RF-013, RA-006). Carregar a página por outro caminho não move o foco. O link "Pular para o conteúdo principal" continua o primeiro item de Tab, antes do botão do menu. Texto longo quebra dentro do item; a lista rola dentro do painel (altura máxima da janela), sem rolagem horizontal.
- **Cabeçalho**: o link "Meu perfil" sai do cabeçalho, pois o menu o contém. O seletor dos testes muda; o comportamento, não (CA-007). Instalar PWA, organização ativa e Sair permanecem.
- **Estados** (RF-018, RF-019): `Loading` discreto dentro do menu; `Alert` com "Tentar de novo" para falha; `SyncStatus`/texto "Telas possivelmente desatualizadas" para o cache offline. A região `role="status"` anuncia uma vez e nenhum estado move o foco. Início e Meu perfil aparecem em todos eles quando há sessão.
- **Sem sessão ou com a sessão limitada à verificação**: o menu não é renderizado. O estado `mfa_required` do `AuthProvider` é distinto de `authenticated`, e o menu só existe para `authenticated`; nenhuma consulta de permissões é feita em `mfa_required`.
- **Escopo de Início**: é a rota `/` (hoje a página "Fundação Técnica Ativa"), sempre visível com sessão (RN-003).
- **Impacto na PWA**: o menu não cria rota nem recurso novo; a consulta nunca vai ao cache do service worker: `/functions/v1` já está no `navigateFallbackDenylist` de `vite.config.ts` e `src/app/pwa-config.test.ts` reprova qualquer `runtimeCaching` de dados do Supabase. Nenhuma mudança de configuração da PWA é necessária.

## Estrutura do projeto

### Documentação (esta funcionalidade)

```text
specs/004-navegacao-por-permissao/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── consulta-de-permissoes.md
│   ├── menu-e-navegacao.md
│   └── verificacoes-automaticas.md
├── checklists/
├── baseline.md          # linha de base antes da mudança (T002, T003)
├── validation.md        # medições e validação humana (T046, T049)
└── tasks.md             # gerado por /speckit-tasks
```

### Código-fonte (raiz do repositório)

```text
supabase/
├── migrations/<data>_actor_permissions_query.sql     # public.get_actor_permissions
├── functions/query-permissions/{handler.ts,index.ts,deno.json}
├── tests/004_actor_permissions.test.sql              # pgTAP, dois tenants
└── config.toml                                       # bloco da nova função, se o padrão exigir

src/
├── domain/navigation/
│   ├── screens.ts            # catálogo de telas, permissões e exigências
│   ├── visible-screens.ts    # regra pura: permissões → itens
│   └── *.test.ts
├── application/identity/
│   └── permissions-service.ts (+ teste)
├── app/
│   ├── navigation/{permissions-context.ts,permissions-provider.tsx,permissions-cache.ts} (+ testes)
│   ├── shell/{navigation-menu.tsx,menu-toggle.tsx,app-shell.tsx,header.tsx} (+ testes)
│   └── App.tsx               # ADMIN_ROUTES passa a ler o catálogo
└── design-system/docs/shell.ts   # documenta o menu no catálogo

tests/
├── integration/navigation-permissions.live.test.ts   # paridade menu × servidor, dois tenants
├── contract/navigation-permissions.test.ts           # contrato da Edge Function, formato mínimo
└── e2e/{navegacao-menu.spec.ts, visual/menu.spec.ts} # + estender mock-backend com query-permissions
```

**Decisão de estrutura**: manter o projeto único e os padrões existentes (camadas `domain/`, `application/`, `app/`; funções Supabase com `handler.ts` testável). Nenhum pacote novo.

## Estratégia de testes (TDD)

1. **Banco (RED primeiro)**: pgTAP com dois tenants e perfis (administrador do A, operador do B e do A, Master, pessoa sem vínculo, vínculo bloqueado, tenant suspenso, papel inativado, sessão expirada): confirma o conjunto exato de códigos, `[]` para tenant alheio, ausência de papéis/pessoas no JSON e que `anon` e `authenticated` não executam a função (CA-002, CA-009, MS-005).
2. **Edge Function**: teste do `handler` com gateway falso (sem token, token inválido, UUID inválido, sucesso, falha interna) e teste de contrato de que a resposta só contém os campos do contrato e que nenhum evento de auditoria é gravado no sucesso (RF-023). Teste ao vivo contra o Supabase local.
3. **Domínio**: `visibleScreens` por perfil de teste (administrador, operador, Master, dois tenants, sem permissões, conjunto vazio); ordem e nomes iguais aos títulos das telas (RF-005, CA-001).
4. **Serviço e provedor**: respostas fora do contrato viram `unavailable`; troca de tenant limpa antes de exibir; corrida de respostas; polling de 60 s só com a aba visível e online (relógio falso); cache lido só offline e descartado no logout, na expiração e na troca de pessoa; nada de item restrito em `loading` e `error` (RF-007, CA-006).
5. **Menu**: papéis ARIA (`navigation`, `aria-current`, `aria-expanded`, `aria-controls`), teclado (Tab, Enter, Escape, clique fora, foco ao abrir e ao fechar), um só landmark `main`, link de pular como primeiro Tab, alvo de 44 px (RF-009 a RF-014).
6. **E2E com backend simulado**: três larguras (360, 768, 1920 px) + 320 px e zoom de 200% sem rolagem horizontal; axe em cada estado; carregamento lento, falha e offline sem item restrito e sem mover o foco; acesso por URL a `/admin/papeis` sem permissão mostrando "Acesso negado" e nenhum dado; menu adulterado no cliente não concede acesso (CA-003, CA-004, CA-005, CA-006).
7. **Paridade ao vivo (CA-001/RF-008)**: para cada perfil, a lista do menu é comparada com o resultado de abrir cada tela pelo servidor (permitido × "Acesso negado"). Uma divergência falha o teste.
8. **Visual**: capturas do menu em três larguras e nos estados principais, geradas no Linux do CI (CA-008). Medição do shell com o menu contra a linha de base (MS-006).
9. **Regressão**: suítes das Specs 001 a 003 sem mudança de comportamento; só o seletor de "Meu perfil" no cabeçalho muda (CA-007).

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| O menu e o servidor divergirem (RF-008) | Catálogo único no cliente, exigência do servidor inalterada e teste ao vivo de paridade por perfil |
| Exibir item restrito antes da confirmação | O cache só é lido offline; o estado `loading` e `error` usam só Início e Meu perfil; testes dedicados |
| Vazar permissão entre tenants ou pessoas | Estado e cache chaveados por (pessoa, tenant); limpeza antes do novo render; geração de consulta descarta respostas antigas; testes com dois tenants |
| O cache em `sessionStorage` sobreviver a um logout falho | Chave com hash de pessoa e tenant, remoção em logout, expiração e troca de pessoa, e só leitura offline; valor sem dado pessoal |
| Tabela de telas do cliente e rotas do `App.tsx` divergirem | `ADMIN_ROUTES` passa a derivar do catálogo; teste confirma que todo caminho do catálogo tem rota |
| O menu piorar o carregamento do shell | Consulta assíncrona que não bloqueia a renderização; sem biblioteca nova; medição contra 132 ms (limite de 158 ms) |
| Sessão em AAL1 | A consulta não filtra por AAL (RN-004): para quem já está `authenticated`, a verificação em duas etapas ocorre ao abrir a tela e o servidor recusa sem MFA. Enquanto a sessão está em `mfa_required`, o menu e a consulta não existem |
| Capturas variam por sistema | Geradas e comparadas no Linux do CI, como na Spec 003 |
| Rolagem horizontal em 320 px ou com zoom | Teste dedicado; item com `min-w-0` e quebra de texto; lista com rolagem vertical própria |

## Rastreabilidade

**Issue**: [#9 — Spec 004: navegação por permissão](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/9) em `aalissonalmeidaq/fluxid_integra2026`; o número também entra na descrição do PR e no RIA.

| Requisito | Onde é atendido |
|---|---|
| RF-001 a RF-004, RF-021 a RF-023 | `get_actor_permissions`, `query-permissions`, contrato da consulta |
| RF-005 a RF-010 | catálogo de telas, `visibleScreens`, `navigation-menu.tsx` |
| RF-011 a RF-014 | `AppShell`, `menu-toggle.tsx`, contrato do menu |
| RF-015 a RF-020 | `permissions-provider.tsx`, `permissions-cache.ts` |
| RF-018, RF-019 | estados do menu com os componentes da Spec 003 |
| CA-001 a CA-009 | contrato de verificações automáticas |
| MS-007 | validação humana de Alisson Almeida registrada no RIA |

## Encerramento do ciclo

Ao concluir implementação e convergência, seguir o gate de registro de IA do `AGENTS.md`: testes, `git add`, `npm run ia:registro -- --spec 004 --ciclo NN --titulo "..."`, validação humana, `npm run ia:validar` e commit único. O link do RIA aponta para a branch até o PR existir; a troca pelo link do PR é pendência obrigatória antes do merge.

## Acompanhamento de complexidade

Sem violações da constituição a justificar. Nenhuma dependência nova.
