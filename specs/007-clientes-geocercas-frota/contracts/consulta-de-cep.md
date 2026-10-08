# Contrato: consulta de CEP

**Atende**: RF-008 a RF-012, RNF-004, CA-006

## Função `lookup-postal-code`

`POST` com `authorization: Bearer <token da sessão>` e `apikey` publicável. Corpo: `{ "organization_id": "<uuid>", "postal_code": "01001-000" }`. O CEP aceita hífen e espaços e é normalizado para 8 dígitos **antes** de qualquer chamada externa; menos ou mais de 8 dígitos responde `VALIDATION_FAILED` sem chamar o serviço.

**Permissão**: `customer.write`, conferida no banco como nas demais operações. Sem permissão, nada é consultado.

### Respostas

| Código | HTTP | Quando | Corpo |
|---|---|---|---|
| `FOUND` | 200 | CEP existente | `{ code, address: { postal_code, street, district, city, state, ibge_code } }` |
| `NOT_FOUND` | 200 | o provedor diz que o CEP não existe | `{ code }` |
| `VALIDATION_FAILED` | 400 | CEP malformado | `{ code, fields: [{ field: 'postal_code', message }] }` |
| `AUTH_REQUIRED` / `ACCESS_DENIED` | 401 / 403 | sem sessão ou sem permissão | `{ code }` |
| `RATE_LIMITED` | 429 | passou de 10/min por pessoa ou 100/min por organização | `{ code, retry_after_seconds }` |
| `SERVICE_UNAVAILABLE` | 503 | tempo esgotado (4 s), erro 5xx, JSON inválido ou resposta suspeita | `{ code }` |
| `METHOD_NOT_ALLOWED` | 405 | método diferente de `POST` | `{ code }` |

`NOT_FOUND` e `SERVICE_UNAVAILABLE` são distintos para a tela dizer "CEP não encontrado" ou "não foi possível buscar agora" (RF-010). Toda resposta de falha é seguida pela digitação manual (RF-011).

### Porta do provedor

```ts
interface PostalCodeProvider {
  lookup(postalCode: string, signal: AbortSignal): Promise<PostalAddress | 'NOT_FOUND'>;
}
```

`ViaCepProvider` implementa a porta com `GET https://viacep.com.br/ws/{cep}/json/`. Trocar de provedor é implementar a porta; a tela e o contrato acima não mudam.

### O que sai para o provedor (RF-009, CA-006)

- URL fixa com **apenas** os 8 dígitos do CEP no caminho; sem query string e sem corpo.
- Cabeçalhos só `accept: application/json` e `user-agent: FluxID/1.0`; nenhum cookie, token ou identificador da pessoa ou da organização.
- Nenhum outro campo do formulário chega à função: o corpo da chamada do navegador não carrega número, complemento, nome ou documento, e a função ignora campos extras.

### Adaptação da resposta do ViaCEP

| ViaCEP | FluxID | Regra |
|---|---|---|
| `cep` | `postal_code` | 8 dígitos |
| `logradouro` | `street` | até 120; pode vir vazio (CEP genérico) |
| `bairro` | `district` | até 80; pode vir vazio |
| `localidade` | `city` | até 80; obrigatório |
| `uf` | `state` | uma das 27 UFs; senão `SERVICE_UNAVAILABLE` |
| `ibge` | `ibge_code` | 7 dígitos, opcional |
| `complemento`, `unidade`, `gia`, `ddd`, `siafi`, `estado`, `regiao` | — | ignorados (o complemento da unidade é digitado pela pessoa) |
| `erro` (`true` ou `"true"`) | `NOT_FOUND` | HTTP 200 com `{"erro":"true"}` |

### Observabilidade

O manipulador registra apenas o código de resultado e a duração em ms. Não registra CEP, nome, e-mail nem identificador de sessão (RF-012). A consulta não gera auditoria, porque não altera nada.

### Cliente

`postal-code-service.ts` chama a função com o transporte existente; a resposta nunca é guardada em `localStorage`, `sessionStorage`, IndexedDB nem no cache do service worker (`/functions/v1` já é exceção). Sem conexão, o serviço devolve o estado "offline" sem tentar a chamada.
