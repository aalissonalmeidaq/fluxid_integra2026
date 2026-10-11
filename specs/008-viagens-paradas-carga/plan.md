# Plano de implementação: Viagens, paradas, carga e entrega

**Feature**: `008-viagens-paradas-carga` | **Data**: 08/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/008-viagens-paradas-carga/spec.md` (3 decisões na seção Clarifications: bloqueio lógico com comando à trava na Fase 6, entrega por parada inteira e teste vencido ou reprovado sem exceção)

## Resumo

Criar a **viagem** da Fase 4 do PRD: planejamento com veículo, motorista, paradas ordenadas e cilindros por parada; conferência do carregamento; início com bloqueio lógico; entrega ou divergência por parada; desbloqueio como registro próprio; conclusão e cancelamento. É a primeira spec que **muda o estado de cilindros por causa de outro cadastro** e a primeira que cruza as Specs 006 (cilindros e custódia) e 007 (clientes, unidades, geocercas, veículos, motoristas).

A abordagem repete o que as Specs 002, 006 e 007 já provaram e acrescenta quatro peças novas:

- **Servidor (padrão herdado)**: tabelas com `organization_id` e RLS sem política de escrita; toda escrita e toda leitura passam por RPC `security definer` com ator e sessão do token, conferência por `private.actor_has_permission`, evento e auditoria na mesma transação, `grant` só a `service_role`, versão otimista, sem exclusão física. Duas Edge Functions novas, `query-trips` (leitura) e `manage-trips` (comandos), no molde de `query-registry` e `manage-registry` e com o catálogo de operações de `_shared/operations.ts`.
- **Peça nova 1, reserva atômica de cilindro**: um índice único parcial garante um cilindro em no máximo um item de carga **aberto**; a RPC trava as linhas dos cilindros em ordem fixa para duas gravações concorrentes nunca se bloquearem em ciclo, e a perdedora recebe a viagem que reservou o cilindro.
- **Peça nova 2, máquina de estados no banco**: situações da viagem, da parada, do item de carga e do bloqueio são colunas independentes, e cada transição é uma função que confere o estado de origem sob `for update`; nenhuma outra é aceita, nem por pedido direto (CA-003).
- **Peça nova 3, custódia do cilindro**: duas colunas novas em `cylinders` (`custody_status` e `custody_site_id`) e cinco tipos novos de evento em `cylinder_events` ligam a viagem ao histórico imutável da Spec 006; a saída do estoque reaproveita `stock_status`.
- **Peça nova 4, idempotência de comando**: todo comando leva um `request_id`; a repetição devolve o resultado gravado, sem duplicar nada. É a base que a Fase 5 usará para reenviar da fila offline.
- **Cliente (padrão herdado)**: camadas `domain/` (regras puras: transições, capacidade, elegibilidade, resumo da viagem), `application/` (serviço sobre o transporte de funções) e `pages/` (telas `React.lazy` e modais), sem regra de domínio em componente.
- **Interface**: uma entrada nova no menu, "Viagens"; lista em tabela a partir de 768 px e cartões abaixo; detalhe com abas de paradas, carga e histórico; formulários em modal como na Spec 007; padrão visual da Spec 005, com a skill `ui-ux-pro-max`.

Fica de fora, por decisão da spec: aplicativo de campo, leitura por câmera ou NFC, GPS, fotos, assinatura e fila offline (Fase 5); comandos e telemetria à trava do lacre (Fase 6); proximidade, alertas e relatórios (Fase 7); recolhimento de vazios do cliente; otimização de rota; importação em massa.

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; React 19.3.0; Tailwind CSS 4.3.3; SQL (PostgreSQL 17 do Supabase) e Edge Functions em Deno, como nas specs anteriores

**Dependências principais**: as já existentes (`zod` para formulários e corpos de requisição). **Nenhuma dependência nova**, nem no cliente nem no banco: a consulta de geocerca é a da Spec 007 (PostGIS já habilitado)

**Armazenamento**: 6 tabelas novas em `public` (`trips`, `trip_stops`, `trip_items`, `trip_deliveries`, `trip_unlocks`, `trip_events`), 2 em `private` (`trip_counters`, `trip_requests`), todas com `organization_id` e RLS e sem exclusão; 2 colunas novas em `cylinders` e 5 tipos novos de evento em `cylinder_events`

**Testes**: pgTAP em `supabase/tests/008_*.test.sql` (RLS com dois tenants, transições, concorrência de reserva, imutabilidade, permissões, MFA, idempotência); Vitest para domínio, serviço, manipuladores das funções e páginas; testes de contrato (permissões, nenhuma exclusão, nenhum nome de recebedor em log, catálogo de operações); suíte `.live` contra o Supabase local; E2E em três larguras com backend simulado; capturas visuais no Linux

**Plataforma alvo**: navegadores modernos, PWA responsiva de 360 px a desktop amplo, retrato e paisagem

**Tipo de projeto**: aplicação web cliente única + migrations e Edge Functions do Supabase

**Metas de desempenho**: lista de viagens em até 2 s (p95) e detalhe em até 1,5 s (p95) com 10 mil viagens e 200 mil itens de carga em 4G (RNF-001); reserva concorrente sem duplicidade em 100% dos testes (RNF-002)

**Restrições**: WCAG 2.2 AA; só tokens, componentes, ícones e fonte da Spec 003; escritas exigem conexão e nunca são enfileiradas (a fila é da Fase 5); organização ativa vem do servidor; nenhuma credencial privilegiada no cliente; nome do recebedor só por RPC e a quem tem `trip.recipient`; nenhum comando a dispositivo

**Escala/escopo**: 8 tabelas, 8 permissões, 1 papel novo, 2 Edge Functions, 21 operações de servidor (7 de consulta e 14 de comando), 1 item de menu, 4 rotas, 9 migrations, 3 larguras de referência

## Verificação da constituição

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| I Especificação antes do código | spec esclarecida, plano e tarefas antes de qualquer código | Aprovado |
| II TDD obrigatório | cada tarefa começa pelo teste (pgTAP, Vitest, contrato); transições, reserva e elegibilidade nascem testadas | Aprovado |
| III Multitenancy e segurança | `organization_id` e RLS em toda tabela, chaves estrangeiras compostas por organização, testes com dois tenants, exceção e desbloqueio excepcional com permissão crítica, `aal2` e auditoria | Aprovado |
| IV Estados explícitos | viagem, parada, item, bloqueio, estoque e custódia são colunas independentes; o bloqueio é lógico e não presume comando executado | Aprovado |
| V Experiência e acessibilidade | componentes do design system, WCAG 2.2 AA, 360 px a desktop, estados de carregamento, vazio, erro e offline | Aprovado |
| VI Rastreabilidade | branch `feat/008-viagens-paradas-carga`, PR, RIA ao fim do ciclo | Aprovado |

Sem violações a justificar. Reavaliação depois do desenho (data-model e contratos): **mantida**.

## Rastreabilidade

| Item | Valor |
|---|---|
| Issue | [#27 — Spec 008: viagens, paradas, carga e entrega](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/27) (constar na descrição do pull request e no RIA de encerramento, princípio VI da constituição) |
| Branch | `feat/008-viagens-paradas-carga` |
| Pull request | a abrir ao fim do ciclo |
| RIA | gerado no gate de encerramento, depois da validação humana por entrevista |

## Estrutura do projeto

### Documentação (esta feature)

```text
specs/008-viagens-paradas-carga/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── contracts/
    ├── operacoes-servidor.md
    ├── permissoes-e-papeis.md
    ├── telas-e-rotas.md
    └── verificacoes-automaticas.md
```

### Código-fonte (raiz do repositório)

```text
supabase/
├── migrations/2026101xxxxxxx_trips_*.sql     # 9 migrations (schema, permissões, guardas da Spec 006, planejamento, carregamento e início, entrega, desbloqueio, encerramento, histórico)
├── functions/query-trips/                    # leitura
├── functions/manage-trips/                   # comandos
├── functions/_shared/operations.ts           # catálogo de operações ganha as de viagem
└── tests/008_*.test.sql                      # pgTAP
src/
├── domain/trips/                             # transições, capacidade, elegibilidade, resumo, validações
├── application/trips/                        # serviço e visões de leitura
├── app/trips/                                # rotas e navegação
└── pages/trips/                              # trips-area (React.lazy), lista, detalhe, formulário, conferência, entrega, desbloqueio
tests/
├── contract/                                 # permissões, imutabilidade, sem exclusão, sem nome em log
├── integration/*.live.test.ts                # suíte contra o Supabase local
└── e2e/                                      # viagens em três larguras e capturas visuais
```

**Decisão de estrutura**: a viagem ganha módulos próprios (`domain/trips`, `application/trips`, `pages/trips`, `functions/*-trips`) em vez de entrar em `registry`, porque tem ciclo de vida, permissões e histórico próprios e porque a Fase 5 vai reaproveitar exatamente este serviço.

## Riscos e tratamento

| Risco | Tratamento |
|---|---|
| Reserva duplicada de cilindro sob concorrência | índice único parcial + trava das linhas dos cilindros em ordem fixa + teste de concorrência com duas conexões (RNF-002, CA-002) |
| Deadlock entre viagens que reservam os mesmos cilindros | ordenar por `cylinder_id` antes de travar |
| Cilindro, veículo, motorista ou cliente inativado depois do planejamento | revalidar tudo no início; a tela avisa e o servidor recusa (spec, casos de borda) |
| Viagem cancelada em andamento deixa cilindro em trânsito | o item continua aberto até um registro de retorno ao estoque ou de entrega tardia, nunca some sozinho |
| Nome do recebedor vazar em log ou auditoria | coluna só em `trip_deliveries`, nunca em evento nem auditoria (o evento guarda só `has_recipient`), teste de contrato varre logs e auditoria |
| Estado do bloqueio ser lido como "trava acionada" | o rótulo da tela é "bloqueado (lógico)" e a Fase 6 acrescenta "confirmado pela trava" sem mudar o modelo |
| Entrada no estoque ou inativação (Spec 006) de cilindro em viagem aberta | as duas RPCs da Spec 006 passam a consultar `trip_items` aberto e recusam com `CYLINDER_IN_TRIP` (RF-024a), com testes nas suítes `006_*` e `008_cylinder_in_trip` |
| Pedido repetido por duplo clique ou queda de rede | `request_id` obrigatório e tabela de pedidos; tela mostra "resultado desconhecido" e a repetição não duplica |
