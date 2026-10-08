# Contrato: geocodificação do endereço da unidade

**Atende**: RF-065 a RF-069, RNF-004, CA-018

## Função `geocode-address`

`POST` com `authorization: Bearer <token da sessão>` e `apikey` publicável. Corpo:

```json
{ "organization_id": "<uuid>", "street": "Praça da Sé", "number": "100", "district": "Sé", "city": "São Paulo", "state": "SP", "postal_code": "01001-000" }
```

`street`, `city` e `state` (UF válida) são obrigatórios; `number`, `district` e `postal_code` são opcionais. O CEP aceita hífen e espaços e é normalizado para 8 dígitos **antes** de qualquer chamada externa. Qualquer outro campo do corpo (nome, documento, contatos, responsável, instruções de acesso, coordenadas) é **ignorado** e nunca chega ao provedor.

**Permissão**: `customer.write`, conferida no banco como nas demais operações. Sem permissão, nada é consultado.

### Respostas

| Código | HTTP | Quando | Corpo |
|---|---|---|---|
| `FOUND` | 200 | o provedor localizou o endereço | `{ code, location: { latitude, longitude, display_name, precision } }` |
| `NOT_FOUND` | 200 | o provedor não achou o endereço | `{ code }` |
| `VALIDATION_FAILED` | 400 | campo obrigatório ausente, UF inválida, CEP malformado | `{ code, fields: [{ field, message }] }` |
| `AUTH_REQUIRED` / `ACCESS_DENIED` | 401 / 403 | sem sessão ou sem permissão | `{ code }` |
| `RATE_LIMITED` | 429 | passou de 10/min por pessoa, 100/min por organização ou 1/s no provedor | `{ code, retry_after_seconds }` |
| `SERVICE_UNAVAILABLE` | 503 | tempo esgotado (4 s), status diferente de 200, JSON inválido ou coordenadas fora do intervalo | `{ code }` |

`precision` vale `address` (ponto no número), `street` (só a rua) ou `locality` (bairro ou cidade). A tela avisa quando não é `address`.

## Provedor

Porta `GeocodingProvider.geocode(query, signal)` com a implementação `NominatimProvider` (OpenStreetMap), busca estruturada com `format=jsonv2&limit=1&countrycodes=br`. Política de uso do Nominatim: cabeçalho `user-agent` que identifica o aplicativo e no máximo 1 requisição por segundo (balde global `geocode:provider`, 1 por 1 s). Trocar de provedor é implementar a porta; nada muda na tela nem neste contrato.

## O que sai e o que não sai

- Sai: logradouro, número, bairro, cidade, UF e CEP, na query string de um `GET` sem corpo nem cookies.
- Não sai: nome da unidade, cliente, documento, contatos, responsável, instruções, coordenadas, organização ou pessoa.
- O log guarda só `{ code, durationMs }`: nunca o endereço nem a pessoa. A resposta não é gravada, não entra no cache do service worker e é só uma sugestão.

## Confirmação e gravação (RF-066)

A busca não grava nada. A unidade é gravada por `create_site` ou `update_site` com o parâmetro opcional `coordinates_source`:

| `coordinates_source` | Efeito no banco |
|---|---|
| ausente ou `manual` | com coordenadas: origem `manual`; sem confirmação |
| `geocoded` | exige latitude e longitude; grava origem `geocoded`, `coordinates_confirmed_at = now()` e `coordinates_confirmed_by` (o ator) |

Na edição: coordenadas alteradas à mão passam a `manual` e perdem a confirmação; endereço alterado sem nova confirmação mantém a origem e **descarta** a confirmação; reenviar `geocoded` sem mudança não renova o instante; coordenadas removidas limpam origem e confirmação. A tela só envia `geocoded` quando a pessoa marcou "Confirmo que o endereço e o ponto estão corretos" para o mesmo endereço e as mesmas coordenadas da sugestão.

O evento `site_created`/`site_updated` e a auditoria `site.create`/`site.update` registram `coordinates_source` e `coordinates_confirmed` (RF-068), sem o endereço completo.

## Primeira entrega (RF-069)

`customer_sites.first_delivery_confirmed` começa `false`. A reconfirmação do endereço e do ponto pelo motorista na primeira entrega à unidade pertence à Fase 4 (viagens e paradas): lá o marcador passa a `true` e o fato entra no histórico da unidade. Esta spec só guarda o marcador e o mostra no detalhe.
