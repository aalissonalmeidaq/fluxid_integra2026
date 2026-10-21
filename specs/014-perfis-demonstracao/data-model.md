# Modelo de dados: Spec 014

## Fonte única: `src/domain/demo/acessos-demonstracao.json`

| Campo | Tipo | Regra |
|---|---|---|
| `tenant.id` | uuid | `5478e9e3-155b-482f-b843-3513e0938dd6` (o id da nuvem) |
| `tenant.display_name` / `legal_name` | texto | "Oxigênio Cariri" / "Oxigenio Cariri" |
| `cylinder.serial_number` | texto | `C262` |
| `cylinder.type` | objeto | nome e capacidade do tipo criado para ele no tenant |
| `seal.device_code` | texto | `DSP-P77E49TC` (só na nuvem) |
| `accounts[]` | lista de 5 | uma por papel: `tenant_admin`, `stock_operator`, `technical_operator`, `tenant_auditor`, `driver` |
| `accounts[].user_id` / `membership_id` | uuid | fixos, iguais nos dois ambientes |
| `accounts[].display_name` | texto | 2 a 100 caracteres |
| `accounts[].role_code` | texto | um dos 5 papéis acima; nunca global |
| `accounts[].description` | texto | até 120 caracteres, uma frase sobre o que o papel faz |
| `accounts[].email` | texto | `<papel>@demo.fluxid.invalid`, único |
| `accounts[].password` | texto | `FluxID-Demo-NN!` (15 caracteres, minúsculas, maiúsculas, números e símbolo), aceito como valor sintético pelo teste de segredos |

## Tabelas novas (esquema `private`, sem acesso do cliente)

### `private.demo_tenant`

| Coluna | Tipo | Regra |
|---|---|---|
| `organization_id` | uuid, pk | referencia `organizations`; `kind = 'tenant'` |
| `singleton` | boolean | sempre `true`, único (só um tenant de demonstração) |
| `cylinder_id` | uuid | o C262 criado pela restauração; acha o cilindro mesmo se um visitante trocar o número de série |
| `updated_at` | timestamptz | |

### `private.demo_accounts`

| Coluna | Tipo | Regra |
|---|---|---|
| `user_id` | uuid, pk | o id fixo do JSON; **sem chave estrangeira** para `auth.users`, porque a fase `markers` grava antes de o usuário existir no Auth |
| `email` | texto | único, em minúsculas |
| `published_password` | texto | a senha pública (RN-001); usada só pelo gatilho de troca de senha |
| `role_code` | texto | um dos 5 papéis de tenant |
| `updated_at` | timestamptz | |

Sem `select` para `anon` e `authenticated`; só funções `security definer` e a chave de serviço as leem.

## Funções novas

| Função | Quem chama | O que faz |
|---|---|---|
| `private.is_demo_tenant(org)` | regras do banco | verdadeiro se for o tenant da demonstração |
| `private.is_demo_account(user)` | regras do banco | verdadeiro se for usuário de demonstração |
| `private.is_demo_email(email)` | regras do banco | verdadeiro se o e-mail for de demonstração |
| `public.is_demo_email(email)` | `password-recovery` (só `service_role`) | a mesma pergunta, no esquema que a função alcança |
| `public.demo_restore(p_manifest jsonb, p_phase text)` | script (só `service_role`) | `markers`: grava `private.demo_tenant` e `private.demo_accounts` (com a senha publicada); `state`: restaura o estado publicado (research.md, item 7) |
| gatilho `demo_password_guard` em `auth.users` | Auth | recusa senha diferente da publicada para usuários de demonstração |

## Mudanças em funções existentes

| Função | Mudança |
|---|---|
| `reserve_tenant_invitation`, `invite_first_tenant_admin` | `DEMO_RESTRICTED` no tenant da demonstração, com negação auditada |
| `return_device` | `DEMO_RESTRICTED` no tenant da demonstração, com negação auditada |
| `user_sessions` e a contagem do limite (Spec 002) | `user_sessions` ganha `kind` (`interactive` por padrão, `service` para a restauração); o limite de 3 sessões e a lista de sessões ativas ignoram `service` |

## Estado publicado (o que a restauração garante)

| Item | Estado |
|---|---|
| Tenant | `status = 'active'`, nomes do JSON |
| 5 usuários | existem no Auth com o id e o e-mail do JSON, senha publicada, e-mail confirmado |
| 5 perfis | `display_name` do JSON |
| 5 vínculos | `status = 'active'`, um papel por vínculo, o do JSON |
| Cilindro C262 | ativo, em estoque, com o tipo do JSON (pulado com aviso se estiver em viagem em andamento) |
| Lacre de bancada | vinculado ao C262 se estiver destinado ao tenant e ativo; senão, aviso sem alteração |

Fica como está: o que os visitantes cadastraram a mais e todo o histórico.

## Códigos novos

| Código | HTTP na borda | Quando |
|---|---|---|
| `DEMO_RESTRICTED` | 403 | convite ou devolução do lacre num tenant de demonstração. A troca de senha de uma conta de demonstração não usa este código: é recusada pelo próprio Auth, com o erro dele (research.md, item 5) |
| `DEMO_FOREIGN_MEMBERS` | (só no script) | o tenant tem vínculos que não são de demonstração; nada é alterado |
