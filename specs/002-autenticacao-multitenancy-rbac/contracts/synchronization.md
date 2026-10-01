# Contrato: sincronização de dados (outbox, push, pull, conflitos e cursor)

**Spec**: `002-autenticacao-multitenancy-rbac`
**Referência**: [connectivity.md](./connectivity.md) — promoção de cloud exige sincronização completa antes da troca.

---

## 1. Banco de dados local (`LocalDatabase`)

- Base transacional aberta por tenant (`organization_id`).
- Armazena somente dados autorizados para operação degradada, outbox, cursores e conflitos.
- Distinto do cache do service worker; não compartilha storage com ele.
- Isolada por `organization_id`; acesso cruzado entre tenants é proibido.
- Aberta na Etapa 1 da inicialização, antes da resolução da conexão.
- Encerramento de sessão ou troca de tenant limpa ou isola o contexto do tenant anterior.

---

## 2. Outbox local (`SyncOutbox`)

Fila persistente de mutações pendentes de confirmação remota.

### Campos obrigatórios por item

| Campo              | Tipo / Restrição                                                    |
|--------------------|---------------------------------------------------------------------|
| `id`               | UUID gerado no cliente                                              |
| `idempotency_key`  | UUID ou hash derivado do conteúdo; único por operação              |
| `organization_id`  | contexto canônico; obrigatório                                      |
| `actor_id`         | Identificador do usuário responsável                               |
| `device_id`        | Identificador do dispositivo de origem                             |
| `operation`        | Tipo de operação (recurso + ação)                                  |
| `payload`          | Dados da operação sem credenciais, tokens ou PII desnecessária     |
| `dependencies`     | IDs de itens ainda não sincronizados dos quais este depende        |
| `local_timestamp`  | Timestamp do dispositivo (evidência auxiliar, não autoridade)      |
| `server_timestamp` | Timestamp confirmado pelo servidor; nulo até confirmação           |
| `version`          | Versão do registro; usada para detecção de conflito                |
| `status`           | Um dos estados definidos abaixo                                    |
| `attempt_count`    | Número de tentativas realizadas; limitado por configuração         |
| `failure_reason`   | Código sanitizado; sem stack trace, payload ou credenciais         |
| `created_at`       | Timestamp da criação local                                         |
| `updated_at`       | Timestamp da última atualização do item                            |

### Estados do item de outbox

| Estado      | Semântica                                                             |
|-------------|-----------------------------------------------------------------------|
| `pending`   | Aguardando tentativa de sincronização.                                |
| `syncing`   | Tentativa em andamento; não deve ser reenviado em paralelo.           |
| `synced`    | Confirmado pelo servidor; pode ser removido após grace period.        |
| `conflict`  | Versão local diverge da remota; aguarda resolução.                    |
| `failed`    | Número máximo de tentativas atingido; requer intervenção.             |
| `discarded` | Descartado por ator autorizado com auditoria; irreversível.           |

Regras:

- Um item nunca é removido da fila antes da confirmação do servidor (`synced`).
- Descarte requer ator autorizado e gera evento de auditoria.
- O número máximo de tentativas é configurável; `failed` não é descartado automaticamente.
- A ordenação respeita dependências declaradas; item não pode ser enviado antes de seus predecessores serem `synced`.

---

## 3. Sincronização de saída (`PushSynchronizer`)

Executada antes da sincronização de entrada em cada ciclo.

### Sequência por item

1. Selecionar próximo item `pending` respeitando dependências.
2. Marcar como `syncing`.
3. Validar sessão e permissões no servidor.
4. Enviar operação idempotente com `idempotency_key`, `organization_id`, `actor_id`, `version` e `device_id`.
5. Preservar `organization_id` e `actor_id` originais; o servidor os valida contra a sessão ativa.
6. Aguardar confirmação do servidor.
7. Em sucesso: marcar `synced`, registrar `server_timestamp`.
8. Em conflito: marcar `conflict`; não avançar como sucesso.
9. Em falha elegível: incrementar `attempt_count`; retornar a `pending` se abaixo do limite.
10. Em falha bloqueante (auth, RLS, tenant): marcar `failed`; interromper o push e registrar.

### Proibições

- Não enviar o mesmo item em paralelo.
- Não remover da fila antes da confirmação.
- Não simular `synced` sem resposta do servidor.
- Não continuar após conflito crítico sem resolução.
- Não enviar para dois endpoints simultaneamente.

### Ledger servidor de idempotência

- A chave lógica é `(organization_id, idempotency_key)` e é reservada atomicamente com a mutação.
- O servidor persiste `actor_user_id`, operação, hash canônico da requisição, código e resposta mínima sanitizada.
- Repetição com o mesmo hash retorna exatamente o resultado persistido sem reaplicar a mutação.
- Repetição com payload/hash divergente ou outro tenant é conflito bloqueante e auditado.
- A retenção padrão é de 30 dias e pode ser ampliada por configuração; a expiração do ledger não remove a evidência de auditoria.

---

## 4. Sincronização de entrada (`PullSynchronizer`)

Executada após a conclusão da sincronização de saída.

### Sequência

1. Ler o cursor de sincronização válido para o tenant ativo.
2. Consultar alterações remotas posteriores ao cursor.
3. Respeitar políticas RLS; não trazer dados de outro tenant.
4. Aplicar alterações atomicamente na base local.
5. Atualizar o cursor somente após a aplicação completa.
6. Invalidar caches obsoletos.
7. Registrar conflitos encontrados.

### Regras do cursor (`SyncCursor`)

- Um cursor por tenant, coleção e origem.
- Nunca avançado com base apenas em timestamp do dispositivo.
- Atualizado atomicamente com a aplicação das alterações.
- Não avançado em caso de conflito crítico.
- Persiste na base local; restaurado na reinicialização.

---

## 5. Resolução de conflitos (`ConflictResolver`)

Conflito ocorre quando a versão local de um registro diverge da versão remota.

### Categorias e tratamentos

| Situação                                         | Tratamento                                                         |
|--------------------------------------------------|--------------------------------------------------------------------|
| Registro alterado local e remotamente            | Preservar ambas as versões; registrar conflito; aguardar regra de domínio ou ator autorizado |
| Registro removido remotamente                    | Preservar versão local; registrar conflito; não remover silenciosamente |
| Usuário sem permissão no momento da sync         | Marcar item como `failed`; não descartar; notificar               |
| Tenant suspenso                                  | Interromper push/pull; estado `blocked`; preservar outbox          |
| Sessão expirada durante sincronização            | Interromper; marcar itens `syncing` de volta a `pending`; exigir reautenticação |
| Operação duplicada (idempotency_key já aceito)   | Servidor retorna sucesso idempotente; item marcado `synced`        |
| Dependência não sincronizada                     | Adiar o envio do item dependente até predecessores estarem `synced` |
| Mudança de endpoint durante sincronização        | Concluir ou cancelar com segurança; não reenviar sem verificação  |

### Regras obrigatórias

- "Última escrita vence" nunca é aplicada indiscriminadamente.
- Conflito crítico preserva versão local e remota.
- Versão local não é sobrescrita silenciosamente pela versão remota.
- Conflito aguarda regra de domínio ou resolução por ator autorizado.
- Resolução manual exige sessão vigente, justificativa e `tenant.manage` no tenant afetado ou `platform.manage` no escopo global.
- Toda resolução manual gera evento append-only `sync.conflict.resolve` com ator, tenant, identificador do conflito, versões e decisão sanitizados; payloads completos e dados secretos não integram a auditoria.
- O cursor não avança enquanto conflito crítico não for resolvido.

---

## 6. Coordenador de sincronização (`SyncCoordinator`)

Serializa push, pull, pausa, retomada e promoção de cloud.

- Sem execuções concorrentes de push ou pull.
- Push sempre precede pull em cada ciclo com cloud disponível.
- Pausa aceita novas mutações quando promoção de cloud está em andamento.
- Retomada após reautenticação reinicia a partir dos itens `pending`.
- Cancela push/pull em andamento de forma segura quando necessário.

---

## 7. Fluxo de inicialização da PWA

### Etapa 1 — Inicialização segura (antes da conexão)

- Carregar apenas app shell e configuração pública.
- Restaurar sessão com segurança (sem revalidação remota ainda).
- Identificar tenant autorizado da sessão local.
- Abrir `LocalDatabase` para o tenant identificado.
- Inspecionar outbox: identificar itens `pending` e `syncing`.
- Itens `syncing` de sessão anterior retornam a `pending`.

### Etapa 2 — Resolução da conexão

- Tentar cloud primeiro.
- Em indisponibilidade técnica, tentar LAN.
- Em indisponibilidade técnica de LAN, tentar local.
- Falha de autenticação, autorização, RLS, tenant ou configuração bloqueia sem fallback.

### Etapa 3 — Sincronização de saída (somente com cloud disponível)

- Enviar outbox completa com operações idempotentes.
- Preservar `organization_id` e `actor_id` originais.
- Validar permissões no servidor para cada item.
- Processar em ordem de dependências.
- Registrar sucesso ou falha de cada item.
- Interromper em conflito crítico ou falha bloqueante.

### Etapa 4 — Sincronização de entrada (após saída concluída)

- Consultar alterações remotas posteriores ao cursor.
- Atualizar base local.
- Avançar cursor somente após conclusão completa.
- Respeitar RLS; não trazer dados de outro tenant.
- Registrar conflitos.
- Invalidar caches obsoletos.

### Etapa 5 — Liberação da aplicação (somente com cloud)

A área operacional é liberada somente após:

1. Sincronização de saída concluída (sem conflito crítico pendente).
2. Sincronização de entrada concluída.
3. Sessão confirmada como válida.
4. Tenant confirmado como ativo e autorizado.
5. Consistência mínima dos dados locais verificada.

Em modo degradado (LAN ou local), a liberação ocorre sem as etapas 3 e 4, somente para capacidades `offline-safe`.

### Estados da tela de inicialização

| Estado                       | Semântica                                    |
|------------------------------|----------------------------------------------|
| Verificando alterações locais| Inspeção da outbox em andamento              |
| Conectando à nuvem           | Probe em cloud                               |
| Sincronizando alterações     | Push em andamento                            |
| Atualizando informações      | Pull em andamento                            |
| Preparando aplicação         | Gates de sessão, tenant e consistência       |
| Sincronização concluída      | Liberação iminente                           |
| Falha de conexão             | Nenhum endpoint acessível; ação disponível   |
| Conflito encontrado          | Conflito crítico; resolução necessária       |
| Sessão expirada              | Reautenticação necessária                    |
| Acesso negado                | Bloqueio de autenticação, RLS ou tenant      |

Todos os estados têm timeout definido e oferecem ação de recuperação. A interface nunca fica indefinidamente bloqueada.

---

## 8. Modo degradado (LAN ou local)

- Indica claramente qual endpoint está ativo.
- Registra alterações na outbox para sincronização futura com cloud.
- Não simula confirmação definitiva para operações não confirmadas pelo servidor.
- Não libera operações de identidade, sessão, convite, RBAC, auditoria sensível e administração.
- Operações `offline-safe` de Specs futuras precisam de classificação de produto antes de serem habilitadas.
- Mantém isolamento por tenant.
- Nunca armazena `service_role` ou credenciais privilegiadas.

### Operações desta Spec por categoria de disponibilidade

| Operação                                       | Disponibilidade offline |
|------------------------------------------------|------------------------|
| Autenticação, login, logout                    | Proibida               |
| Recuperação de senha                           | Proibida               |
| Convites                                       | Proibida               |
| Administração de tenants                       | Proibida               |
| Administração de usuários e vínculos           | Proibida               |
| RBAC (criar/alterar/atribuir papéis)           | Proibida               |
| Auditoria sensível                             | Proibida               |
| Consulta de perfil próprio (leitura local)     | A definir por produto  |
| Operações operacionais de Specs futuras        | A definir por produto  |

> **Questão em aberto**: a classificação detalhada de operações `offline-safe` para os domínios operacionais das Specs futuras ainda não foi definida pela equipe de produto. Nenhuma regra de negócio foi inventada neste contrato.

---

## 9. Segurança multitenant na sincronização

- RLS aplicada em cloud, LAN e local quando tecnicamente aplicável.
- `organization_id` enviado pelo cliente é contexto solicitado, nunca única fonte de autorização.
- Dados locais segregados por `organization_id`.
- Cache isolado ou limpo na troca de tenant.
- Encerramento de sessão bloqueia o acesso à base local e isola outbox e cursores do tenant anterior; pendências não são apagadas automaticamente.
- Outbox pendente só pode ser removida depois de confirmação remota ou descarte explícito por ator autorizado e auditado. Após reautenticação do mesmo usuário e tenant, a retomada restaura as pendências isoladas.
- Proibida sincronização entre tenants.
- Arquivos do Storage também isolados por `user_id` e política do bucket.
- Logs sem dados sensíveis.

---

## 10. Cobertura de testes obrigatória

| Cenário                                             | Comportamento esperado                                   |
|-----------------------------------------------------|----------------------------------------------------------|
| Inicialização sem pendências                        | Outbox vazia; push/pull concluem rapidamente             |
| Inicialização com outbox pendente                   | Push antes do pull; itens permanecem até confirmação     |
| Item confirmado pelo servidor                       | Marcado `synced`; removível após grace period            |
| Repetição com mesma `idempotency_key`               | Servidor aceita sem duplicar; item marcado `synced`      |
| Perda de conexão durante push                       | Itens `syncing` retornam a `pending`; retomada idempotente |
| Sessão expirada durante sincronização               | Push interrompido; itens `syncing` retornam a `pending`  |
| Conflito de versão                                  | Versões preservadas; cursor não avança                   |
| Tenant suspenso durante sincronização               | Estado `blocked`; outbox preservada                      |
| Isolamento Tenant A / Tenant B                      | Nenhum dado cruzado; RLS válida                          |
| Retomada após fechamento da PWA                     | Itens `syncing` retornam a `pending`; sem duplicação     |
| Atualização correta do cursor                       | Cursor avança somente após pull concluído                |
| Modo degradado: operação bloqueada                  | Bloqueada; mensagem acessível apresentada                |
| Acessibilidade da tela de inicialização             | WCAG 2.2 AA; foco, contraste, anúncios corretos          |
| Comportamento em 360 px e desktop                   | Layout operável sem perda de contexto                    |
| Service worker não armazena respostas sensíveis      | Varredura automatizada aprovada                          |
