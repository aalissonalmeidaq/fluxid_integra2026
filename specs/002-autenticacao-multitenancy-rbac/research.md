# Pesquisa técnica: Autenticação, multitenancy e RBAC

## Decisão 1: autenticação e método de recuperação

**Decisão**: usar Supabase Auth com e-mail/senha, confirmação e recuperação por fluxo PKCE, sem auto cadastro público. Convites são iniciados somente por operação administrativa autorizada.

**Justificativa**: PKCE reduz exposição no redirecionamento e o bloqueio de cadastro público preserva o modelo por convite. Respostas de recuperação permanecem indistinguíveis para evitar enumeração.

**Alternativas consideradas**: fluxo implícito, rejeitado em favor de PKCE; signup público, rejeitado pela Spec; login social e SSO, fora do escopo.

## Decisão 2: MFA e ações críticas

**Decisão**: usar TOTP nativo e exigir `aal2` para Master FluxID, Administrador FluxID e operações críticas de qualquer perfil. O frontend conduz matrícula/desafio, mas banco e servidor validam o nível de garantia.

**Justificativa**: o claim `aal` é emitido pelo Auth e pode ser exigido por políticas restritivas. A confirmação adicional não pode depender somente da interface.

**Alternativas consideradas**: SMS, rejeitado por custo, dependência e riscos; MFA opcional, rejeitada pela decisão de produto.

**Fonte**: https://supabase.com/docs/guides/auth/auth-mfa e https://supabase.com/docs/guides/auth/auth-mfa/totp

## Decisão 3: duração e limite de sessões

**Decisão**: configurar timebox de 8 horas, inatividade de 30 minutos e JWT de 1 hora. Manter registro `user_sessions` por `session_id` e governar login/logout por Edge Functions. Ao atingir três sessões, o quarto login permanece bloqueado, apresenta a lista sanitizada das sessões ativas e só prossegue depois que o usuário escolher e encerrar uma delas; nenhuma sessão é revogada automaticamente.

**Justificativa**: Supabase oferece timebox, inatividade e sessão única, mas não limite nativo de três. O registro próprio permite contagem, estado e auditoria sem armazenar access/refresh tokens. Ações sensíveis também confirmam a existência de `session_id` válido.

**Alternativas consideradas**: sessão única nativa, rejeitada pela decisão de produto; revogar automaticamente a sessão mais antiga ou a nova, rejeitado por retirar controle do usuário; contagem no cliente, rejeitada por ser contornável; sessões ilimitadas, rejeitadas.

**Fonte**: https://supabase.com/docs/guides/auth/sessions

## Decisão 4: modelo de autorização

**Decisão**: manter identidade, organização, vínculo, papel, permissão e atribuição em entidades separadas. A autorização consulta vínculos e permissões atuais no banco; JWT não contém a matriz completa.

**Justificativa**: um usuário pode participar de vários tenants e ter permissões distintas. Consultar estado atual evita que remoções dependam da renovação do token. `raw_user_meta_data` nunca participa da autorização.

**Alternativas consideradas**: um papel global no perfil, rejeitado por quebrar multitenancy; todas as permissões no JWT, rejeitadas por tamanho e defasagem; filtros apenas no frontend, rejeitados.

## Decisão 5: RLS e helpers privados

**Decisão**: habilitar e forçar RLS nas tabelas da aplicação, revogar privilégios padrão, conceder operações mínimas e usar helpers em schema privado para verificações complexas. Políticas envolvem `organization_id`, vínculo ativo e permissão atual; UPDATE possui `USING` e `WITH CHECK`.

**Justificativa**: a Data API expõe o schema `public`; RLS é a barreira final contra acesso cruzado. Helpers privados evitam repetição e podem usar índices, desde que validem `auth.uid()`, fixem `search_path` e não sejam executáveis diretamente.

**Alternativas consideradas**: `TO authenticated` sem predicado, rejeitado por permitir BOLA; claims editáveis, rejeitados; `SECURITY DEFINER` público, rejeitado.

**Fonte**: https://supabase.com/docs/guides/database/postgres/row-level-security

## Decisão 6: chaves, índices e concorrência

**Decisão**: usar UUID compatível com Auth para identidades e organizações expostas; `timestamptz` para instantes; texto com constraints para estados estáveis; índices em todas as FKs, em `(organization_id, status)` e nas combinações consultadas por RLS. Proteger a invariante do último administrador em transação curta com bloqueio das linhas relevantes.

**Justificativa**: FKs não recebem índice automaticamente. Índices compostos reduzem custo das políticas multitenant. A validação concorrente impede dois administradores de removerem simultaneamente a última atribuição.

**Alternativas consideradas**: validação apenas no cliente, rejeitada; enums rígidos em todos os estados, evitados onde evolução de migration seria desnecessariamente custosa; transações com chamadas externas, rejeitadas.

## Decisão 7: operações privilegiadas

**Decisão**: usar Edge Functions para login governado, logout/revogação, convites e administração global. Cada função valida schema de entrada, origem, JWT, sessão, tenant e permissão antes de usar um cliente servidor; nunca registra senha, token ou segredo.

**Justificativa**: Auth Admin e `service_role` não podem chegar ao navegador. As funções formam uma fronteira auditável e comum aos destinos local, LAN e cloud.

**Alternativas consideradas**: chamadas Auth Admin do cliente, proibidas; funções SQL públicas privilegiadas, rejeitadas; backend independente, adiado por não ser necessário ao MVP.

## Decisão 8: e-mail transacional

**Decisão**: usar Mailpit/captura local em desenvolvimento, serviço padrão somente em homologação controlada e SMTP homologado com SPF, DKIM e DMARC em LAN/cloud produtivos. Templates do FluxID serão curtos, transacionais e em português brasileiro.

**Justificativa**: o SMTP padrão do Supabase é best-effort, limitado a endereços da equipe e aproximadamente duas mensagens por hora, sem SLA produtivo.

**Alternativas consideradas**: serviço padrão em produção, rejeitado após validação documental; fornecedor fixo nesta Spec, evitado para manter portabilidade SMTP; e-mails fora do escopo, rejeitados porque convite e recuperação dependem deles.

**Fonte**: https://supabase.com/docs/guides/auth/auth-smtp

## Decisão 9: avatares

**Decisão**: bucket privado `avatars`, aceitando JPEG, PNG e WebP de até 2 MB. O caminho é derivado do `user_id`, nunca livremente escolhido; leitura exige proprietário ou permissão para consultar o perfil em organização compartilhada.

**Justificativa**: bucket privado e policies preservam privacidade. Lista de MIME, limite e validação de conteúdo reduzem upload malicioso. SVG fica excluído.

**Alternativas consideradas**: bucket público, rejeitado; URL arbitrária, rejeitada por SSRF e rastreamento; SVG, rejeitado por superfície ativa.

## Decisão 10: auditoria e retenção

**Decisão**: `audit_logs` é append-only para a aplicação, registra ator, organização, ação, alvo, resultado, instante, justificativa e metadados sanitizados. Retenção: auditoria 5 anos; convites expirados 90 dias; perfis inativos 2 anos antes de anonimização, salvo retenção legal.

**Justificativa**: preserva investigação e responsabilização com minimização. A auditoria não armazena credenciais, tokens, links, IP completo ou payload livre.

**Alternativas consideradas**: retenção indefinida, rejeitada por privacidade; exclusão imediata, rejeitada por rastreabilidade; logs técnicos como auditoria, rejeitados por mutabilidade e formato inadequado.

## Decisão 11: interface, rotas e estado

**Decisão**: separar sessão, tenant ativo e capacidades em providers/casos de uso; rotas são protegidas antes da renderização de dados. Formulários permitem colar e usar gerenciadores de senha, anunciam erros e conduzem foco. Telas administrativas usam paginação e se adaptam de tabela para lista em 360 px.

**Justificativa**: atende WCAG 2.2 AA, evita flash de conteúdo protegido e mantém regras fora dos componentes. Dados do tenant anterior são descartados antes da troca.

**Alternativas consideradas**: esconder botões como autorização, rejeitado; persistir dados protegidos offline, rejeitado; controles dependentes de hover/cor, rejeitados.

## Decisão 12: workflow de banco

**Decisão**: adotar migrations imperativas geradas inicialmente com `supabase migration new`, iteradas no banco local e verificadas com reset, testes e advisors. Não usar `apply_migration` para iteração local.

**Justificativa**: o projeto não possui `supabase/schemas/` e `schema_paths` está vazio. O workflow imperativo é o caminho existente e evita histórico poluído durante a iteração.

**Alternativas consideradas**: introduzir schemas declarativos nesta feature, rejeitado por ampliar escopo; editar banco cloud diretamente, proibido; inventar nomes/timestamps de migration, proibido.

## Decisão 13: identidade entre projetos Supabase

**Decisão**: tratar Auth de cloud, LAN e local como domínios de sessão independentes. A troca de endpoint invalida o cliente anterior e exige sessão emitida e validável no destino escolhido. A PWA nunca replica senha, refresh token, segredo MFA nem tabelas internas de Auth. Identidades de aplicação usam UUID estável provisionado por processo servidor homologado, mas esse vínculo não torna sessões portáveis.

**Justificativa**: compartilhar apenas chave de assinatura não garante presença da sessão, renovação do refresh token, revogação ou equivalência de políticas no outro projeto. Reautenticação fail-closed evita aceitar sessão cuja autoridade não pode ser comprovada no destino.

**Alternativas consideradas**: compartilhar chave JWT e reutilizar sessão, rejeitado por não transferir com segurança o ciclo de vida Auth; replicar schema Auth e refresh tokens, rejeitado pelo risco e acoplamento; manter login somente na cloud, rejeitado por impedir acesso autenticado LAN quando a cloud estiver tecnicamente indisponível.

**Fonte**: https://supabase.com/docs/guides/auth/sessions e https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects

## Decisão 14: compatibilidade dos endpoints

**Decisão**: cada destino operacional publica um identificador não sensível de versão do contrato/schema. Depois do health check e antes de criar o cliente ativo, o resolvedor compara esse identificador com a versão exigida pelo build. Ausência ou incompatibilidade é erro de configuração bloqueante, sem fallback. Migrations, RLS e catálogo de permissões devem produzir a mesma versão compatível em cloud, LAN e local homologados.

**Justificativa**: saúde de transporte não prova que schema, policies e contratos aceitam as mesmas operações. Bloquear incompatibilidade evita operar ou sincronizar contra estrutura divergente.

**Alternativas consideradas**: confiar apenas no endpoint de saúde, rejeitado por não detectar drift; permitir fallback por versão incompatível, rejeitado por mascarar configuração incorreta; comparar schema completo no cliente, rejeitado por exposição e custo.

**Fonte**: https://supabase.com/docs/guides/deployment/managing-environments e https://supabase.com/docs/guides/local-development/database-migrations

## Decisão 15: persistência local da PWA

**Decisão**: usar IndexedDB por meio de um adapter transacional próprio para armazenar outbox, cursores e conflitos, sempre particionados por `organization_id`. A base abre bloqueada durante a inicialização; dados protegidos só ficam acessíveis após confirmar endpoint, sessão e tenant. Logout ou troca de tenant preserva pendências na partição anterior, mas as torna inacessíveis até reautenticação equivalente ou descarte autorizado e auditado.

**Justificativa**: IndexedDB oferece persistência assíncrona, transações e volume compatível com uma PWA, sem misturar dados operacionais ao cache do service worker. O adapter mantém regras de domínio e isolamento fora dos componentes React.

**Alternativas consideradas**: `localStorage`, rejeitado por ser síncrono e sem transações; Cache Storage, rejeitado por ser destinado a recursos/respostas e não a uma fila transacional; memória, rejeitada por perder pendências no fechamento; SQLite/WASM, adiado por ampliar dependências e complexidade sem necessidade comprovada.
