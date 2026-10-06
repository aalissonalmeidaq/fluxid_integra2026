# Contrato: verificações automáticas

**Atende**: CA-001 a CA-010, MS-003, MS-004, MS-006

| Verificação | Onde | Prova |
|---|---|---|
| RLS com dois tenants, por tabela | `supabase/tests/006_*_rls.test.sql` | CA-001, MS-004: A lê/grava o que é seu; não vê, busca nem altera o de B (e o inverso); `anon` e `authenticated` sem permissão negados; escrita direta negada |
| RPC com dois tenants | `supabase/tests/006_operations.test.sql` | cada RPC nega ator de outro tenant e responde igual para "inexistente" e "de outra organização" (RF-042) |
| Unicidade | `supabase/tests/006_uniqueness.test.sql` | série por organização (ativos e inativos); identificador ativo por organização; mesmo valor aceito em outra organização; desativado só por transferência |
| Imutabilidade e exclusão | `supabase/tests/006_immutability.test.sql` | CA-003, CA-004: `update`/`delete` em eventos e testes recusados para todo papel; `delete` em cilindros, tipos e identificadores recusado |
| Idempotência | `supabase/tests/006_stock_in.test.sql` + `tests/contract/cylinders-stock-in.live.test.ts` | CA-002, MS-003: 10 repetições = 1 evento e mesma resposta; mesma chave com pedido diferente = conflito; outra chave com cilindro em estoque = recusa |
| Auditoria por ação | `supabase/tests/006_audit.test.sql` | CA-005: uma asserção por ação sensível (evento + auditoria atômicos; falha desfaz os dois) |
| Ordem do histórico | `supabase/tests/006_history_order.test.sql` | RF-025: `sequence` contínua e estável, também para eventos no mesmo instante |
| Limites do teste | `src/domain/cylinders/hydrostatic-status.test.ts` + `supabase/tests/006_hydrostatic.test.sql` | CA-008: 31, 30 e 0 dias, ontem, sem teste, reprovado e aprovado posterior, retificação — mesma tabela de casos nos dois lados |
| Limite único de 30 dias | `tests/contract/cylinders-hydrostatic-limit.test.ts` | RF-021: a constante do TypeScript e a função SQL são iguais; nenhuma tela define o número |
| Sem exclusão exposta | `tests/contract/cylinders-no-delete.test.ts` | CA-003: nenhuma operação, serviço ou botão de exclusão; operação desconhecida é negada e auditada |
| Permissões coerentes | `tests/contract/cylinders-permissions.test.ts` | catálogo de telas, rotas, contratos e migration usam os mesmos códigos; papéis padrão com o mapeamento do contrato |
| Manipuladores das funções | `supabase/functions/**/handler` + `tests/contract/cylinders-handlers.test.ts` | método, token, corpo inválido, operação desconhecida, `organization_id` divergente |
| Domínio e serviço | `src/domain/cylinders`, `src/application/cylinders` | normalização, validações, mapeamento de erros, chave de operação mantida em repetição |
| Páginas | `src/pages/cylinders/*.test.tsx` | estados, foco no primeiro erro, anúncios, diálogos devolvendo o foco, offline sem chamada ao servidor |
| E2E + axe | `tests/e2e/cilindros.spec.ts`, `entrada-estoque.spec.ts` | CA-006: 360/768/1920 px, 320 px e zoom 200% sem rolagem horizontal, sem violação crítica ou grave, teclado completo |
| PWA | `src/app/pwa-config.test.ts` + `tests/e2e/pwa.spec.ts` | CA-007: estrutura offline; nenhum dado de cilindro em cache |
| Desempenho | `tests/contract/cylinders-volume.live.test.ts` | RNF-001, RNF-002: 50 mil cilindros, busca p95 ≤ 1 s, primeira página p95 ≤ 2 s |
| Escalas | `tests/contract/escalas-no-codigo.test.ts` | RF-031: sem cor/tamanho/transição fora dos tokens nas telas novas |
| Visual | `tests/e2e/visual/cilindros.visual.spec.ts` | CA-009: capturas em 360, 768 e 1920 px, geradas no Linux; nunca `*-win32.png` |
| Pacote | `npm run build` antes e depois | CA-010: entrada ≤ 593,95 kB |
| Registro de IA | `npm run ia:validar` | validação humana por entrevista gravada no RIA (MS-007) |
