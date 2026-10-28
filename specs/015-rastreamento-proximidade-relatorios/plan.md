# Plano de implementação: Rastreamento, proximidade e relatórios

**Feature**: `015-rastreamento-proximidade-relatorios` | **Data**: 22/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/015-rastreamento-proximidade-relatorios/spec.md`.

## Resumo

Entregar o acompanhamento de viagens no mapa e em lista acessível, coleta de posição do celular do motorista, avaliação auditável de proximidade com os lacres, histórico, tratamento de ocorrências, seis relatórios operacionais com exportação CSV e avisos opcionais por e-mail.

A solução reaproveita posições, alertas, Broadcast privado, outbox e auditoria da Spec 012. Acrescenta uma camada nativa Android encapsulada por Capacitor para o serviço em primeiro plano; no navegador/PWA, onde a plataforma não garante geolocalização em segundo plano, a coleta funciona somente enquanto o documento está visível e assume estado degradado ao perder essa capacidade. As regras ficam em domínio TypeScript e funções PostgreSQL, nunca nos componentes React.

## Rastreabilidade

- **Issue**: [#58](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/58).
- **Branch**: `feature/015-rastreamento-proximidade-relatorios`.
- **Pull request**: a abrir no fechamento, após testes, convergência, validação humana e RIA.

## Contexto técnico

**Linguagem/versão**: TypeScript 7/6 compatível sobre Node.js 24; React 19; Java/Kotlin e Android SDK para a casca Capacitor; SQL no PostgreSQL 17 do Supabase; Edge Functions em Deno.

**Dependências principais**: Vite 8, Tailwind CSS 4, `@supabase/supabase-js` 2.117, Supabase CLI 2.117, Leaflet 1.9, Zod 4, Capacitor 8 e APIs nativas Android. O provedor de e-mail permanece atrás de uma porta de servidor configurável; a escolha e contratação do provedor não fazem parte desta spec.

**Armazenamento**: PostgreSQL/PostGIS com RLS para regras, sessões, posições, comparações, ocorrências, exportações e preferências; IndexedDB para a fila móvel vinculada a conta, organização, endpoint e viagem; Storage privado para CSV concluído e temporário.

**Testes**:

- Vitest para domínio, aplicação, serialização CSV segura, fila IndexedDB e componentes;
- pgTAP para funções, constraints, paginação, idempotência, autorização e RLS com dois tenants;
- testes Android instrumentados para permissão, notificação persistente, ciclo do serviço e pausa após 8 horas;
- testes `.live` para RPC, Broadcast, Storage assinado e Edge Functions;
- Playwright em 360, 768 e 1920 px, teclado, leitor semântico, axe, estados offline/degradado e capturas visuais no Linux;
- cenários de carga para 10.000 linhas, 480 posições offline e atualização em até 10 segundos.

**Plataforma alvo**: PWA em navegadores modernos; Android 10 ou superior para coleta confiável em segundo plano; Supabase cloud, LAN e local segundo a política de conectividade. iOS e web continuam utilizáveis em modo visível/degradado nesta entrega.

**Tipo de projeto**: aplicação web/PWA com casca móvel Android e backend Supabase.

**Metas de desempenho**: atualização visível em até 10 s para 95% dos eventos recebidos; consulta/preparação de até 10.000 registros em até 30 s para 95% das solicitações; paginação por cursor estável; coleta nominal a cada 60 s sem prometer precisão temporal impossível à plataforma.

**Restrições**: uma única conexão Supabase ativa; sem fallback em erro de autenticação/RLS; sem `service_role` no cliente; localização é dado sensível; nenhuma coordenada em e-mail, Broadcast, auditoria ou log; fila mínima de 480 posições; exportação neutraliza fórmulas; mapa nunca é a única representação; somente tokens visuais existentes.

**Escala/escopo**: viagens ativas com um celular e vários lacres; seis tipos de relatório; exportação sempre por job, com meta de 30 s até 10.000 linhas; uma regra de proximidade vigente por organização em cada instante.

## Verificação da constituição

| Princípio | Como o plano atende |
|---|---|
| I. Especificação antes do código | spec esclarecida, requisitos testáveis e checklist completo |
| II. TDD | domínio, SQL/RLS, sincronização, Android e UI começam por testes RED |
| III. Multitenancy e segurança | todas as entidades têm `organization_id`; funções conferem ator/sessão; RLS é testada com dois tenants; ações sensíveis e exportações são auditadas; coordenadas são minimizadas |
| IV. Estados explícitos | coleta, sessão, qualidade, comparação, ocorrência, exportação e entrega de e-mail têm máquinas de estado separadas |
| V. Experiência e acessibilidade | identidade das Specs 003/005, mapa mais lista equivalente, estados completos, 360 px a desktop, WCAG 2.2 AA e modo degradado honesto |
| VI. Rastreabilidade | branch criada; issue e PR ficam como gates; RIA somente no encerramento |
| VII. Qualidade verificável | cobertura exigida, dois tenants, testes nativos, integração, E2E, acessibilidade, PWA, desempenho e validação humana |
| VIII. Documentação viva | spec, plano, pesquisa, modelo, contratos, quickstart e documentação operacional evoluem no mesmo PR |

**Resultado do gate pré-desenho**: aprovado, sem violação constitucional.

## Desenho técnico

1. **Coleta móvel**: um adaptador `LocationTrackingPort` separa domínio e plataforma. Android usa plugin Capacitor próprio e serviço em primeiro plano com notificação persistente; no Android 13+, solicita `POST_NOTIFICATIONS` no contexto da viagem e trata a recusa como visibilidade reduzida/degradada, sem bloquear a viagem. A web usa `watchPosition` apenas com a página visível. O domínio encerra/pausa a sessão e expõe o motivo degradado.
2. **Fila e sincronização**: cada posição recebe UUID no aparelho e número sequencial por sessão. IndexedDB guarda até a confirmação do servidor. O envio em lotes usa `ON CONFLICT` pela chave do cliente, valida conta/organização/viagem/endpoint de origem e preserva `observed_at`; troca de contexto nunca redireciona itens. Como nas Specs anteriores, o cliente nunca chama RPC diretamente: as Edge Functions `query-tracking` (consultas e regra vigente) e `manage-tracking` (sessão, ingestão `ingest_driver_positions`, regra e ocorrências) validam o envelope com `_shared/operations.ts` e chamam RPCs que recebem `p_actor`/`p_session`, executáveis somente por `service_role`.
3. **Proximidade**: a transação de ingestão associa posições por contexto e tempo, valida idade/precisão, calcula distância geodésica no PostGIS e grava toda comparação. Uma máquina de estado incrementa ou reinicia a sequência; três resultados `outside` confirmam uma ocorrência. Inconclusivos não alteram a sequência. Uma leitura presencial válida gera evidência pontual própria, sem fabricar posição contínua. A entrega encerra o par do cilindro na mesma transação do evento operacional e mantém a geocerca de destino da Spec 012.
4. **Tempo real**: gatilhos enviam apenas invalidação sanitizada ao canal privado `tracking:<organization_id>` por Supabase Broadcast; o cliente refaz a consulta autorizada. Polling de 30 s continua como recuperação, sem alterar o schema interno do Realtime.
5. **Histórico e relatórios**: RPCs retornam projeções paginadas por `(occurred_at, id)` e filtros validados. A mesma consulta canônica fornece resumo, linhas e snapshot de exportação. Lacunas viram itens explícitos e segmentos de mapa separados.
6. **Exportação**: toda exportação cria um job; o worker o processa imediatamente após a criação, materializa CSV UTF-8 seguro, e recortes de até 10.000 linhas devem chegar a `ready` em até 30 s (CS-006). A interface sempre acompanha o estado do job. Solicitação, claim/processamento, consulta de estado e download revalidam `report.export` e a permissão de consulta correspondente ao tipo do relatório. O arquivo só é publicado após completo, em bucket privado, com expiração e URL curta emitida após nova autorização.
7. **E-mail**: categorias liberadas pela organização e adesões individuais começam desativadas. `proximity_confirmed` exige `tracking.read`; `seal_high_critical` e `seal_recovered` exigem `seal.read`. Um outbox deduplicado por ocorrência/transição/destinatário alimenta uma Edge Function curta e idempotente. O adaptador do provedor recebe somente conteúdo mínimo e segredos do ambiente de servidor.
8. **Interface**: gestor vê mapa full-width sincronizado com lista/timeline; filtros vivem na URL. Motorista vê permissão, coleta ativa, janela offline, quantidade pendente e recuperação. Atualizações preservam foco e seleção e são anunciadas somente quando relevantes.

## Estrutura do projeto

### Documentação desta feature

```text
specs/015-rastreamento-proximidade-relatorios/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rastreamento-e-sincronizacao.md
│   ├── consultas-relatorios-exportacoes.md
│   └── avisos-email.md
├── checklists/requirements.md
└── tasks.md                         # gerado por /speckit-tasks
```

### Código previsto

```text
android/app/src/main/                 # serviço foreground e plugin Capacitor próprios
capacitor.config.ts                   # casca Android; webDir continua dist

src/
├── domain/tracking/                  # validade, proximidade, lacunas e estados
├── application/tracking/             # portas, casos de uso, views e Broadcast
├── infrastructure/tracking/          # IndexedDB, geolocalização web/nativa e sync
├── application/reports/              # filtros, projeções, CSV e exportações
├── pages/tracking/                    # acompanhamento, histórico e motorista
├── pages/reports/                     # consulta e exportação
├── pages/settings/                    # regra de proximidade e preferências de avisos
└── components/maps/                   # extensão do mapa existente; lista equivalente

supabase/
├── migrations/20261022*.sql          # schema, permissões, RLS, RPCs, gatilhos e Storage
├── functions/query-tracking/          # consultas de acompanhamento, histórico, ocorrência e regra
├── functions/manage-tracking/         # sessão, ingestão em lote, regra e tratamento de ocorrência
├── functions/report-export/           # materialização/obtenção autorizada
├── functions/email-notifications/     # consumo idempotente do outbox
└── tests/015_*.test.sql

tests/
├── contract/tracking-*.test.ts
├── integration/tracking-*.live.test.ts
└── e2e/tracking-*.spec.ts
```

**Decisão de estrutura**: preservar a arquitetura atual de domínio/aplicação/infraestrutura/páginas e o backend Supabase; adicionar `android/` somente para a capacidade que o navegador não oferece. O plugin nativo implementa uma porta e não contém regra de proximidade.

## Estratégia TDD e ordem de implementação

1. RED/GREEN/REFACTOR do domínio: validade temporal, distância, sequência de três, retrospectividade e segmentação por lacunas.
2. RED/GREEN/REFACTOR do banco: schema, constraints, índices, RLS de dois tenants, permissões e funções transacionais.
3. RED/GREEN/REFACTOR da fila móvel e ingestão idempotente; depois adaptadores web e Android.
4. RED/GREEN/REFACTOR das consultas, paginação, relatórios, CSV e jobs.
5. RED/GREEN/REFACTOR do outbox e adaptador de e-mail.
6. Componentes e jornadas por história, sempre com testes de interação/acessibilidade antes da composição visual.
7. Integração, carga, E2E, capturas Linux, convergência e validação humana pelo `quickstart.md`.

## Verificação pós-desenho

O modelo de dados, os contratos e o quickstart mantêm domínio fora do React, isolamento por organização, autorização no servidor, auditoria sanitizada, estados explícitos e equivalência textual do mapa. A adição da casca Android é a menor extensão que satisfaz a coleta real em segundo plano; o PWA permanece instalável e funcional. **Gate aprovado, sem exceção constitucional.**

## Complexidade a acompanhar

| Ponto | Por que é necessário | Alternativa mais simples rejeitada |
|---|---|---|
| Casca Android/serviço em primeiro plano | navegadores suspendem geolocalização de documentos ocultos e não cumprem a coleta contínua acordada | prometer segundo plano apenas com PWA criaria perda silenciosa de evidência |
| Comparações persistidas | preservam regra, evidências e decisão histórica sem recalcular o passado | calcular somente na consulta apagaria a trilha que confirmou a ocorrência |
| Snapshot de exportação | garante que resumo, linhas e arquivo tenham o mesmo recorte autorizado | repetir consultas mutáveis pode produzir totais divergentes |
| Outbox de e-mail | desacopla falha externa do alerta e fornece deduplicação/retry | enviar dentro da transação aumentaria latência e poderia desfazer o evento original |
