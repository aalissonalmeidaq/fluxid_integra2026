# Linha de base do tamanho do pacote (antes da Spec 007)

**Data**: 07/10/2026 | **Base**: `main` no commit `5bb62ab` (depois do PR #20)

| Item | Valor |
|---|---|
| Arquivo de entrada | `dist/assets/index-*.js` |
| Tamanho | **579,54 kB** (579 538 bytes) |
| Limite (Spec 005, +5% sobre a linha de base daquela spec) | 593,95 kB |
| Folga disponível | 14,41 kB |

Medido com `npm run build`. A Spec 007 acrescenta ao pacote de entrada apenas quatro itens do catálogo de telas; as telas, o serviço e a geometria carregam em chunks próprios (`React.lazy`). A medição final entra em `validation.md`.

## Suítes das Specs 001 a 006 antes da mudança (T002)

Medido em 07/10/2026 na branch `feat/007-clientes-geocercas-frota`, a partir da `main` no commit `5bb62ab`:

| Verificação | Resultado |
|---|---|
| `npm run lint` | sem erros |
| `npm run typecheck` | sem erros |
| `npm test` | 152 arquivos, 1919 testes aprovados |
| `npx supabase db reset` + `npx supabase test db` | 41 arquivos, 897 testes pgTAP aprovados |

## Procedimento do Supabase local (T004)

- Funções novas só são carregadas depois de `npx supabase stop` e `npx supabase start`.
- As suítes pgTAP `006_*` e `007_*` contam linhas de `audit_logs` e exigem base limpa: rodar `npx supabase db reset` antes de `npx supabase test db`, sobretudo depois de `npm run test:live`.
- As três funções novas (`query-registry`, `manage-registry` e `lookup-postal-code`) seguem o padrão das de cilindros: **sem** bloco `[functions.<nome>] verify_jwt = false` em `supabase/config.toml`, que só as funções públicas têm.

## Arquivos alheios à spec (T005)

`package.json`, `package-lock.json`, `vite.config.ts` e `docs/arquitetura-conectividade-supabase.md` estão modificados na máquina por trabalho de HTTPS de desenvolvimento, fora desta spec. **Não entram** nos commits da Spec 007: usar sempre `git add` com caminhos explícitos (ou `git add -p`) e conferir `git status` antes de cada commit.
