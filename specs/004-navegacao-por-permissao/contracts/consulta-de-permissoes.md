# Contrato: consulta das próprias permissões

**Atende**: RF-001 a RF-004, RF-021 a RF-023, RN-001, CA-002, CA-009

## Edge Function `query-permissions`

`POST /functions/v1/query-permissions`, somente com chave publicável e `Authorization: Bearer <token da sessão>`.

### Pedido

```json
{ "organization_id": "<uuid do tenant ativo>" }
```

`organization_id` é opcional. Sem ele (por exemplo, perfil global sem tenant ativo), `tenant` volta vazio. Qualquer outro campo é ignorado. UUID inválido resulta em `VALIDATION_FAILED`.

### Respostas

| Situação | Status | Corpo |
|---|---|---|
| Sucesso | 200 | `{ "code": "PERMISSIONS_LISTED", "tenant": ["tenant.manage"], "global": [] }` |
| Sem token, token inválido ou sessão não vigente | 401 | `{ "code": "AUTH_REQUIRED" }` |
| `organization_id` inválido | 400 | `{ "code": "VALIDATION_FAILED" }` |
| Método diferente de POST | 405 | `{ "code": "METHOD_NOT_ALLOWED" }` |
| Falha interna | 500 | `{ "code": "INTERNAL_ERROR" }` |

Não existe `ACCESS_DENIED` nesta consulta: uma organização sem vínculo ativo da pessoa devolve `tenant: []`, igual a uma organização inexistente (sem oráculo de existência).

### Garantias

- O corpo só contém os campos acima. Nunca há papéis, pessoas, nomes, versões, identificadores nem dados de outros tenants.
- A sessão (`user_sessions`), o vínculo, a organização, o papel e a permissão são avaliados no banco a cada chamada. O tenant do pedido é só contexto solicitado, nunca prova de acesso.
- AAL não filtra a resposta; telas que exigem segundo fator o verificam ao abrir (RN-004).
- Leitura sem efeito: nenhum evento de auditoria no sucesso (RF-023). Negativas de acesso às telas por URL continuam auditadas pelas funções existentes.
- Nada é guardado em log: nem token, nem chave, nem o conteúdo da resposta.

## Função de banco `public.get_actor_permissions`

```sql
get_actor_permissions(p_actor uuid, p_session uuid, p_organization uuid) returns jsonb
```

- `security definer`, `set search_path = ''`, `revoke all ... from public, anon, authenticated`, `grant execute ... to service_role`.
- Retorna `{ "kind": "listed", "tenant": [...], "global": [...] }`, com códigos distintos e ordenados.
- Sessão não vigente (mesmo critério de `tenant_actor_authorized`: ativa, não expirada, atividade em até 30 minutos) devolve `{ "kind": "access_denied" }`, que a Edge Function traduz em `AUTH_REQUIRED`.
- `tenant`: permissões ativas, de papéis ativos, do vínculo ativo da pessoa em `p_organization` ativa. `[]` caso contrário.
- `global`: permissões ativas, de papéis ativos, do vínculo ativo da pessoa na organização `owner` ativa.
- **Critério único, sem filtro pelo escopo da permissão**: os dois conjuntos usam a mesma regra de `private.actor_has_permission` (sessão, vínculo, organização, papel e permissão ativos), que é a que as funções de servidor aplicam ao abrir cada tela. O escopo de cada código vem do catálogo: `audit.read` tem escopo `tenant`, mas um papel global concede essa permissão na organização proprietária, e é isso que autoriza a auditoria da plataforma. Filtrar por escopo esconderia essa tela de quem o servidor aceita.
- Se `p_organization` for a própria organização proprietária (por exemplo, o Master com ela como tenant ativo), `tenant` e `global` podem coincidir. O menu usa cada lista só para os itens do seu escopo (RF-006), e a tela abre se o servidor aceita.
- Os papéis semeados determinam os conjuntos: o Master tem todas as permissões ativas (RF-039 da Spec 002) e o Administrador FluxID tem `platform.manage`, `audit.read` e `profile.read`, sem `tenant.manage`.

## Cliente: `PermissionsService`

`permissions-service.ts` recebe um transporte (`call(body)`) e devolve `{ kind: 'success', value: { tenant, global } } | { kind: 'unavailable' }`. Resposta fora do contrato (campo ausente, tipo errado, status inesperado) é `unavailable`. Status 401 é tratado como sessão inválida pelo `AuthProvider`, nunca como lista vazia.
