# Linha de base: Spec 010

**Data**: 12/10/2026 (13/10 em UTC) | **Branch**: `feat/010-fila-offline-fotos-assinatura`, criada a partir da `main` no commit `fb06441` (merge da PR #33)

Medido **antes das mudanças de código desta spec** (só a correção dos testes pgTAP por data de São Paulo, T073, foi adiantada), no Windows 11, com o Supabase local em Docker.

## Suítes das Specs 001 a 009 (T002)

| Etapa | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | sem erros |
| `npx vitest run` | 282 arquivos, 4.409 testes; 4.408 passaram na primeira rodada e 1 reprovou por tempo (`src/pages/field/read-cylinder-button.test.tsx`), porque a rodada competia com o pgTAP e o `db reset`; **passa isolado** (8 testes). Registrado como instabilidade sob carga, sem aumentar prazo |
| `npx supabase db reset` | todas as migrations e o seed aplicados |
| `npx supabase test db` | 89 arquivos, 2.514 testes, PASS (rodado **dentro** da janela de 00:00 a 03:00 UTC, depois da correção de T073) |

## Pacote de entrada (T003)

`dist/assets/index-*.js`: **577.338 bytes** (a Spec 009 fechou em 577.133; a diferença é a correção do convite de instalação do PWA). O limite desta spec é de mais 5% [RNF-007]: **606.205 bytes**.

## Procedimento do Supabase local (T004)

- Funções e migrations novas exigem `npx supabase stop`, `npx supabase start` e `npx supabase db reset`; o bucket novo (`trip-evidence`) entra por migration.
- As suítes pgTAP que contam linhas de `audit_logs` exigem base limpa: `npx supabase db reset` antes de `npx supabase test db`, depois de `npm run test:live`.
- `npm run test:live` e o E2E não rodam ao mesmo tempo que o pgTAP nem que a suíte unitária completa.
- Um arquivo pgTAP isolado roda com `npx supabase test db supabase/tests/NNN_nome.test.sql`.

## Janela de horário (T073, adiantada)

Os testes pgTAP das Specs 008 e 009 usavam `current_date` (UTC) e reprovavam entre 00:00 e 03:00 UTC (21:00 e 00:00 em Brasília). Foram trocados por `(now() at time zone 'America/Sao_Paulo')::date` nos 22 arquivos de `supabase/tests/008_*.test.sql` e `009_*.test.sql`, e a suíte passou **dentro** da janela (01:3x UTC): 89 arquivos, 2.514 testes. Os testes novos desta spec usam datas explícitas e a data de São Paulo.

## Estado do repositório (T005)

- Os arquivos desta spec estão em `specs/010-fila-offline-fotos-assinatura/` e ainda sem commit; o hook de governança só aceita o commit com o RIA, então a spec entra junto com a implementação, no fechamento do ciclo (T077).
- Dois stashes antigos do repositório pertencem à pessoa responsável e não foram tocados.
