# Linha de base: Spec 009

**Data**: 12/10/2026 | **Branch**: `feat/009-leitura-gps-campo`, criada a partir da `main` no commit `a39aa6c` (merge da PR #30)

Medido **antes de qualquer mudança de código**, no Windows 11, com o Supabase local em Docker.

## Suítes das Specs 001 a 008 (T002)

| Etapa | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | sem erros |
| `npm test` | 256 arquivos, 3890 testes, todos passando (564 s) |
| `npx supabase db reset` | todas as migrations e o seed aplicados |
| `npx supabase test db` | 86 arquivos, 2398 testes, PASS |

## Pacote de entrada (T003)

`dist/assets/index-*.js`: **577 148 bytes** (577,14 kB; 163,96 kB comprimido). O limite desta spec é de mais 5% [RNF-005]: **606 005 bytes**.

`tests/e2e/medicao-shell.spec.ts` não foi medido nesta linha de base: a Spec 009 não mexe no shell autenticado, e a medição de pacote cobre o risco de peso.

## Procedimento do Supabase local (T004)

- Funções novas, de qualquer Edge Function, exigem `npx supabase stop` e `npx supabase start`.
- As suítes pgTAP que contam linhas de `audit_logs` exigem base limpa: `npx supabase db reset` antes de `npx supabase test db` e depois de `npm run test:live`.
- `npm run test:live` e o E2E não devem rodar ao mesmo tempo que o pgTAP.

## Observação sobre o estado do repositório (T005)

- Os arquivos desta spec estão em `specs/009-leitura-gps-campo/` e ainda sem commit; o hook de governança só aceita o commit com o RIA, então a spec entra junto com a implementação, no fechamento do ciclo (T055).
- Dois stashes antigos do repositório pertencem à pessoa responsável e não foram tocados.
