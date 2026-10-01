# Linha de base — Spec 004

Medida em 01/10/2026, na branch `feat/004-navegacao-por-permissao`, ainda sem nenhuma mudança de código desta Spec (commit `af0ff69`). Ambiente: Windows 11, Node.js 24.21.0, Supabase local em contêineres, Chromium do Playwright 1.63.0.

## Suítes das Specs 001 a 003 (T002)

| Comando | Resultado |
|---|---|
| `npm run lint` | sem erros |
| `npm run typecheck` | sem erros |
| `npm test` | 1397 testes aprovados |
| `npm run test:e2e` | 699 aprovados, 20 ignorados (os cinco projetos; as especificações transversais ignoram o WebKit por desenho) |

## Carregamento do shell (T003)

Comando: `npx playwright test tests/e2e/medicao-shell.spec.ts --project=desktop-chromium`, em uma cópia limpa do commit `af0ff69`.

| Medida | Valor |
|---|---|
| Mediana do shell visível (10 amostras) | 117 ms (amostras: 138, 122, 114, 117, 114, 118, 111, 117, 116, 124) |
| Mediana dos bytes transferidos | 695 740 |
| Referência da Spec 003 | 132 ms |
| Limite desta Spec (RNF-001, MS-006) | 158 ms (132 ms + 20%) |

A medição de hoje ficou abaixo da referência da Spec 003 porque as máquinas diferem; o limite de 158 ms continua sendo o critério de aceitação, e a comparação final usa a mesma máquina e o mesmo comando.
