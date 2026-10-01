# Publicação em nuvem: estado e roteiro

Este documento registra onde o FluxID roda hoje e o que falta para publicá-lo em nuvem (Supabase cloud e Vercel). A decisão de 01/10/2026 é **usar só o ambiente local por ora**; a publicação não tem data.

## Estado atual (01/10/2026)

| Item | Estado |
|------|--------|
| Ambiente de uso | Supabase local (Docker) e `npm run dev`. |
| `VITE_SUPABASE_CONNECTION_MODE` | `local` no `.env.local`. Com `auto`, o app tentaria a nuvem primeiro e seria bloqueado por incompatibilidade de contrato. |
| Projeto Supabase cloud | Existe, mas **não tem a Spec 002**: a função `public-compatibility` e a tabela `organizations` respondem 404. Não é um destino homologado. |
| Variáveis do GitHub | `SUPABASE_CLOUD_URL` e `SUPABASE_CLOUD_PUBLISHABLE_KEY` existem (valores públicos). O segredo `RETENTION_JOB_SECRET` **não** existe. |
| Workflow `Limpeza de retenção (Storage)` | **Desativado** (`gh workflow disable`), para não falhar todo dia sem segredo nem projeto publicado. |
| Tarefas da Spec 002 | T146 (prova de contrato e schema em nuvem), T147 (medição de desempenho em nuvem) e T149 (configurar a limpeza de retenção) seguem abertas, não canceladas. |

Consequência prática: enquanto o workflow estiver desativado, os avatares anonimizados pela rotina de retenção permanecem no Storage. Isso só importa quando houver uso real em nuvem.

## O que falta definir antes de qualquer uso em nuvem

1. **Primeiro Master FluxID.** O seed local cria o Master e os administradores, mas não vai para a nuvem. Não existe procedimento documentado para criar o primeiro Master lá; sem ele, ninguém consegue entrar.
2. **Configuração do Auth.** O `db push` não leva as configurações de autenticação do `config.toml`: MFA TOTP, URLs de redirecionamento de recuperação e convite, modelos de e-mail e SMTP. Em produção, SMTP homologado é obrigatório.
3. **Segredos das funções que dependem da URL do app:** `INVITATION_REDIRECT_URL` e `PASSWORD_RECOVERY_REDIRECT_URL`. Dependem do endereço público definitivo (Vercel).
4. **Tipo do projeto cloud:** teste ou produção, antes de aplicar migrations.

## Roteiro de publicação (Supabase)

Execute no terminal, na raiz do repositório. A senha do banco é digitada por quem executa; não a registre em lugar nenhum.

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy --project-ref <ref-do-projeto>
```

**Nunca use `--include-seed`.** O seed cria usuários de teste com senhas conhecidas e não pode existir na nuvem.

Segredo da limpeza de retenção, com o mesmo valor no Supabase e no GitHub, sem aparecer na tela:

```bash
SECRET=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
npx supabase secrets set RETENTION_JOB_SECRET="$SECRET" --project-ref <ref-do-projeto>
printf %s "$SECRET" | gh secret set RETENTION_JOB_SECRET --repo <dono>/<repositório>
unset SECRET
```

Para reativar e testar a limpeza:

```bash
gh workflow enable "Limpeza de retenção (Storage)"
gh workflow run "Limpeza de retenção (Storage)"
gh run watch
```

Depois da publicação, confirme sem credenciais: `GET <url>/functions/v1/public-compatibility` deve responder 200 com a versão do contrato.

## Vercel (frontend)

A Vercel hospeda apenas o frontend (build estático do Vite). O backend continua no Supabase.

- Configure no projeto da Vercel somente variáveis públicas: `VITE_SUPABASE_CLOUD_URL`, `VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY`, `VITE_SUPABASE_CONTRACT_VERSION` e `VITE_SUPABASE_CONNECTION_MODE`.
- **Nunca** configure `service_role`, chaves `sb_secret_...`, `RETENTION_JOB_SECRET` ou qualquer credencial privilegiada nas variáveis da Vercel: tudo com prefixo `VITE_` vai para o bundle do navegador.
- Depois do deploy, use a URL pública para definir `INVITATION_REDIRECT_URL` e `PASSWORD_RECOVERY_REDIRECT_URL` e cadastrá-las nas URLs de redirecionamento permitidas do Auth.

## Verificação ao concluir a publicação

- `public-compatibility` responde 200 e a versão bate com `VITE_SUPABASE_CONTRACT_VERSION`.
- Testes de RLS com dois tenants no destino, conforme `specs/002-autenticacao-multitenancy-rbac/quickstart.md`.
- Medição de desempenho (T147) e registro no `validation.md`.
- Workflow de retenção executado uma vez com sucesso (T149).
