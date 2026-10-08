# Contrato: geocodificação do endereço da unidade

**Atende**: RF-065 a RF-069, RNF-004, CA-018

> **Integração temporária e exclusiva do protótipo** (ajuste de 08/10/2026). O uso do Nominatim público é controlado por configuração e só vale para dados fictícios. Variáveis, cache, retenção, bloqueios e troca de provedor estão em `docs/geocodificacao-prototipo.md`; não é a solução de produção (T146).

## Função `geocode-address`

`POST` com `authorization: Bearer <token da sessão>` e `apikey` publicável. Corpo:

```json
{ "organization_id": "<uuid>", "customer_id": "<uuid>", "consent_confirmed": true, "street": "Praça da Sé", "number": "100", "city": "São Paulo", "state": "SP", "postal_code": "01001-000" }
```

`street`, `number`, `city`, `state` (UF válida) e `postal_code` (8 dígitos) são **obrigatórios**: endereço incompleto é recusado antes de qualquer chamada externa. O CEP aceita hífen e espaços e é normalizado para 8 dígitos. `customer_id` serve só para o servidor conferir o tipo de pessoa do cliente no banco (nunca vai ao provedor). `consent_confirmed: true` é a confirmação explícita de que o endereço será enviado ao serviço externo. Qualquer outro campo do corpo (nome, documento, contatos, responsável, bairro, complemento, instruções de acesso, identificação do cilindro, coordenadas) é **ignorado** e nunca chega ao provedor.

**Ordem das verificações**: método, sessão, funcionalidade ligada (`GEOCODING_ENABLED`), identificadores, confirmação (`GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION`), endereço completo, permissão `customer.write` conferida no banco, cliente da organização, lido do banco (pertence à organização, ativo e não anonimizado) e seu tipo de pessoa (pessoa física bloqueada salvo `GEOCODING_ALLOW_PERSONAL_ADDRESSES=true`), limites por pessoa e por organização, cache, limite global ao provedor e, por fim, a consulta. Qualquer bloqueio anterior à consulta não chama o provedor.

### Respostas

| Código | HTTP | Quando | Corpo |
|---|---|---|---|
| `FOUND` | 200 | o provedor localizou o endereço | `{ code, location: { latitude, longitude, display_name, precision } }` |
| `NOT_FOUND` | 200 | o provedor não achou o endereço | `{ code }` |
| `ADDRESS_INCOMPLETE` | 400 | falta logradouro, número, cidade, UF válida ou CEP de 8 dígitos | `{ code, fields: [{ field, message }] }` |
| `VALIDATION_FAILED` | 400 | corpo que não é objeto, organização ou cliente que não são UUID | `{ code }` |
| `AUTH_REQUIRED` / `ACCESS_DENIED` | 401 / 403 | sem sessão ou sem permissão | `{ code }` |
| `FEATURE_DISABLED` | 403 | `GEOCODING_ENABLED` não é `true` | `{ code }` |
| `CONFIRMATION_REQUIRED` | 428 | sem `consent_confirmed: true` | `{ code }` |
| `PERSONAL_ADDRESS_NOT_ALLOWED` | 403 | cliente de pessoa física e `GEOCODING_ALLOW_PERSONAL_ADDRESSES` não é `true` | `{ code }` |
| `TEST_ENVIRONMENT_BLOCKED` | 403 | chamada real em ambiente de testes automatizados sem mock | `{ code }` |
| `NOT_FOUND` (cliente) | 404 | o cliente não existe na organização | `{ code }` |
| `CUSTOMER_NOT_OPERABLE` | 409 | o cliente está inativo ou anonimizado | `{ code }` |
| `RATE_LIMITED` | 429 | passou de 10/min por pessoa, 100/min por organização ou do limite global ao provedor (no máximo 1/s) | `{ code, retry_after_seconds }` |
| `SERVICE_UNAVAILABLE` | 503 | tempo esgotado (4 s), status diferente de 200, JSON inválido, coordenadas fora do intervalo ou provedor não registrado | `{ code }` |

`FOUND` traz também `cached` (`true` quando veio do cache da organização).

`precision` vale `address` (ponto no número), `street` (só a rua) ou `locality` (bairro ou cidade). A tela avisa quando não é `address`.

## Provedor

Porta `GeocodingProvider` (`name` e `geocode(query, signal)`) com a implementação `NominatimProvider` (OpenStreetMap), busca estruturada com `format=jsonv2&limit=1&countrycodes=br&country=Brasil`. O provedor é escolhido por `GEOCODING_PROVIDER` entre os registrados em `registry.ts`. Política de uso do Nominatim: cabeçalho `user-agent` que identifica o aplicativo e no máximo 1 requisição por segundo (balde global `geocode:provider`, com o nome do provedor como sujeito; `GEOCODING_RATE_LIMIT_PER_SECOND` nunca passa de 1). Trocar de provedor é implementar a porta e registrá-la; nada muda na tela nem neste contrato. Sob testes automatizados, o adaptador sem `fetch` injetado recusa a chamada real.

## O que sai e o que não sai

- Sai: logradouro, número, cidade, UF, CEP e país (fixo), na query string de um `GET` sem corpo nem cookies.
- Não sai: nome, CPF, CNPJ, telefone, e-mail, motorista, cliente, organização (tenant), bairro, complemento, instruções de acesso, identificação do cilindro ou coordenadas.
- O registro de operação guarda só `{ operationId, provider, durationMs, status, errorCode }`: nunca o endereço, a URL da requisição, o cliente, a organização ou a pessoa. Falhas de rede do provedor são reduzidas a um código fixo antes de subir.
- A resposta não entra no cache do service worker e é só uma sugestão. O servidor guarda um cache por organização, chaveado pelo hash do endereço normalizado, com retenção de `GEOCODING_CACHE_TTL_DAYS` dias (padrão 30, de 1 a 90; tabela `private.geocode_cache`, migration `20261008120000_geocode_cache.sql`).

## Tela

O botão **Buscar coordenadas** é o único gatilho: não há consulta durante a digitação nem autocomplete. O clique abre o aviso *"O endereço será enviado ao serviço externo OpenStreetMap/Nominatim para obtenção das coordenadas. Use esta função apenas com endereços fictícios ou de unidades comerciais."* e a consulta só acontece depois de **Concordo e buscar coordenadas**. Endereço incompleto nem abre o aviso. O ponto pode ser corrigido por clique no mapa ou nos campos de latitude e longitude antes de salvar; ponto corrigido à mão é gravado como `manual`, sem a confirmação da busca.

## Confirmação e gravação (RF-066)

A busca não grava nada. A unidade é gravada por `create_site` ou `update_site` com o parâmetro opcional `coordinates_source`:

| `coordinates_source` | Efeito no banco |
|---|---|
| ausente ou `manual` | com coordenadas: origem `manual`; sem confirmação |
| `geocoded` | exige latitude e longitude; grava origem `geocoded`, `coordinates_confirmed_at = now()` e `coordinates_confirmed_by` (o ator) |

Na edição: coordenadas alteradas à mão passam a `manual` e perdem a confirmação; endereço alterado sem nova confirmação mantém a origem e **descarta** a confirmação; reenviar `geocoded` sem mudança não renova o instante; coordenadas removidas limpam origem e confirmação. A tela só envia `geocoded` quando a pessoa marcou "Confirmo que o endereço e o ponto encontrados estão corretos." para o mesmo endereço e as mesmas coordenadas da sugestão.

O evento `site_created`/`site_updated` e a auditoria `site.create`/`site.update` registram `coordinates_source` e `coordinates_confirmed` (RF-068), sem o endereço completo.

## Primeira entrega (RF-069)

`customer_sites.first_delivery_confirmed` começa `false`. A reconfirmação do endereço e do ponto pelo motorista na primeira entrega à unidade pertence à Fase 4 (viagens e paradas): lá o marcador passa a `true` e o fato entra no histórico da unidade. Esta spec só guarda o marcador e o mostra no detalhe.
