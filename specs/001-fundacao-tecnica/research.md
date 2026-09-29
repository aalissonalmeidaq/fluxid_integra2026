# Pesquisa técnica: Fundação do FluxID

## Decisão 1: base web e versões

**Decisão**: usar Node.js 24.21.0, TypeScript 7.0.2, React 19.3.0, Vite 8.3.1, Tailwind CSS 4.3.3 e Supabase CLI 2.117.0 como dependência de desenvolvimento. As dependências serão instaladas com versões exatas e registradas em `package-lock.json`.

**Justificativa**: as versões são estáveis no momento do planejamento, atendem às decisões oficiais do projeto e evitam variação entre máquinas e CI.

**Alternativas consideradas**: faixas semver com `^`, rejeitadas por reduzirem a reprodutibilidade; outro gerenciador de pacotes, rejeitado porque o repositório já usa npm.

## Decisão 2: PWA

**Decisão**: usar `vite-plugin-pwa` 1.3.0 com manifest versionado, geração controlada do service worker e estratégia conservadora de cache apenas para o shell estático nesta spec.

**Justificativa**: entrega instalação e atualização controlada sem introduzir persistência de dados de negócio antes de uma estratégia de sincronização.

**Alternativas consideradas**: service worker manual, rejeitado por aumentar complexidade; cache de respostas Supabase, rejeitado por risco de dados obsoletos e vazamento entre sessões.

## Decisão 3: cliente Supabase

**Decisão**: usar `@supabase/supabase-js` 2.117.2 e criar exatamente um cliente depois que o resolvedor selecionar o endpoint. Somente chaves publicáveis entram no bundle.

**Justificativa**: clientes simultâneos poderiam abrir conexões concorrentes e facilitar escrita duplicada. A documentação atual recomenda chaves publicáveis para navegador e reserva chaves secretas ao servidor.

**Alternativas consideradas**: cliente por endpoint mantido em paralelo, rejeitado; chaves legadas `anon`, aceitas apenas como compatibilidade temporária e não como contrato novo.

**Fontes**: https://supabase.com/docs/guides/getting-started/api-keys e https://supabase.com/docs/guides/local-development/cli/getting-started

## Decisão 4: probe de disponibilidade

**Decisão**: fazer `GET` em `{SUPABASE_URL}/auth/v1/health` com `AbortController`, sem chave e com timeout configurável. Resposta 2xx indica somente disponibilidade do serviço; timeout, falha de rede e 5xx permitem tentar o próximo endpoint; 4xx recebido pelo probe indica acesso ou configuração inválida e não produz fallback. Rejeições posteriores de chave publicável, sessão, autorização, validação ou RLS pertencem ao fluxo operacional do cliente já selecionado, são classificadas separadamente e nunca iniciam fallback automático.

**Justificativa**: o endpoint verifica o serviço sem consultar dados nem depender do OpenAPI da Data API, mas não autentica a chave, a sessão nem as políticas RLS. Separar saúde do endpoint de erro operacional evita atribuir ao probe uma garantia que ele não fornece e impede que acesso negado seja escondido por uma troca de destino.

**Alternativas consideradas**: consultar `/rest/v1/`, rejeitado porque o acesso ao esquema via chave pública mudou; executar consulta em tabela sentinela, rejeitado porque esta spec não cria schema; `navigator.onLine`, rejeitado porque não prova disponibilidade do serviço.

**Fontes**: https://github.com/supabase/auth e https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key

## Decisão 5: prioridade e estabilidade

**Decisão**: em modo `auto`, avaliar `local`, `lan` e `cloud` uma única vez nessa ordem. Fixar o resultado em memória durante a sessão e permitir nova resolução apenas por ação explícita ou reinício controlado.

**Justificativa**: evita oscilação, sessões partidas e comportamento não determinístico.

**Alternativas consideradas**: corrida paralela entre endpoints, rejeitada porque viola prioridade; monitoramento que troca automaticamente durante a sessão, rejeitado porque autenticação e dados não são intercambiáveis.

## Decisão 6: local, LAN e produção

**Decisão**: usar a pilha do Supabase CLI apenas em desenvolvimento e testes no mesmo equipamento. Um endpoint LAN operacional deve ser uma implantação self-hosted homologada, endurecida e servida por HTTPS.

**Justificativa**: a documentação do Supabase declara que a pilha CLI não é endurecida para produção e não deve ser exposta externamente.

**Alternativas consideradas**: expor a porta do CLI diretamente na LAN, rejeitado por ausência de TLS, rate limiting e credenciais adequadas.

**Fontes**: https://supabase.com/docs/guides/self-hosting e https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https

## Decisão 7: testes e acessibilidade

**Decisão**: usar Vitest 5.0.2 para unidades e contratos, React Testing Library para componentes, Playwright 1.63.0 para E2E e axe-core para acessibilidade. O resolvedor terá cobertura integral de cenários.

**Justificativa**: separa regras puras, integração do navegador e experiência final, atendendo aos gates constitucionais.

**Alternativas consideradas**: somente testes E2E, rejeitados por lentidão e diagnóstico fraco; somente testes unitários, rejeitados porque não validam PWA, viewport e acessibilidade no navegador.

## Decisão 8: dados e sincronização

**Decisão**: não criar tabelas, migrations, filas persistentes ou replicação nesta spec. O estado de conectividade vive somente em memória.

**Justificativa**: fallback de endpoint não equivale a sincronização de bancos. Antecipar schema violaria o escopo e criaria uma falsa garantia de continuidade.

**Alternativas consideradas**: tabela de health check e fila offline genérica, rejeitadas porque exigem regras de identidade, conflito e retenção ainda não especificadas.
