# Publicação em nuvem: estado e roteiro

Este documento registra onde o FluxID roda hoje e o que falta para publicá-lo em nuvem (Supabase cloud e Vercel). A decisão de 01/10/2026 é **usar só o ambiente local por ora**; a publicação não tem data.

## Estado atual (01/10/2026)

| Item | Estado |
|------|--------|
| Ambiente de uso | Supabase local (Docker) e `npm run dev`. |
| `VITE_SUPABASE_CONNECTION_MODE` | `local` no `.env.local`. Com `auto`, o app tentaria a nuvem primeiro e seria bloqueado por incompatibilidade de contrato. |
| Projeto Supabase cloud | Existe; em 20/10/2026 recebeu as cinco migrations e as quatro Edge Functions da Spec 014. A restauração das contas/amostra e a homologação publicada ainda precisam concluir o roteiro desta seção. |
| Variáveis do GitHub | `SUPABASE_CLOUD_URL` e `SUPABASE_CLOUD_PUBLISHABLE_KEY` existem (valores públicos). O segredo `RETENTION_JOB_SECRET` **não** existe. |
| Workflow `Limpeza de retenção (Storage)` | **Desativado** (`gh workflow disable`), para não falhar todo dia sem segredo nem projeto publicado. |
| Tarefas da Spec 002 | T146 (prova de contrato e schema em nuvem), T147 (medição de desempenho em nuvem) e T149 (configurar a limpeza de retenção) seguem abertas, não canceladas. |

Consequência prática: enquanto o workflow estiver desativado, os avatares anonimizados pela rotina de retenção permanecem no Storage. Isso só importa quando houver uso real em nuvem.

## O que falta definir antes de qualquer uso em nuvem

1. **Primeiro Master FluxID.** O seed local cria o Master e os administradores, mas não vai para a nuvem. O primeiro Master da nuvem é criado uma única vez por `npm run operacao:primeiro-master` (ver "Primeiro Master na nuvem" abaixo).
2. **Configuração do Auth.** O `db push` não leva as configurações de autenticação do `config.toml`: MFA TOTP (desligado desde a Spec 013, RF-021: desative também em *Authentication > Multi-Factor* do projeto), URLs de redirecionamento de recuperação e convite, modelos de e-mail e SMTP. Em produção, SMTP homologado é obrigatório.
3. **Segredos das funções que dependem da URL do app:** `INVITATION_REDIRECT_URL` e `PASSWORD_RECOVERY_REDIRECT_URL`. Dependem do endereço público definitivo (Vercel).
4. **Tipo do projeto cloud:** teste ou produção, antes de aplicar migrations.

## Decisão de 13/10/2026 (Spec 010)

A publicação passa a ser feita **depois do merge da Spec 010 na `main`**, primeiro em um projeto Supabase de **teste** (migrations e funções, **sem seed**) e no frontend da Vercel, para homologar a instalação em Android por HTTPS real, a RLS com dois tenants e a medição. O `vercel.json` da raiz já traz o build, o fallback de rotas do app de página única, os cabeçalhos do service worker e do manifesto e as permissões de câmera, GPS e NFC. Quem faz o login (`supabase login` e `vercel login`) é a pessoa responsável; nenhum token entra em arquivo versionado. As quatro definições acima (primeiro Master, Auth, segredos de redirecionamento e tipo do projeto) continuam obrigatórias antes do primeiro uso.

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

### Lacres IoT (Spec 012)

As migrations dos lacres habilitam `pg_net`, `supabase_vault` e `pg_cron` e agendam o job `fluxid-seal-watchdog` (a cada minuto). Depois do `db push` e do `functions deploy`:

1. **Segredos das funções.** Gere o par VAPID uma vez e guarde a chave privada só no Supabase. O sal do endereço de origem é obrigatório na nuvem:

   ```bash
   node -e "const c=require('node:crypto');const j=c.generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'jwk'});console.log('VAPID_PUBLIC_KEY='+Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')]).toString('base64url'));console.log('VAPID_PRIVATE_KEY='+j.d)" > vapid.env
   npx supabase secrets set --env-file vapid.env --project-ref <ref-do-projeto>
   npx supabase secrets set VAPID_SUBJECT="mailto:<contato-da-equipe>" SEAL_SOURCE_SALT="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")" --project-ref <ref-do-projeto>
   grep VAPID_PUBLIC_KEY vapid.env   # a pública vai para a Vercel como VITE_VAPID_PUBLIC_KEY
   rm vapid.env
   ```

2. **Endereço da função `seal-push` no Vault.** A migration grava o endereço local; na nuvem, troque no SQL Editor do projeto:

   ```sql
   select vault.update_secret((select id from vault.secrets where name = 'seal_push_url'), 'https://<ref-do-projeto>.supabase.co/functions/v1/seal-push');
   ```

   O `seal_push_secret` é gerado pela própria migration e nunca sai do banco: o banco o envia à função a cada chamada e confere na volta.

3. **Conferência.** No SQL Editor: `select jobname, schedule, active from cron.job;` mostra `fluxid-seal-watchdog` ativo; `select name from vault.secrets where name like 'seal_push_%';` mostra os dois segredos. Na tela Meu perfil, ative as notificações neste aparelho e provoque um alerta de teste (por exemplo, desligar um lacre simulado sob vigilância) para ver a notificação chegar.

4. **Consumo (RNF-004).** Cada lacre faz 1 chamada por minuto ao `seal-gateway`: cerca de 43 200 invocações por mês por lacre. No plano gratuito (500 000 invocações de função por mês), isso cobre uns 10 lacres ligados o mês inteiro, sem contar as telas. Para mais lacres, aumente o intervalo de envio no cadastro ou mude de plano. O `seal-push` só é chamado quando há notificação a enviar.

As funções `seal-gateway` e `seal-push` são publicadas sem verificação de JWT (`verify_jwt = false` no `supabase/config.toml`): o lacre se identifica pela chave do dispositivo, e o `seal-push` pelo segredo do Vault.

### Aprovação dos lacres pelo Master (Spec 013)

As 7 migrations `20261019120xxx_seals_enrollment_*` criam a fila de pedidos (`seal_enrollments`), as operações do Master e a devolução pelo tenant. A migration de compatibilidade cria um pedido "em operação" para cada lacre da Spec 012 já cadastrado. A função nova `platform-seals` é publicada **com** verificação de JWT (é do Master, com segundo fator), então não entra no `supabase/config.toml`. Depois do `db push` e do `functions deploy platform-seals`:

1. **Senha da rede de configuração no Vault.** É a mesma senha gravada em `FLUXID_PORTAL_SENHA` no `firmware/include/secrets.h` da frota (WPA2, exatamente 8 caracteres). A pessoa responsável grava o valor no SQL Editor do projeto, uma única vez, sem que ele apareça em arquivo, issue ou histórico:

   ```sql
   select vault.create_secret('<senha-da-rede-de-configuracao>', 'seal_portal_password', 'Spec 013: senha da rede de configuração dos lacres');
   ```

   A senha é fixa no firmware: para trocá-la, grave um firmware novo em toda a frota e, depois, atualize o Vault com `vault.update_secret`. Nenhuma migration grava esse valor. Sem o segredo, a tela do Master explica que a senha não foi configurada (`NOT_CONFIGURED`).

2. **Conferência.** No SQL Editor: `select status, count(*) from public.seal_enrollments group by 1;` mostra os lacres da Spec 012 como `approved`; `select name from vault.secrets where name = 'seal_portal_password';` mostra o segredo (nunca o valor). Na tela Lacres da plataforma, o Master revela a senha com um motivo, e a consulta aparece na auditoria da plataforma.

3. **Lacres da Spec 012.** Continuam respondendo `200` com a chave do cadastro manual. Antes de retirar ou devolver um deles, regrave-o com o firmware novo (`firmware/README.md`).

### Acessos de demonstração (Spec 014)

As 5 migrations `20261020170xxx` criam as marcas da demonstração, a função `public.demo_restore` (só `service_role`), as restrições (convites e devolução do lacre no tenant da demonstração, senha das contas de demonstração presa à publicada) e os textos "empresa" nos papéis. A recuperação de senha passa a não enviar link a contas de demonstração: publique de novo as funções `password-recovery`, `invite-user`, `manage-organizations` e `manage-seals`. O seed continua fora da nuvem: os acessos de demonstração chegam lá pelo script.

1. **Criar ou restaurar a demonstração.** No terminal de quem opera, com a chave só no ambiente desse terminal:

   ```powershell
   $env:SUPABASE_URL = "https://<ref-do-projeto>.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY = "<chave secreta do projeto: Settings > API Keys>"
   npm run operacao:demonstracao
   Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
   ```

   O script valida `src/domain/demo/acessos-demonstracao.json`, para se algum e-mail de demonstração já pertencer a outro usuário, grava as marcas (`demo_restore` fase `markers`), cria ou atualiza os 5 usuários no Auth (id fixo, senha publicada, e-mail confirmado) e restaura o estado publicado (fase `state`): empresa "Oxigênio Cariri" ativa, perfis, vínculos ativos, um papel por pessoa, o cilindro C262 em estoque e os dados de exemplo (cilindros, clientes, geocercas, veículos, motoristas, viagens e lacres simulados com alertas), pelas operações do domínio. Para sem alterar nada se a empresa tiver vínculo de alguém que não é da demonstração. Cada execução fica na auditoria da plataforma (`demo.restore`), sem senha. Rodar de novo é seguro.

2. **Lacre de bancada.** O Master real aprova o `DSP-P77E49TC` para o "Oxigênio Cariri" em Lacres da plataforma (só o Master destina lacres). Rode o script de novo: o lacre fica vinculado ao C262. Se o lacre deixar de estar destinado à empresa, o script avisa e não mexe.

3. **Rotina diária.** O workflow `.github/workflows/restaurar-demonstracao.yml` roda o mesmo script às 03:23 de Brasília e sob demanda (Actions > Restaurar a demonstração > Run workflow). Cadastre em Settings > Secrets and variables > Actions o segredo `SUPABASE_SERVICE_ROLE_KEY` (a variável `SUPABASE_CLOUD_URL` já existe). Sem o segredo, a rotina falha dizendo o que cadastrar. A saída mostra só o resumo.

4. **Desligar.** Quando a plataforma deixar de ser demonstração, defina `VITE_DEMO_ACCESS=false` nas variáveis da Vercel e publique de novo: o botão e as credenciais saem do pacote. Desligue também a rotina diária.

## Vercel (frontend)

A Vercel hospeda apenas o frontend (build estático do Vite). O backend continua no Supabase.

### Publicação automática a cada merge (17/10/2026)

O projeto `fluxid` da Vercel não tem integração Git; até 13/10 ele era publicado à mão pela CLI, e por isso o merge da Spec 011 não chegou a `https://fluxid.tec.br`. Desde 17/10/2026 o workflow `.github/workflows/publicar-vercel.yml` publica em produção a cada push na `main` (ou seja, a cada pull request mergeado) e pode ser disparado à mão em *Actions > Publicação na Vercel (produção) > Run workflow*. Ele usa o build remoto da Vercel e confere que o domínio responde 200.

Configuração no repositório do GitHub:

- variáveis `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` (identificadores do `.vercel/project.json`; não são segredos), já cadastradas;
- segredo `VERCEL_TOKEN`: um token criado pela pessoa responsável em *Vercel > Account Settings > Tokens*, com escopo só no time do projeto. Cadastre sem que ele apareça em arquivo ou histórico: `gh secret set VERCEL_TOKEN --repo aalissonalmeidaq/fluxid_integra2026` (o valor é pedido no terminal). Sem ele, o workflow falha com uma mensagem dizendo o que falta.

Publicação manual, quando necessária: numa cópia limpa da `main` (sem arquivos locais não rastreados), com `.vercel/project.json`, rode `npx vercel@64.5.0 deploy --prod`.

- Configure no projeto da Vercel somente variáveis públicas: `VITE_SUPABASE_CLOUD_URL`, `VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY`, `VITE_SUPABASE_CONTRACT_VERSION`, `VITE_SUPABASE_CONNECTION_MODE` e `VITE_VAPID_PUBLIC_KEY` (Spec 012).
- **Nunca** configure `service_role`, chaves `sb_secret_...`, `RETENTION_JOB_SECRET` ou qualquer credencial privilegiada nas variáveis da Vercel: tudo com prefixo `VITE_` vai para o bundle do navegador.
- Depois do deploy, use a URL pública para definir `INVITATION_REDIRECT_URL` e `PASSWORD_RECOVERY_REDIRECT_URL` e cadastrá-las nas URLs de redirecionamento permitidas do Auth.

### Página inicial pública e endereços (Spec 011)

- A raiz `/` (por exemplo, `https://fluxid.tec.br/`) é a **landing page pública** do projeto: apresenta o FluxID, leva ao sistema e reúne os documentos, repositórios, evidências e vídeos. Ela não exige sessão nem faz chamada ao servidor.
- A **Visão geral** do sistema fica em `/visao-geral`, e o login em `/login`. O aplicativo instalado (PWA) inicia em `/visao-geral`, não na landing.
- As URLs de redirecionamento do Auth e os segredos `INVITATION_REDIRECT_URL` e `PASSWORD_RECOVERY_REDIRECT_URL` continuam apontando para o domínio público; a recuperação de senha usa `/recuperar-senha/confirmar`. Nenhum caminho que dependa de `/` como Visão geral deve ser cadastrado.
- Os links de materiais da landing (Google Drive, GitHub e YouTube) ficam em `src/pages/landing/landing-content.ts`; as pastas do Drive precisam continuar compartilhadas para quem recebe o link.

## Verificação ao concluir a publicação

- `public-compatibility` responde 200 e a versão bate com `VITE_SUPABASE_CONTRACT_VERSION`.
- Testes de RLS com dois tenants no destino, conforme `specs/002-autenticacao-multitenancy-rbac/quickstart.md`.
- Medição de desempenho (T147) e registro no `validation.md`.
- Workflow de retenção executado uma vez com sucesso (T149).
- Lacres (Spec 012): `cron.job` com `fluxid-seal-watchdog` ativo, `seal_push_url` apontando para o projeto e uma notificação recebida.
- Lacres (Spec 013): `platform-seals` publicada, `seal_portal_password` no Vault e os lacres da Spec 012 em "Em operação" na tela do Master.

## Primeiro Master na nuvem

O script `scripts/operacao/primeiro-master.mjs` cria o usuário no Auth, o perfil, o vínculo ativo com a organização proprietária, o papel `master_fluxid` e o registro de auditoria `master.bootstrap`. Só age quando não existe Master (repetir é seguro) e desfaz o usuário do Auth se uma etapa falhar. Roda no terminal de quem opera; a chave secreta nunca vai para arquivo versionado nem para o navegador.

PowerShell, na raiz do repositório (a senha é pedida sem eco; não a coloque em variável de ambiente se puder evitar):

```powershell
$env:SUPABASE_URL = "https://<ref-do-projeto>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<chave secreta do projeto: Settings > API Keys>"
$env:FLUXID_MASTER_EMAIL = "<e-mail real do Master>"
npm run operacao:primeiro-master
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```

A senha exige 12 caracteres ou mais, com minúsculas, maiúsculas, números e símbolos.

## E-mail de Auth na nuvem (provisório)

Decisão de 13/10/2026: por enquanto o projeto usa o **SMTP embutido do Supabase**. Ele só entrega para membros da organização do Supabase e tem limite baixo por hora, então serve só para testes do Master (login, recuperação de senha). Não serve para convidar outras pessoas nem para produção.

Pendente antes do uso real: configurar SMTP homologado com o domínio `fluxid.tec.br` (serviço transacional com SPF, DKIM e DMARC válidos) em *Authentication > Emails > SMTP Settings*. A chave do serviço fica só no painel do Supabase, nunca em arquivo versionado.
