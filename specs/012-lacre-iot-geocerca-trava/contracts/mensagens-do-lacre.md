# Contrato: mensagens do lacre (`seal-gateway`)

**Atende**: RF-001 a RF-010, RF-016, RF-021, RF-022a, RF-026 a RF-029, RF-032, RF-034a a RF-034e, RF-040, CA-003, CA-006, CA-011

Os exemplos canônicos de cada pedido e resposta ficam em `tests/fixtures/seal-protocol/` e são usados pela borda, pelo simulador e pelos testes nativos do firmware (research.md, item 17). Este documento descreve as regras; os arquivos JSON são a referência exata.

## Chamada

```http
POST https://<projeto>.supabase.co/functions/v1/seal-gateway
Content-Type: application/json
X-Device-Id: DSP-7KQ2M9XT
X-Device-Key: fxk_<chave>
```

- Só HTTPS. Uma chamada por intervalo leva as mensagens e recebe o comando (RNF-004).
- O lacre **nunca** envia organização, cilindro ou cliente (RN-006).
- Corpo de até 64 KB.

## Corpo do pedido

```json
{
  "protocol": 1,
  "firmware_version": "2.0.0",
  "watch_version": 3,
  "messages": [
    {
      "message_id": "01JABCD...",
      "type": "position",
      "read_at": "2026-10-17T14:03:00Z",
      "latitude": -7.209194,
      "longitude": -39.306367,
      "quality": "gps",
      "accuracy_m": 6.5,
      "battery_pct": 87,
      "signal_dbm": -61,
      "seal_state": "closed",
      "wifi": { "ssid": "FluxID-Caminhao-02", "kind": "list", "rssi": -61 }
    }
  ]
}
```

| Campo | Regra |
|---|---|
| `protocol` | `1` nesta spec. O FluxID mantém a lista de versões aceitas (`private.seal_limits()->'protocols'`). Ao publicar uma versão nova, a anterior continua aceita até todos os lacres da organização informarem a nova em `firmware_version` e por no mínimo 30 dias (RF-007a). Versão fora da lista responde `400 unsupported_protocol` |
| `watch_version` | última versão da vigilância que o lacre guardou (0 se nenhuma) |
| `messages` | de 1 a 50 itens (RF-004); ordem livre, o FluxID ordena por `read_at` |
| `message_id` | único por mensagem, até 64 caracteres; o reenvio usa o mesmo valor |
| `read_at` | ISO 8601 em UTC; até 5 min no futuro é aceito (relógio do lacre) |

### Tipos de mensagem (RF-007)

| `type` | Campos próprios | Efeito |
|---|---|---|
| `position` | `latitude`, `longitude`, `quality` (`gps` ou `last_known`), `accuracy_m?`, `battery_pct` (0 a 100, ou `null` sem medição), `signal_dbm`, `seal_state`, `wifi?` | posição nova ou repetição (até 20 m); saúde; geocerca (RF-008 a RF-010, RF-018 a RF-021) |
| `event` | `code` (`boot`, `button`, `valve_moved`, `wifi_fallback_default`), `detail?` | registro no histórico do dispositivo |
| `alert` | `code` (`low_battery`, `weak_signal`, `seal_open`, `seal_broken`), `value?` | alerta do lacre, sem duplicar (RF-016) |
| `command_result` | `command_id`, `result` (`executed` ou `error`), `reason?` (`wifi_not_found`, `wifi_auth`, `wifi_no_internet`, `actuator`, `unknown`) | muda o comando e, se for de trava, o estado da trava (RF-027) |
| `activation` | posição como em `position`, `valve` (`open` ou `closed`, o estado gravado) | lacre ativo; gera o `seal_code` na primeira vez (RF-032); se `valve` divergir de `lock_state`, abre o alerta `command_failed` com motivo `state_mismatch`, sem mudar a trava |
| `shutdown` | posição como em `position` | saúde `off` e alerta conforme RF-014; não encerra o vínculo |
| `network_change` | `wifi` (`ssid`, `kind`, `rssi`), `saved` (lista de nomes, até 5) | atualiza a rede em uso e a lista (RF-034a, RF-034e) |
| `auto_lock` | `locked_at`, posição da decisão | trava `locked_comm_loss`, alerta alto, sem comando novo (RF-022a) |

## Resposta `200`

```json
{
  "server_time": "2026-10-17T14:03:01Z",
  "results": [ { "message_id": "01JABCD...", "status": "stored" } ],
  "command": {
    "id": "6c1f…",
    "kind": "lock",
    "issued_at": "2026-10-17T14:02:58Z"
  },
  "watch": { "active": true, "version": 4, "fences": [
    { "shape": "circle", "lat": -7.2091, "lng": -39.3063, "radius_m": 120 },
    { "shape": "polygon", "vertices": [[-7.21, -39.30], [-7.21, -39.31], [-7.20, -39.31]] }
  ] },
  "report_interval_s": 60
}
```

- `results[].status`: `stored`, `duplicate` (já recebida, RF-003) ou `refused` com `reason` (`invalid_field`, `read_at_in_future`, `unknown_command`, `command_of_other_device`).
- `command`: no máximo um, ou `null`. Trava tem prioridade sobre rede. O comando entregue e não confirmado é repetido com o mesmo `id` até a confirmação ou a expiração.
  - `lock` e `unlock`: sem campos extras.
  - `wifi_add`: `ssid`, `open` e, se não for aberta, `password` (só aqui, só para este lacre, RF-034c).
  - `wifi_remove`: `ssid`. `wifi_reset`: sem campos (volta só para a rede padrão).
- `watch`: sempre `active` e `version`; `fences` só quando `version` difere da `watch_version` do pedido (research.md, item 12). `active: false` faz o lacre apagar a geocerca guardada.
- `server_time`: para o lacre conferir o relógio (o certificado já exige hora certa por SNTP).

## Respostas de erro

| Situação | Resposta | O lacre faz |
|---|---|---|
| Sem chave, chave errada, de outro dispositivo, dispositivo inativo ou inexistente | `401 {"error":"unauthorized"}` (sempre igual, CA-006) | guarda as leituras, tenta no próximo intervalo e acende o LED de erro |
| Mais de 6 pedidos no minuto, ou endereço bloqueado por chaves erradas | `429 {"error":"rate_limited"}` com `Retry-After` | guarda as leituras e respeita o `Retry-After` |
| Corpo fora do formato (não é JSON, sem `messages`, mais de 50) | `400 {"error":"invalid_body"}` | descarta o lote malformado (defeito do firmware) e registra no LED |
| Falha interna | `503 {"error":"unavailable"}` | guarda e reenvia (RF-003 garante que não duplica) |

Nenhuma resposta revela organização, cilindro, cliente ou o motivo da recusa de autenticação.

## Regras do lado do lacre (resumo, detalhe em spec.md, "Requisitos para o firmware")

- Um envio por intervalo (`report_interval_s`), mesmo parado.
- Sem resposta: guarda na fila e reenvia em lotes de até 50, com os mesmos `message_id`.
- Executa o comando e confirma com `command_result` no envio seguinte, ou num envio imediato.
- `wifi_add`: só guarda a rede depois de chamar o FluxID por ela; senão volta e confirma `error` com o motivo (RF-034d).
- Sob vigilância (`watch.active`), 3 envios seguidos sem resposta e 2 posições com GPS fora das `fences`, além de 50 m → trava e envia `auto_lock` quando voltar (RN-011).
