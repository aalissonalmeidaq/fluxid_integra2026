# Modelo de dados: Navegação por permissão

Nenhuma tabela, coluna, política RLS ou migração de dados. A função de banco nova só lê as tabelas existentes (`user_sessions`, `memberships`, `organizations`, `membership_roles`, `roles`, `role_permissions`, `permissions`).

## Entidades

### Permissão da pessoa (servidor → cliente)

| Campo | Tipo | Regra |
|---|---|---|
| `tenant` | lista de códigos | Permissões da pessoa no tenant informado; `[]` se não há vínculo ativo, organização ativa, papel ativo ou permissão ativa |
| `global` | lista de códigos | Permissões da pessoa na organização proprietária; `[]` se não é perfil global |

Os dois conjuntos usam o mesmo critério do servidor (sessão, vínculo, organização, papel e permissão ativos), **sem filtrar pelo escopo do código**: `audit.read` tem escopo `tenant`, mas o papel global a concede na organização proprietária, e isso autoriza a auditoria da plataforma. Quando o tenant ativo é a própria organização proprietária, `tenant` e `global` podem coincidir; cada lista só serve aos itens do seu escopo.

Códigos existentes no catálogo: `tenant.manage`, `audit.read`, `profile.read` e `platform.manage`. O conjunto de cada pessoa depende dos papéis semeados: hoje o papel Administrador do tenant concede `audit.read` e `tenant.manage`, o Operador técnico não concede nenhum, e o Administrador FluxID concede `audit.read`, `platform.manage` e `profile.read`. O cliente ignora códigos que o catálogo de telas não usa.

### Tela do catálogo (cliente, constante)

| Campo | Tipo | Regra |
|---|---|---|
| `id` | texto | Estável (`inicio`, `perfil`, `membros`, `papeis`, `auditoria`, `organizacoes`, `auditoria-global`) |
| `label` | texto | Igual ao título da tela (RF-005) |
| `path` | texto | Igual à rota em `App.tsx` |
| `requires` | nenhum, ou `{ scope: 'tenant' \| 'global', code }` | Início e Meu perfil: nenhum (RN-003) |
| `tenantScoped` | booleano | Usado também pelas rotas |
| `requireAal2` | booleano | Usado também pelas rotas; não esconde o item (RN-004) |

Ordem: Início, Meu perfil, Pessoas do tenant, Papéis e permissões, Auditoria do tenant, Organizações, Auditoria da plataforma.

| Tela | Caminho | Exige |
|---|---|---|
| Início | `/` | sessão |
| Meu perfil | `/perfil` | sessão |
| Pessoas do tenant | `/admin/membros` | `tenant.manage` (tenant) |
| Papéis e permissões | `/admin/papeis` | `tenant.manage` (tenant) |
| Auditoria do tenant | `/admin/auditoria` | `audit.read` (tenant) |
| Organizações | `/admin/tenants` | `platform.manage` (global) |
| Auditoria da plataforma | `/admin/auditoria-global` | `audit.read` (global) |

### Estado do menu (cliente, memória)

União discriminada:

| Estado | Itens exibidos | Observação |
|---|---|---|
| `loading` | Início e Meu perfil | indicador anunciado uma vez |
| `ready` | Início, Meu perfil e os itens cujas permissões constam | estado estável |
| `error` | Início e Meu perfil | aviso em texto e "Tentar de novo" |
| `offline` | último conjunto conhecido da mesma sessão e tenant, ou só Início e Meu perfil se não houver | marcado como possivelmente desatualizado |

Chave de contexto: (pessoa, tenant ativo ou nenhum). Mudou a chave, o estado volta a `loading` e as permissões anteriores são descartadas.

### Cache offline (cliente, `sessionStorage`)

`fluxid.menu.<hash curto de pessoa+tenant>` → `{ codes: { tenant: string[], global: string[] }, savedAt: ISO-8601 }`. Sem identificador em claro, sem credencial, sem dado pessoal. Removido no logout, na expiração e na troca de pessoa.

## Transições do estado do menu

```text
sem sessão ─ autenticar ─▶ loading ─ sucesso ─▶ ready ─ 60 s/navegação ─▶ ready
                              │                    │
                              ├─ falha ─▶ error ── tentar de novo ─▶ loading
                              └─ offline ─▶ offline ── rede volta ─▶ loading
qualquer estado ─ trocar tenant/pessoa, sair, expirar ─▶ loading ou sem sessão (permissões descartadas)
```
