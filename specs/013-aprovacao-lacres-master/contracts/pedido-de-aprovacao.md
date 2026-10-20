# Contrato: pedido de aprovação pelo `seal-gateway`

Complementa `specs/012-lacre-iot-geocerca-trava/contracts/mensagens-do-lacre.md`. A chamada e o corpo são os mesmos; mudam as respostas para lacres sem destinação.

## Chamada

Igual à Spec 012: `POST /functions/v1/seal-gateway`, `X-Device-Id` (código do chip, `DSP-` + 8) e `X-Device-Key` (chave criada pelo lacre). Enquanto não é aprovado, cada chamada leva só estas mensagens, com `firmware_version` no envelope:

- `event` com `code: "boot"`;
- `network_change` com `wifi` (`ssid`, `kind`, `rssi`) e `saved` (nomes das redes guardadas, até 5), no formato da Spec 012;
- quando houver, `event` com `code: "networks_forgotten"` e `detail` (`all` ou `extras`).

O banco tira daí `signal_dbm` (= `wifi.rssi`), `wifi_ssid` e `firmware_version` para o pedido. Nada disso entra em tenant (RN-003), nem como `seal_device_events`. O código `networks_forgotten` estende a lista de códigos de `event` da Spec 012 e também é aceito de lacre aprovado.

## Respostas novas

| Situação do código | Chave | Resposta | O lacre faz |
|---|---|---|---|
| desconhecido | qualquer | `202 {"status":"pending_approval","report_interval_s":60}`; cria o pedido | continua só com o `boot` a cada intervalo, sem fila de leituras |
| pendente | a do pedido | `202 {"status":"pending_approval","report_interval_s":60}`; atualiza última chamada, sinal e rede | idem |
| pendente | outra | `401 {"error":"unauthorized"}`; marca conflito no pedido (`conflict_at`, `conflict_key_hash`) | guarda e tenta no próximo intervalo; LED de erro |
| recusado | a do pedido | `403 {"status":"refused"}`; só atualiza a última chamada, sem reabrir o pedido | tenta de novo a cada 1 h |
| expirado | a do pedido | volta a `pending` e responde `202` | idem pendente |
| aprovado | a do pedido | `200` como na Spec 012 | passa a operar: leituras, fila, comandos |
| aprovado | outra | `401 {"error":"unauthorized"}`; marca conflito | idem 401 |
| devolvido | a do pedido | `202 {"status":"pending_approval","report_interval_s":60,"forget_networks":"all"}` | apaga todas as redes, exceto a configurada pelo portal depois do último `200`; sem rede, abre o portal; confirma com `networks_forgotten`; volta a só pedir aprovação |
| retirado | a do pedido | `202 {"status":"pending_approval","report_interval_s":60,"forget_networks":"extras"}` (ou `"all"`, se o Master escolheu) | com `extras`, apaga as redes da lista do sistema e mantém a principal; com `all`, como no devolvido; confirma com `networks_forgotten`; volta a só pedir aprovação |

Regras:

- Nenhuma resposta revela organização, cilindro ou o motivo de um 401 (CA-006 da Spec 012).
- Antes da aprovação, nada do corpo é gravado além do resumo do pedido (sinal, rede, versão do firmware). Nenhuma posição, alerta ou evento entra em tenant (RN-003).
- Limite de pedidos novos: 20 por hora por resumo de endereço. Acima disso: `429 {"error":"rate_limited"}` com `Retry-After`.
- `forget_networks` (RN-006) segue em toda resposta `202` até o lacre enviar `event` `networks_forgotten`. Então o banco limpa a marca e, com `all`, anula `last_organization_id`. Apagar redes já apagadas não tem efeito, então repetir a marca é seguro. O lacre guarda o evento na NVS e o repete enquanto a resposta `202` ainda trouxer `forget_networks`; quando ela deixa de trazer a marca, o evento foi aceito. Num lacre aprovado (`200`), vale o resultado `stored` ou `duplicate`, como na Spec 012.
- Lacres da Spec 012 com código e chave do cadastro manual seguem respondendo `200` (compatibilidade).
