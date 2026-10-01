# Contrato: RBAC e auditoria

## Catálogo e papéis

- Permissões usam código estável `resource.action`, escopo e delegabilidade.
- Papéis oficiais são imutáveis e não podem ser excluídos.
- Papel personalizado pertence a um tenant e aceita apenas permissões `tenant_delegable`.
- Atribuição de papel exige vínculo ativo no mesmo escopo.

Matriz inicial:

| Papel | Capacidades nesta Spec |
|---|---|
| Master FluxID | todas as permissões globais e de tenant |
| Administrador FluxID | tenants, usuários globais não Master e auditoria global; sem políticas críticas |
| Administrador do tenant | usuários, convites, papéis delegáveis e `audit.read` do tenant |
| Operador técnico | próprio perfil |
| Operador de estoque | próprio perfil |
| Motorista | próprio perfil |

## Avaliação de autorização

Entrada interna: ator autenticado, `session_id`, AAL, organização solicitada, código de permissão e alvo opcional.

Resultado: `allowed` ou `denied` com código sanitizado. O cálculo considera usuário, sessão válida, organização ativa, vínculo ativo, papel ativo e permissão atual. O frontend pode usar o resultado para UX, mas a operação protegida repete a verificação.

## Alterações de RBAC

- Criar/alterar/inativar papel personalizado.
- Associar/remover permissão delegável.
- Atribuir/remover papel de vínculo.
- Impedir transformação em papel global, permissão não delegável e remoção do último administrador.
- Atualizações concorrentes usam controle transacional e retornam `CONFLICT` quando a pré-condição mudou.

## Consulta de auditoria

Requer `audit.read`. Filtros permitidos: período, ação, resultado, ator e tipo de alvo; todos restritos ao escopo autorizado. Paginação por `(occurred_at, id)`, até 100 itens.

Campos retornados: ID, organização, ator sanitizado, ação, alvo sanitizado, resultado, motivo, justificativa permitida e instante. Metadados passam por allowlist.

Auditoria não oferece criar, alterar ou excluir pela API pública. Tentativas negadas críticas são registradas por fronteira confiável.

