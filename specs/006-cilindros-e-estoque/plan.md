# Plano de implementação: Cilindros, identificadores, estoque e histórico

**Feature**: `006-cilindros-e-estoque` | **Data**: 05/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/006-cilindros-e-estoque/spec.md` (8 decisões na seção Clarifications)

## Resumo

Criar o primeiro dado de domínio do FluxID: o **cadastro de cilindros** de cada organização, com **identificadores** (QR Code, Data Matrix, NFC e número do casco), **testes hidrostáticos**, **entrada no estoque idempotente** e **histórico imutável**. É a primeira spec com banco novo desde a Spec 002.

A abordagem repete o que a Spec 002 já provou:

- **Servidor**: tabelas com `organization_id` e RLS; toda escrita e toda leitura passam por funções RPC `security definer` que recebem ator e sessão (`p_actor`, `p_session`) e conferem a permissão no banco com `private.actor_has_permission`. As Edge Functions `query-cylinders` e `manage-cylinders` autenticam o token e chamam as RPCs com a chave de serviço, que fica só no servidor.
- **Auditoria e histórico**: cada RPC de escrita grava, na mesma transação, o evento de histórico do cilindro e o registro de auditoria (`private.write_audit_event`).
- **Idempotência**: a entrada no estoque reaproveita `private.idempotency_ledger` com a chave gerada no cliente.
- **Cliente**: camadas `domain/` (regras puras: normalização, situação do teste, validações), `application/` (serviço sobre o transporte de funções) e `pages/` (telas lazy), sem regra de domínio em componente React.
- **Interface**: duas entradas no menu ("Cilindros" e "Entrada no estoque"), tabela a partir de 768 px e cartões abaixo, no padrão visual da Spec 005.

Fica de fora, por decisão da spec: locais de estoque, fila offline, leitura por câmera ou NFC nativo, fotos, importação em massa, exportação e a troca da fonte de exemplo da Visão geral.

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; React 19.3.0; Tailwind CSS 4.3.3; SQL (PostgreSQL do Supabase) e Edge Functions em Deno, como nas specs anteriores

**Dependências principais**: as já existentes (`zod` para validar formulários e corpos de requisição). **Nenhuma dependência nova de execução** (RNF-004). No banco, a extensão `pg_trgm` (contrib do PostgreSQL, já disponível no Supabase) entra na migration para a busca por parte do número de série; não é dependência de pacote (ver `research.md`, decisão 7)

**Armazenamento**: 5 tabelas novas em `public` (`cylinder_types`, `cylinders`, `cylinder_identifiers`, `cylinder_tests`, `cylinder_events`), todas com `organization_id`, RLS e sem exclusão; `private.idempotency_ledger` e `public.audit_logs` existentes. Nada de dado de cilindro em `localStorage`, `sessionStorage`, IndexedDB ou cache do service worker (RF-036)

**Testes**: pgTAP em `supabase/tests/006_*.test.sql` (RLS com dois tenants por tabela, imutabilidade, unicidade, idempotência, auditoria por ação, limites de data); Vitest para domínio, serviço, manipuladores das funções e páginas; testes de contrato (permissões, limite de 30 dias igual no TypeScript e no SQL, nenhuma exclusão exposta); suíte `.live` para concorrência, idempotência com 10 repetições e desempenho com 50 mil cilindros; Playwright com axe e o backend simulado existente para 360, 768 e 1920 px; regressão visual só em Chromium no Linux

**Plataforma alvo**: navegadores modernos, PWA responsiva de 360 px a desktop amplo, retrato e paisagem

**Tipo de projeto**: aplicação web cliente única + migrations e Edge Functions do Supabase

**Metas de desempenho**: busca por identificador em até 1 s (p95) e primeira página da lista em até 2 s (p95), ambas com 50 mil cilindros na organização (RNF-001, RNF-002); pacote de entrada até 593,95 kB (RNF-003)

**Restrições**: WCAG 2.2 AA; só tokens, componentes, ícones e fonte da Spec 003; escritas exigem conexão e nunca são enfileiradas (RF-035); organização ativa sempre vem do servidor (RF-043); nenhuma credencial privilegiada no cliente (RF-041); respostas de negação não revelam cilindros de outra organização (RF-042)

**Escala/escopo**: 5 tabelas, 7 permissões, 1 papel padrão novo, 2 Edge Functions, 16 operações de servidor, 2 itens de menu, 4 telas (lista, cadastro, detalhe e entrada no estoque) mais diálogos de ação, 3 larguras de referência

## Verificação da constituição

*GATE inicial: aprovado. Reavaliado após o desenho da Fase 1: aprovado.*

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| I Especificação antes do código | Spec esclarecida (8 decisões) antes deste plano | Aprovado |
| II TDD obrigatório | Regras de domínio, RPCs, gatilhos de imutabilidade, idempotência e autorização nascem com teste RED (pgTAP e Vitest) antes do código | Aprovado |
| III Multitenancy e segurança | `organization_id` + RLS em todas as tabelas; RPCs conferem sessão, vínculo, papel e permissão a cada chamada; chave de serviço só no servidor; justificativa e auditoria nas ações sensíveis; teste de RLS com dois tenants por tabela | Aprovado |
| IV Estados explícitos | Situação cadastral (`status`), de estoque (`stock_status`) e do teste (calculada) são independentes, em colunas e componentes separados (RF-018) | Aprovado |
| V Experiência e acessibilidade | Design system, WCAG 2.2 AA, 360 px a desktop amplo, PWA preservada; offline informa que escrita exige conexão | Aprovado |
| VI Rastreabilidade | Branch `feat/006-cilindros-e-estoque`, spec 006, PR e RIA de encerramento | Aprovado |
| VII Qualidade verificável | Lint, tipagem, testes, cobertura, RLS, integração, E2E, axe, build PWA e validação humana (Alisson Almeida) | Aprovado |
| VIII Documentação viva | Contratos desta spec; `docs/prd.md` e `README.md` atualizados na convergência | Aprovado |

Nenhuma violação a justificar. Uma lacuna conhecida é tratada em *Riscos* (auditoria de tentativa direta de exclusão no banco, CA-003).

## Decisões de arquitetura

Detalhes e alternativas em [research.md](./research.md).

- **Todo acesso passa por RPC com ator e sessão.** O cliente nunca lê nem grava tabela diretamente. As RLS de `select` (membro ativo com `cylinder.read`) existem como segunda barreira e são testadas; `insert`, `update` e `delete` são revogados de `anon` e `authenticated`. As RPCs seguem o padrão de `query_audit_events`: `security definer`, `set search_path = ''`, conferência com `private.actor_has_permission(p_actor, p_session, p_organization, código)` e `revoke ... from public, anon, authenticated` com `grant` só ao `service_role`.
- **A organização vem da sessão, não do corpo.** As funções recebem `organization_id` apenas como contexto; a RPC confere que o ator tem vínculo ativo nela. Cilindro de outra organização e cilindro inexistente produzem a **mesma** resposta `NOT_FOUND` (RF-042, RF-043).
- **Sete permissões novas** (`cylinder.read`, `cylinder.write`, `cylinder.deactivate`, `cylinder.identifier`, `cylinder.stock_in`, `cylinder.test`, `cylinder.history`), entregues por migration ao `tenant_admin` e aos papéis `stock_operator`, `technical_operator` e `tenant_auditor` (novo papel padrão). `bootstrap_tenant_roles` passa a criar o auditor e a conceder as permissões; os tenants existentes são atualizados de forma idempotente. Nenhum papel existente perde permissão (premissa 8). Detalhe em [contracts/permissoes-e-papeis.md](./contracts/permissoes-e-papeis.md).
- **Histórico como tabela de eventos imutável**, com `sequence` por cilindro atribuída sob bloqueio da linha do cilindro (`select ... for update`), o que dá ordem estável e sem lacunas, mesmo no mesmo instante (RF-025). Gatilhos `before update or delete` recusam qualquer alteração, inclusive de `service_role` (RF-024, CA-004). O mesmo vale para `cylinder_tests`; `cylinders` e `cylinder_types` recusam `delete`; `cylinder_identifiers` recusa `delete` e só aceita a mudança de `active` para `deactivated` com os campos de desativação.
- **Idempotência da entrada**: `stock_in` faz `claim_idempotency_key` com operação `cylinder.stock_in` e hash do pedido. Repetição com a mesma chave devolve o `result_payload` gravado na primeira vez (mesma resposta); mesma chave com pedido diferente é `IDEMPOTENCY_PAYLOAD_CONFLICT`. A chave é um UUID gerado no cliente ao abrir o formulário e **mantido** em tentativas de repetição após falha de rede; um novo UUID só nasce após sucesso (RF-014, RF-029).
- **Concorrência**: `cylinders.version` otimista (`p_expected_version`), como em `change_tenant_membership_status`; segunda gravação sobre dado antigo recebe `VERSION_CONFLICT` com orientação para recarregar (RF-004, RNF-005). Unicidade de número de série e de identificador ativo por índice único parcial, mais `pg_advisory_xact_lock` por (organização, valor) para mensagens de conflito limpas sem criar nada pela metade.
- **Situação do teste calculada**: o domínio (`src/domain/cylinders/hydrostatic-status.ts`) calcula "em dia / a vencer / vencido / reprovado / sem teste" a partir do último teste efetivo e da data de hoje em `America/Sao_Paulo`. O limite `HYDROSTATIC_EXPIRING_DAYS = 30` existe uma só vez no TypeScript e uma só vez no SQL (`private.hydrostatic_expiring_days()`); um teste de contrato reprova divergência (RF-021). A lista filtra por situação no banco com colunas denormalizadas (`hydro_last_result`, `hydro_next_due_on`) mantidas pelas RPCs de teste, nunca pelo cliente.
- **Rotas**: a navegação continua por âncoras e `window.location.pathname`. O catálogo de telas ganha `/cilindros` (exige `cylinder.read`) e `/estoque/entrada` (exige `cylinder.stock_in`). Sub-rotas (`/cilindros/novo` e `/cilindros/<id>`) são resolvidas por um pequeno resolvedor em `src/app/cylinders/cylinder-routes.ts`, que também aplica a permissão da ação (`novo` exige `cylinder.write`). Todas as telas são `React.lazy` (RF-037).
- **Escritas exigem conexão**: o serviço de cilindros recebe o estado de conexão do contexto existente; sem conexão, o botão de envio fica desabilitado e a tela informa o motivo. Nada é enfileirado e `sync-outbox` não é usado (RF-035). Perda de conexão no meio do envio mostra "estado desconhecido" e oferece repetir **com a mesma chave**.
- **Entrada no estoque por leitor-teclado**: campo com foco inicial, Enter envia, `trim` e remoção de quebras de linha; após o resultado a tela limpa o campo, devolve o foco a ele e anuncia o resultado em região `role="status"` (RF-029).
- **Visão geral intacta**: continua com a fonte de exemplo; nenhum dado de cilindro entra em `OverviewSource` (RF-032, premissa 6).
- **Cache do service worker**: nenhuma regra nova; `/functions/v1` já está na lista de exceções de navegação e `pwa-config.test.ts` continua reprovando `runtimeCaching` de dados (RF-036, CA-007).

## Estrutura do projeto

### Documentação (esta funcionalidade)

```text
specs/006-cilindros-e-estoque/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── operacoes-servidor.md
│   ├── permissoes-e-papeis.md
│   ├── telas-e-rotas.md
│   └── verificacoes-automaticas.md
├── checklists/
├── baseline.md          # linha de base do tamanho do pacote (antes da mudança)
├── validation.md        # medições e validação humana
└── tasks.md             # gerado por /speckit-tasks
```

### Código-fonte (raiz do repositório)

```text
supabase/
├── migrations/
│   ├── 2026100500xxxx_cylinders_schema.sql        # tabelas, índices, RLS, gatilhos de imutabilidade, pg_trgm
│   ├── 2026100500xxxx_cylinders_permissions.sql   # permissões, papel tenant_auditor, bootstrap
│   └── 2026100500xxxx_cylinders_operations.sql    # RPCs de consulta e de escrita
├── functions/
│   ├── query-cylinders/{deno.json,handler.ts,index.ts}
│   └── manage-cylinders/{deno.json,handler.ts,index.ts}
└── tests/006_*.test.sql                           # pgTAP: RLS, imutabilidade, unicidade, idempotência, auditoria

src/
├── domain/cylinders/
│   ├── identifier.ts              # tipos, normalização (caixa e espaços), validação
│   ├── hydrostatic-status.ts      # situação do teste e limite de 30 dias
│   ├── cylinder-validation.ts     # regras dos campos (zod)
│   ├── cylinder-types.ts          # tipos e vocabulário (situações, motivos, eventos)
│   └── *.test.ts
├── application/cylinders/
│   ├── cylinder-service.ts        # consultas e comandos sobre o transporte de funções
│   ├── operation-key.ts           # chave de operação (UUID) mantida entre repetições
│   └── *.test.ts
├── app/cylinders/cylinder-routes.ts               # resolve /cilindros, /cilindros/novo, /cilindros/<id>
├── pages/cylinders/
│   ├── cylinder-list-page.tsx     # busca, filtros, paginação, tabela e cartões
│   ├── cylinder-form-page.tsx     # cadastro e edição, uma página, um envio
│   ├── cylinder-detail-page.tsx   # dados, identificadores, testes e histórico
│   ├── stock-in-page.tsx          # entrada no estoque por identificador
│   ├── components/{status-badges.tsx,identifier-list.tsx,hydrostatic-test-form.tsx,history-list.tsx,reason-dialog.tsx}
│   └── *.test.tsx
└── domain/navigation/screens.ts                   # + "Cilindros" e "Entrada no estoque"

tests/
├── contract/{cylinders-permissions.test.ts,cylinders-no-delete.test.ts,cylinders-hydrostatic-limit.test.ts,cylinders-volume.live.test.ts}
└── e2e/{cilindros.spec.ts,entrada-estoque.spec.ts} (+ visual/cilindros.visual.spec.ts)
```

**Decisão de estrutura**: projeto único e camadas existentes (`domain/`, `application/`, `app/`, `pages/`, `design-system/`); migrations e Edge Functions no padrão da Spec 002. Nenhum pacote novo.

## Estratégia de testes (TDD)

1. **pgTAP, RLS com dois tenants (RF-038, CA-001)**: para cada uma das 5 tabelas, o Tenant A lê e grava o que é dele e não vê, não busca nem altera nada do Tenant B (e o inverso); `anon` não acessa nada; `authenticated` sem permissão é negado; perfil global sem vínculo é negado.
2. **pgTAP, regras**: unicidade de número de série por organização (e repetida em outra); identificador ativo único por organização e repetido em outra; identificador desativado só reaproveitado por transferência; inativar mantém identificadores ativos e bloqueia entrada; justificativa obrigatória onde a spec manda; limites de data do teste; retificação referencia o original e não pode ser repetida sobre registro já retificado.
3. **pgTAP, imutabilidade e exclusão (CA-003, CA-004)**: `update` e `delete` em `cylinder_events` e `cylinder_tests` recusados para todo papel, inclusive `service_role`; `delete` em `cylinders`, `cylinder_types` e `cylinder_identifiers` recusado.
4. **pgTAP, idempotência (CA-002)**: 10 repetições com a mesma chave → 1 evento e resposta idêntica; mesma chave com identificador diferente → conflito; outra chave sobre cilindro já em estoque → `ALREADY_IN_STOCK` sem evento.
5. **pgTAP, auditoria por ação (CA-005)**: uma asserção por ação sensível confirmando o par evento + auditoria na mesma transação e a falha de ambos juntos.
6. **Domínio (Vitest)**: normalização de identificador; situação do teste nos limites (30, 31 e 0 dias, ontem, sem teste, reprovado após aprovado, aprovado após reprovado, retificação); validações de formulário (CA-008).
7. **Serviço e funções**: mapeamento de códigos de erro para estados de tela; manipuladores `query-cylinders` e `manage-cylinders` com portas falsas (autenticação, operação desconhecida, corpo inválido, `organization_id` divergente da sessão); chave de operação mantida em repetição.
8. **Páginas (React Testing Library)**: lista (busca, filtros, paginação mantendo filtros, vazio com e sem permissão, total anunciado), cadastro (erros junto dos campos e foco no primeiro), detalhe (blocos), entrada (foco, Enter, limpar e devolver o foco, avisos de teste vencido, não encontrado, inativo, já em estoque, offline).
9. **Contrato**: limite de 30 dias igual em TS e SQL; nenhuma operação de exclusão exposta nas funções nem nos serviços; permissões do catálogo de telas e das rotas coerentes com a migration.
10. **E2E com backend simulado**: cadastro → lista → detalhe → entrada, em 360, 768 e 1920 px, 320 px e zoom de 200% sem rolagem horizontal, axe sem violação crítica ou grave, teclado completo, offline com estrutura aberta e aviso (CA-006, CA-007).
11. **Suíte `.live`** (Supabase local): duas sessões cadastrando o mesmo número de série; duas inativando o mesmo cilindro; edição simultânea; desempenho de banco e função com 50 mil cilindros (busca por identificador p95 ≤ 1 s; consulta da primeira página no servidor) (RNF-001). A **primeira página da lista em até 2 s (p95) em 4G** (RNF-002) é medida no navegador com Playwright e limitação de rede, contra a mesma massa de 50 mil cilindros, e registrada em `validation.md`.
12. **Escalas e visual**: `escalas-no-codigo.test.ts` sobre as telas novas; capturas das telas novas em três larguras, geradas no Linux por `npm run test:visual:atualizar` (CA-009).
13. **Pacote**: `npm run build` antes e depois; entrada ≤ 593,95 kB (CA-010).

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| **CA-003 pede que a tentativa direta de exclusão no banco seja "recusada e auditada"**, mas uma exceção de gatilho desfaz a transação e leva junto o registro de auditoria | A recusa é garantida por privilégio revogado + gatilho (testado). A auditoria da tentativa cobre o caminho de aplicação: operação de exclusão não existe nas funções e uma chamada com operação desconhecida ou de exclusão é auditada como `denied`. A tentativa por SQL direto fica no log do PostgreSQL. **Decidido em `/speckit-clarify`**: essa cobertura é a aceita, e CA-003 foi reescrito de acordo (ver `research.md`, decisão 10) |
| Vazamento entre organizações por RPC mal escrita (`security definer` ignora RLS) | Toda RPC começa por `actor_has_permission` e filtra por `p_organization`; pgTAP com dois tenants por função; revisão do `grant` só a `service_role` |
| Existência de cilindro de outra organização revelada por mensagem ou tempo | Resposta única `NOT_FOUND` para inexistente e de outra organização; mesmos campos e status HTTP; teste compara as duas respostas |
| Corrida na unicidade de série e de identificador | Índice único parcial como barreira final + bloqueio consultivo por valor; teste `.live` com duas sessões |
| Entrada duplicada por duplo clique, nova tentativa ou resposta perdida | Chave de operação no cliente + `idempotency_ledger` no servidor + botão desabilitado durante o envio; 10 repetições em teste |
| Ordem do histórico instável com eventos no mesmo instante | `sequence` por cilindro sob bloqueio da linha; ordenação por `sequence`, nunca por relógio |
| Situação do teste divergir entre lista (banco) e detalhe (cliente) | Constante única em cada lado, verificada por teste de contrato; fuso fixo `America/Sao_Paulo`; mesma tabela de casos de limite em pgTAP e Vitest |
| Busca lenta com 50 mil cilindros | Índice B-tree em (organização, valor normalizado) para identificador, trigrama (`pg_trgm`) para parte do número de série, paginação por cursor; teste de desempenho no gate |
| Pacote de entrada crescer | Telas e serviço em chunks `React.lazy`; só o catálogo de telas (dois itens) entra no pacote de entrada; medição antes e depois |
| Leitor tipo teclado enviar prefixo, sufixo ou Enter extra | Normalização no domínio (remove quebras e espaços das pontas) com testes; o prefixo configurável de leitor não faz parte desta spec |
| Dado de cilindro cair no cache do service worker | Nenhuma regra de cache de dados; teste de configuração existente e teste novo de que respostas de `/functions/v1` não são cacheadas |
| Capturas variarem por sistema | Geradas e comparadas só no Linux; nunca versionar `*-win32.png` |
| Regressão do menu por permissão (Spec 004) | Só duas entradas novas no catálogo; testes da Spec 004 permanecem; nenhuma regra de visibilidade alterada (RF-027) |

## Complexidade

Sem violações da constituição. As duas decisões que mais se afastam do padrão anterior estão justificadas em `research.md`: a extensão `pg_trgm` (busca por parte do número de série) e a separação em duas Edge Functions (consulta e comando).

## Rastreabilidade

- Issue: [#15](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/15) (Spec 006: cilindros, identificadores, estoque e histórico).
- Branch: `feat/006-cilindros-e-estoque`. A issue deve constar na descrição do pull request e no RIA de encerramento (constituição, princípio VI).

## Rastreabilidade

| Item | Valor |
|---|---|
| Issue | [#16 — Spec 006: cilindros, identificadores, estoque e histórico](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/16) |
| Branch | `feat/006-cilindros-e-estoque` |
| Pull request | a abrir ao fim do ciclo (constar a issue #16 na descrição) |
| RIA | gerado no gate de encerramento (T077) |

## Emenda de 05/10/2026: símbolo do identificador (RF-044)

- **Decisão de dependência (RNF-004)**: `bwip-js` 4.x (MIT) gera QR Code e Data Matrix em SVG no navegador (`bwip-js/browser`, `toSVG`), sem rede. Alternativas descartadas: `qrcode` (não faz Data Matrix) e duas bibliotecas (mais peso).
- Regra de domínio em `src/domain/cylinders/identifier-symbology.ts` (tipo do identificador → simbologia); o componente `identifier-symbol.tsx` carrega a biblioteca por `import()` só ao clicar em "Mostrar código", mantendo o pacote de entrada dentro do limite (CA-010/CA-011). Sem mudança de banco, de funções ou de permissão (leitura já exige `cylinder.read`).
