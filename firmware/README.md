# Firmware do lacre FluxID

Firmware do lacre IoT do FluxID para o ESP32-C3 Super Mini. O lacre lê a posição pelo GPS, guarda cada leitura numa fila na própria flash e, a cada minuto, chama o FluxID por HTTPS pelo Wi-Fi. Na resposta, recebe o comando pendente (travar, destravar, mudar as redes) e a geocerca que deve vigiar. A trava da válvula é feita por uma solenoide.

Desde a Spec 013, **um único firmware serve a todos os lacres**. O código do lacre vem do chip e a chave é criada pelo próprio lacre. Sem rede salva, ele abre a rede de configuração `FluxID-Lacre-XXXX`, onde a pessoa no local escolhe o Wi-Fi pelo celular. Até o Master aprovar e destinar o lacre a um tenant, ele só pede aprovação e não guarda leitura nenhuma.

O contrato das mensagens está em [`specs/012-lacre-iot-geocerca-trava/contracts/mensagens-do-lacre.md`](../specs/012-lacre-iot-geocerca-trava/contracts/mensagens-do-lacre.md). O pedido de aprovação está em [`specs/013-aprovacao-lacres-master/contracts/pedido-de-aprovacao.md`](../specs/013-aprovacao-lacres-master/contracts/pedido-de-aprovacao.md) e o portal, em [`contracts/portal-do-lacre.md`](../specs/013-aprovacao-lacres-master/contracts/portal-do-lacre.md). Os exemplos de [`tests/fixtures/seal-protocol/`](../tests/fixtures/seal-protocol/) são a referência exata, usada também pela borda do FluxID e pelo simulador.

## De onde veio

O código partiu do repositório [`simaoBastos/fluxid-firmware`](https://github.com/simaoBastos/fluxid-firmware) (commit `6af9529`, 15/10/2026), trazido para este repositório na Spec 012 por decisão do responsável pelo produto (16/10/2026). Daquele código foram aproveitados os LEDs (`LED.cpp`, `Estado.cpp`), a leitura do GPS, a ideia da fila com gravação em `.tmp` seguida de renomeação, e a leitura do `Retry-After`. Saíram:

- o SIM800L, o TinyGSM e o ArduinoHttpClient, porque em 17/10/2026 o lacre passou a usar só o Wi-Fi;
- o cliente da API antiga, com uma mensagem por chamada e HTTP sem TLS, substituído pelo contrato do `seal-gateway`, com lotes de até 50 mensagens e HTTPS.

O histórico de desenvolvimento e os registros de IA anteriores continuam no repositório de origem.

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `src/nucleo/` | Regras sem hardware: protocolo, fila, redes, vigilância da geocerca, trava, identidade do chip, pedido de aprovação e portal. Testadas no computador. |
| `src/` | Hardware e laço: HTTPS, relógio, GPS, bateria, solenoide, LEDs, flash, NVS e o portal de configuração (`PortalWiFi`). |
| `portal/index.html` | A página do portal, testada no navegador (`tests/e2e/portal-lacre.spec.ts`) e embutida na compilação. |
| `test/` | Testes das regras (`pio test -e native`). |
| `include/` | `config.h` (pinos e tempos) e `secrets.example.h` (modelo dos segredos). |
| `certificados/` | Raízes do Mozilla, mais a GlobalSign Root CA (a cadeia do Supabase precisa dela), para conferir o certificado do FluxID. |
| `ferramentas/` | Gerador do pacote de certificados e `embutir_portal.py`, que gera `src/PortalPagina.h` (fora do git) a partir da página. |
| `docs/PINOUT.md` | Pinos e ligações. |

## Montagem

ESP32-C3 Super Mini, módulo GPS na UART1, solenoide biestável com ponte H, bateria de lítio com divisor resistivo no ADC e dois LEDs. Os pinos estão em [`docs/PINOUT.md`](docs/PINOUT.md) e em [`include/config.h`](include/config.h). Os da solenoide, da bateria e do sensor do lacre são proposta desta spec e precisam ser confirmados na bancada.

## Segredos

O endereço do FluxID e a senha da rede de configuração ficam em `include/secrets.h`, que o git ignora. Nunca versione esse arquivo. O mesmo `secrets.h` serve para toda a frota: não há código, chave nem rede por lacre.

```sh
cp include/secrets.example.h include/secrets.h
```

No `secrets.h` copiado, apague a linha `#define FLUXID_SEGREDOS_DO_MODELO`: ela só existe no modelo, para o CI compilar sem conferir o tamanho da senha.

| Macro | O que é |
| --- | --- |
| `FLUXID_URL` | Endereço do projeto Supabase, só `https://` |
| `FLUXID_PORTAL_SENHA` | Senha da rede de configuração `FluxID-Lacre-XXXX` (WPA2, exatamente 8 caracteres, para digitar no celular; o firmware não compila com outro tamanho), a mesma da frota. O mesmo valor fica no Vault como `seal_portal_password` ([docs/publicacao-em-nuvem.md](../docs/publicacao-em-nuvem.md)); o Master a consulta em Lacres da plataforma. Obrigatória: sem ela, o firmware não compila |
| `FLUXID_REDE_FABRICA_SSID` / `FLUXID_REDE_FABRICA_SENHA` | Opcionais. A rede padrão da plataforma (por exemplo, `FluxID`), usada só enquanto ninguém escolheu a rede do local pelo portal. Não é de tenant nenhum: o lacre nunca a esquece e nunca a grava na memória. O portal continua abrindo sozinho enquanto não houver rede escolhida |
| `FLUXID_DISPOSITIVO` / `FLUXID_CHAVE` | Opcionais, só para os lacres da Spec 012 já cadastrados à mão. Lacres novos não usam |
| `FLUXID_PERMITIR_HTTP_LOCAL` | Só na bancada, contra o Supabase local sem TLS. Nunca em lacre de campo |

`FLUXID_WIFI_SSID` e `FLUXID_WIFI_SENHA` (a rede padrão da Spec 012) não existem mais: o firmware novo os ignora, e o CI reprova o uso deles em `src/`. A rede principal vem só do portal, para nenhuma rede ficar compilada e fora do alcance do esquecimento das redes (RN-006 da Spec 013).

Sem `secrets.h`, o firmware compila com o modelo e mostra um aviso. É assim que o CI compila. O lacre gravado desse jeito não conecta.

## Compilar, testar e gravar

```sh
pio test -e native          # regras no computador (precisa de gcc/g++)
pio run -e esp32c3          # compilar para o lacre
pio run -e esp32c3 -t upload
pio device monitor          # serial a 115200
```

No Windows sem compilador C++, os testes rodam num contêiner, a partir da raiz do repositório. Monte o repositório inteiro, e não só `firmware/`, porque os testes leem os exemplos de `../tests/fixtures/seal-protocol`. Para compilar como o CI, sem o `secrets.h` local, monte o modelo por cima dele:

```sh
docker run --rm -v fluxid-pio:/root/.platformio -v "$PWD:/w" -w /w/firmware python:3.12-bookworm \
  sh -c "pip install -q platformio==6.1.16 && pio test -e native"
docker run --rm -v "$PWD:/w" -v "$PWD/firmware/include/secrets.example.h:/w/firmware/include/secrets.h:ro" -w /w/firmware \
  fluxid-pio:6.1.16 sh -c "pio run -e esp32c3"
```

No Git Bash do Windows, prefixe com `MSYS_NO_PATHCONV=1` para o Docker receber os caminhos certos.

**Primeira gravação de uma placa nova:** o firmware nunca formata a flash sozinho, porque uma falha de montagem não prova que a partição está vazia e formatar apagaria a fila. Grave uma vez um LittleFS vazio:

```sh
mkdir data && pio run -e esp32c3 -t uploadfs
```

O `uploadfs` apaga a fila guardada. Use só em placa nova.

## Como funciona

**Identidade (Spec 013).** O código do lacre é `DSP-` mais 8 caracteres calculados do MAC de fábrica do chip, sempre o mesmo. Na primeira vez, o lacre sorteia a própria chave (`fxk_…`) com o gerador de hardware e a guarda na NVS; o FluxID guarda só o resumo dela. Ninguém copia chave nenhuma. Memória apagada gera chave nova, e o Master vê o pedido como conflito e aceita a chave nova.

**Rede de configuração (Spec 013).** Sem rede salva, o lacre abre a rede `FluxID-Lacre-` mais os 4 últimos caracteres do código, com a senha padrão. O DNS dela responde a qualquer endereço, e o celular abre a página sozinho. A página mostra o código e as redes ao alcance, com o sinal em texto. O lacre testa a rede escolhida e confere a chegada ao FluxID antes de guardar; com sucesso, a rede vira a principal e a página continua disponível enquanto o celular permanecer conectado, para conferência. Depois de 15 min sem cliente, ela fecha por 5 min e abre de novo quando ainda não há rede salva. Com rede salva, ela só abre com o botão BOOT segurado por 5 s, e a rede atual continua até uma nova ser confirmada.

**Aguardando aprovação (Spec 013).** Até o Master aprovar, cada chamada leva só `boot`, a rede em uso e, quando houver, `networks_forgotten`. Nenhuma leitura entra na fila. `202` mantém a espera; `403` (recusado) passa a tentar de hora em hora; `200` liga a operação, e então vale o que segue. Devolvido ou retirado, o lacre recebe `202` com `forget_networks`: esvazia a fila e a vigilância, esquece as redes extras (retirado) ou todas, menos a configurada pelo portal depois da última aprovação (devolvido), e confirma nas chamadas seguintes.

Em operação, a cada intervalo combinado (padrão de 1 minuto), mesmo parado:

1. Lê a posição. Sem fix atual, usa a última conhecida (`last_known`). Antes do primeiro fix e antes de acertar o relógio por SNTP, não cria leitura.
2. Guarda a mensagem na fila com um `message_id` único (`DSP-…-0000000123`). O contador é reservado em blocos de 100 na NVS, para não repetir depois de um reinício.
3. Envia as mais antigas da fila, até 50, num só pedido HTTPS. O certificado é conferido pelas raízes embutidas. A chave vai só no cabeçalho e nunca aparece no serial.
4. Tira da fila o que o FluxID decidiu (`stored`, `duplicate` ou `refused`). Sem resposta, com `401`, `429` ou `503`, mantém tudo e tenta de novo no intervalo seguinte, respeitando o `Retry-After`. Com `400`, descarta o lote, porque o problema está no corpo e reenviar não resolve.
5. Executa o comando da resposta, uma vez por `id`, e confirma com `command_result` num envio imediato.

O FluxID consolida posições repetidas: dentro da tolerância de 20 m, com a mesma qualidade e o mesmo estado do lacre, não cria outro ponto histórico e atualiza somente o horário `last_seen_at`. Bateria, sinal e demais dados correntes continuam atualizados no dispositivo.

**Ao ligar**, envia o evento `boot` e, no primeiro fix, a `activation`, com o estado gravado da válvula.

**Trava (RN-010).** A válvula fica aberta no uso normal. `lock` e `unlock` dão um pulso na solenoide e só então confirmam `executed`; se o acionador falhar, a confirmação é `error` com `actuator`. O último estado confirmado fica na NVS. No primeiro uso não há estado gravado, e a válvula fica aberta sem acionar. Depois de um reinício, o lacre reafirma o estado gravado com um pulso.

**Redes Wi-Fi (RF-034a a RF-034e).** O lacre guarda até 5 redes recebidas do FluxID, além da principal (a do portal; na Spec 012, a "padrão"). Entre as que estão ao alcance, usa a de sinal mais forte, e só procura outra depois de 3 envios sem resposta. Se nenhuma da lista estiver ao alcance, volta para a padrão e envia `wifi_fallback_default`. Uma rede nova é testada antes de ser guardada: o lacre conecta nela e só a guarda depois de falar com o FluxID por ela. Se não conseguir em 60 s, volta para a rede anterior e confirma `error` com o motivo (`wifi_not_found`, `wifi_auth` ou `wifi_no_internet`). Toda mudança gera um `network_change` com o nome da rede em uso e as guardadas, nunca as senhas.

**Trava por perda de comunicação (RN-011).** O lacre guarda a vigilância e as cercas recebidas. Sob vigilância, depois de 3 envios seguidos sem resposta, compara cada posição com GPS com as cercas, que podem ser círculo ou polígono, com distância por haversine e 50 m de tolerância. Duas posições seguidas fora da geocerca travam a válvula, e o lacre avisa com `auto_lock` quando voltar a comunicar. Dentro da geocerca, rede caída não trava.

**Bateria e sinal.** `low_battery` abaixo de 15% e `weak_signal` abaixo de −85 dBm, uma vez por queda. Em 2%, o lacre avisa o desligamento (`shutdown`) e dorme.

## LEDs

| Estado | Padrão |
| --- | --- |
| Funcionando | Verde pisca 100 ms a cada 4 s |
| Aguardando aprovação, recusado ou chave recusada (`401`) | Verde fixo |
| Rede de configuração aberta | Verde e vermelho alternam a cada 500 ms |
| Erro (fila indisponível, lote recusado com `400`) | Vermelho repete curto-curto-longo-curto |

## Roteiro de bancada

O roteiro completo da Spec 013 está em [`specs/013-aprovacao-lacres-master/quickstart.md`](../specs/013-aprovacao-lacres-master/quickstart.md), seção 3. Em resumo:

1. Preencha o `secrets.h` só com `FLUXID_URL` e `FLUXID_PORTAL_SENHA` (a mesma do Vault). Grave o LittleFS vazio (placa nova) e o firmware.
2. Ligue o lacre: a rede `FluxID-Lacre-XXXX` aparece. No FluxID, o Master abre Lacres da plataforma > Mostrar a senha. Entre na rede pelo celular, escolha o Wi-Fi e cronometre até o "Conectado" (até 3 minutos).
3. Teste também uma senha errada: a página diz "Senha errada" e nada é guardado.
4. O Master confere o código e aprova para o Tenant A. O lacre passa a operar; vincule-o a um cilindro e siga os passos abaixo.
5. Segure o botão BOOT por 5 s: a rede de configuração reabre e o lacre continua na rede atual até uma nova ser testada.
6. Devolva o lacre pelo Tenant A com ele ligado: ele apaga as redes e abre a rede de configuração.

Da Spec 012, com o lacre em operação:

1. Abra o monitor serial e confira o código do lacre, a rede conectada e, no FluxID, a ativação, as posições a cada minuto e a bateria.
2. Confira que o lacre está aprovado e em operação no Tenant A.
3. Confira no serial a rede conectada e, no FluxID, a ativação, as posições a cada minuto e a bateria.
4. Vincule o lacre a um cilindro. Peça "Travar" no detalhe do cilindro: a solenoide deve dar um pulso e a tela deve mostrar "Travada" só depois da confirmação.
5. Peça "Destravar" (exige o segundo fator) e confira o pulso no outro sentido.
6. Desligue o roteador por 3 minutos: as leituras ficam na fila e vão juntas quando a rede voltar, sem repetir.
7. Adicione uma rede pelo FluxID: o lacre troca, confirma, e a rede aparece na lista. Repita com uma senha errada: o lacre volta para a rede anterior e o FluxID mostra o alerta com `wifi_auth`.
8. Registre o que foi visto no `validation.md` da spec em validação.

**Lacres da Spec 012 cadastrados à mão.** Com `FLUXID_DISPOSITIVO` e `FLUXID_CHAVE` no `secrets.h`, o firmware novo usa o código e a chave antigos e começa já operando. O firmware da Spec 012 não entende a resposta `202`: antes de retirar ou devolver um desses lacres, regrave-o com o firmware novo, para ele não ficar reenviando a fila sem uma resposta que entenda. Ele também nunca confirma o esquecimento das redes, então só muda de tenant depois de regravado.

## Certificados

`certificados/x509_crt_bundle.bin` tem as 121 raízes da lista do Mozilla publicada pelo curl em 25/09/2026. A lista cobre o Let's Encrypt (ISRG Root X1 e X2) e o Google Trust Services (GTS Root R1, R3 e R4), que assinam os certificados do Supabase. Para gerar de novo:

```sh
curl -sSo cacert.pem https://curl.se/ca/cacert.pem
python ferramentas/gerar_pacote_certificados.py cacert.pem certificados/x509_crt_bundle.bin
```

Gere de novo uma vez por ano ou quando a autoridade do Supabase mudar, e grave os lacres.

## Limites conhecidos

- **Senhas na flash.** Sem a cifragem da flash do ESP32, as senhas das redes ficam legíveis para quem tiver o lacre em mãos e um gravador. É risco de protótipo; a cifragem fica para a Fase 8 (hardware homologado).
- **Sem sensor de rompimento nem de posição da válvula.** O estado do lacre vai como `unknown`, e o pulso da solenoide é considerado executado.
- **Precisão estimada.** A precisão vem do HDOP vezes 5 m, uma estimativa e não uma medida.
- **Bateria aproximada.** A porcentagem é linear entre 3,3 V e 4,2 V.
- **Flash.** O firmware ocupa 83% da partição de aplicação padrão.
- **Leitura de números curtos.** O ArduinoJson lê números com poucos dígitos em precisão `float`, o que dá cerca de 10 cm nas cercas. Isso não afeta a tolerância de 50 m. As posições enviadas pelo lacre saem com precisão `double`.
