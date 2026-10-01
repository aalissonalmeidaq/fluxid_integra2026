# Contrato: administração de organizações, convites e usuários

## Regras comuns

- Toda entrada é validada por schema e toda resposta exclui credenciais, tokens e PII desnecessária.
- `organization_id` identifica o contexto solicitado; autorização é derivada do ator e de seus vínculos/permissões.
- Ação crítica exige MFA AAL2 e gera auditoria de sucesso ou negação.

## Organizações

Operações: criar tenant, consultar, alterar identificação, suspender, inativar e reativar.

- Master: todas as operações.
- Administrador FluxID: operações concedidas, exceto políticas críticas e usuários Master.
- Tenant: sem escrita sobre organizações.

Respostas de escrita: entidade sanitizada, estado resultante e identificador do evento de auditoria. Conflitos retornam código estável; nenhum detalhe SQL é exposto.

## Convites

Entrada: `organization_id`, e-mail, papel oficial/personalizado permitido.

Estados públicos: `pending_delivery`, `sent`, `delivery_failed`, `accepted`, `expired`, `revoked`.

- Expiração: 72 horas.
- Reenvio: revoga todos os convites utilizáveis anteriores para o mesmo e-mail/tenant.
- Falha de entrega: mantém estado real e permite reenvio manual somente após intervalo de segurança.
- Aceitação: uso único, destinatário correspondente e criação/ativação do vínculo no mesmo tenant.

## Usuários e vínculos

Operações: listar com paginação, consultar, bloquear, inativar e reativar vínculo.

- Administrador do tenant opera somente vínculos do tenant ativo.
- A alteração não afeta vínculos do mesmo usuário em outras organizações.
- Bloqueio/inativação do último Administrador do tenant ativo é recusado de forma transacional.
- Listagem retorna no máximo 100 registros, cursor estável e somente campos necessários.

## Códigos de erro

`ACCESS_DENIED`, `MFA_REQUIRED`, `TENANT_UNAVAILABLE`, `MEMBERSHIP_UNAVAILABLE`, `LAST_ADMIN_REQUIRED`, `INVITATION_CONFLICT`, `INVITATION_EXPIRED`, `DELIVERY_PENDING`, `RATE_LIMITED`, `VALIDATION_FAILED` e `SERVICE_UNAVAILABLE`.

