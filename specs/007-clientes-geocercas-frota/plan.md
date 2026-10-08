# Plano de implementação: Clientes, unidades, geocercas, veículos e motoristas

**Feature**: `007-clientes-geocercas-frota` | **Data**: 07/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/007-clientes-geocercas-frota/spec.md` (13 decisões na seção Clarifications, em duas sessões)

## Resumo

Criar os quatro cadastros de base da Fase 3 do PRD: **clientes** (com contatos e **unidades**), **geocercas** ligadas às unidades, **veículos** e **motoristas**, todos por organização, sem exclusão física, com histórico imutável e auditoria. É a segunda spec com banco novo depois da 006 e a primeira com uma integração externa (**ViaCEP**) e com **dados pessoais sensíveis** (CPF e CNH).

A abordagem repete o que as Specs 002 e 006 já provaram e acrescenta três peças novas:

- **Servidor (padrão herdado)**: tabelas com `organization_id` e RLS; toda escrita e toda leitura passam por RPC `security definer` com ator e sessão do token, conferência por `private.actor_has_permission`, evento e auditoria na mesma transação, `grant` só ao `service_role`. Edge Functions `query-registry` e `manage-registry` sobre uma borda genérica extraída de `_shared/cylinders.ts`.
- **Peça nova 1, PostGIS**: geocerca como `geography` com índice GiST; "ponto dentro" exato (círculo por distância, polígono por cobertura) com pré-filtro espacial.
- **Peça nova 2, consulta de CEP**: Edge Function `lookup-postal-code` com porta de provedor substituível, `ViaCepProvider`, limite de taxa reaproveitando `take_rate_limit_token`, prazo de 4 s e só o CEP saindo.
- **Peça nova 2b, geocodificação do endereço**: Edge Function `geocode-address` com porta `GeocodingProvider`, `NominatimProvider`, limites por pessoa, por organização e global de 1/s, só o endereço saindo; origem e confirmação das coordenadas na unidade (migration `*_registry_site_geocoding.sql`); campo de coordenadas com busca e confirmação humana no formulário da unidade (`contracts/geocodificacao-de-endereco.md`).
- **Peça nova 2c, mapas**: Leaflet (única dependência nova do cliente, em bloco carregado sob demanda, fora do pacote de entrada), blocos do OpenStreetMap (exceção em `tests/contract/no-external-assets.test.ts` só para `tile.openstreetmap.org` e `www.openstreetmap.org`), RPC `list_site_points` (`customer.read`, no máximo 1000 pontos e o total), mapa no formulário e no detalhe da unidade e na Visão geral (80% mapa e 20% indicadores empilhados).
- **Peça nova 3, proteção de dados pessoais**: CPF e CNH em tabelas sem política de `select` (só RPC), exibição sempre mascarada, revelação sob demanda com permissão própria e auditoria, e nenhum documento em saída alguma.
- **Cliente (padrão herdado)**: camadas `domain/` (regras puras: documentos, placa, telefone, CEP, geometria, situação de validade), `application/` (serviços sobre o transporte de funções) e `pages/` (telas `React.lazy`), sem regra de domínio em componente React.
- **Interface**: quatro entradas no menu (Clientes, Geocercas, Veículos, Motoristas), tabela a partir de 768 px e cartões abaixo, no padrão visual da Spec 005, com a skill `ui-ux-pro-max`.

Fica de fora, por decisão da spec: viagens e escalação (Fase 4), aplicativo de campo, GPS e offline com fila (Fase 5), mapa interativo, proximidade e alertas (Fases 6 e 7), fotos e anexos, importação em massa, catálogos por organização e manutenção detalhada de veículo.

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; React 19.3.0; Tailwind CSS 4.3.3; SQL (PostgreSQL 17 do Supabase) e Edge Functions em Deno, como nas specs anteriores

**Dependências principais**: as já existentes (`zod` para formulários e corpos de requisição). **Nenhuma dependência nova de execução no cliente** (RNF-006): a geometria e a pré-visualização são código próprio. No banco, a extensão **PostGIS 3.3.7** (verificada na imagem local, `research.md` decisão 1) e, já instalada, `pg_trgm`; não são dependências de pacote

**Armazenamento**: 9 tabelas novas em `public` (`customers`, `customer_documents`, `customer_contacts`, `customer_sites`, `geofences`, `vehicles`, `drivers`, `driver_documents`, `registry_events`), todas com `organization_id` e RLS e sem exclusão; `private.rate_limits`, `private.idempotency_ledger` e `public.audit_logs` existentes. Nada de dado de cadastro, documento ou resposta de CEP em `localStorage`, `sessionStorage`, IndexedDB ou cache do service worker (RF-046)

**Testes**: pgTAP em `supabase/tests/007_*.test.sql`; Vitest para domínio, serviço, manipuladores das funções e páginas; testes de contrato (permissões, limites iguais em TS e SQL, nenhuma exclusão, nenhuma saída com documento, saída do CEP); suíte `.live` para concorrência e desempenho com o volume de referência; Playwright com axe e backend simulado para 360, 768 e 1920 px; regressão visual só em Chromium no Linux. Lista completa em [contracts/verificacoes-automaticas.md](./contracts/verificacoes-automaticas.md)

**Plataforma alvo**: navegadores modernos, PWA responsiva de 360 px a desktop amplo, retrato e paisagem

**Tipo de projeto**: aplicação web cliente única + migrations e Edge Functions do Supabase

**Metas de desempenho**: busca em até 1 s (p95) e primeira página em até 2 s (p95) no volume de referência de 10 mil clientes, 50 mil unidades, 50 mil geocercas, 5 mil veículos e 5 mil motoristas (RNF-001, RNF-002); "geocercas que contêm um ponto" em até 200 ms (p95) com 50 mil geocercas (RNF-003); busca de CEP em até 5 s com falha tratada (RNF-004); pacote de entrada até 593,95 kB (RNF-005)

**Restrições**: WCAG 2.2 AA; só tokens, componentes, ícones e fonte da Spec 003; escritas e busca de CEP exigem conexão e nunca são enfileiradas (RF-045); organização ativa vem do servidor (RF-053); nenhuma credencial privilegiada no cliente (RF-051); respostas de negação não revelam registros de outra organização (RF-052); só o CEP sai para terceiros (RF-009)

**Escala/escopo**: 9 tabelas, 20 permissões, 3 Edge Functions (2 de domínio e 1 de CEP), 42 operações de servidor (16 de consulta, 25 de comando e a consulta de CEP), 4 itens de menu, 19 rotas, 11 migrations, 3 larguras de referência

## Verificação da constituição

*GATE inicial: aprovado. Reavaliado após o desenho da Fase 1: aprovado.*

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| I Especificação antes do código | Spec esclarecida (13 decisões) antes deste plano | Aprovado |
| II TDD obrigatório | Validadores de documento, geometria, RPCs, cascata, imutabilidade, limite de taxa e adaptador de CEP nascem com teste RED (pgTAP e Vitest) antes do código | Aprovado |
| III Multitenancy e segurança | `organization_id` + RLS em todas as tabelas; documentos pessoais em tabelas sem política de leitura; RPCs conferem sessão, vínculo, papel e permissão a cada chamada; chave de serviço só no servidor; justificativa e auditoria nas ações sensíveis; teste de RLS com dois tenants por tabela e para a consulta espacial; só o CEP sai para terceiros | Aprovado |
| IV Estados explícitos | Situação cadastral, situação operacional do veículo e situação do documento (calculada) são independentes, em colunas e componentes separados | Aprovado |
| V Experiência e acessibilidade | Design system, WCAG 2.2 AA, 360 px a desktop amplo, PWA preservada; offline informa que escrita e busca de CEP exigem conexão; geocerca com alternativa em texto | Aprovado |
| VI Rastreabilidade | Branch `feat/007-clientes-geocercas-frota`, spec 007, issue (a abrir), PR e RIA de encerramento | Aprovado |
| VII Qualidade verificável | Lint, tipagem, testes, cobertura, RLS, integração, E2E, axe, build PWA e validação humana (Natã Baracho) | Aprovado |
| VIII Documentação viva | Contratos desta spec; `docs/prd.md` e `README.md` atualizados na convergência | Aprovado |

Nenhuma violação a justificar. Dois pontos de atenção estão em *Riscos*: dados pessoais em coluna de texto (criptografia por coluna avaliada e adiada) e dependência de um serviço público externo.

## Decisões de arquitetura

Detalhes e alternativas em [research.md](./research.md).

- **Todo acesso passa por RPC com ator e sessão.** O cliente nunca lê nem grava tabela diretamente. As RLS de `select` (membro ativo com a permissão de leitura da área) existem como segunda barreira e são testadas; `insert`, `update` e `delete` ficam revogados de `anon` e `authenticated`. As RPCs seguem o padrão de `query_audit_events` e das RPCs de cilindros.
- **Anonimização irreversível no lugar de exclusão.** Três operações (`anonymize_driver`, `anonymize_customer`, `anonymize_contact`) sobrescrevem os campos pessoais no próprio registro, em uma transação, sem excluir linha alguma, com permissão crítica própria só do administrador do tenant, MFA (`aal2`, como `manage-membership`), registro inativo, motivo, justificativa e confirmação; o histórico nunca guarda nome, CPF, CNH, telefone nem e-mail, então nada identificável resta (decisão 15).
- **Documentos pessoais fora do alcance do PostgREST.** `customer_documents` e `driver_documents` têm RLS sem nenhuma política e privilégios revogados; listas e detalhes usam só `*_display` mascarado; o valor completo sai apenas por `reveal_document`, com permissão `*.document` (só o administrador do tenant), auditoria sem o valor e `Cache-Control: no-store` (decisão 4).
- **A organização vem da sessão, não do corpo.** Recurso de outra organização e recurso inexistente produzem a **mesma** resposta `NOT_FOUND` (RF-052, RF-053).
- **20 permissões novas**, entregues por migration ao administrador, ao operador de estoque, ao operador técnico e ao auditor, com `bootstrap_tenant_roles` atualizado e os tenants existentes atualizados de forma idempotente; o papel `driver` não recebe nenhuma. Detalhe em [contracts/permissoes-e-papeis.md](./contracts/permissoes-e-papeis.md).
- **Histórico em uma tabela de eventos imutável** (`registry_events`) para as cinco áreas, com `sequence` por entidade sob bloqueio da linha, gatilhos que recusam `update` e `delete` a qualquer papel e dados do fato sem CPF, CNH, telefone nem e-mail (decisão 6).
- **Cascata atômica** na inativação do cliente e da unidade, com prévia de quantidades e `CASCADE_CHANGED` quando algo muda entre a prévia e a confirmação; reativar nunca desce em cascata (decisão 7).
- **PostGIS**: `area` para índice e `center`+`radius_m` ou `vertices` para a decisão exata; validação do polígono em `geometry` antes de converter; borda conta como dentro; limites únicos em TS e SQL com teste de contrato (decisões 1 e 2).
- **CEP pelo servidor**, com porta de provedor, prazo de 4 s, dois baldes de limite (10/min por pessoa e 100/min por organização), só o CEP na URL, `complemento` do ViaCEP ignorado, falha nunca bloqueia o cadastro (decisão 5, [contracts/consulta-de-cep.md](./contracts/consulta-de-cep.md)).
- **Documentos e placa**: validação em domínio e no banco com a mesma tabela de casos; CNPJ numérico e alfanumérico por uma só função (valor = código ASCII − 48); correção por edição com justificativa e evento sem valor para CPF e CNH (decisão 3).
- **Vínculo motorista–usuário** só com usuário ativo da organização com o papel `driver`, sem conceder papel (decisão 8).
- **Situação de licenciamento e de CNH** calculadas por função única `validity-status` com o limite de 30 dias compartilhado com a Spec 006 e verificado por contrato (decisão 9).
- **Rotas**: a navegação continua por âncoras e `window.location.pathname`; um resolvedor `src/app/registry/registry-routes.ts` trata as sub-rotas e aplica a permissão da ação; todas as telas são `React.lazy` (RF-047).
- **Escritas exigem conexão**: sem conexão, o envio e a busca de CEP ficam desabilitados com o motivo; nada é enfileirado. Perda de conexão no meio do envio mostra "estado desconhecido" e permite repetir; a unicidade de documento e placa impede duplicata.
- **Visão geral intacta**: nenhum dado desta spec entra na fonte de exemplo da Spec 005 (RF-042).
- **Cache do service worker**: nenhuma regra nova; `/functions/v1` já é exceção e o teste de configuração continua reprovando `runtimeCaching` de dados (RF-046, CA-012).

## Estrutura do projeto

### Documentação (esta funcionalidade)

```text
specs/007-clientes-geocercas-frota/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── operacoes-servidor.md
│   ├── consulta-de-cep.md
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
│   ├── 20261007120000_registry_extensions.sql      # PostGIS
│   ├── 20261007120100_registry_schema.sql          # tabelas, índices, RLS, gatilhos, limites e validadores
│   ├── 20261007120200_registry_permissions.sql     # 20 permissões, papéis, bootstrap
│   ├── 20261007120300_registry_customers_write.sql # RPCs de cliente, contatos e unidade (US1)
│   ├── 20261007120400_registry_customers_read.sql  # consultas de clientes e unidades (US2)
│   ├── 20261007120500_registry_geofences.sql       # RPCs de geocercas e consulta espacial (US3)
│   ├── 20261007120600_registry_vehicles.sql        # RPCs de veículos (US4)
│   ├── 20261007120700_registry_drivers.sql         # RPCs de motoristas, vínculo e revelação (US5)
│   ├── 20261007120800_registry_inactivation.sql    # inativação e reativação, cascata e prévia (US6)
│   ├── 20261007120900_registry_history.sql         # consulta de histórico (US7)
│   └── 20261007121000_registry_anonymization.sql   # RPCs de anonimização e gatilhos de registro anonimizado (US8)
├── functions/
│   ├── _shared/operations.ts                    # borda genérica extraída (cylinders.ts reexporta)
│   ├── query-registry/{deno.json,handler.ts,index.ts}
│   ├── manage-registry/{deno.json,handler.ts,index.ts}
│   └── lookup-postal-code/{deno.json,handler.ts,provider.ts,viacep-provider.ts,index.ts}
└── tests/007_*.test.sql                         # pgTAP (inclui 007_anonymization, 007_documents_rls e 007_contacts_visibility)

src/
├── domain/registry/
│   ├── document-validation.ts     # CPF, CNPJ (numérico e alfanumérico), CNH
│   ├── masks.ts                   # máscaras de CPF e CNH, CNPJ completo
│   ├── plate.ts                   # normalização e padrões antigo e Mercosul
│   ├── phone-and-postal-code.ts   # telefone e CEP
│   ├── geofence-limits.ts         # limites únicos de raio e de vértices
│   ├── geofence-geometry.ts       # validação de círculo e polígono, cruzamento, área
│   ├── registry-vocabulary.ts     # situações, segmentos, tipos, categorias, eventos
│   ├── registry-validation.ts     # regras dos formulários (zod)
│   └── *.test.ts
├── domain/shared/validity-status.ts   # em dia, a vencer, vencido, sem data; EXPIRING_DAYS = 30
├── application/registry/
│   ├── registry-service.ts        # consultas e comandos sobre o transporte de funções
│   ├── postal-code-service.ts     # busca de CEP e seus estados
│   └── *.test.ts
├── app/registry/registry-routes.ts                # resolve as rotas e a permissão da ação
├── pages/registry/
│   ├── customers/{customer-list-page,customer-form-page,customer-detail-page,site-form-page,site-detail-page}.tsx
│   ├── geofences/{geofence-list-page,geofence-form-page,geofence-detail-page}.tsx
│   ├── vehicles/{vehicle-list-page,vehicle-form-page,vehicle-detail-page}.tsx
│   ├── drivers/{driver-list-page,driver-form-page,driver-detail-page}.tsx
│   ├── components/{document-field,postal-code-field,status-badge,reveal-document,contact-list-editor,
│   │               receiving-window-field,geofence-shape-editor,geofence-preview,point-tester,
│   │               cascade-confirm-dialog,anonymize-dialog,registry-history}.tsx
│   └── *.test.tsx
└── domain/navigation/screens.ts                   # + Clientes, Geocercas, Veículos e Motoristas

tests/
├── contract/{registry-permissions,registry-no-delete,registry-limits,registry-no-sensitive-output,postal-code-egress,registry-handlers}.test.ts
│            {registry-anonymization-leak,registry-volume,registry-concurrency}.live.test.ts
├── e2e/{registro-clientes,registro-geocercas,registro-frota}.spec.ts (+ support/mock-registry.ts, visual/registro.visual.spec.ts)
└── support/sql/registry-volume-{semear,limpar}.sql
```

**Decisão de estrutura**: projeto único e camadas existentes (`domain/`, `application/`, `app/`, `pages/`, `design-system/`); migrations e Edge Functions no padrão das Specs 002 e 006. Nenhum pacote novo no cliente. A extração da borda genérica das funções (`_shared/operations.ts`) é refatoração sem mudança de comportamento, coberta pelos testes atuais das funções de cilindros.

## Estratégia de testes (TDD)

Resumo; a lista completa e os arquivos estão em [contracts/verificacoes-automaticas.md](./contracts/verificacoes-automaticas.md).

1. **pgTAP, RLS com dois tenants (RF-048, CA-001)** para cada tabela, inclusive documentos (sem leitura direta por ninguém) e consulta espacial.
2. **pgTAP, regras**: unicidade de documento, placa, CPF, CNH e vínculo; limites de geocerca nos valores de borda (24, 25, 5000, 5001 m e 2, 3, 100, 101 vértices); polígono inválido; ponto dentro, fora e na borda; situação do licenciamento e da CNH nos limites de data; cascata e sua atomicidade.
3. **pgTAP, imutabilidade, exclusão e auditoria** (CA-002 a CA-004): `update` e `delete` recusados a todo papel, **exceto** a substituição de contatos dentro de `update_customer`; uma asserção por ação sensível; nenhum documento, nome, telefone nem e-mail de pessoa física em `audit_logs` nem em `registry_events`.
4. **Domínio (Vitest)**: validadores com a mesma tabela de casos do SQL, incluindo o CNPJ alfanumérico oficial `12.ABC.345/01DE-35` e valores fictícios gerados pela suíte.
5. **Função de CEP**: porta falsa do provedor para encontrado, inexistente, indisponível, tempo esgotado, JSON inválido e resposta suspeita; limites por pessoa e por organização; **captura da requisição de saída** (CA-006).
6. **Páginas e serviço**: estados do campo de CEP, foco em "Número", revelação e ocultação, diálogo de cascata, polígono só por teclado.
7. **Contrato**: permissões iguais em migration, catálogo, rotas e manipuladores; limites iguais em TS e SQL; nenhuma exclusão exposta; nenhuma saída com documento (CA-005).
8. **E2E com backend simulado** nas três larguras, axe, teclado, offline e provedor de CEP simulado; **suíte `.live`** para concorrência (documento, placa, CPF, edição e inativação) e desempenho com o volume de referência; **visual** só no Linux; **pacote** medido antes e depois.
9. **Anonimização (RF-054 a RF-063, CA-015 a CA-017)**: pgTAP para o efeito de cada operação, as pré-condições (registro inativo), a permissão crítica, a atomicidade, a contagem de linhas igual antes e depois, a liberação do CPF e da CNH e o bloqueio por gatilho do registro anonimizado; manipulador para `MFA_REQUIRED` e `CONFIRMATION_REQUIRED`; teste `.live` que cadastra, edita, anonimiza e procura todos os valores antigos em tabelas, eventos, auditoria e respostas; componente e E2E do diálogo.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| **Vazamento de CPF e CNH** por tabela legível, log, evento, auditoria, mensagem de erro ou cache | Tabelas de documentos sem política e sem privilégio; só campos mascarados nas listas; revelação com permissão própria e auditoria sem valor; `Cache-Control: no-store`; manipuladores sem log de corpo; teste de contrato que procura valores conhecidos em todas as saídas (CA-005) |
| **Documento completo em coluna de texto** (sem criptografia por coluna) | Aceito e registrado: RLS, privilégios e criptografia em repouso da plataforma; `pgsodium`/Vault avaliados e adiados por exigirem gestão de chaves ainda inexistente; reavaliar na Fase 5, antes de dados de campo |
| **Dependência do ViaCEP**, serviço público sem garantia de disponibilidade e que já mudou o formato de `erro` | Porta de provedor substituível; adaptador aceita `true` e `"true"`; qualquer falha leva à digitação manual; sem nova tentativa automática; prazo de 4 s; CI usa provedor falso, nunca o real |
| **Abuso da consulta de CEP** (banimento do FluxID pelo provedor) | 10/min por pessoa e 100/min por organização com `take_rate_limit_token`; só autenticados com `customer.write`; CEP validado antes de chamar |
| **Vazamento do CEP junto de dados da pessoa** | A chamada sai do servidor só com o CEP no caminho; sem cookies nem identificação; log sem CEP; teste de captura de saída |
| **Geocerca incorreta** (cruzamento, orientação, aproximação do círculo, `geography` em polígonos grandes) | Validação em `geometry` antes de converter; decisão exata do círculo por distância; testes nos dois sentidos e na borda; limite de 5 km; pré-visualização para a pessoa conferir |
| **"Ponto dentro" lento** | GiST em `area`, pré-filtro por caixa e teste exato só nos candidatos; meta de 200 ms medida com 50 mil geocercas; plano de execução conferido |
| **Cascata deixar estado pela metade** | Transação única com bloqueio em ordem estável; teste de falha injetada; `expected_counts` e `CASCADE_CHANGED` |
| **Corrida em unicidade** (documento, placa, CPF, CNH) | Índices únicos + bloqueio consultivo por valor normalizado; teste `.live` com duas sessões |
| **Existência de registro de outra organização revelada** | Resposta única `NOT_FOUND`; erro de vínculo `USER_NOT_ELIGIBLE` sem dizer se o usuário existe noutra organização; teste compara respostas |
| **Divergência entre validação no cliente e no banco** | Mesma tabela de casos e limites únicos com teste de contrato |
| **Pedido de eliminação de dados pessoais (LGPD, art. 18)** | Atendido por anonimização irreversível dentro desta spec (RF-054 a RF-063, História 8): permissão crítica, MFA, justificativa e confirmação; histórico sem valores pessoais; teste que procura os valores antigos em todas as saídas depois de anonimizar (CA-015) |
| **Anonimização não alcançar cópias de segurança e logs da plataforma** | Declarado e documentado (RF-063, premissa 14): seguem a retenção da plataforma; a pessoa responsável e a equipe jurídica confirmam; endereço e geocerca de pessoa física ficam como decisão aberta |
| **Anonimização feita por engano ou sem autorização** | Só administrador do tenant, MFA, registro inativo, motivo, justificativa e confirmação digitada; diálogo mostra o que será removido; auditoria do ato; atômica e idempotente |
| **Contatos do cliente (telefone e e-mail) legíveis por todo papel de leitura** | `get_customer` só devolve telefone e e-mail a quem tem `customer.write` (RF-003); teste de papel por operação |
| **Dado de teste ser documento real** | Todos os documentos de teste são fictícios e gerados pela suíte; revisão no gate de IA |
| **Pacote de entrada crescer** | Telas, serviço e geometria em chunks `React.lazy`; só 4 itens entram no catálogo de entrada; folga atual de 14,41 kB e medição antes e depois |
| **Regressão do menu por permissão (Spec 004)** | Só quatro entradas novas; testes da Spec 004 permanecem; nenhuma regra de visibilidade alterada |
| **Capturas variarem por sistema** | Geradas e comparadas só no Linux; nunca versionar `*-win32.png` |
| **Refatoração da borda das funções quebrar cilindros** | Extração sem mudança de comportamento, coberta pelos testes de manipulador e pela suíte `.live` da Spec 006 |

## Complexidade

Sem violações da constituição. As decisões que mais se afastam do padrão anterior estão justificadas em `research.md`: PostGIS (geografia), tabelas de documentos sem política de leitura, tabela de eventos única para cinco áreas e Edge Function separada para a consulta externa de CEP.

## Rastreabilidade

| Item | Valor |
|---|---|
| Issue | [#21 — Spec 007: clientes, unidades, geocercas, veículos e motoristas](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/21) (constar na descrição do pull request e no RIA de encerramento, princípio VI da constituição) |
| Branch | `feat/007-clientes-geocercas-frota` |
| Pull request | a abrir ao fim do ciclo |
| RIA | gerado no gate de encerramento, depois da validação humana por entrevista |
