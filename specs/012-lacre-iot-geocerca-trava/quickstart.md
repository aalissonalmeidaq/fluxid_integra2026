# Quickstart: validar o lacre IoT

**Feature**: `012-lacre-iot-geocerca-trava` | **Data**: 17/10/2026

Roteiro para provar a spec de ponta a ponta: primeiro com o simulador no Supabase local, depois com o lacre físico no Supabase de teste. Os contratos estão em [contracts/](./contracts/) e o modelo em [data-model.md](./data-model.md).

## Pré-requisitos

- Docker e o Supabase CLI (`npx supabase start`); depois de mudar funções, `npx supabase stop` e `start` (a memória do projeto registra que o recarregamento não basta).
- Node.js 24 e `npm ci`.
- Para o firmware: Python 3 e `pip install platformio`; um ESP32-C3 Super Mini com GPS, solenoide e bateria; um ponto de acesso Wi-Fi com internet.
- Chaves VAPID de teste, geradas uma vez por quem opera (a privada nunca entra em arquivo versionado):
  - pública em `.env.local`: `VITE_VAPID_PUBLIC_KEY=...`
  - privada no Supabase local: `supabase/functions/.env` (fora do git) com `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; na nuvem, `npx supabase secrets set`.
- Segredo do `seal-push` no Vault, criado pela migration com valor aleatório (nada a fazer à mão no local).

## 1. Testes automatizados

```bash
npm run lint && npm run typecheck
npm test                       # domínio, serviço, telas, contratos
npx supabase test db           # pgTAP, inclusive 012_*
npm run test:live              # simulador + dois tenants no Supabase local
npm run build && npm run test:e2e
cd firmware && pio test -e native && pio run -e esp32c3
```

No Windows sem compilador C++, os testes do firmware rodam num contêiner (veja `firmware/README.md`).

Esperado: tudo verde; `012_rls` e `012_push_outbox` com os casos permitido e bloqueado nos dois tenants.

## 2. Simulador no Supabase local

1. Entrar como administrador do Tenant A e cadastrar um dispositivo em `/lacres`. Copiar o código e a chave (aparecem uma vez).
2. Rodar o simulador:

   ```bash
   node scripts/lacre/simulador.mjs --url http://127.0.0.1:54321 --device DSP-XXXXXXXX --key fxk_... --cenario ativar
   ```

3. Vincular o lacre a um cilindro em `/lacres` ou no detalhe do cilindro.
4. Cenários, um por vez (`--cenario`):

| Cenário | Resultado esperado |
|---|---|
| `parado --minutos 10` | uma única posição no histórico, "visto por último" avançando (MS-002) |
| `movendo` | posições novas a cada 20 m ou mais; mapa atualiza sozinho em até 10 s |
| `reenvio` | segunda chamada responde `duplicate`, nada novo |
| `lote-atrasado` | 50 leituras gravadas na ordem; última posição continua a mais nova |
| `sem-gps --minutos 4` | saúde "sem GPS" e alerta médio |
| `silencio` | em até ~2,5 min: "sem comunicação"; com viagem ou vigilância, alerta de possível extravio e notificação; no estoque, alerta médio sem notificação |
| `desligar` | "desligado" na hora |
| `confirmar` | executa e confirma o comando pendente (travar, destravar ou rede) |
| `chave-errada --vezes 11` | `401` iguais e depois `429` |

5. Viagem (Spec 008) com esse cilindro e um sem lacre: iniciar → comando `lock` pendente; `--cenario confirmar` → "travada". O cilindro sem lacre aparece "sem lacre".
6. Entrega dentro da geocerca da unidade (`--cenario ir-para --lat ... --lng ...` antes de salvar) → `unlock` com prova do lacre; repetir com o lacre fora → nenhum comando e o motivo na tela.
7. Com o cilindro entregue e destravado, `--cenario sair-da-geocerca` → violação, `lock` na própria resposta, alerta alto e notificação.
8. `--cenario auto-lock` → "travada por perda de comunicação" e alerta.
9. Rede: adicionar uma rede em `/lacres/:id` → `--cenario rede-ok` → a rede entra na lista e a senha some do FluxID. Repetir com outra rede e `--cenario rede-falha` → comando "com erro" com o motivo `wifi_auth`, alerta médio e senha apagada (conferir que `vault.secrets` não tem mais o registro).
10. Tenant B: entrar e tentar abrir `/lacres/<id do A>` → "não encontrado".

## 3. Lacre físico (História 8, Supabase de teste)

1. Publicar migrations e funções conforme `docs/publicacao-em-nuvem.md` (sem seed) e configurar os segredos VAPID e da função.
2. Copiar `firmware/include/secrets.example.h` para `secrets.h` e preencher a rede padrão, o endereço do projeto, o código e a chave do dispositivo. **Nunca** versionar `secrets.h`.
3. Placa nova: `mkdir data && pio run -e esp32c3 -t uploadfs` (LittleFS vazio; apaga a fila). Depois, `pio run -e esp32c3 -t upload` e `pio device monitor`. O roteiro de bancada está em `firmware/README.md`.
4. Conferir, com cronômetro:

| Passo | Esperado | Requisito |
|---|---|---|
| ligar o lacre | aparece ativo em `/lacres` | RF-032 |
| andar com o lacre | o cilindro se move no mapa em até 10 s | RNF-001, MS-012 |
| iniciar viagem | solenoide fecha, confirmação, "travada" | RF-023, RF-027 |
| entrega dentro da geocerca | solenoide abre, "destravada" | RF-024 |
| levar para fora da geocerca | violação, trava e notificação | RF-021 |
| desligar o hotspot fora da geocerca por 3 min | o lacre trava sozinho e avisa ao voltar | RN-011 |
| desligar o hotspot dentro da geocerca por 3 min | não trava | Clarifications 17/10 |
| retirar a bateria | aviso de possível extravio em até ~1 min depois do envio perdido | RNF-003 |
| adicionar uma rede com senha errada | o lacre volta à rede anterior e informa o erro | RF-034d |

5. Anotar o consumo de invocações no painel do Supabase (RNF-004) e os tempos no `validation.md`.

## 4. Encerramento

Entrevista de validação humana com Natã da Silva Baracho (AGENTS.md), registro no RIA e gate de governança antes do commit final.
