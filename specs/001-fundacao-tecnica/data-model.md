# Modelo de dados e estados: Conectividade da fundação

Esta spec não cria tabelas no PostgreSQL. O modelo descreve configuração e estado efêmero da aplicação.

## `ConnectionMode`

Valores aceitos:

- `auto`: avalia endpoints pela prioridade definida;
- `local`: usa somente o serviço no dispositivo;
- `lan`: usa somente o serviço homologado na rede local;
- `cloud`: usa somente o serviço gerenciado.

Qualquer outro valor é configuração inválida e impede a inicialização do cliente.

## `EndpointKind`

Valores: `local`, `lan`, `cloud`.

Prioridade no modo automático: `local < lan < cloud`.

## `EndpointConfig`

| Campo | Tipo | Regra |
|---|---|---|
| `kind` | `EndpointKind` | Obrigatório e único na lista |
| `url` | URL absoluta | HTTP permitido apenas para desenvolvimento local; LAN operacional e cloud exigem HTTPS |
| `publishableKey` | texto | Obrigatório; nunca registrar ou exibir |
| `probeTimeoutMs` | inteiro | Entre 250 e 10.000 ms; padrão 2.000 ms |
| `enabled` | booleano | Derivado da presença de URL e chave |

## `FailureKind`

| Valor | Exemplos | Permite fallback |
|---|---|---|
| `timeout` | limite do probe excedido | Sim |
| `network` | DNS, conexão recusada, CORS ou perda de rede | Sim |
| `service_unavailable` | resposta 5xx | Sim |
| `authentication` | credencial ou sessão rejeitada | Não |
| `authorization` | identidade autenticada sem permissão para a operação | Não |
| `validation` | entrada ou operação rejeitada pelo contrato do serviço | Não |
| `isolation` | política RLS ou isolamento entre organizações rejeitou o acesso | Não |
| `configuration` | URL, modo ou chave ausente/inválida | Não |
| `unknown` | resposta não classificada | Não, por segurança |

`timeout`, `network` e `service_unavailable` são resultados possíveis do probe. Os demais valores representam configuração inválida ou erros operacionais recebidos depois que o cliente foi criado. Nenhum erro operacional permite fallback.

## `ConnectionState`

| Estado | Significado |
|---|---|
| `idle` | resolução ainda não iniciada |
| `probing` | um endpoint está sendo verificado |
| `connected` | o primeiro endpoint elegível foi escolhido e o cliente pode ser criado |
| `degraded` | um endpoint posterior na ordem elegível foi escolhido após pelo menos uma falha que permitia fallback |
| `blocked` | uma falha não elegível a fallback exige correção |
| `offline` | nenhum endpoint elegível respondeu |

## `ResolutionAttempt`

| Campo | Tipo | Regra |
|---|---|---|
| `endpoint` | `EndpointKind` | Endpoint avaliado |
| `startedAt` | instante monotônico | Usado apenas para duração |
| `durationMs` | número não negativo | Pode ser registrado |
| `outcome` | sucesso ou `FailureKind` | Nunca inclui chave, token ou corpo sensível |
| `statusCode` | inteiro opcional | Registrar somente quando houver resposta HTTP |

## `ResolutionResult`

| Campo | Tipo | Regra |
|---|---|---|
| `state` | `ConnectionState` | Estado final da resolução |
| `selectedEndpoint` | `EndpointKind` opcional | Presente em `connected` e `degraded`; preservado em `blocked` quando o bloqueio ocorrer depois da criação do cliente |
| `attempts` | lista de `ResolutionAttempt` | Ordem preservada; sem dados sensíveis |
| `fallbackOccurred` | booleano | Verdadeiro quando o endpoint selecionado não é o primeiro elegível |
| `messageCode` | texto enumerado | Usado pela UI para mensagem acessível e traduzível |

## Transições

```text
idle
  └── iniciar → probing

probing
  ├── sucesso no primeiro elegível → connected
  ├── falha elegível + próximo endpoint → probing
  ├── sucesso após falha anterior → degraded
  ├── falha bloqueante → blocked
  └── destinos esgotados → offline

connected | degraded
  ├── erro operacional bloqueante → blocked, preservando selectedEndpoint
  └── reconexão explícita → probing

blocked | offline
  └── reconexão explícita → probing
```

Não existe transição automática entre endpoints depois de `connected` ou `degraded` nesta spec.
