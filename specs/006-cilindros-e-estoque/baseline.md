# Linha de base da Spec 006

**Data**: 05/10/2026 | **Branch**: `feat/006-cilindros-e-estoque` (a partir do merge da Spec 005, PR #14) | **Ambiente**: Windows 11, Node.js 24.21.0, Supabase local (Docker)

## Suítes antes da mudança (T002)

| Comando | Resultado |
|---|---|
| `npm run lint` | sem erros |
| `npm run typecheck` | sem erros |
| `npm test` | 127 arquivos, 1622 testes aprovados |
| `npx supabase test db` | 27 arquivos, 410 testes pgTAP aprovados |

## Pacote de produção (T003)

`npm run build`, arquivo `dist/assets/index-*.js` (1 kB = 1000 bytes, como o Vite imprime):

| Item | Valor |
|---|---|
| Entrada (estado de entrada da Spec 006, fim da Spec 005) | **578,36 kB** (gzip 164,65 kB) |
| CSS de entrada (informativo) | 36,36 kB (gzip 7,75 kB) |
| Linha de base original da Spec 005 | 565,67 kB |
| Limite (+5% sobre 565,67 kB) | **593,95 kB** |
| Folga disponível para a Spec 006 | 15,59 kB |

As medianas do shell (`tests/e2e/medicao-shell.spec.ts`) ficam como na Spec 005 (`specs/005-login-e-visao-geral/validation.md`).

## Supabase local (T004)

- Serviços principais ativos (`supabase status`); `imgproxy` e `pooler` parados, sem efeito nesta spec.
- Funções novas de borda só são carregadas após `npx supabase stop` e `npx supabase start`.
- Migrations novas são aplicadas com `npx supabase db reset` (recria o banco com o `seed.sql`).
- Os testes de banco rodam com `npx supabase test db`.

## Rastreabilidade (T001)

Issue [#15](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/15) aberta em 05/10/2026; deve constar na descrição do PR e no RIA.
