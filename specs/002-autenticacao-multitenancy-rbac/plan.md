# Plano de implementação: Autenticação, multitenancy e controle de acesso RBAC

**Feature**: `002-autenticacao-multitenancy-rbac` | **Data**: 29/09/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/002-autenticacao-multitenancy-rbac/spec.md`

## Resumo

Implementar identidade individual por e-mail e senha, MFA TOTP, sessões governadas, organizações isoladas, vínculos multitenant, RBAC, perfil e auditoria. A PWA passa a resolver um único cliente Supabase na ordem `cloud → LAN → local`, com fallback exclusivo por indisponibilidade técnica. Outbox, pull incremental, conflitos e promoção coordenada protegem a convergência antes da troca para cloud. Operações privilegiadas passam por fronteira servidor; credenciais, sessões e dados de tenants nunca são transferidos por simples troca de URL.

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; SQL PostgreSQL 17; Edge Functions em TypeScript/Deno 2

**Dependências principais**: React 19.3.0, Vite 8.3.1, Tailwind CSS 4.3.3, `@supabase/supabase-js` 2.117.2, Supabase CLI 2.117.0, Zod 4.6.5 e `vite-plugin-pwa` 1.3.0; novas dependências somente com justificativa, versão exata, auditoria e lockfile

**Armazenamento**: Supabase PostgreSQL para identidade complementar, organizações, vínculos, RBAC, sessões de aplicação, convites e auditoria; Storage privado para avatares; base local transacional da PWA para dados permitidos, outbox, conflitos e cursores segregados por tenant; `auth.users` e `auth.sessions` permanecem sob responsabilidade de cada projeto Supabase

**Testes**: Vitest 5.0.2, React Testing Library, testes SQL/RLS no Supabase local, testes de contrato das Edge Functions, Playwright 1.63.0, axe-core, lint, tipagem e build/PWA

**Plataforma alvo**: navegadores modernos em desktop e Android, PWA responsiva de 360 px a desktop amplo; Supabase local em desenvolvimento, LAN self-hosted homologada ou cloud em operação

**Tipo de projeto**: aplicação web cliente única com banco/serviços Supabase e Edge Functions para fronteiras privilegiadas

**Metas de desempenho**: p95 do login válido e das consultas administrativas abaixo de 3 segundos no ambiente de referência; p95 das verificações de autorização abaixo de 800 ms; listas paginadas com no máximo 100 itens por página

**Restrições**: WCAG 2.2 AA; RLS deny-by-default; nenhuma credencial privilegiada no cliente; MFA AAL2 para perfis globais e ações críticas; sessão máxima de 8 horas, inatividade de 30 minutos e até 3 sessões; SMTP homologado em produção; `cloud → LAN → local`; sem fallback por erro de segurança/domínio/configuração; sem escrita simultânea; push antes de pull; promoção cloud somente após gates de sincronização

**Escala/escopo**: MVP para até 100 tenants, 10 mil identidades, 100 mil vínculos, 500 papéis personalizados por tenant e 10 milhões de eventos de auditoria antes de reavaliar particionamento; paginação e índices obrigatórios desde o início

## Verificação da constituição

*GATE inicial: aprovado. Reavaliado após o desenho da Fase 1: aprovado.*

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| Especificação antes do código | Decisões da Spec 002 resolvidas; a classificação de operações futuras `offline-safe` permanece fora deste escopo | Aprovado |
| TDD obrigatório | Tarefas futuras devem ordenar RED → GREEN → REFACTOR para domínio, autorização, RLS e UI | Aprovado |
| Multitenancy e segurança | `organization_id`, RLS, dois tenants, menor privilégio e `service_role` somente no servidor | Aprovado |
| Estados explícitos | Estados de tenant, vínculo, convite, sessão e entrega de e-mail possuem transições documentadas | Aprovado |
| Experiência e acessibilidade | Design system FluxID, mobile-first, autenticação acessível, foco e estados completos | Aprovado |
| Rastreabilidade | Branch e Spec 002 identificadas; artefatos mantêm IDs de requisitos e histórias | Aprovado |
| Qualidade verificável | Gates incluem unidade, contratos, integração, RLS, E2E, axe, PWA, advisors e segredos | Aprovado |
| Documentação viva | Plano, pesquisa, modelo, contratos e quickstart acompanham a feature | Aprovado |

Não há violação constitucional aceita. O uso de Edge Functions é necessário para operações que exigem credencial privilegiada e limite de sessões, mantendo essa credencial fora do navegador.

## Arquitetura e limites de confiança

- O navegador usa somente chave publicável. O cliente ativo é gerenciado pelo `SupabaseClientManager` desta Spec, que substitui a prioridade `local → LAN → cloud` da Spec 001 pela nova ordem `cloud → LAN → local` conforme [ADR-001](../../../docs/decisoes-arquiteturais/ADR-001-prioridade-cloud-e-sincronizacao-segura.md).
- Login, logout governado, convites, mudanças globais, revogações e anonimização passam por Edge Functions com validação de origem, entrada, identidade, sessão e permissão.
- Consultas e mutações de baixo risco usam Data API com grants mínimos e RLS; `organization_id` recebido é apenas contexto solicitado.
- Helpers de autorização residem em schema privado, usam `auth.uid()` e vínculos atuais, têm `search_path` fixo e execução revogada por padrão.
- Claims do JWT não carregam a matriz completa de permissões. `aal` e `session_id` podem ser usados, mas mudanças de acesso são confirmadas no banco para evitar autorização obsoleta.
- Auditoria é escrita na mesma transação das mudanças sensíveis sempre que possível. Edge Functions não mantêm transação aberta durante chamadas SMTP/Auth externas.
- O service worker armazena somente shell estático; tokens, respostas Auth/Data API, avatares e dados administrativos ficam fora do cache.
- A base local da aplicação é distinta do cache do service worker. Ela é aberta por tenant e armazena somente dados autorizados para operação degradada, outbox, cursores e conflitos.
- Projetos Supabase distintos possuem Auth e chaves de assinatura próprios. O gerenciador invalida o cliente anterior e exige sessão válida no destino; não copia refresh token, senha ou segredo MFA.

## Componentes e responsabilidades

| Componente conceitual | Responsabilidade testável |
|---|---|
| `EndpointConfiguration` | validar pares URL/chave publicável, timeout e modos sem revelar valores |
| `EndpointHealthCheck` | executar probe limitado, cancelável, somente leitura e sem corpo sensível |
| `EndpointCompatibilityCheck` | comparar a versão pública do contrato/schema do destino com a versão esperada e bloquear incompatibilidade sem fallback |
| `ConnectionFailureClassifier` | distinguir indisponibilidade elegível de bloqueios de autenticação, autorização, RLS, tenant, validação, integridade e configuração |
| `CloudFirstConnectionResolver` | resolver sequencialmente `cloud → LAN → local`, uma passagem por ciclo, sem concorrência |
| `SupabaseClientManager` | manter exatamente um cliente ativo, invalidar o anterior e impedir reutilização indevida de sessão |
| `ConnectivityState` | representar inicialização, probing, conectado, degradado, sincronizando, conflito, bloqueado e offline |
| `LocalDatabase` | persistir dados permitidos, outbox, conflitos e cursores com partição lógica por tenant |
| `SyncOutbox` | enfileirar comandos idempotentes e preservar itens até confirmação remota |
| `SyncCoordinator` | serializar push, pull, pausa, retomada e promoção; impedir execuções concorrentes |
| `PushSynchronizer` | respeitar dependências, validar sessão/permissão no servidor e confirmar cada item |
| `PullSynchronizer` | buscar após cursor, aplicar alterações atomicamente e só então avançar o cursor |
| `ConflictResolver` | classificar conflitos e preservar versões quando não houver regra automática segura |
| `SyncCursor` | guardar marco confirmado por tenant, coleção e origem, sem confiar somente no relógio do dispositivo |
| `EndpointPromotionCoordinator` | reavaliar cloud e promovê-la somente após estabilização e convergência |
| `AuditLogger` | registrar endpoint, transição, item e resultado sanitizados, sem URL completa, chaves ou payload sensível |

> **Nota sobre nomes**: os identificadores acima são conceituais. Os nomes finais no código devem seguir o padrão de nomenclatura já adotado pelo projeto (ex.: `camelCase` para funções, `PascalCase` para classes/tipos). As responsabilidades devem permanecer separadas e testáveis.

## Fluxo de inicialização e promoção

1. carregar app shell e configuração pública;
2. abrir `LocalDatabase` em estado bloqueado e inspecionar somente metadados sanitizados da outbox, sem liberar dados protegidos;
3. resolver cloud, depois LAN e depois local apenas em falha elegível e restaurar somente sessão válida emitida pelo destino selecionado;
4. se cloud estiver ativa, executar push até confirmação ou conflito crítico;
5. executar pull desde o cursor válido e confirmar a atualização local;
6. validar sessão, tenant e consistência mínima;
7. liberar a área operacional ou apresentar estado bloqueado/degradado recuperável;
8. em LAN/local, reavaliar cloud após 60 segundos, com jitter de até 10% e sem ciclos sobrepostos;
9. ao retorno da cloud, pausar novas mutações, estabilizar a atual, sincronizar e somente então trocar o cliente.

Os padrões são: probe de 3 segundos; até 3 ciclos de resolução com intervalos de 2 s, 4 s e 8 s; até 5 tentativas por item de outbox; 30 segundos até oferecer recuperação na inicialização; e reavaliação da cloud após 60 segundos com jitter de até 10%. Os valores configuráveis devem respeitar esses contratos, nenhum loop pode ser infinito e a UI sempre oferece cancelamento ou nova tentativa quando seguro.

## Decisões fechadas e fronteira futura

As decisões necessárias para implementar esta Spec estão fechadas:

1. **Topologia Auth**: cada projeto possui autoridade de sessão independente. Acesso protegido em LAN/local exige autenticação emitida pelo próprio destino; senha, refresh token, sessão e segredo MFA não são copiados nem sincronizados.

2. **Operações `offline-safe`**: a allowlist da Spec 002 é vazia. Operações de identidade, sessão, convite, RBAC, auditoria sensível e administração são proibidas; Specs de domínio futuras decidirão suas próprias operações, sem bloquear esta entrega.

   O cenário de sucesso do contrato idempotente usa exclusivamente uma operação sintética do harness de teste para comprovar reserva, replay e concorrência no ledger. Essa operação não integra a allowlist da aplicação, não pode ser enfileirada pela PWA e não representa funcionalidade de domínio.

3. **Intervalos e limites**: valem os padrões definidos neste plano e nos requisitos RF-048, RF-053, RF-057 e RF-060.

4. **Conflitos**: para entidades críticas desta Spec, preservar ambas as versões e bloquear escrita automática é a regra. Resolução manual exige sessão vigente, justificativa, `tenant.manage` no tenant ou `platform.manage` no escopo global e auditoria append-only `sync.conflict.resolve`. Regras específicas de agregados operacionais pertencem às Specs futuras.

5. **Compatibilidade entre endpoints**: cada destino expõe uma versão pública do contrato/schema. O cliente a compara com a versão esperada após o health check; incompatibilidade bloqueia o destino sem fallback. Promoção e homologação exigem o mesmo conjunto aprovado de migrations, RLS e catálogo de permissões.

## Estrutura do projeto

### Documentação desta feature

```text
specs/002-autenticacao-multitenancy-rbac/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── auth-sessions.md       ← autenticação e sessões
│   ├── identity-admin.md      ← organizações, convites e usuários
│   ├── connectivity.md        ← resolução CLOUD → LAN → LOCAL (novo)
│   ├── synchronization.md     ← outbox, push, pull, conflitos e cursor (novo)
│   ├── rbac-audit.md          ← RBAC e auditoria
│   └── profile-avatar.md      ← perfil e avatar
└── checklists/
    └── requirements.md
```

### Código-fonte previsto

```text
src/
├── app/
│   ├── auth/
│   ├── routing/
│   └── providers.tsx
├── domain/identity/
├── application/identity/
├── infrastructure/supabase/
├── infrastructure/connectivity/
├── infrastructure/local-database/
├── infrastructure/synchronization/
├── pages/auth/
├── pages/admin/
└── components/identity/

supabase/
├── migrations/
├── functions/
│   ├── public-compatibility/   ← versão pública do contrato (RF-047)
│   ├── sync-command/           ← ledger idempotente (RF-053)
│   ├── session-login/
│   ├── session-logout/
│   ├── session-status/
│   ├── password-recovery/
│   ├── manage-organizations/
│   ├── invite-user/
│   ├── manage-membership/
│   ├── manage-access/          ← previsto (US5)
│   ├── query-audit/            ← previsto (US8)
│   └── retention-storage-cleanup/ ← limpeza de avatares anonimizados, acionada por agendador (US8, AUD-009)
├── templates/
└── seed.sql

tests/
├── contract/
├── integration/
└── e2e/

supabase/tests/                 ← testes SQL/RLS
```

**Decisão de estrutura**: aplicação web única com camadas de domínio, aplicação e infraestrutura. Componentes React não calculam permissões nem transições. O workflow de banco é imperativo porque `schema_paths` está vazio e ainda não existe `supabase/schemas/`; migrations devem nascer pelo CLI e ser validadas localmente antes de qualquer destino remoto.

## Estratégia de implementação

1. Criar testes de contratos e estados antes do schema.
2. Em RED, substituir os testes da Spec 001 pela prioridade cloud e cobrir cancelamento, concorrência, bloqueios e descarte do cliente.
3. Implementar a mudança mínima do resolvedor e do gerenciador do cliente; manter modos explícitos.
4. Definir em RED a persistência local, estados da outbox, cursores, retomada e isolamento por tenant.
5. Implementar push idempotente, pull incremental e conflitos antes da promoção automática.
6. Criar migrations imperativas pelo CLI: uma fundação com tipos, tabelas, constraints, índices, grants, RLS e helpers privados; migrations incrementais para RPC idempotente, bucket/policies e retenção, cada uma validada por reset e testes SQL.
7. Validar RLS com Tenant A, Tenant B e Master FluxID em cada destino aplicável antes de integrar a UI.
8. Implementar fronteiras servidor de sessão e administração com respostas sanitizadas e auditoria.
9. Implementar casos de uso, coordenadores e providers React independentes de componentes.
10. Entregar histórias incrementalmente: inicialização/sincronização; autenticação; tenants; usuários; RBAC; tenant ativo; perfil; auditoria.
11. Validar UI de inicialização em 360 px/desktop, teclado, leitores de tela, offline e service worker.
12. Convergir documentação, testes e segurança e registrar a ADR-001 no RIA do encerramento.

## Gates pós-desenho

- Nenhum `NEEDS CLARIFICATION` permanece nos artefatos.
- Toda tabela exposta possui grants mínimos, RLS habilitada e políticas testadas para acesso permitido e negado.
- Toda FK e coluna usada por RLS/consultas críticas possui índice coerente.
- Funções privilegiadas ficam fora de schemas expostos, validam identidade e têm execução explicitamente revogada/concedida.
- Políticas UPDATE usam `USING` e `WITH CHECK`; views, se existirem, usam invocador seguro.
- Sessões e ações críticas validam `session_id`/AAL2 quando exigido.
- SMTP produtivo, domínio e credenciais permanecem configuração externa; desenvolvimento usa captura local.
- O plano preserva cobertura global de 85%/80% (configurada em `vitest.config.ts`) e exige 95% de linhas, funções e branches em domínio/autorização.
- `supabase db advisors`, varredura de segredos, lint, tipos, testes, E2E, axe e build devem passar antes do encerramento.
- Testes do resolvedor cobrem cloud saudável; fallback para LAN; fallback para local; todos indisponíveis; timeout elegível; autenticação, autorização e RLS bloqueantes; retorno da cloud; e invalidação do cliente anterior.
- Testes de sincronização cobrem outbox pendente, push antes de pull, confirmação antes de remoção, repetição idempotente, queda de rede, sessão expirada, conflito de versão, tenant suspenso, retomada, cursor e isolamento A/B.
- O bundle não contém chave privilegiada, logs não contêm segredo e o service worker não armazena respostas protegidas.

## Rastreamento de complexidade

Nenhuma violação constitucional. A fronteira servidor e a tabela de sessões são justificadas pelo limite de três sessões. Base local, outbox e coordenação de promoção são complexidade exigida pela nova continuidade degradada; a habilitação produtiva de LAN/local permanece condicionada à compatibilidade comprovada de contrato/schema, RLS e catálogo de permissões.

## Tarefas derivadas

As tarefas foram geradas em [tasks.md](./tasks.md), que substitui a lista preliminar anteriormente mantida nesta seção. Cada tarefa de implementação segue TDD: teste falhando (RED) → implementação mínima (GREEN) → refatoração (REFACTOR) → teste de regressão.

> **Governança**: esta revisão arquitetural altera decisões de conectividade e sincronização e deve ser incluída no RIA do ciclo antes do commit de encerramento, conforme o gate obrigatório do repositório. O RIA não deve ser gerado nesta interação; ele será criado quando o ciclo estiver prestes a ser encerrado com testes aprovados.
