# Validação da Spec 006: Cilindros, identificadores, estoque e histórico

**Data**: 05/10/2026 (rodada original) e 06/10/2026 (correção pós-merge) | **Branches**: `feat/006-cilindros-e-estoque` e `fix/006-pos-merge-convergencia` | **Ambiente**: Windows 11, Node.js 24.21.0, Supabase local (Docker)

## Resultados automatizados (T075)

Rodada original, na branch `feat/006-cilindros-e-estoque` (05/10/2026):

| Comando | Resultado |
|---|---|
| `npm run lint` | sem erros |
| `npm run typecheck` | sem erros |
| `npm run test:coverage` | 149 arquivos, 1894 testes aprovados; instruções 91,84%, ramos 86,84%, funções 90,9%, linhas 94,77% |
| `npx supabase db reset` + `npx supabase test db` | 41 arquivos, 897 testes pgTAP aprovados |
| `npm run test:live` | 14 arquivos, 92 testes aprovados |
| `npm run build` | entrada `index-*.js` com **579,50 kB** (limite 593,95 kB; linha de base 578,36 kB) |
| `npm run test:e2e` | 1145 aprovados, 31 ignorados, 0 falhas |
| `npm run test:desempenho:cilindros` (RNF-002) | 50 mil cilindros, Slow 4G, 20 cargas: mediana 231 ms, **p95 756 ms**, máx. 763 ms (limite 2000 ms) |

Rodada final, após a correção pós-merge, na branch `fix/006-pos-merge-convergencia` (06/10/2026). Estes números substituem os da rodada original:

| Comando | Resultado |
|---|---|
| `npm run lint` | sem erros |
| `npm run typecheck` | sem erros |
| `npm run test:coverage` | 152 arquivos, 1919 testes aprovados; instruções 91,78%, ramos 86,84%, funções 90,61%, linhas 94,75% |
| `npx supabase test db` | 41 arquivos, 897 testes pgTAP aprovados |
| `npm run test:live` | 14 arquivos, 92 testes aprovados |
| `npm run build` | entrada `index-*.js` com **579,54 kB** (limite 593,95 kB) |
| `npm run test:e2e` | 1148 aprovados, 31 ignorados, 0 falhas (5 projetos, execução isolada) |

## Desvios e correções encontrados durante a rodada

1. `tests/integration/navigation-permissions.live.test.ts` ainda esperava as permissões e o menu anteriores à Spec 006; atualizado para o mapeamento de `contracts/permissoes-e-papeis.md` (administrador com as sete permissões `cylinder.*`; operador técnico com `read`, `identifier`, `test` e `history`) e para os novos itens de menu.
2. A medição de 50 mil cilindros (`desempenho-lista-cilindros.spec.ts`) rodava nos projetos comuns do Playwright sem `E2E_AO_VIVO=1` e falhava; agora é ignorada fora do projeto `ao-vivo-4g` (`playwright.config.ts`).
3. Falhas pontuais de WebKit na primeira rodada completa de E2E vieram de carga paralela junto da medição acima; isoladas e na rodada completa seguinte passaram. O mesmo ocorreu em `simbolo-16px.spec.ts` (tablet WebKit) na rodada de 06/10/2026, executada junto das suítes live e pgTAP: isolado passou 9 de 9 e a rodada completa seguinte, sem outra carga, passou.
4. As suítes pgTAP `006_*` contam linhas de `audit_logs` e exigem base limpa: depois de `test:live` ou de chamadas às funções, rode `supabase db reset` antes de `supabase test db`.

## Falhas encontradas após o merge e correções (PR #17 mesclada, 06/10/2026)

Depois do merge do PR #17, a CI da `main` reprovou o E2E `tests/e2e/cilindros.spec.ts` (registro de teste hidrostático) em desktop Chromium, tablet WebKit e mobile Chromium, sem encontrar a mensagem "Teste hidrostático registrado.". A correção está na branch `fix/006-pos-merge-convergencia`.

1. **Fuso horário no teste E2E e no backend simulado.** O teste obtinha "hoje" com `new Date().toISOString().slice(0, 10)`, que é a data em UTC. Entre 21h e 24h em `America/Sao_Paulo` o UTC já está no dia seguinte, e o formulário, que usa o dia de São Paulo, recusava a realização como data futura. O sistema não tinha defeito: a data oficial já era `todayInSaoPaulo()`; o erro estava no teste e no simulado `mock-cylinders.ts`, que calculavam datas em UTC e somavam dias em milissegundos. Correção: o teste e o simulado passam a usar `todayInSaoPaulo()` e o novo `addCivilDays()` (soma de dias só no calendário civil, sem milissegundos nem horário de verão). Regressão: testes de domínio com o instante `2026-10-06T01:30:00Z` (22h30 em São Paulo, 06/10 em UTC) e um E2E com relógio fixo nesse instante, que confirma que a data do dia UTC seguinte é recusada e a de São Paulo é aceita. Nenhum timeout foi aumentado e nenhuma asserção foi removida.
2. **Leitura por câmera sem consulta de formatos.** O botão "Ler com a câmera" aparecia sempre que existia `BarcodeDetector`, mesmo em navegadores que não leem QR Code nem Data Matrix, e o detector era criado com os dois formatos sem conferência. Correção: o botão consulta `BarcodeDetector.getSupportedFormats()`, só aparece com `getUserMedia` e suporte a `qr_code`, `data_matrix` ou ambos, instancia o detector só com a interseção e trata falha na consulta como "sem suporte"; as faixas da câmera são desligadas ao concluir, cancelar, desmontar ou errar.
3. **Contradição na especificação.** Duas clarificações de `spec.md` discordavam sobre a câmera (uma a incluía e outra a deixava para a Fase 5). Agora a leitura limitada por câmera de QR Code e Data Matrix pertence à Spec 006 (RF-045) e o NFC nativo e o aplicativo de campo seguem na Fase 5.

Nenhuma regra de tenant, RLS ou auditoria foi alterada: as mudanças ficam no teste, no simulado do E2E, no domínio de datas e no botão de câmera, sem migration nem função de borda.

## Roteiro do quickstart

Itens 1 a 4 e 6: cobertos pelos resultados acima (pgTAP, vitest, live, E2E com backend simulado, build e capturas visuais em 360/768/1920 px). Itens 5.1 a 5.9 (validação manual guiada em celular e desktop): **validação humana concluída** em 05/10/2026, em notebook (Chrome, Windows 11) e celular Android, com aprovação após ajustes, conforme o RIA-022. A correção pós-merge tem validação humana própria, registrada no RIA do ciclo corretivo.

## Situação

A decisão de aprovação da correção pós-merge depende da CI verde no pull request corretivo e na `main` depois do merge; até lá o resultado não é declarado aprovado.
