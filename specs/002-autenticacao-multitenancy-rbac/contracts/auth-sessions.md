# Contrato: autenticação e sessões

## Princípios

- Entradas e respostas nunca expõem se um e-mail existe, tokens em logs ou detalhes internos.
- Login e logout governados passam por fronteira servidor; somente sessão aceita é devolvida ao cliente.
- Códigos de erro são estáveis, sanitizados e traduzidos pela interface.

## `session-login`

Entrada: `email`, `password`, `revoke_session_id` opcional (UUID de uma sessão do próprio usuário, usado somente após `SESSION_LIMIT_REACHED`) e contexto público do cliente. Ambos obrigatórios; e-mail normalizado apenas para autenticação; senha nunca persistida ou registrada.

Resultados:

| Código | Condição | Resposta pública |
|---|---|---|
| `AUTHENTICATED` | credenciais válidas, sessão aceita | sessão entregue; próximo passo é MFA ou seleção de tenant |
| `INVALID_CREDENTIALS` | e-mail/senha inválidos | mensagem genérica |
| `ACCOUNT_UNAVAILABLE` | usuário/vínculos sem acesso elegível | acesso indisponível, sem revelar tenant |
| `SESSION_LIMIT_REACHED` | três sessões ativas válidas | não entregar nova sessão; retornar lista sanitizada para escolha e encerramento explícito de uma sessão existente |
| `MFA_REQUIRED` | perfil global ou ação exige AAL2 | sessão AAL1 limitada ao fluxo MFA |
| `RATE_LIMITED` | limite de segurança | mensagem genérica com nova tentativa posterior |

Pós-condições: `user_sessions` registra somente sessão aceita; o limite não revoga sessão automaticamente; falhas relevantes geram auditoria sanitizada. Nenhum fallback de endpoint ocorre por resposta Auth.

Códigos HTTP: `AUTHENTICATED` e `MFA_REQUIRED` 200; `INVALID_REQUEST` 400; `INVALID_CREDENTIALS` 401; `ACCOUNT_UNAVAILABLE` 403; `SESSION_LIMIT_REACHED` 409; `RATE_LIMITED` 429; `INTERNAL_ERROR` 500. O limitador usa apenas o hash da identidade normalizada, com bloqueio após 5 falhas em 15 minutos.

## `session-status`

Entrada: JWT atual. Fronteira confiável de atividade: valida `user_sessions`, registra `last_seen_at` e eleva o AAL registrado quando o token comprova `aal2`. Respostas: `SESSION_ACTIVE` 200 (`aal`, `expires_at`); `SESSION_EXPIRED` (com `reason` `timebox` ou `inactivity`), `SESSION_REVOKED` e `SESSION_INVALID` 401. A PWA a chama ao iniciar e periodicamente enquanto houver atividade.

Todas as políticas RLS exigem sessão de governança ativa (`private.has_active_session()`), portanto revogação, expiração e inatividade valem imediatamente para a Data API, sem esperar o vencimento do JWT.

## Renovação e expiração

- JWT: 1 hora.
- Sessão: máximo 8 horas.
- Inatividade: 30 minutos desde refresh/atividade confiável.
- Renovação confirma estado do usuário, vínculo/tenant e `user_sessions`.
- Sessão expirada, revogada ou ausente perde acesso protegido e conduz ao login.

## `session-logout`

Entrada: JWT atual e escopo fixo `current` nesta Spec.

Saída: `SIGNED_OUT` mesmo quando a sessão já estiver encerrada. Revoga a sessão Auth atual, marca `user_sessions` e limpa tenant/dados do cliente.

## Recuperação de senha

- Solicitação pública sempre responde `RECOVERY_REQUEST_ACCEPTED` para e-mail bem-formado.
- Link expira em 1 hora e é de uso único.
- Reenvio invalida fluxos anteriores.
- Nova senha segue política do Auth; sucesso revoga sessões existentes conforme regra de segurança e gera auditoria.

## MFA TOTP

- Matrícula exige sessão AAL1 válida e apresenta QR mais alternativa textual acessível.
- Verificação correta eleva a AAL2; códigos incorretos não revelam detalhes.
- Master e Administrador FluxID não acessam áreas globais em AAL1.
- Ações críticas validam AAL2 na fronteira confiável, não apenas no React.
