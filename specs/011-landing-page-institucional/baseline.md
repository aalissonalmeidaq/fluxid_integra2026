# Linha de base: Spec 011

**Data**: 14/10/2026 (UTC) | **Branch**: `feat/011-landing-page-institucional`, criada a partir da `main` no commit `6e3173d` (merge do PR #38)

Medido **antes de qualquer mudança de código desta spec**, no Windows 11.

## Suítes das Specs 001 a 010

| Etapa | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npx tsc -b` (typecheck) | sem erros |
| `npx vitest run` | 332 arquivos, 5.214 testes; 5.213 passaram na primeira rodada e 1 reprovou por tempo (`src/pages/field/read-cylinder-button.test.tsx`, o mesmo da linha de base da Spec 010); reexecutado isolado: 8 de 8 passaram |
| `npm run build` | concluído |

Os testes de banco (pgTAP) e os E2E não fazem parte da linha de base desta spec: a landing não mexe no servidor, e os E2E são medidos nas tarefas T013 e T058.

## Pacote de entrada

`dist/assets/index-*.js`: **597.791 bytes** (a Spec 010 partiu de 577.338 e cresceu 3,5% dentro do limite dela). O limite desta spec é de mais 2% [RNF-003]: **609.747 bytes**.

## Issue

Não existe issue aberta para a Spec 011 (as Specs 001 a 010 têm). Abrir uma issue é ação visível no GitHub e fica a cargo da pessoa responsável: **pendente de confirmação** (T002).

## Procedimento

- Rodar a rodada completa fora da janela das 00:00 às 03:00 UTC (testes de `current_date` da Spec 008).
- `npm run test:live` e o E2E não rodam ao mesmo tempo que a suíte unitária completa.
