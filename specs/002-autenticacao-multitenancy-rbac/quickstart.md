# Guia de validação: autenticação, multitenancy e RBAC

Este guia descreve como validar a Spec 002 de ponta a ponta depois da implementação. Ele não substitui o [modelo de dados](./data-model.md) nem os contratos: [auth-sessions.md](./contracts/auth-sessions.md), [identity-admin.md](./contracts/identity-admin.md), [connectivity.md](./contracts/connectivity.md), [synchronization.md](./contracts/synchronization.md), [rbac-audit.md](./contracts/rbac-audit.md) e [profile-avatar.md](./contracts/profile-avatar.md).

## Pré-requisitos

- Node.js e npm nas versões adotadas pelo repositório.
- Docker compatível com o Supabase CLI local.
- Dependências instaladas com `npm ci`.
- Nenhum segredo real no repositório ou nos artefatos de teste.
- Pares URL/chave publicável separados para cloud, LAN e local quando aplicáveis, além da versão esperada do contrato/schema; nenhum valor privilegiado no frontend.
- Captura local de e-mail habilitada; SMTP real é validado apenas em ambiente homologado e autorizado.

## Preparação do ambiente local

Na raiz do repositório:

```powershell
npm ci
npx supabase start
npx supabase db reset
```

Em terminais separados, iniciar as funções e a aplicação conforme a configuração entregue pela implementação:

```powershell
npx supabase functions serve --env-file supabase/.env.local
npm run dev
```

O arquivo de ambiente das funções deve existir apenas localmente e não pode conter credenciais produtivas. Os segredos locais de desenvolvimento ficam em `[edge_runtime.secrets]` de `supabase/config.toml`; funções novas ou alteradas só passam a valer depois de `npx supabase stop` e `npx supabase start`. As variáveis exclusivas do servidor (`INVITATION_REDIRECT_URL`, `AVATAR_UPLOADS_PER_HOUR`, `RETENTION_JOB_SECRET`) aparecem no `.env.example` apenas como nomes, sem valores. Para a limpeza de retenção, crie `supabase/.env` (ignorado pelo git) com uma linha `RETENTION_JOB_SECRET=<valor aleatório>`, por exemplo gerado com `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`, e reinicie o Supabase local. Sem ele, o teste ao vivo do caminho feliz falha de propósito. O contrato está em [retention-cleanup.md](./contracts/retention-cleanup.md).

Confirme no navegador a ordem `cloud → LAN → local`, a seleção do primeiro destino saudável e compatível e o bloqueio sem fallback quando a versão pública do contrato/schema divergir.

## Massa mínima de validação

Prepare dados sintéticos e determinísticos para:

- uma identidade Master FluxID com MFA configurado;
- Tenant A e Tenant B ativos;
- um Administrador do Tenant A;
- um Gestor e um Usuário Comum do Tenant A;
- um Administrador do Tenant B;
- um usuário com vínculo simultâneo nos dois tenants;
- um papel personalizado do Tenant A;
- convites pendente, aceito, expirado e revogado;
- duas sessões ativas da mesma identidade, permitindo testar a terceira e bloquear a quarta;
- uma identidade sem papéis com vínculo ativo no Tenant B (`perf@example.invalid`), usada só pela medição de desempenho ao vivo.

Os identificadores e relacionamentos devem seguir [data-model.md](./data-model.md). Não reutilize pessoas, e-mails ou organizações reais.

## Ordem recomendada dos testes automatizados

```powershell
npm run lint
npm run typecheck
npm run test:coverage
npm run test:live
npm run test:e2e
npm run build
npx supabase db reset
npx supabase db lint
npx supabase test db
npx supabase inspect db table-sizes
```

`npm run test:live` executa as suítes `*.live.test.ts` contra o Supabase local em execução, cada uma com usuários dedicados. Os testes de banco (`npx supabase test db`) usam pgTAP e cobrem RLS com dois tenants.

Se os testes SQL/RLS forem expostos por outro script durante a implementação, esse script passa a ser a fonte canônica e deve substituir `npx supabase test db` neste guia. Execute também os advisors de segurança e desempenho no destino homologado antes da liberação, sem copiar resultados sensíveis para a documentação.

## Cenários de aceitação

### 1. Autenticação, recuperação e MFA

1. Entrar com credenciais válidas e confirmar redirecionamento para um tenant autorizado.
2. Tentar senha inválida e usuário inexistente; a resposta não deve revelar se o e-mail está cadastrado.
3. Solicitar recuperação, abrir a mensagem na captura local, definir nova senha e invalidar o fluxo já consumido.
4. Configurar TOTP, confirmar AAL2 e testar um código inválido.
5. Verificar que ação crítica e perfil global exigem elevação recente conforme [auth-sessions.md](./contracts/auth-sessions.md).

Resultado esperado: autenticação acessível, mensagens sanitizadas, MFA funcional e nenhuma credencial privilegiada no navegador ou nos logs.

### 2. Limite e revogação de sessões

1. Criar até três sessões da mesma identidade em navegadores ou contextos isolados.
2. Tentar uma quarta sessão.
3. Confirmar que a quarta sessão não é criada, escolher explicitamente uma das três sessões sanitizadas para encerramento e então repetir o login.
4. Confirmar expiração após oito horas e por trinta minutos de inatividade usando relógio controlado nos testes.

Resultado esperado: no máximo três sessões ativas, concorrência tratada atomicamente e revogação auditada, conforme [auth-sessions.md](./contracts/auth-sessions.md).

### 3. Isolamento entre tenants

Para cada tabela com dados de tenant:

1. Autenticar como membro do Tenant A e comprovar o acesso permitido ao registro A.
2. Tentar ler, inserir, alterar e excluir registro equivalente do Tenant B.
3. Repetir com vínculo inativo, tenant inativo e `organization_id` adulterado no cliente.
4. Validar separadamente o escopo global do Master FluxID.

Resultado esperado: todas as tentativas cruzadas são bloqueadas por RLS ou pela fronteira servidor; trocar parâmetros no cliente nunca amplia o acesso.

### 4. Administração de identidades e convites

1. Enviar convite como Administrador do tenant e capturar a mensagem local.
2. Aceitar dentro da validade e impedir segundo consumo.
3. Validar expiração, revogação, reenvio e conflito de e-mail/vínculo.
4. Bloquear tentativa equivalente por Usuário Comum e confirmar auditoria da ação sensível.

Resultado esperado: estados e respostas seguem [identity-admin.md](./contracts/identity-admin.md), sem enumeração de contas e sem vínculo fora do tenant autorizado.

### 5. RBAC e revogação imediata

1. Criar papel personalizado no Tenant A e associar permissões.
2. Atribuir o papel a um vínculo do Tenant A e confirmar a ação permitida.
3. Remover a permissão e repetir a ação sem renovar o token.
4. Tentar reutilizar o papel no Tenant B e alterar papéis imutáveis do sistema.

Resultado esperado: a autorização consulta o estado vigente, a remoção produz efeito imediato e todas as mutações seguem [rbac-audit.md](./contracts/rbac-audit.md).

### 6. Perfil e avatar

1. Alterar somente os campos editáveis do próprio perfil.
2. Enviar avatar válido e recuperar sua visualização por URL assinada de curta duração.
3. Testar tipo, tamanho, conteúdo e caminho inválidos.
4. Tentar acessar diretamente o objeto privado de outra identidade.

Resultado esperado: objetos permanecem privados, acesso indevido é negado e o fluxo segue [profile-avatar.md](./contracts/profile-avatar.md).

### 7. Auditoria e retenção

1. Executar login, falha relevante, convite, mudança de papel, revogação e ação global.
2. Conferir ator, tenant, ação, alvo, resultado, data e correlação, sem senha, token ou segredo.
3. Tentar alterar e excluir eventos com perfis comuns e administrativos.
4. Validar paginação, filtros autorizados e política de retenção.

Resultado esperado: trilha append-only, consultável apenas no escopo autorizado e consistente com a mutação sensível.

### 8. Interface, acessibilidade e PWA

1. Executar os fluxos em 360 px, tablet e desktop amplo.
2. Navegar somente por teclado, verificar foco visível, rótulos, anúncios de erro e retorno de foco.
3. Permitir colagem e gerenciadores de senha nos campos de autenticação.
4. Validar contraste e executar axe nas páginas da feature.
5. Conferir estados de carregamento, vazio, erro, offline e sincronização.
6. Em modo offline, confirmar que autenticação e mutações sensíveis são bloqueadas com orientação clara e que dados protegidos não estão no cache do service worker. Isso inclui navegações a rotas de Auth, Data, Storage e Functions, que não podem receber o app shell.

Resultado esperado: WCAG 2.2 AA nos critérios aplicáveis, layout sem perda funcional e PWA sem armazenar respostas protegidas.

### 8. Dados locais, sincronização e promoção

1. Com o app aberto, conferir na base local (IndexedDB) a outbox e o cursor de entrada do tenant ativo.
2. Fazer uma alteração elegível com conectividade e confirmar que ela entra na outbox com UUID e chave de idempotência, é enviada uma única vez e só é marcada como confirmada depois da versão devolvida pelo servidor.
3. Repetir o envio da mesma operação e confirmar que o servidor a trata como duplicada, sem efeito novo.
4. Derrubar a conexão, tentar uma ação sensível e confirmar que ela é bloqueada com orientação clara, sem confirmação falsa.
5. Criar versões divergentes da mesma entidade e confirmar que o conflito é preservado para resolução explícita, sem sobrescrita silenciosa.
6. Alternar entre cloud, LAN e local seguindo `cloud → LAN → local`; ao promover uma conexão LAN ou local para cloud, confirmar que a sincronização termina antes da troca do cliente ativo e que nenhuma sessão é transferida por simples troca de URL.
7. Trocar de tenant e confirmar que os dados do tenant anterior saem do contexto antes de o novo ser liberado.

Resultado esperado: nenhuma escrita simultânea em duas instâncias, operações idempotentes, conflitos explícitos e auditados, conforme [synchronization.md](./contracts/synchronization.md) e [connectivity.md](./contracts/connectivity.md).

## Evidências para encerramento

Registre, sem dados sensíveis:

- comandos executados e seus resultados;
- matriz de RLS com acesso permitido e bloqueado para Tenant A e Tenant B;
- cobertura global e cobertura do domínio/autorização;
- evidências E2E e de acessibilidade;
- resultado de lint, tipos, build, advisors e varredura de segredos;
- validação do SMTP no ambiente autorizado;
- medições de desempenho e ambiente de referência (RNF-003 e RNF-004), registradas em [validation.md](./validation.md);
- decisão humana sobre a entrega.

Essas evidências alimentam a validação e o registro de IA somente no encerramento do ciclo, seguindo o gate de governança do repositório.
