# Pesquisa e decisões: Cilindros, identificadores, estoque e histórico

**Feature**: `006-cilindros-e-estoque` | **Data**: 05/10/2026

Não restou nenhum item "NEEDS CLARIFICATION": as dúvidas de produto foram resolvidas em `/speckit-clarify`. Aqui ficam as decisões técnicas, com alternativas.

## 1. Caminho de acesso a dados: RPC com ator e sessão

- **Decisão**: o cliente não acessa tabelas. Toda consulta e todo comando vão pelas Edge Functions `query-cylinders` e `manage-cylinders`, que chamam RPCs `security definer` com `p_actor`, `p_session` e `p_organization`. As RPCs conferem sessão, vínculo, organização, papel e permissão com `private.actor_has_permission`. As tabelas têm RLS de `select` por membro com `cylinder.read` como segunda barreira.
- **Motivo**: é o padrão já aprovado e testado na Spec 002 (`query_audit_events`, `list_tenant_members`, `change_tenant_membership_status`); a auditoria e o histórico entram na mesma transação do comando; a chave de serviço não sai do servidor (RF-041).
- **Alternativas**: (a) PostgREST direto com políticas de `insert/update` por permissão: menos código, mas a auditoria e o evento de histórico não ficariam na mesma transação sem gatilhos complexos, e o cliente teria superfície de escrita nas tabelas; (b) RPC chamada direto pelo cliente com `auth.uid()`: o projeto já decidiu por sessão governada (`user_sessions`) em vez de apenas o JWT, então não serve.

## 2. Duas Edge Functions: consulta e comando

- **Decisão**: `query-cylinders` (somente leitura, sem auditoria, como `query-permissions`) e `manage-cylinders` (escrita, auditada, exige conexão e MFA conforme o caso).
- **Motivo**: separa o que audita do que não audita e simplifica a lista de operações permitidas de cada função.
- **Alternativa**: uma só função com `operation`; rejeitada por misturar dois perfis de falha e de auditoria.

## 3. Permissões e papéis

- **Decisão**: sete permissões de escopo `tenant`, delegáveis, não críticas (`cylinder.read`, `cylinder.write`, `cylinder.deactivate`, `cylinder.identifier`, `cylinder.stock_in`, `cylinder.test`, `cylinder.history`). `bootstrap_tenant_roles` cria o papel padrão novo `tenant_auditor` e concede as permissões aos papéis padrão; um bloco idempotente atualiza os tenants existentes.
- **Mapeamento** (RF-039): administrador do tenant = todas; Operador de estoque (`stock_operator`) = `read`, `write`, `stock_in`, `history`; Operador técnico (`technical_operator`) = `read`, `identifier`, `test`, `history`; auditor (`tenant_auditor`) = `read`, `history`. As descrições antigas ("Acesso somente ao próprio perfil nesta Spec") são atualizadas.
- **Observação**: a spec chama os papéis de "estoquista" e "técnico"; no banco, os papéis já existem como `stock_operator` ("Operador de estoque") e `technical_operator` ("Operador técnico"). O plano mantém os códigos existentes para não quebrar nada; a tela usa os nomes do banco.
- **Administrador FluxID**: não tem vínculo de tenant, então `actor_has_permission` o nega por construção. Ele só acessa dados quando tiver vínculo ativo com a organização ativa e o papel certo (spec, atores).
- **Alternativas**: reaproveitar `tenant.manage` para tudo (descartado: perderia a separação entre estoquista, técnico e auditor).

## 4. Modelo de dados e imutabilidade

- **Decisão**: cinco tabelas (ver `data-model.md`). `cylinder_events` e `cylinder_tests` são somente de inserção (gatilhos `before update or delete` recusam todos os papéis). `cylinders`, `cylinder_types` e `cylinder_identifiers` recusam `delete`; `cylinder_identifiers` aceita uma única transição `active → deactivated`.
- **Ordem do histórico**: `sequence integer` por cilindro, atribuída depois de `select ... for update` na linha do cilindro, com `unique (cylinder_id, sequence)`. Ordenar por `sequence` dá ordem determinística (RF-025) mesmo para eventos no mesmo instante e não depende de relógio.
- **Alternativas**: identidade global (`bigint generated always as identity`) como desempate: ordem estável, mas com lacunas e sem relação direta com o cilindro; `occurred_at` sozinho: instável. O `occurred_at` fica como informação, nunca como critério de ordem.

## 5. Unicidade de série e de identificador

- **Série**: `serial_normalized = upper(btrim(serial_number))`; índice único em (`organization_id`, `serial_normalized`) entre ativos e inativos (RF-002).
- **Identificador**: `value_normalized = upper(btrim(value))`, sem diferença de tipo na unicidade (a busca do campo único de entrada não conhece o tipo, RF-012). Índice único **parcial** em (`organization_id`, `value_normalized`) onde `status = 'active'` (RF-008).
- **Valor desativado (RF-011)**: `add_identifier` recusa um valor que já exista em qualquer linha da organização (`IDENTIFIER_UNAVAILABLE`, com a dica de usar a transferência). `transfer_identifier` aceita apenas valor cujas linhas estejam todas desativadas; cria uma nova linha ativa no cilindro de destino (pode ser o próprio cilindro de origem), mantém a linha antiga desativada com `transferred_to_identifier_id` e grava eventos nos cilindros de origem e de destino, com confirmação e justificativa, em uma única transação.
- **Corrida**: `pg_advisory_xact_lock(hashtextextended(organization_id || ':' || value_normalized, 0))` antes de checar, mais o índice como barreira final. Conflito devolve mensagem com o cilindro dono (dentro da mesma organização, como pede a história 1).
- **Cilindro inativo**: seus identificadores **continuam ativos e reservados** (decisão de `/speckit-clarify`). Acrescentar identificador a cilindro inativo é recusado; desativar identificador de cilindro inativo é permitido (é o caminho para liberá-lo por transferência).

## 6. Idempotência da entrada

- **Decisão**: `private.claim_idempotency_key(organization, key, actor, 'cylinder.stock_in', hash)` na RPC. O `request_hash` é o SHA-256 de (`cylinder_id`, `identifier_value_normalized`). Na primeira vez a RPC grava o `result_payload` (cilindro, evento criado, situação do teste); nas repetições devolve exatamente esse payload com `replayed: true`. Mesma chave com hash diferente → `IDEMPOTENCY_PAYLOAD_CONFLICT`.
- **Motivo**: tabela, expiração de 30 dias e semântica já existem e estão testadas (`002_idempotency.test.sql`).
- **Detalhe**: a chave é um UUID gerado no cliente (`crypto.randomUUID`) ao abrir a tela e mantido enquanto o resultado for desconhecido; só é trocado após resposta definitiva. Entrada sobre cilindro já em estoque com **outra** chave é `ALREADY_IN_STOCK`, sem evento.

## 7. Busca e desempenho com 50 mil cilindros

- **Identificador**: igualdade em `value_normalized` com B-tree em (`organization_id`, `value_normalized`) (índice parcial dos ativos já serve de índice). Busca exata = 1 linha; atende RNF-001 com folga.
- **Número de série (parte do valor)**: `ILIKE '%x%'` não usa B-tree. Decisão: extensão `pg_trgm` com GIN em `serial_normalized` (`gin_trgm_ops`). É extensão contrib do PostgreSQL, disponível no Supabase local e na nuvem, não adiciona pacote de execução ao cliente nem às funções (RNF-004). A migration cria `create extension if not exists pg_trgm with schema extensions`.
- **Alternativa**: busca por prefixo (`like 'x%'`) com B-tree e `text_pattern_ops`, sem extensão. Mais simples, mas a spec diz "parte do número de série" (cenário 1 da história 2); a decisão mantém o comportamento da spec. Se a equipe preferir evitar a extensão, o fallback é prefixo e a spec precisa mudar.
- **Lista**: paginação por cursor (`id` do cilindro ordenado por série) com tamanho de página padrão 25 e máximo 100; total exato por `count(*)` com os mesmos filtros (50 mil linhas, dentro do orçamento; medido no gate). Filtros por `status`, `stock_status`, tipo e situação do teste usam as colunas denormalizadas.
- **Meta de 2 s em 4G**: o orçamento do servidor é pequeno (consulta de uma página indexada); o restante é rede e render. Medição no Playwright com limitação de rede, na mesma máquina, registrada em `validation.md`.

## 8. Situação do teste e fuso

- **Decisão**: situação **calculada**, nunca gravada. O domínio TypeScript e o SQL implementam a mesma tabela de decisão, com `hoje` em `America/Sao_Paulo`:
  - nenhum teste efetivo → `sem_teste`;
  - último efetivo reprovado → `reprovado` (vale até um aprovado posterior);
  - aprovado: `dias = next_due_on − hoje`; `dias < 0` → `vencido`; `0 ≤ dias ≤ 30` → `a_vencer`; `dias > 30` → `em_dia`.
- **Teste efetivo**: o registro de maior `performed_on` (desempate por criação) que **não** foi substituído por retificação. Retificar cria nova linha com `rectifies_test_id`; só é possível retificar um registro ainda efetivo (não retificado).
- **Limite único** (RF-021): `HYDROSTATIC_EXPIRING_DAYS = 30` em um arquivo do domínio e `private.hydrostatic_expiring_days()` em uma função SQL; o teste de contrato lê os dois e reprova se diferirem. As telas só importam a constante pelo domínio.
- **Denormalização**: `cylinders.hydro_last_result` e `cylinders.hydro_next_due_on` são atualizados pela RPC de teste dentro da transação, apenas para filtro e ordenação; a situação exibida deriva deles e da data de hoje.
- **Validações**: realização não pode ser futura; próxima data obrigatória se aprovado e posterior à realização; no máximo 10 anos adiante da realização ("muito distante"); ano de fabricação entre 1900 e o ano corrente.

## 9. Rotas, telas e permissão no menu

- **Decisão**: o catálogo `SCREENS` ganha duas telas de menu (`cilindros`, `/cilindros`, `cylinder.read`; `entrada-estoque`, `/estoque/entrada`, `cylinder.stock_in`), ambas `tenantScoped: true`, `requireAal2: false`. Sub-rotas dinâmicas (`/cilindros/novo`, `/cilindros/<uuid>`) são tratadas em `cylinder-routes.ts`, com a permissão de cada ação lida do mesmo catálogo de códigos. O servidor continua a única barreira.
- **Motivo**: o roteador atual é por `pathname` exato; introduzir biblioteca de roteamento seria dependência nova (RNF-004). O resolvedor de prefixo é pequeno e testável.
- **MFA**: a spec não exige AAL2 para cilindros; as ações não são administrativas de tenant. `requireAal2: false`. Revisar se a equipe quiser AAL2 para inativação.

## 10. Auditoria da tentativa direta de exclusão (CA-003)

- **Problema**: CA-003 diz que a tentativa direta no servidor é "recusada e auditada". Uma exceção em gatilho desfaz a transação, inclusive o registro de auditoria que o gatilho tentasse gravar.
- **Decisão proposta**: (a) a recusa é garantida por privilégio revogado de `anon` e `authenticated` e por gatilho que levanta exceção para qualquer papel (testado com pgTAP); (b) a auditoria cobre o caminho de aplicação: as Edge Functions não expõem exclusão, e uma operação desconhecida ou de exclusão é auditada como `denied` pelo `audit()` do manipulador (padrão de `manage-membership`); (c) tentativas diretas por SQL ficam no log do PostgreSQL.
- **Alternativas**: gatilho que grava a auditoria e devolve `NULL` (a exclusão vira no-op silenciosa: não é "recusada" para quem chamou e engana o cliente); `dblink` para gravar fora da transação (extensão e credencial extra, risco maior que o ganho).
- **Decidido** em `/speckit-clarify` (05/10/2026): (a) a (c) são a cobertura aceita; CA-003 foi reescrito na spec para "recusada no banco para qualquer papel; tentativas pelas funções do aplicativo são auditadas como negadas".

## 11. Conexão e escrita

- **Decisão**: o serviço de cilindros consulta `ConnectivityContext`/`use-online-status` existentes. Sem conexão: formulários e entrada mostram o estado de "exige conexão" e não chamam o servidor. Sem uso de `sync-outbox` nem de `local-database` (RF-035).
- **Falha no meio do envio**: estado "resultado desconhecido", com botão "Tentar de novo" que reutiliza a mesma chave de operação (entrada) ou, para as demais escritas, verifica a versão ao recarregar. Só a entrada tem idempotência por chave nesta spec; as demais escritas se protegem por `version` e pelas unicidades.

## 12. Seed e dados de teste

- **Decisão**: `seed.sql` não ganha cilindros (a Visão geral continua com exemplo; nenhum dado de cilindro vem de exemplo, RF-032). As suítes pgTAP criam a massa dentro de transação com rollback, usando os tenants A e B e e-mails `@example.invalid`. O volume de 50 mil cilindros é gerado pela suíte `.live` com `generate_series`, em organização própria, e removido ao final. Sem dados reais (premissa 9).

## 13. Interface

- **Decisão**: reutilizar `StatusBadge`, `Loading`, estados vazio/erro/offline, `Dialog` e campos da Spec 003; três selos separados (cadastral, estoque, teste), com ícone e texto. Lista em tabela a partir de 768 px e cartões abaixo. Diálogos de confirmação (inativar, desativar identificador, transferir) devolvem o foco ao acionador. A skill `ui-ux-pro-max` orienta o detalhamento das telas na implementação, dentro dos tokens (AGENTS.md).
- **Sem novo componente de design system** salvo se a revisão visual indicar necessidade; qualquer componente novo entra no catálogo da Spec 003.
