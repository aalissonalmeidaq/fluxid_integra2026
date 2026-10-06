# Validação da Spec 006: Cilindros, identificadores, estoque e histórico

**Data**: 05/10/2026 | **Branch**: `feat/006-cilindros-e-estoque` | **Ambiente**: Windows 11, Node.js 24.21.0, Supabase local (Docker)

## Resultados automatizados (T075)

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

## Desvios e correções encontrados durante a rodada

1. `tests/integration/navigation-permissions.live.test.ts` ainda esperava as permissões e o menu anteriores à Spec 006; atualizado para o mapeamento de `contracts/permissoes-e-papeis.md` (administrador com as sete permissões `cylinder.*`; operador técnico com `read`, `identifier`, `test` e `history`) e para os novos itens de menu.
2. A medição de 50 mil cilindros (`desempenho-lista-cilindros.spec.ts`) rodava nos projetos comuns do Playwright sem `E2E_AO_VIVO=1` e falhava; agora é ignorada fora do projeto `ao-vivo-4g` (`playwright.config.ts`).
3. Falhas pontuais de WebKit na primeira rodada completa de E2E vieram de carga paralela junto da medição acima; isoladas e na rodada completa seguinte passaram.
4. As suítes pgTAP `006_*` contam linhas de `audit_logs` e exigem base limpa: depois de `test:live` ou de chamadas às funções, rode `supabase db reset` antes de `supabase test db`.

## Roteiro do quickstart

Itens 1 a 4 e 6: cobertos pelos resultados acima (pgTAP, vitest, live, E2E com backend simulado, build e capturas visuais em 360/768/1920 px). Itens 5.1 a 5.9 (validação manual guiada em celular e desktop) **não foram executados pelo agente**: dependem da pessoa responsável e serão feitos na entrevista de validação humana do gate de IA (T077).
