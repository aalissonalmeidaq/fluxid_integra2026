# Pinos do lacre FluxID (ESP32-C3 Super Mini)

Pinos usados pelo firmware e ligações da montagem do protótipo. Este documento veio do firmware de origem (`simaoBastos/fluxid-firmware`, 15/10/2026) e foi atualizado na Spec 012, quando o SIM800L saiu do projeto e entraram a solenoide e a medição de bateria.

- **No firmware:** o pino aparece em [`include/config.h`](../include/config.h).
- **Ligação física:** como o componente está ligado na placa, segundo o responsável pelo hardware. A equipe de software não fez medição elétrica.
- **Teste físico:** só conta o que foi visto funcionando na placa. Compilar não é teste físico.

## Tabela de pinos

| Pino | Componente | Função | No firmware | Ligação física | Teste físico |
| --- | --- | --- | --- | --- | --- |
| 3V3 | GPS | Alimentação do GPS | Não se aplica | Informada (15/10) | Não registrado à parte |
| GND | Todos | Terra comum | Não se aplica | Informada (15/10) | Não registrado à parte |
| GPIO0 | LED verde | Padrões de estado | `PINO_LED_VERDE` | Confirmada (15/10) | Padrões antigos vistos; os atuais, pendentes |
| GPIO1 | LED vermelho | Padrões de estado e de erro | `PINO_LED_VERMELHO` | Confirmada (15/10) | Idem |
| GPIO3 | Divisor da bateria (reservado) | Tensão da bateria no ADC1 | Desligado: `PINO_BATERIA = -1` | Sem ligação: o protótipo é alimentado só pela USB (18/10/2026) | Não se aplica |
| GPIO4 | Ponte H da solenoide (IN1) | Pulso de fechar (travar) | `PINO_SOLENOIDE_FECHAR` | **Proposta da Spec 012** | **Pendente (T115)** |
| GPIO5 | Ponte H da solenoide (IN2) | Pulso de abrir (destravar) | `PINO_SOLENOIDE_ABRIR` | **Proposta da Spec 012** | **Pendente (T115)** |
| GPIO20 | GPS (TX do módulo) | Recebe NMEA (UART1, 9600 baud) | `PINO_GPS_RX` | Informada (15/10) | Fix real informado pela equipe |
| GPIO21 | GPS (RX do módulo) | Linha de envio ao GPS (o firmware não envia comandos) | `PINO_GPS_TX` | Informada (15/10) | Não se aplica |

O sensor de rompimento do lacre ainda não tem pino (`PINO_SENSOR_LACRE = -1`): sem ele, o lacre informa o estado `unknown`. Quando houver sensor, ligar numa entrada com pull-up (LOW = fechado) e mudar o valor em `config.h`.

Os pinos da solenoide, da bateria e do sensor são proposta desta spec. Confirme no esquema da placa e na bancada antes de ligar (T115); o resultado vai para `specs/012-lacre-iot-geocerca-trava/validation.md`.

## Pinos reservados ou ocupados

| Pino | Situação |
| --- | --- |
| GPIO18 / GPIO19 | USB D− / D+ (monitor serial por USB CDC, `ARDUINO_USB_CDC_ON_BOOT=1`). Não usar. |
| GPIO2, GPIO8, GPIO9 | Pinos de strapping do ESP32-C3 (GPIO9 é o botão BOOT). Não usar. |
| GPIO6, GPIO7 | Eram do SIM800L, que saiu do projeto em 17/10/2026. Livres. |
| GPIO10 | Livre. Candidato ao sensor do lacre. |

Fonte: conhecimento geral do ESP32-C3 (documentação da Espressif). Confirme no datasheet antes de usar um pino novo.

## Solenoide

A trava usa uma solenoide **biestável**: um pulso curto (`DURACAO_PULSO_SOLENOIDE_MS`, 80 ms) num sentido fecha a válvula, e no outro abre. Ela não gasta corrente para segurar a posição, então a válvula fica como estava se a energia faltar. O ESP32 não alimenta a bobina: a ponte H (por exemplo, um DRV8833) recebe os dois sinais e liga a bobina à bateria. Os dois lados nunca ficam ligados ao mesmo tempo.

Sem sensor de posição da válvula, o firmware considera executado o pulso enviado. Um pino não configurado (`-1`) faz o comando falhar com o motivo `actuator`.

## Bateria

O protótipo é alimentado só pela porta USB do ESP32 (decisão de 18/10/2026): não há bateria, a medição fica desligada (`PINO_BATERIA = -1`) e o lacre envia a bateria como `null` ("sem medição"), sem alerta de bateria baixa nem desligamento por ela. Com bateria e divisor no futuro, vale o que segue.

O ADC lê a tensão depois do divisor (`FATOR_DIVISOR_BATERIA = (R1 + R2) / R2`; 2,0 para dois resistores iguais) e converte em porcentagem linear entre 3,3 V e 4,2 V. É uma aproximação: a curva real de uma bateria de lítio não é linear. Abaixo de 15% o lacre envia `low_battery`; em 2% avisa o desligamento (`shutdown`) e dorme, conferindo de novo a cada 30 minutos.

## UARTs e monitor serial

| Uso | Periférico | Pinos |
| --- | --- | --- |
| Monitor serial (`Serial`) | USB CDC interno | GPIO18/19 (USB) |
| GPS | UART1, 9600 baud, buffer de recepção de 2 KB | RX 20 / TX 21 |

- O buffer do GPS foi aumentado para 2 KB antes do `begin()`: cobre cerca de 2 s de NMEA durante uma chamada HTTPS. Bloqueios mais longos ainda perdem frases, e a leitura seguinte pode sair como `last_known` até chegar uma frase nova. Medir na bancada.
- No reset, a ROM imprime o log de boot no GPIO21, que chega ao RX do GPS. Em geral é inofensivo; não foi observado.

## Manutenção

Sempre que um pino mudar no firmware, atualize esta tabela na mesma mudança. Um pino só passa a "ligação física confirmada" quando o responsável pelo hardware confirmar.
