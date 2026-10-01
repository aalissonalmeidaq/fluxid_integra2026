# Modelo de dados: Autenticação, multitenancy e RBAC

## Convenções

- Identificadores públicos: `uuid`.
- Instantes: `timestamptz` em UTC.
- Dados pertencentes a tenant: `organization_id` obrigatório.
- Estados: `text` com `check constraint` e transições validadas no domínio/banco.
- Todas as FKs recebem índice; consultas multitenant usam índices iniciados por `organization_id`.
- `created_at` e `updated_at` não substituem auditoria.
- Versão de concorrência: `organizations`, `memberships` e `roles` usam `version bigint not null default 1`, incrementada por trigger a cada UPDATE confirmado. Nesta Spec esses registros não podem originar mutações offline nem itens de outbox; a versão serve para concorrência online e detecção futura de conflitos. `role_permissions`, `membership_roles`, `invitations`, `user_sessions` e `audit_logs` também não originam outbox nesta Spec.

## `organizations`

Representa a FluxID proprietária ou um tenant contratante.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK, gerado no banco |
| `kind` | text | `owner` ou `tenant`; apenas uma organização `owner` |
| `legal_name` | text | obrigatório, normalizado, 2–160 caracteres |
| `display_name` | text | obrigatório, 2–100 caracteres |
| `status` | text | `active`, `suspended` ou `inactive` |
| `version` | bigint | `1` por padrão; incrementado por trigger a cada UPDATE confirmado no servidor |
| `created_at` | timestamptz | obrigatório |
| `updated_at` | timestamptz | obrigatório |

Índices: unicidade parcial para `kind = 'owner'`; `(status, created_at)` para administração global.

Transições: `active ↔ suspended`, `active ↔ inactive`, `suspended ↔ inactive`; toda transição exige permissão global, MFA e auditoria. Suspensão/inativação não exclui dados.

## `profiles`

Complementa `auth.users` sem duplicar senha, token ou autorização.

| Campo | Tipo | Regra |
|---|---|---|
| `user_id` | uuid | PK e FK para `auth.users(id)` |
| `display_name` | text | obrigatório, 2–100 caracteres |
| `avatar_path` | text | nulo ou caminho interno validado do próprio usuário |
| `locale` | text | padrão `pt-BR` nesta Spec |
| `anonymized_at` | timestamptz | nulo até anonimização |
| `created_at` | timestamptz | obrigatório |
| `updated_at` | timestamptz | obrigatório |

E-mail permanece no Auth. O usuário edita apenas nome, locale e avatar. `anonymized_at` torna os campos pessoais irreversivelmente não identificáveis após a retenção aplicável.

## `memberships`

Vínculo independente entre identidade e organização.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | FK obrigatória |
| `user_id` | uuid | FK obrigatória para `auth.users` |
| `status` | text | `invited`, `active`, `blocked` ou `inactive` |
| `invited_at` | timestamptz | obrigatório para origem por convite |
| `activated_at` | timestamptz | nulo antes da ativação |
| `blocked_at` | timestamptz | nulo fora de bloqueio |
| `inactivated_at` | timestamptz | nulo fora de inatividade |
| `version` | bigint | `1` por padrão; incrementado por trigger a cada UPDATE confirmado no servidor |
| `created_at` | timestamptz | obrigatório |
| `updated_at` | timestamptz | obrigatório |

Constraint única: `(organization_id, user_id)`. Índices: `(user_id, status)`, `(organization_id, status)`.

Transições: `invited → active|inactive`; `active → blocked|inactive`; `blocked → active|inactive`; `inactive → active`. Nenhuma transição atravessa organizações. Uma operação não pode deixar tenant ativo sem Administrador do tenant ativo.

## `permissions`

Catálogo estável de capacidades.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `code` | text | único, formato `resource.action` |
| `description` | text | obrigatório |
| `scope` | text | `global` ou `tenant` |
| `delegability` | text | `non_delegable` ou `tenant_delegable` |
| `critical` | boolean | exige MFA quando verdadeiro |
| `active` | boolean | padrão verdadeiro |

Catálogo inicial inclui capacidades de tenants, usuários globais, usuários do tenant, convites, papéis, perfil, auditoria e sessões. Permissões de domínio operacional serão adicionadas por Specs posteriores.

## `roles`

Agrupamento global ou pertencente a tenant.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | nulo para papel global; obrigatório para personalizado de tenant |
| `code` | text | único no escopo |
| `name` | text | 2–80 caracteres |
| `description` | text | até 300 caracteres |
| `scope` | text | `global` ou `tenant` |
| `system` | boolean | verdadeiro para os seis papéis oficiais |
| `active` | boolean | papéis oficiais permanecem ativos |
| `version` | bigint | `1` por padrão; incrementado por trigger a cada UPDATE confirmado no servidor |
| `created_at` | timestamptz | obrigatório |
| `updated_at` | timestamptz | obrigatório |

Papéis `system = true` são imutáveis. Papel personalizado é único por `(organization_id, code)` e só aceita permissões `tenant_delegable`.

## `role_permissions`

| Campo | Tipo | Regra |
|---|---|---|
| `role_id` | uuid | FK, parte da PK composta |
| `permission_id` | uuid | FK, parte da PK composta |
| `created_at` | timestamptz | obrigatório |

A associação precisa respeitar escopo e delegabilidade. Índice adicional em `permission_id`.

## `membership_roles`

| Campo | Tipo | Regra |
|---|---|---|
| `membership_id` | uuid | FK, parte da PK composta |
| `role_id` | uuid | FK, parte da PK composta |
| `assigned_by` | uuid | FK para `auth.users` |
| `created_at` | timestamptz | obrigatório |

Papel de tenant e vínculo devem pertencer à mesma organização. Papel global só pode ser atribuído a vínculo da organização proprietária. Índice adicional em `role_id`.

## `invitations`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `organization_id` | uuid | FK obrigatória |
| `email_normalized` | text | obrigatório; nunca usado para enumeração pública |
| `intended_role_id` | uuid | FK obrigatória e compatível com organização |
| `status` | text | `pending_delivery`, `sent`, `delivery_failed`, `accepted`, `expired` ou `revoked` |
| `auth_invite_id` | text | identificador opaco opcional; nunca segredo/link |
| `expires_at` | timestamptz | emissão + 72 horas |
| `sent_at` | timestamptz | nulo até confirmação |
| `accepted_at` | timestamptz | nulo até consumo único |
| `revoked_at` | timestamptz | nulo até revogação |
| `created_by` | uuid | FK para `auth.users` |
| `created_at` | timestamptz | obrigatório |

Índice único parcial impede mais de um convite utilizável por `(organization_id, email_normalized)`. Reenvio revoga convites utilizáveis anteriores antes de criar o novo. Convites terminais são descartados após 90 dias sem remover sua auditoria.

## `user_sessions`

Registro de governança; não armazena access token nem refresh token.

| Campo | Tipo | Regra |
|---|---|---|
| `session_id` | uuid | PK, corresponde ao claim/Auth session |
| `user_id` | uuid | FK obrigatória para `auth.users` |
| `status` | text | `active`, `revoked` ou `expired` |
| `aal` | text | `aal1` ou `aal2` observado |
| `started_at` | timestamptz | obrigatório |
| `last_seen_at` | timestamptz | atualizado por fronteira confiável |
| `expires_at` | timestamptz | máximo de 8 horas |
| `ended_at` | timestamptz | nulo enquanto ativa |
| `end_reason` | text | motivo sanitizado opcional |

Índice parcial `(user_id, started_at)` para `status = 'active'`. A criação é serializada por usuário; se já houver três ativas válidas, o quarto login não entrega nova sessão e retorna a lista sanitizada das sessões existentes para encerramento explícito de uma delas. Nenhuma sessão é revogada automaticamente.

## `audit_logs`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | bigint identity | PK ordenável |
| `organization_id` | uuid | nulo para evento global sem tenant |
| `actor_user_id` | uuid | nulo quando identidade desconhecida |
| `actor_session_id` | uuid | nulo quando indisponível |
| `action` | text | código enumerável da ação |
| `target_type` | text | tipo lógico do alvo |
| `target_id` | text | identificador sanitizado |
| `result` | text | `success`, `denied` ou `failed` |
| `reason_code` | text | código sanitizado, sem stack trace |
| `justification` | text | obrigatória quando a regra exigir; limite 500 caracteres |
| `metadata` | jsonb | allowlist sem PII desnecessária ou segredos |
| `occurred_at` | timestamptz | obrigatório, imutável |

Índices: `(organization_id, occurred_at desc, id desc)`, `(actor_user_id, occurred_at desc)` e `(action, occurred_at desc)`. A aplicação recebe somente INSERT por função controlada e SELECT conforme `audit.read`; UPDATE/DELETE ficam revogados. Retenção de cinco anos, salvo hold legal documentado fora do payload livre.

## Storage `avatars`

- Bucket privado.
- Caminho canônico: `<user_id>/<object_id>.<extensão-normalizada>`.
- MIME permitido: `image/jpeg`, `image/png`, `image/webp`.
- Limite: 2 MB.
- Proprietário pode criar/substituir/excluir o próprio avatar.
- Usuário com permissão de consultar perfis pode ler avatares de pessoas que compartilham organização autorizada.
- Upload exige validação de MIME declarado, bytes reais, tamanho e caminho.

## Base local (PWA)

As três estruturas abaixo residem exclusivamente na base local do dispositivo (`LocalDatabase`), abertas por `organization_id`. Nunca são replicadas para o banco remoto. Nomenclatura de colunas segue o contrato [synchronization.md](./contracts/synchronization.md).

### `local_outbox`

Fila persistente de mutações pendentes de confirmação remota.

| Campo | Tipo / Restrição | Regra |
|---|---|---|
| `id` | uuid | PK; gerado no cliente |
| `idempotency_key` | text | único por operação; UUID ou hash do conteúdo |
| `organization_id` | uuid | contexto canônico; obrigatório; não cruza tenants |
| `actor_id` | uuid | usuário responsável pela operação |
| `device_id` | uuid | identificador estável do dispositivo de origem |
| `operation` | text | recurso + ação (ex.: `membership.update`); formato estável |
| `payload` | jsonb | dados da operação; sem credenciais, tokens ou PII desnecessária |
| `version` | bigint | versão do registro local no momento do enfileiramento |
| `dependencies` | text[] | `idempotency_key`s de predecessores ainda não `synced` |
| `local_timestamp` | timestamptz | timestamp do dispositivo; evidência auxiliar, não autoridade |
| `server_timestamp` | timestamptz | nulo até confirmação do servidor |
| `status` | text | `pending`, `syncing`, `synced`, `conflict`, `failed` ou `discarded` |
| `attempt_count` | integer | padrão 0; limite configurável (padrão 5) |
| `failure_reason` | text | código sanitizado; sem stack trace ou segredos |
| `created_at` | timestamptz | timestamp local de criação do item |
| `updated_at` | timestamptz | timestamp local da última atualização do estado |

Regras: item nunca removido antes de `synced`; descarte exige ator autorizado e gera evento de auditoria; `device_id` gerado na primeira abertura da base local e persiste por instalação/tenant.

### `local_sync_cursors`

Marcadores de progresso do pull incremental, segregados por tenant, coleção e endpoint.

| Campo | Tipo / Restrição | Regra |
|---|---|---|
| `organization_id` | uuid | parte da PK composta |
| `collection` | text | nome lógico da tabela/recurso (ex.: `memberships`); parte da PK |
| `endpoint_type` | text | `cloud`, `lan` ou `local`; parte da PK |
| `cursor_value` | text | último identificador/timestamp confirmado pelo servidor |
| `confirmed_at` | timestamptz | timestamp local da última confirmação |

Regras: nunca avançado com base apenas no relógio do dispositivo; atualizado atomicamente com a aplicação das alterações; não avançado em conflito crítico; restaurado na reinicialização.

### `local_sync_conflicts`

Registro das versões em conflito enquanto aguardam resolução.

| Campo | Tipo / Restrição | Regra |
|---|---|---|
| `id` | uuid | PK; gerado localmente |
| `outbox_item_id` | uuid | FK para `local_outbox.id`; nulo em conflito detectado no pull |
| `organization_id` | uuid | obrigatório |
| `entity_type` | text | tipo lógico do recurso conflitante (ex.: `membership`) |
| `entity_id` | uuid | identificador do recurso |
| `local_version` | bigint | versão no momento do conflito |
| `remote_version` | bigint | versão remota que divergiu |
| `local_payload` | jsonb | snapshot local sanitizado |
| `remote_payload` | jsonb | snapshot remoto sanitizado |
| `detected_at` | timestamptz | timestamp local da detecção |
| `resolved_at` | timestamptz | nulo até resolução |
| `resolution` | text | código da regra ou ação que resolveu; nulo enquanto pendente |
| `resolver_actor_id` | uuid | nulo até resolução |

Regras: versão local e remota preservadas até resolução explícita; cursor não avança enquanto conflito crítico não for resolvido; nenhuma escrita automática nos dados do tenant.

## Regras de RLS

1. `anon` não recebe acesso a tabelas/bucket protegidos.
2. Perfil próprio é legível/editável somente nos campos permitidos; administradores veem perfis no escopo autorizado.
3. Organização, vínculo, papel, convite e auditoria exigem vínculo ativo e permissão atual.
4. Toda policy de tenant compara `organization_id` com uma associação confiável derivada de `auth.uid()`.
5. Master pode operar globalmente após MFA; Administrador FluxID não altera Master nem políticas críticas.
6. Alterações sensíveis e invariantes complexas passam por funções/Edge Functions, não por INSERT/UPDATE genérico do cliente.
7. Tenant A nunca consulta, altera ou exclui dados do Tenant B, mesmo com parâmetro adulterado.

## Versão pública do contrato/schema

Cada destino mantém uma versão estável e não sensível do contrato/schema, atualizada pela mesma cadeia de migrations que instala tabelas, RLS e catálogo de permissões. Um endpoint somente leitura expõe apenas esse identificador ao health/compatibility check. Ausência ou divergência da versão esperada é erro de configuração bloqueante: o cliente não autentica, não sincroniza e não tenta outro destino por fallback. A promoção para cloud também exige equivalência comprovada das migrations, políticas RLS e permissões.

## `idempotency_ledger`

Ledger servidor privado usado pela fronteira de sincronização; não é gravável diretamente pelo cliente.

| Campo | Tipo | Regra |
|---|---|---|
| `organization_id` | uuid | parte da PK composta e escopo obrigatório |
| `idempotency_key` | text | parte da PK composta |
| `actor_user_id` | uuid | ator validado pela sessão |
| `operation` | text | código allowlisted da operação |
| `request_hash` | text | hash canônico para detectar repetição divergente |
| `result_code` | text | resultado estável e sanitizado |
| `result_payload` | jsonb | somente resposta mínima allowlisted, sem segredo ou PII desnecessária |
| `created_at` | timestamptz | instante confirmado pelo servidor |
| `expires_at` | timestamptz | retenção mínima de 30 dias, configurável para prazo maior |

A primeira execução válida reserva `(organization_id, idempotency_key)` na mesma transação da mutação. Repetição com o mesmo `request_hash` retorna o resultado persistido; hash diferente é conflito bloqueante. Chaves nunca são aceitas entre organizações e a limpeza por retenção não remove auditoria.

## Retenção e exclusão

- Auditoria: 5 anos; purge controlado e auditado, suspenso por hold legal.
- Convites terminais: 90 dias; depois exclusão.
- Perfil/vínculos inativos: após 2 anos, anonimizar PII desnecessária; preservar chaves mínimas referenciadas pela auditoria.
- Avatar: excluir na substituição confirmada ou anonimização, sem reutilizar caminho anterior.

### Estruturas privadas da retenção

Ficam no schema `private`, sem acesso da aplicação (os privilégios são revogados de `anon` e `authenticated`).

#### `private.retention_holds`

Retenção legal documentada que suspende o descarte (AUD-008).

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | uuid | chave primária |
| `scope` | text | `global`, `organization` ou `user` |
| `organization_id` | uuid | obrigatório só em `organization`; referencia `organizations` |
| `user_id` | uuid | obrigatório só em `user`; referencia `auth.users` |
| `reason` | text | justificativa de 10 a 500 caracteres |
| `created_by`, `created_at` | uuid, timestamptz | quem e quando criou |
| `released_at`, `released_by` | timestamptz, uuid | nulos enquanto a retenção está ativa |

Restrições: o escopo determina quais identificadores são nulos. Índice parcial sobre retenções ativas. Consulta:
`private.retention_held(organização, pessoa)`.

#### `private.storage_cleanup_queue`

Fila dos objetos do Storage a remover depois da anonimização. SQL não apaga o objeto sem deixá-lo órfão, então a rotina
só enfileira e uma função servidor remove pelo Storage API.

| Campo | Tipo | Regra |
|-------|------|-------|
| `path` | text | chave primária; caminho do objeto, sem reutilização |
| `bucket` | text | padrão `avatars` |
| `enqueued_at` | timestamptz | ordem de processamento |

Fluxo: `public.anonymize_inactive_profiles()` insere o `avatar_path` do perfil anonimizado →
`public.take_storage_cleanup_batch(limite)` lê o lote mais antigo **sem** removê-lo → a função
`retention-storage-cleanup` apaga os objetos → `public.complete_storage_cleanup(caminhos)` tira os itens da fila. Falha
na remoção mantém o item para a próxima execução. As duas funções públicas só executam para `service_role`.

A rotina `public.run_identity_retention()` (pg_cron, diária) executa a purga de auditoria, a purga de convites e a
anonimização. Quem aciona a função de limpeza é o agendador descrito em
[retention-cleanup.md](./contracts/retention-cleanup.md).
