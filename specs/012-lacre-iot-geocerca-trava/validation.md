# Validação — Spec 012: Lacre IoT, geocerca e trava

Registro dos números reais das rodadas na branch `feat/012-lacre-iot-geocerca-trava`, no Supabase local. Os itens que dependem do lacre físico e de pessoas (T115, T121, T122 e T124) estão em "Pendências" e não constam como feitos.

## Rodada completa (T120, 18/10/2026)

| Etapa | Resultado |
|---|---|
| `npm run lint` e `npm run typecheck` | passaram |
| `npm run test:coverage` | 391 arquivos, 5 753 testes, todos passaram; instruções 90,21%, ramos 85,11%, funções 88,93%, linhas 93,26%; limites inalterados |
| `npx supabase db reset` e `npx supabase test db` | 115 arquivos, 3 019 testes, PASS (inclui os 20 arquivos `012_*` e o novo `012_seal_geofence_view`) |
| `npm run test:live` | 27 arquivos, 143 testes passaram; 3 pulados (medição de desempenho, só com variável própria) |
| `npm run build` | passou |
| `npm run test:e2e` | 1 916 passaram, 106 pulados, 5 falharam na primeira rodada: 2 instáveis (passaram na repetição) e 3 do mesmo teste de geocercas da Spec 007, que esperava o desenho SVG antigo; a pré-visualização passou a usar o mapa real e o teste foi atualizado (27 de 27 depois) |
| `npm run test:visual:atualizar` | 279 de 279 capturas geradas no Linux e reproduzíveis na segunda rodada; nenhum `*-win32.png`; mudaram as telas de lacre (geocercas no mapa), da visão geral e as que usam o mapa real no lugar do desenho da geocerca |
| `pio test -e native` e `pio run -e esp32c3` | 57 testes nativos passaram; o firmware compilou sem segredos locais, como no CI (RAM 12,6%, flash 83,1%) |

Correções feitas durante a rodada: placas de veículo geradas nas suítes `.live` às vezes saíam fora do formato (dígito no lugar de letra), e agora são sempre válidas; a lista esperada de permissões e do menu na suíte de navegação passou a incluir os lacres; a varredura de segredos do firmware passou a considerar só os arquivos versionáveis (o `secrets.h` local da bancada fica de fora, como no CI).

## Pacote de entrada (T118, RNF-006)

| Medida | Bytes |
|---|---|
| Linha de base (`baseline.md`, T003) | 599 490 |
| Limite da spec (+5%) | 629 465 |
| `dist/assets/index-*.js` em 2026-10-18 | 621 386 (+21 896, +3,65%) |

Dentro do limite. As telas de lacre e de alertas (`/lacres`, `/alertas`) ficam em chunks `React.lazy`, e o mapa continua no chunk `map-view`, carregado sob demanda. O crescimento vem do que entra nas telas já existentes: o bloco "Lacre" do cilindro, o painel de trava da viagem, as notificações no perfil e a camada de serviço dos lacres.

## Firmware (T111 a T113)

| Etapa | Resultado |
|---|---|
| `pio test -e native` | 5 suítes, 54 testes, todos passaram (protocolo com os exemplos de `tests/fixtures/seal-protocol/`, fila, redes, vigilância e trava) |
| `pio run -e esp32c3` | compilou; RAM 12,6% (41 444 de 327 680 bytes), flash 83,1% (1 088 908 de 1 310 720 bytes) |
| Varredura de segredos (`tests/contract/firmware-sem-segredos.test.ts` e job `firmware` do CI) | sem chave, endereço real, chave privada ou `setInsecure` |

Os testes nativos rodaram num contêiner Linux (`python:3.12-bookworm` com PlatformIO 6.1.16), porque a máquina de desenvolvimento é Windows sem compilador C++. O CI roda os mesmos comandos no job `firmware`.

## Bancada com o lacre físico, parte 1 (T115, 18/10/2026)

Placa: ESP32-C3 (QFN32, revisão v0.4, flash de 4 MB) na COM7 do computador de desenvolvimento, **alimentada só pela USB**. GPS na UART1 (GPIO20 e GPIO21) e LEDs no GPIO0 e GPIO1, como no firmware de origem. Antes de gravar, o firmware antigo foi copiado inteiro (4 MB) para poder voltar. Alvo: o Supabase local deste computador, pela rede Wi-Fi `FluxID`, sem TLS (`FLUXID_PERMITIR_HTTP_LOCAL`, só na bancada).

| Item | O que se observou |
|---|---|
| Gravação | firmware novo gravado com `esptool`; a placa iniciou e montou o LittleFS existente sem formatar |
| GPS | fix com precisão estimada de 6 a 12 m; o relógio foi acertado pela hora dos satélites quando não havia internet |
| Fila sem rede | sem Wi-Fi, as leituras ficaram na fila com o horário certo (até 39 mensagens) e foram entregues num só lote quando a rede conectou |
| Envio | `HTTP 200` a cada minuto; ativação, eventos, posições e troca de rede gravados no banco do Tenant A; o identificador `LCR-3FR82YZ8` foi gerado na ativação |
| Consumo pelo sistema | `list_seals` e `get_seal` (as consultas da tela Lacres) mostraram saúde "Funcionando", rede FluxID, sinal de -54 dBm e bateria "sem medição"; lacre parado gerou uma posição atualizada 18 vezes (regra dos 20 m) |
| Geocerca | com uma geocerca circular de 150 m cadastrada no local, o mapa do lacre mostrou o ponto dentro dela ("Dentro de Bancada (150 m)", 0 m) |

Problemas encontrados na bancada e corrigidos no firmware, na borda e nos testes:

- **Bateria sem divisor.** O pino da bateria solto leu 0%, e o lacre avisou o desligamento e dormiu. Como o protótipo é alimentado pela USB, a medição foi desligada (`PINO_BATERIA = -1`). A bateria passou a ir como `null` ("sem medição"): a borda aceita, o banco já aceitava, e o lacre nunca desliga por ela.
- **Sem internet, sem hora.** O lacre não criava leituras sem SNTP. Agora a hora vem do GPS (`SegundosDesde1970`, com teste nativo).
- **Rede fora do alcance travava o laço.** Cada tentativa bloqueava por 20 s, e o GPS perdia frases. Agora o lacre só tenta conectar numa rede que a varredura encontrou.
- **Rede `FluxID` invisível.** O hotspot estava em WPA3 e Wi-Fi 6 (802.11ax), e o ESP32-C3 não o via. Com WPA2 e o Wi-Fi 6 desligado, passou a ver.
- **`AUTH_EXPIRE` (motivo 2) ao conectar.** É problema conhecido da antena do ESP32-C3 Super Mini. Resolveu com a potência de transmissão em 8,5 dBm (`POTENCIA_WIFI` em `config.h`).

Não testado nesta parte: a trava pela solenoide (pinos ainda a confirmar no hardware), o desligamento avisado e a conexão por HTTPS com o Supabase da nuvem. Ficam como pendências abaixo.

## Publicação na nuvem (T121, 18/10/2026, depois do merge do PR #43)

| Etapa | Resultado |
|---|---|
| `npx supabase db push` (projeto `fluxid`) | teste a seco com as 15 migrations `20261018*_seals_*` e nenhum seed; aplicadas sem erro |
| Segredos das funções | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`https://fluxid.tec.br`) e `SEAL_SOURCE_SALT`, gerados e enviados por arquivo temporário apagado em seguida; nenhum valor em arquivo versionado |
| `npx supabase functions deploy` | `seal-gateway`, `seal-push`, `query-seals` e `manage-seals` publicadas; as outras que mudaram também |
| Vault e cron | `seal_push_url` trocado para o endereço da nuvem; `seal_push_secret` presente; `fluxid-seal-watchdog` ativo; extensões `pg_cron`, `pg_net`, `postgis` e `supabase_vault` presentes; 3 permissões `seal.*` |
| Conferência sem credencial | `public-compatibility` 200 (contrato 002.1); `seal-gateway` com chave errada 401 (`unauthorized`); `seal-push` sem segredo 401 |
| Vercel | `VITE_VAPID_PUBLIC_KEY` cadastrada em produção; publicação da `main` disparada (run 39165461631, sucesso); o pacote do fluxid.tec.br carrega a chave pública |

Não conferido: o envio de uma notificação de verdade na nuvem, que depende de um lacre falando com o projeto da nuvem (o da bancada aponta para o Supabase local). Fica junto da parte 2 da bancada.

## Pendências

- T115, parte 2: trava pela solenoide (travar e destravar), com o modelo da solenoide e os pinos confirmados; conexão por HTTPS com o Supabase da nuvem.
- T121, conferência final: uma notificação recebida de verdade na nuvem, com um lacre apontando para o projeto da nuvem.
- T122: roteiro do `quickstart.md` com o lacre físico e as medições MS-008, MS-010, MS-012 e RNF-004.
