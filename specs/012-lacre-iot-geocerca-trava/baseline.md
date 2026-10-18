# Linha de base: Spec 012

**Data**: 18/10/2026 | **Branch**: `feat/012-lacre-iot-geocerca-trava`, criada a partir da `main` no commit `4c4c00d` (merge da PR #39). Antes de qualquer código desta spec, a pedido da pessoa responsável, os ajustes visuais da landing que estavam preparados foram commitados à parte (`c340227`, RIA-031).

Medido no Windows 11, com o Supabase local em Docker.

## Suítes das Specs 001 a 011 (T002)

| Etapa | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | sem erros |
| `npx vitest run` | 358 arquivos, **5.464 testes, todos passaram** (antes de qualquer mudança de TypeScript desta spec) |
| `npx supabase db reset` | todas as migrations e o seed aplicados |
| `npx supabase test db` | rodado já com as migrations de esquema e permissões desta spec (T013, T014): 99 arquivos, 2.791 testes. Só falharam as 3 asserções antigas que contam permissões (`002_rbac_invariants`, testes 3 e 6; `002_rbac_rls`, teste 2), ajustadas às 3 permissões novas na T015; depois disso, todas passam |

## Pacote de entrada (T003)

`dist/assets/index-*.js`: **599.490 bytes**. O limite desta spec é de mais 5% (RNF-006): **629.465 bytes**.

## Arquivos alheios à spec (T004)

Ficam fora dos commits desta spec, com `git add` explícito: `.agents/skills/impeccable/`, `.claude/agents/`, `.claude/settings.local.json`, `.codex/` e `.tmp/`.

## Provas de plataforma (T005, T006)

| Peça | Resultado no Supabase local |
|---|---|
| `pg_cron` 1.6.4 | já instalado; `cron.schedule` e `cron.unschedule` funcionam |
| `pg_net` 0.20.4 | disponível; `create extension` funciona e `net.http_get` de dentro do banco alcançou `public-compatibility` pelo endereço interno `http://supabase_kong_fluxid:8000` (200) |
| `supabase_vault` 0.3.1 | já instalado; `vault.create_secret`, a leitura em `vault.decrypted_secrets` e `delete from vault.secrets` funcionam |
| Realtime | `realtime.send` existe; o canal privado com política em `realtime.messages` é provado na T043 com um cliente autenticado |
| Web Push | `jsr:@negrel/webpush@0.5.0` rodou no runtime de funções: assinatura VAPID, corpo `aes128gcm` e mensagem decifrada corretamente por um receptor de teste; a função temporária foi apagada |

## Segredos de desenvolvimento (T007)

- Par VAPID de desenvolvimento gerado localmente: a chave pública em `.env.local` (`VITE_VAPID_PUBLIC_KEY`) e o par em `supabase/functions/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), os dois ignorados pelo git.
- `.gitignore` passa a ignorar `firmware/include/secrets.h` e `firmware/.pio/`.

## Procedimento do Supabase local

- Funções novas exigem `npx supabase stop` e `npx supabase start`; pastas de função que começam com `_` são ignoradas pelo runtime (como `_shared`).
- As suítes pgTAP que contam linhas de `audit_logs` exigem base limpa: `npx supabase db reset` antes de `npx supabase test db`, depois de `npm run test:live`.
- `npm run test:live` e o E2E não rodam ao mesmo tempo que o pgTAP nem que a suíte unitária completa.
- A suíte unitária completa leva mais de 10 minutos nesta máquina.
- Dentro do banco local, as funções são alcançadas por `http://supabase_kong_fluxid:8000/functions/v1/...`; na nuvem, pela URL pública do projeto.
