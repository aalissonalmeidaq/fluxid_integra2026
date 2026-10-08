# Geocodificação do protótipo (Nominatim)

> **Integração temporária e exclusiva do protótipo.** O uso do serviço público OpenStreetMap/Nominatim existe apenas para validar o fluxo de cadastro de unidades com dados fictícios. Ela **não** é a solução de produção: antes de qualquer uso real, o provedor deve ser trocado por um serviço contratado (ou por uma instância própria), com decisão da pessoa responsável e da equipe jurídica (T146 da Spec 007). Quando isso acontecer, esta integração, a tabela de cache e este documento saem junto.

## O que ela faz

Na tela de cadastro e edição de unidade, o botão **Buscar coordenadas** pede ao servidor a latitude e a longitude do endereço. A pessoa revisa o resultado, pode corrigir o ponto no mapa (clique no ponto certo) ou nos campos de latitude e longitude, e só então salva.

Regras do fluxo:

1. A busca roda **somente no clique** em "Buscar coordenadas". Não há consulta durante a digitação e não há autocomplete.
2. O clique abre o aviso: *"O endereço será enviado ao serviço externo OpenStreetMap/Nominatim para obtenção das coordenadas. Use esta função apenas com endereços fictícios ou de unidades comerciais."* A consulta só acontece depois de **Concordo e buscar coordenadas**. O servidor recusa (`CONFIRMATION_REQUIRED`) qualquer pedido sem `consent_confirmed: true`.
3. O navegador **nunca** chama o Nominatim. Só a Edge Function `geocode-address` fala com o serviço, depois de autenticar a sessão e conferir a permissão `customer.write`.
4. O resultado é uma sugestão: nada é gravado até a pessoa confirmar o endereço e o ponto (RF-066).

## Variáveis de ambiente (somente servidor)

Lidas pela Edge Function `geocode-address`. Nunca use o prefixo `VITE_` e nunca as leia no cliente. Modelo em `.env.example`; no Supabase local os valores do protótipo estão em `[edge_runtime.secrets]` de `supabase/config.toml`; em LAN e cloud defina-os como segredos da função.

| Variável | Valor do protótipo | Padrão se ausente | Efeito |
|---|---|---|---|
| `GEOCODING_ENABLED` | `true` | `false` | Liga a funcionalidade. Desligada, a função responde `FEATURE_DISABLED` (403) logo após autenticar, sem consultar nada. Só o valor `true` liga. |
| `GEOCODING_PROVIDER` | `nominatim` | `nominatim` | Escolhe o provedor registrado em `supabase/functions/geocode-address/registry.ts`. Nome desconhecido responde `SERVICE_UNAVAILABLE` (nunca cai em outro provedor). |
| `GEOCODING_ALLOW_PERSONAL_ADDRESSES` | `false` | `false` | `false` bloqueia (`PERSONAL_ADDRESS_NOT_ALLOWED`) o endereço de cadastro de **pessoa física**. O tipo de pessoa é lido do banco, nunca do corpo do pedido. |
| `GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION` | `true` | `true` | Exige a confirmação explícita no pedido. Só o valor `false` dispensa. |
| `GEOCODING_CACHE_TTL_DAYS` | `30` | `30` | Retenção do cache server-side, de 1 a 90 dias (inteiro). Valor ausente, inválido ou fora da faixa volta a 30. |
| `GEOCODING_RATE_LIMIT_PER_SECOND` | `1` | `1` | Limite **global** ao provedor. Nunca passa de 1 requisição por segundo: valores maiores viram 1; frações alargam a janela (`0.5` = 1 a cada 2 s). |
| `GEOCODING_BLOCK_REAL_CALLS` | *(não definir)* | `false` | Opcional. `true` faz o adaptador recusar chamadas reais (como acontece sempre sob Vitest/`NODE_ENV=test`). Use em pipelines que rodam a função fora do Vitest. |

## Quando a consulta é bloqueada

| Situação | Resposta | Chamou o provedor? |
|---|---|---|
| Sem sessão válida | `AUTH_REQUIRED` 401 | não |
| Funcionalidade desligada | `FEATURE_DISABLED` 403 | não |
| Confirmação não fornecida | `CONFIRMATION_REQUIRED` 428 | não |
| Endereço incompleto (falta logradouro, número, cidade, UF ou CEP válido) | `ADDRESS_INCOMPLETE` 400 | não |
| Sem a permissão `customer.write` | `ACCESS_DENIED` 403 | não |
| Cliente que não existe nesta organização | `NOT_FOUND` 404 | não |
| Cadastro de pessoa física | `PERSONAL_ADDRESS_NOT_ALLOWED` 403 | não |
| Cliente inativo ou anonimizado | `CUSTOMER_NOT_OPERABLE` 409 | não |
| Limite por pessoa (10/min), por organização (100/min) ou global (1/s) | `RATE_LIMITED` 429 | não |
| Teste automatizado sem mock | `TEST_ENVIRONMENT_BLOCKED` 403 | não (a rede nem é tocada) |
| Tempo esgotado (4 s), status diferente de 200 ou resposta inválida | `SERVICE_UNAVAILABLE` 503 | sim; a tela leva à digitação manual |

Os dois primeiros limites usam os baldes `geocode:user` e `geocode:org`; o global usa o balde `geocode:provider` (nome do provedor como sujeito) e só é consumido quando não houve acerto de cache.

## O que sai para o provedor

Somente: **logradouro, número, cidade, estado, CEP e país** (fixo: Brasil), na query string de um `GET` sem corpo nem cookies, com `user-agent` que identifica o aplicativo. Nunca saem nome, CPF, CNPJ, telefone, e-mail, motorista, cliente, organização (tenant), bairro, complemento, instruções de acesso ou identificação do cilindro. O bairro e os demais campos são ignorados no servidor mesmo que cheguem no corpo.

## Cache server-side

- **Chave**: SHA-256 do endereço normalizado (sem acentos, em minúsculas, espaços únicos: logradouro, número, cidade, UF, CEP). O texto do endereço não serve de índice.
- **Isolamento entre tenants**: tabela `private.geocode_cache` com `organization_id` na chave primária, RLS ligada, sem política e sem privilégio para `anon`/`authenticated`; só o servidor (`service_role`) usa as funções `read_geocode_cache` e `write_geocode_cache`, que sempre filtram por organização. O mesmo endereço em duas organizações são duas linhas e nunca se enxergam (teste pgTAP com dois tenants).
- **Retenção**: `GEOCODING_CACHE_TTL_DAYS` (padrão **30 dias**, de 1 a 90) a partir da gravação. Entrada vencida nunca é devolvida e é apagada a cada escrita da mesma organização. Só respostas encontradas são guardadas (endereço sem resultado não entra no cache).
- **Efeito**: um acerto não chama o Nominatim nem gasta o limite global; a autorização, o tipo de pessoa e os limites individuais continuam valendo.
- O que fica guardado são coordenadas, precisão e o endereço formatado devolvido pelo provedor, do mesmo cadastro comercial. Por isso o aviso pede dados fictícios no protótipo.

## Registro de operação (logs)

A função registra uma linha JSON por pedido com **somente**: `operationId` (UUID gerado para a operação), `provider`, `durationMs`, `status` (HTTP) e `errorCode` (código fixo, como `RATE_LIMITED` ou `provider_timeout`, ou `null`). Nunca o endereço, a URL da requisição, o cliente, a organização ou a pessoa. Falhas de rede do provedor são reduzidas a um código fixo antes de subir, porque a mensagem original pode conter a URL.

## Trocar o provedor

1. Implemente `GeocodingProvider` (`name` e `geocode(query, signal)`), lançando `GeocodingProviderError` com código fixo nas falhas.
2. Registre a fábrica em `DEFAULT_PROVIDERS` (`registry.ts`).
3. Defina `GEOCODING_PROVIDER` com o nome registrado.

O frontend, o contrato e o cache não mudam. O nome do provedor é o sujeito do balde global de limite e aparece no registro de operação.

## Testes

Nenhum teste chama o serviço real: o adaptador recusa a chamada sem `fetch` injetado em ambiente de teste, e `src/test/setup.ts` rejeita qualquer `fetch` ao host do Nominatim. O provedor só é instanciado quando `GEOCODING_ENABLED=true`; desligada, a função responde `FEATURE_DISABLED` sem sequer criar o adaptador. Configurações do frontend não existem: nenhuma dessas decisões é lida nem controlável pelo navegador.

## Uso permitido e produção

- O Nominatim público está autorizado **somente para o protótipo** e **somente para endereços fictícios ou de unidades comerciais**. Cadastro de pessoa física permanece bloqueado.
- **Produção exigirá nova avaliação jurídica, contratual e de capacidade** (T146 da Spec 007): termos de uso e política de privacidade do provedor, contrato ou instância própria, volume esperado e limite de 1 requisição por segundo do serviço público.
- O provedor pode ser substituído por configuração, sem alterar o frontend (seção anterior).

Cobertura em `tests/contract/geocode-address-handler.test.ts`, `tests/contract/nominatim-provider.test.ts`, `tests/contract/geocoding-config.test.ts`, `supabase/tests/007_geocode_cache.test.sql`, `src/application/registry/geocoding-service.test.ts`, `src/pages/registry/components/coordinates-field.test.tsx` e `tests/e2e/registro-clientes.spec.ts`.
