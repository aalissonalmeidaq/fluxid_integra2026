# Contrato do resolvedor de conectividade

> **Nota histórica (Spec 001)**: Este contrato registra a prioridade `local → LAN → cloud` implementada na Spec 001. A partir da Spec 002, a ordem foi alterada para `CLOUD → LAN → LOCAL` conforme [ADR-001](../../docs/decisoes-arquiteturais/ADR-001-prioridade-cloud-e-sincronizacao-segura.md). O contrato vigente está em [`specs/002-autenticacao-multitenancy-rbac/contracts/connectivity.md`](../../specs/002-autenticacao-multitenancy-rbac/contracts/connectivity.md). Este arquivo é preservado como registro histórico e não deve ser editado retroativamente.

## Entrada

- modo validado;
- lista de endpoints habilitados;
- função de probe injetável;
- relógio/timeout injetável para testes.

## Probe

```text
GET {endpoint.url}/auth/v1/health
```

- sem chave secreta ou sessão de usuário;
- cancelado ao atingir `probeTimeoutMs`;
- corpo da resposta não é persistido nem registrado;
- 2xx: disponível;
- 5xx, timeout ou erro de transporte: indisponibilidade elegível a fallback;
- 4xx: falha bloqueante de acesso ou configuração;
- respostas fora dessas categorias: falha desconhecida e bloqueante.

O probe comprova somente que o serviço Auth do endpoint está disponível. Ele não valida a chave publicável, a sessão do usuário, permissões de linha ou políticas RLS.

## Resolução

```text
resolveConnection(config) -> ResolutionResult
```

Regras:

1. modo explícito avalia somente o endpoint solicitado;
2. modo `auto` avalia `local`, `lan`, `cloud` sequencialmente;
3. endpoint sem par URL/chave não é elegível; configuração parcial bloqueia a inicialização;
4. a primeira resposta 2xx encerra a resolução;
5. uma falha bloqueante encerra a resolução, mesmo que exista próximo endpoint;
6. cada endpoint é avaliado no máximo uma vez por resolução;
7. o resultado não contém chaves ou tokens.

## Fábrica do cliente

```text
createSelectedClient(result, config) -> SupabaseClient
```

A fábrica aceita apenas resultados `connected` ou `degraded`, cria um único cliente e não recebe a lista completa de chaves.

## Erros operacionais do cliente selecionado

```text
classifyOperationalError(errorMetadata) -> FailureKind
```

- recebe somente metadados sanitizados, como status HTTP e código estável; corpos, chaves e tokens não são registrados;
- autenticação, autorização, validação, isolamento/RLS, configuração e falha desconhecida são bloqueantes;
- um erro operacional atualiza a apresentação para `blocked`, preserva o destino da sessão para diagnóstico e não chama novamente o resolvedor;
- somente uma ação explícita de reconexão pode iniciar uma nova resolução;
- como esta spec não implementa autenticação nem operações de domínio, o contrato é validado com doubles e fixtures sanitizadas, sem consulta sentinela ou tabela adicional.

## Contrato visual

| Estado | Mensagem mínima | Semântica acessível |
|---|---|---|
| `probing` | Verificando conexão | `status`, sem interromper leitura |
| `connected` | Conectado ao destino selecionado | destino expresso em texto |
| `degraded` | Operando pelo destino selecionado após fallback | destino e fallback expressos em texto; não apenas cor |
| `blocked` | Configuração ou acesso precisa de correção | `alert` com ação recomendada |
| `offline` | Nenhum serviço disponível | `alert`; aplicação permanece navegável |

O componente de interface recebe somente o `ResolutionResult`; ele não executa regras de seleção nem cria clientes.
