# Linha de base: Spec 008

**Data**: 09/10/2026 | **Branch**: `feat/008-viagens-paradas-carga` (a partir da `main` no PR #26)

## Suítes verdes antes da mudança (T002)

| Verificação | Resultado |
|---|---|
| `npm run lint` | sem erros |
| `npm run typecheck` | sem erros |
| `npm test` (Vitest) | 219 arquivos, 3126 testes, todos passando |
| `npx supabase test db` (pgTAP, após `db reset`) | 64 arquivos, 1624 testes, todos passando |

## Pacote de entrada (T003)

`npm run build` termina sem erros. Maiores arquivos de `dist/assets/`: `bwip-js` (912 KB, carregado sob demanda), `index` (576 KB, pacote de entrada) e `map-view` (151 KB, sob demanda). O pacote de entrada de referência é o `index-*.js` de 576 KB (sem compressão); as telas de viagem entram em chunks `React.lazy` e não podem aumentá-lo além disso. `tests/e2e/medicao-shell.spec.ts` existe e não foi alterado.

## Procedimento do Supabase local (T004)

- Funções de borda novas só são carregadas depois de `npx supabase stop` e `npx supabase start`.
- As suítes pgTAP que contam linhas de `audit_logs` exigem base limpa: rodar `npx supabase db reset` antes de `npx supabase test db`, sobretudo depois de `npm run test:live`. Sem o reset, `007_inactivation.test.sql` falhou na linha de base (2 de 20 asserções); com o reset, tudo passou.
- `supabase/config.toml` só lista funções públicas (`verify_jwt = false`). `query-registry`, `manage-registry` e as demais funções de cadastro **não** têm bloco próprio e usam o padrão; `query-trips` e `manage-trips` seguem o mesmo e também não ganham bloco.

## Arquivos alheios à spec (T005)

`git status` na abertura da implementação mostrava apenas `specs/008-viagens-paradas-carga/` sem rastreio. Os commits desta spec usam `git add` explícito e nunca `git add -A`.
