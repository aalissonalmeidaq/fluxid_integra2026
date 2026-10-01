# Contrato: resolução de conectividade e gerenciamento de cliente

**Spec**: `002-autenticacao-multitenancy-rbac`
**Substitui**: prioridade `local → LAN → cloud` da Spec 001
**Decisão arquitetural**: [ADR-001](../../../docs/decisoes-arquiteturais/ADR-001-prioridade-cloud-e-sincronizacao-segura.md)

---

## 1. Configuração de endpoints (`EndpointConfiguration`)

Cada endpoint tem um par `url` e `anonKey` (chave publicável). Os três endpoints são:

| Identificador | Variável de URL               | Variável de chave              |
|---------------|-------------------------------|-------------------------------|
| `cloud`       | `VITE_SUPABASE_CLOUD_URL`     | `VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY` |
| `lan`         | `VITE_SUPABASE_LAN_URL`       | `VITE_SUPABASE_LAN_PUBLISHABLE_KEY`   |
| `local`       | `VITE_SUPABASE_LOCAL_URL`     | `VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY` |

Regras:

- Nenhum valor de variável pode ser embutido diretamente no código-fonte.
- O endereço LAN é sempre configurável por ambiente; nenhum IP/hostname LAN pode ser fixado no código.
- Variáveis sem prefixo `VITE_` nunca chegam ao bundle do navegador.
- `service_role`, senhas de banco, chaves administrativas e tokens privados nunca integram a configuração do cliente.
- Endpoint com par URL/chave incompleto ou malformado é inelegível. Ausência de variáveis de um endpoint não é erro; o endpoint simplesmente não é avaliado.
- Timeout configurável por variável de ambiente; se ausente, usa valor padrão seguro definido no código.

Saída da validação: lista ordenada de endpoints elegíveis e timeout efetivo, sem expor os valores das chaves.

Cada build também declara uma versão pública esperada de contrato/schema. Depois do probe de saúde, o destino deve informar sua versão compatível. Ausência ou divergência é `configuration`, bloqueia o ciclo e não permite fallback.

---

## 2. Probe de disponibilidade (`EndpointHealthCheck`)

```
GET {endpoint.url}/auth/v1/health
```

Propriedades:

- Sem cabeçalhos de autenticação, sessão ou payload.
- Cancelado ao atingir `probeTimeoutMs`.
- Corpo da resposta não é persistido nem registrado.
- Cada endpoint é sondado no máximo uma vez por ciclo de resolução.

Classificação da resposta do probe:

| Condição                                 | Resultado                          |
|------------------------------------------|------------------------------------|
| HTTP 2xx                                 | disponível                         |
| Timeout, transporte, DNS, recusa         | indisponibilidade elegível ao fallback |
| HTTP 5xx                                 | indisponibilidade elegível ao fallback |
| HTTP 4xx                                 | falha bloqueante                   |
| Resposta fora dessas categorias          | falha bloqueante                   |

O probe confirma apenas que o serviço Auth está respondendo. Não valida chave publicável, sessão, permissões de linha nem RLS.

---

## 3. Classificador de falhas (`ConnectionFailureClassifier`)

Entrada: apenas metadados sanitizados (status HTTP, código de erro estável). Nenhum corpo completo, chave ou token.

### Falhas que permitem fallback

- Dispositivo sem acesso à internet.
- Falha de DNS.
- Timeout de rede ou de probe.
- Conexão recusada.
- Endpoint inalcançável.
- Interrupção de rede.
- HTTP 5xx (servidor indisponível).

### Falhas que bloqueiam a resolução (sem fallback)

| Categoria           | Exemplos                                              |
|---------------------|-------------------------------------------------------|
| Autenticação        | credenciais inválidas, sessão expirada, bloqueado     |
| Autorização         | ausência de permissão, acesso negado                  |
| RLS                 | violação de política de isolamento                    |
| Tenant              | acesso a tenant incorreto, tenant suspenso            |
| Validação           | schema inválido, campo obrigatório ausente            |
| Integridade         | conflito de chave, constraint violada                 |
| Configuração        | variável obrigatória ausente, endpoint inelegível     |
| Funcional/Domínio   | regra de negócio violada                              |
| HTTP 4xx (geral)    | qualquer 4xx retornado pelo probe                     |

Falha bloqueante atualiza o estado para `blocked` e não reinicia o resolvedor. Apenas ação explícita ou backoff automático inicia novo ciclo.

---

## 4. Resolvedor cloud-first (`CloudFirstConnectionResolver`)

### Ordem obrigatória

```
CLOUD → LAN → LOCAL
```

Reiniciada a cada novo ciclo completo de resolução.

### Algoritmo determinístico

1. Validar configuração de `cloud`.
2. Se inelegível, registrar e avançar para `lan`.
3. Executar probe em `cloud` com timeout configurável.
4. Se disponível, selecionar e encerrar.
5. Se falha bloqueante, estado `blocked` e encerrar.
6. Se indisponibilidade técnica, registrar e avançar para `lan`.
7. Validar configuração de `lan`.
8. Se inelegível, avançar para `local`.
9. Executar probe em `lan`.
10. Se disponível, selecionar e encerrar.
11. Se falha bloqueante, estado `blocked` e encerrar.
12. Se indisponibilidade técnica, avançar para `local`.
13. Validar configuração de `local`.
14. Se inelegível, estado `offline` e encerrar.
15. Executar probe em `local`.
16. Se disponível, selecionar em modo degradado explícito.
17. Se todos indisponíveis, estado `offline` ou `blocked` conforme classificação final.

### Restrições

- Uma única passagem por ciclo; sem tentativas infinitas.
- Sem execuções concorrentes.
- Cancelável a qualquer momento.
- Repetição manual disponível após `blocked` ou `offline`.
- Repetição automática com backoff limitado (tentativas e intervalo configuráveis).
- Registra: endpoint selecionado, categoria de falha, duração — sem URL completa, chave ou token.

---

## 5. Gerenciador do cliente ativo (`SupabaseClientManager`)

- Exatamente um cliente Supabase ativo em qualquer instante.
- Troca invalida o cliente anterior antes de criar o novo.
- Nenhuma operação nova é iniciada no cliente invalidado.
- Sessões não são transferidas entre projetos por simples troca de URL.
- Reautenticação válida no destino é exigida quando a sessão não é portável.
- O gerenciador não copia refresh token, senha ou segredo MFA entre projetos.

---

## 6. Estados de conectividade (`ConnectivityState`)

| Estado         | Semântica                                                         |
|----------------|-------------------------------------------------------------------|
| `initializing` | Configuração carregada; resolução ainda não iniciada.             |
| `probing`      | Probe em andamento.                                               |
| `connected`    | Cloud selecionado; operação normal.                               |
| `degraded`     | LAN ou local ativo após indisponibilidade técnica do cloud.       |
| `syncing`      | Sincronização ativa (push ou pull).                               |
| `conflict`     | Conflito de sincronização aguardando resolução.                   |
| `blocked`      | Falha de segurança, domínio, configuração ou autorização.         |
| `offline`      | Nenhum endpoint disponível.                                       |

### Contrato visual

| Estado      | Mensagem mínima                            | Semântica ARIA                          |
|-------------|--------------------------------------------|-----------------------------------------|
| `probing`   | Verificando conexão                        | `role="status"` não interruptivo        |
| `connected` | Conectado ao destino selecionado           | Destino expresso em texto               |
| `degraded`  | Operando em modo degradado via [endpoint]  | Texto: endpoint ativo e fallback        |
| `syncing`   | Sincronizando alterações                   | `role="status"` com progresso textual   |
| `conflict`  | Conflito encontrado — ação necessária      | `role="alert"` com orientação           |
| `blocked`   | Acesso ou configuração precisa de correção | `role="alert"` com ação recomendada     |
| `offline`   | Nenhum serviço disponível                  | `role="alert"` com orientação           |

- O componente de interface recebe apenas o estado; não executa regras de seleção nem cria clientes.
- Cor não pode ser o único indicador do estado.
- Timeout e recuperação são sempre finitos; a interface nunca fica indefinidamente bloqueada.

---

## 7. Promoção de cloud (`EndpointPromotionCoordinator`)

Em modo `degraded`, cloud é reavaliada após 60 segundos, com jitter de até 10%, backoff limitado e sem ciclos sobrepostos.

### Sequência obrigatória de promoção

1. Não trocar o cliente durante operação em andamento.
2. Pausar aceitação de novas mutações.
3. Estabilizar ou cancelar com segurança a operação corrente.
4. Executar push completo até confirmação ou conflito crítico.
5. Executar pull desde o último cursor válido.
6. Confirmar sessão, tenant ativo e consistência mínima.
7. Somente então invalidar o cliente anterior e promover o cliente cloud.
8. Registrar a transição de forma auditável.

### Proibições

- Sem duplicação de operações.
- Sem perda de dados.
- Sem sobrescrita silenciosa de versão remota.
- Sem envio duplicado de comandos.
- Sem troca de tenant na promoção.
- Sem reutilização indevida de sessão.
- Sem vazamento entre tenants.

---

## 8. Segurança e isolamento

- Frontend usa somente chaves publicáveis.
- `service_role` e chaves secretas nunca recebem prefixo `VITE_` e nunca chegam ao navegador.
- Supabase CLI é exclusivo para desenvolvimento; não exposto como serviço operacional na LAN.
- Instalação Supabase em LAN tratada como ambiente self-hosted endurecido com HTTPS.
- Logs e auditoria nunca contêm URL completa, chave, token, senha ou dado sensível.
- Base local, outbox e cursores são segregados por `organization_id`.
- Encerramento de sessão ou troca de tenant limpa ou isola o contexto anterior sem sincronização cruzada.
- Cloud, LAN e local são autoridades de sessão independentes; compartilhar chave JWT não torna uma sessão portável.
- Troca para LAN ou local exige autenticação emitida e validada no próprio destino antes de liberar dados protegidos.
- Senha, refresh token, segredo MFA e tabelas internas de Auth não são copiados ou sincronizados pela PWA.
- O service worker pré-carrega somente o app shell. As rotas `/auth/v1`, `/rest/v1`, `/graphql/v1`, `/storage/v1`, `/functions/v1` e `/realtime/v1` ficam no `navigateFallbackDenylist`: uma navegação offline a elas falha em vez de receber o shell como se fosse resposta do servidor. Teste: `tests/e2e/pwa.spec.ts`.

---

## 9. Cobertura de testes obrigatória

| Cenário                                                     | Comportamento esperado                       |
|-------------------------------------------------------------|----------------------------------------------|
| Cloud disponível                                            | Seleciona cloud; LAN e local não sondados    |
| Cloud indisponível (técnico) e LAN disponível               | Seleciona LAN; local não sondado             |
| Cloud e LAN indisponíveis; local disponível                 | Seleciona local em modo degradado            |
| Todos indisponíveis                                         | Estado `offline`                             |
| Erro de autenticação no cloud                               | Estado `blocked`; sem fallback               |
| Erro de autorização no cloud                                | Estado `blocked`; sem fallback               |
| Violação de RLS no cloud                                    | Estado `blocked`; sem fallback               |
| Timeout no cloud                                            | Fallback elegível para LAN                   |
| Cloud retorna após LAN ativa                                | Promoção somente após sincronização segura   |
| Troca de endpoint                                           | Invalida cliente anterior                    |
| Resolução concorrente                                       | Segunda é rejeitada ou serializada           |
| Nenhuma chave privilegiada no bundle                        | Varredura automatizada aprovada              |
| Nenhum segredo nos logs                                     | Varredura automatizada aprovada              |
| Falha de RLS não aciona fallback                            | Estado `blocked`; resolvedor não chamado     |
