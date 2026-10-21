# Contrato: portal de configuração do lacre

Servido pelo próprio lacre na rede `FluxID-Lacre-XXXX` (4 últimos caracteres do código), protegida pela senha padrão (WPA2). Endereço `http://192.168.4.1/`; o DNS do lacre responde a qualquer nome com esse endereço, e os testes de "portal cativo" dos sistemas abrem a página sozinhos.

## Rotas

| Rota | Método | Resposta |
|---|---|---|
| `/` (e qualquer outra) | GET | a página de configuração (HTML) |
| `/redes` | GET | `{"codigo":"DSP-…","redes":[{"ssid":"…","sinal":"forte","rssi":-55,"aberta":false}]}`, ordenadas pelo sinal; nomes repetidos aparecem uma vez |
| `/testar` | POST (`ssid`, `senha`, `aberta`) | `202 {"situacao":"testando"}`; um teste por vez (`409 {"situacao":"ocupado"}`) |
| `/situacao` | GET | `{"situacao":"testando" \| "conectado" \| "falhou","motivo":"wifi_auth" \| "wifi_not_found" \| "wifi_no_internet" \| null,"aprovacao":"pendente" \| "aprovado" \| null}` |

Depois de uma conexão bem-sucedida, o ponto de acesso e esta página continuam disponíveis enquanto houver um cliente conectado, para que a pessoa confira a rede e o acesso ao FluxID. Sem cliente, o portal fecha após o prazo normal de inatividade; não há fechamento especial 60 segundos depois do sucesso.

## Regras

- **Sinal em texto:** forte (≥ -60 dBm), médio (-61 a -75) ou fraco (< -75), sempre com a palavra e não só um ícone.
- **Validação**, a mesma do domínio das redes (Spec 012):
  - nome de 1 a 32 bytes;
  - senha de 8 a 63 caracteres, ou rede aberta.
- **Escape:** todo nome de rede vindo da varredura passa por escape de HTML antes de entrar na página, e a lista em JSON também é escapada.
- **Sucesso:**
  - o lacre guarda a rede como a sua rede principal (a "padrão" da Spec 012);
  - mostra o resultado conforme o campo `aprovacao` de `/situacao`: "Conectado à internet e ao FluxID. O lacre aguarda a vinculação a um tenant pelo Master" (`pendente`) ou "Conectado. O lacre voltou a operar com a nova rede" (`aprovado`), sempre com o código;
  - mantém a rede de configuração e a página disponíveis enquanto houver cliente conectado; sem cliente, fecha após 15 min de inatividade.
- **Falha:**
  - nada é guardado e a rede de configuração continua aberta;
  - mensagens: senha errada (`wifi_auth`), rede fora do alcance (`wifi_not_found`), sem internet ou sem resposta do FluxID (`wifi_no_internet`).
- **Senha:**
  - não volta para a página, nem no erro;
  - nunca aparece no serial.
- **Acessibilidade:**
  - `lang="pt-BR"`, rótulos visíveis e área de toque de 44 px;
  - foco visível e contraste AA;
  - o resultado é anunciado por `role="status"`;
  - funciona de 360 px a desktop sem rolagem horizontal.
- **Verificação:** a página vem de `firmware/portal/index.html` e é testada no navegador por `tests/e2e/portal-lacre.spec.ts`. As rotas acima são simuladas, e o teste roda o axe, a navegação só por teclado, o anúncio de cada resultado, o escape de nome malicioso e a ausência da senha, em 360, 768 e 1920 px.

## Conexão atual em `/situacao` (RF-024)

Toda resposta de `GET /situacao` traz também a conexão atual do lacre, para a página mostrar ao abrir e a cada 5 s fora de um teste:

```json
{ "situacao": "ocioso", "motivo": null, "aprovacao": null,
  "conexao": { "rede": "FluxID", "fluxid": true, "aprovacao": "pendente" } }
```

- `rede`: o nome da rede em uso, ou `null` sem conexão. A página o mostra só como texto;
- `fluxid`: o último envio por essa rede teve resposta do FluxID;
- `aprovacao`: `pendente` (aguardando vinculação a um tenant) ou `aprovado` (em operação), só quando `fluxid` é verdadeiro.

A rede padrão da plataforma (RF-023) aparece aqui como qualquer outra.
