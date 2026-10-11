# Contrato: verificações automáticas

**Atende**: RF-029 a RF-033, RNF-001 a RNF-004, CA-001 a CA-008, MS-004 a MS-008

| Arquivo | O que prova | Requisitos |
|---|---|---|
| `supabase/tests/008_rls.test.sql` | RLS de todas as tabelas novas com **dois tenants**: o Tenant B não lê nem escreve nada do A, nem por RPC com identificadores trocados; `authenticated` não tem acesso direto | RF-029, CA-001 |
| `supabase/tests/008_plan.test.sql` | planejamento, reserva, capacidade, elegibilidade (inativo, fora do estoque, teste vencido, teste reprovado), cliente, unidade, veículo e motorista inativos, edição com versão | RF-001 a RF-006 |
| `supabase/tests/008_reservation_concurrency.test.sql` e suíte `.live` | duas conexões tentando reservar o mesmo cilindro: uma vence, a outra recebe `CYLINDER_RESERVED`; sem deadlock com a ordem fixa | RF-004, RNF-002, CA-002, MS-004 |
| `supabase/tests/008_transitions.test.sql` | toda transição válida e **todas** as inválidas de viagem, parada, item e bloqueio, inclusive por chamada direta | RF-007 a RF-009, CA-003 |
| `supabase/tests/008_loading_start.test.sql` | conferência e desfazer, retirada com exceção, início só com tudo conferido e bloqueado, revalidação no início (CNH, teste, veículo), custódia e estoque do cilindro | RF-010 a RF-012, RF-024, CA-004 |
| `supabase/tests/008_delivery.test.sql` | entrega uma vez por parada, divergência com justificativa, correção por novo registro, posição dentro e fora da geocerca e sem geocerca, recebedor só com nome e função | RF-013 a RF-017 |
| `supabase/tests/008_unlock.test.sql` | desbloqueio normal e excepcional, `aal2` obrigatório no excepcional, permissão de exceção, independência da entrega, sem desfazer | RF-018 a RF-020, CA-005 |
| `supabase/tests/008_close.test.sql` | conclusão com e sem parada aberta, cancelamento em cada situação, retorno ao estoque, viagem fechada não edita | RF-021 a RF-023 |
| `supabase/tests/008_history_audit.test.sql` | eventos imutáveis e contínuos, eventos de custódia no cilindro, auditoria na mesma transação, **sem nome de recebedor** em evento e em auditoria | RF-025, RF-032, CA-006, CA-007 |
| `supabase/tests/008_idempotency.test.sql` | repetição do mesmo `request_id` devolve o mesmo resultado sem duplicar; reuso com outra operação é `REQUEST_REUSED` | spec, regras de negócio |
| `supabase/tests/008_permissions.test.sql` | cada operação nega quem não tem a permissão; papéis padrão com o mapeamento do contrato; `trip.exception` crítica; nome do recebedor mascarado sem `trip.recipient` | RF-030, RF-031 |
| `supabase/tests/008_cylinder_in_trip.test.sql` | `stock_in_cylinder` e `inactivate_cylinder` da Spec 006 recusam cilindro com item aberto (`CYLINDER_IN_TRIP`) e o aceitam depois de `released`, `removed`, `returned` ou `delivered`; a reativação não muda | RF-024a |
| `supabase/tests/008_no_delete.test.sql` | nenhuma tabela nova aceita `delete` nem `truncate` | RF-033 |
| `supabase/tests/008_limits_contract.test.sql` | limites únicos (30 paradas, 200 cilindros) iguais no banco e no TypeScript | RF-002, RF-003 |
| `tests/contract/trips-permissions.test.ts` | catálogo de permissões e papéis igual ao contrato | RF-031 |
| `tests/contract/trips-limits.test.ts` | os mesmos limites no TypeScript | RF-002, RF-003 |
| `tests/contract/trips-no-delete.test.ts` | nenhuma operação de exclusão em `query-trips`, `manage-trips` nem no serviço | RF-033 |
| `tests/contract/trips-no-recipient-in-logs.test.ts` | os manipuladores nunca registram corpo nem resposta, e nenhum log, auditoria ou evento contém o nome do recebedor | CA-007 |
| `tests/contract/query-trips-handler.test.ts`, `manage-trips-handler.test.ts` | autenticação, método, operação desconhecida, corpo inválido, organização divergente, mapeamento HTTP, `request_id` obrigatório nos comandos | RF-030 |
| `src/domain/trips/*.test.ts` | transições, capacidade, elegibilidade, resumo e validações do formulário | RF-002 a RF-009 |
| `src/application/trips/*.test.ts` | serviço: sucesso, cada falha de servidor vira estado de tela, offline sem chamada, nada guardado localmente | RF-030 |
| `src/pages/trips/**/*.test.tsx` | lista, formulário, detalhe, conferência, entrega, desbloqueio e cancelamento, com estados de carregamento, vazio, erro e offline | RF-026 a RF-028 |
| `tests/integration/trips-*.live.test.ts` | fluxo completo contra o Supabase local: planejar, conferir, iniciar, entregar, desbloquear, concluir; dois tenants | MS-004, MS-005 |
| `tests/e2e/viagens-*.spec.ts` | jornada completa em 360, 768 e 1920 px com backend simulado, só com teclado, axe sem violação crítica ou grave, offline | RNF-003, CA-008, MS-008 |
| `tests/e2e/visual/viagens.visual.spec.ts` | capturas no Linux de lista, formulário, detalhe e diálogos | RNF-003 |
| `scripts/viagens/medir-desempenho-4g.mjs` | lista e detalhe com 10 mil viagens e 200 mil itens em 4G, p95 | RNF-001 |

## Regras de execução

- Cada tarefa de implementação começa pelo teste da tabela acima (RED), depois o código (GREEN) e então a limpeza.
- Toda política RLS é testada com dois tenants, no acesso permitido e no bloqueado.
- Nenhum teste chama serviço externo; nenhum documento ou nome real é usado (nomes de recebedor são fictícios e `@example.invalid`).
- `npm run test:coverage` precisa passar sem reduzir limite nem excluir arquivo.
- Antes de rodar o E2E, `npm run build`.
- Suítes `.live` rodam depois de `npx supabase stop` e `start`, para carregar as funções novas.
