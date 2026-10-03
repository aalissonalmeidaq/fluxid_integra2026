# Linha de base da Spec 005

Medida na branch `feat/005-login-e-visao-geral`, antes de qualquer mudança de código, em 01/10/2026. Ambiente: Windows 11 Pro, Node.js 24, Chromium do Playwright (projeto `desktop-chromium`), backend simulado, sem service worker. As medições do shell e do pacote usaram uma cópia limpa do commit `1fab73e` (`git worktree`), porque os testes novos da Spec 005 já existiam na árvore de trabalho e impedem o `npm run build`.

## Suítes das Specs 001 a 004 (T002, CA-001)

| Comando | Resultado |
|---|---|
| `npm run lint` | sem erros |
| `npm run typecheck` | sem erros |
| `npm test` | 1513 testes aprovados |
| `npm run test:e2e` | 885 aprovados e 27 ignorados (912 no total), 3,9 min |

## Carregamento do shell (T003, RNF-001, MS-006)

Comando: `npx playwright test tests/e2e/medicao-shell.spec.ts --project=desktop-chromium --workers=1`, 10 amostras na entrada e 20 no shell autenticado.

| Medida | Mediana desta máquina | Referência da Spec 004 | Limite (+20%) |
|---|---|---|---|
| Entrada visível | 119 ms | 127 ms | 152 ms |
| Shell autenticado (botão "Sair" visível) | 83 ms | 89 ms | 107 ms |
| Menu visível | 85 ms | — | — |
| Consulta de permissões (p95) | 4 ms | — | — |
| Bytes transferidos na entrada | 706.051 | — | — |

A decisão de aprovação usa os limites da Spec 004 (152 ms e 107 ms). Esta máquina mediu abaixo das referências, então a comparação final também deve ser feita nela, com o mesmo comando.

## Pacote de produção (T003, RNF-003)

Comando: `npm run build`. Limite: +5% sobre o tamanho abaixo.

| Arquivo | Tamanho | Gzip |
|---|---|---|
| `dist/assets/index-*.js` | 565,67 kB | 160,91 kB |
| `dist/assets/index-*.css` | 28,79 kB | 6,76 kB |
| Total da pasta `dist` (inclui `sw.js` e imagens) | 841.208 bytes | — |
