#pragma once

// Pinos e tempos do lacre FluxID (ESP32-C3 Super Mini). Os pinos dos LEDs e do GPS vem do firmware de origem
// (docs/PINOUT.md). Os da solenoide, da bateria e do sensor do lacre sao a proposta desta spec e precisam ser
// confirmados na bancada (T115); -1 desliga a funcao.

#define FLUXID_VERSAO_FIRMWARE "2.0.0"

// GPS na UART1, 9600 baud.
#define PINO_GPS_RX 20
#define PINO_GPS_TX 21

// LEDs de estado.
#define PINO_LED_VERDE 0
#define PINO_LED_VERMELHO 1

// Solenoide biestavel por ponte H: um pulso em FECHAR trava a valvula, um pulso em ABRIR destrava.
#define PINO_SOLENOIDE_FECHAR 4
#define PINO_SOLENOIDE_ABRIR 5
#define DURACAO_PULSO_SOLENOIDE_MS 80

// Bateria por divisor resistivo no ADC1 (GPIO0 a GPIO4 tem ADC1). Fator = (R1 + R2) / R2.
// -1: o prototipo e alimentado so pela USB (decisao de 18/10/2026), sem bateria; vai "sem medicao" e nunca desliga por ela.
// Com bateria e divisor, use o GPIO3.
#define PINO_BATERIA -1
#define FATOR_DIVISOR_BATERIA 2.0f
#define BATERIA_VAZIA_MV 3300
#define BATERIA_CHEIA_MV 4200
// Leitura abaixo disto: sem divisor ligado; a bateria vai como "sem medicao" e o lacre nunca desliga por ela.
#define BATERIA_SEM_MEDICAO_MV 2500

// Sensor de rompimento do lacre (entrada com pull-up; LOW = fechado). -1: sem sensor, o estado vai "unknown".
#define PINO_SENSOR_LACRE -1

// Limites (os mesmos de private.seal_limits() no FluxID).
#define BATERIA_BAIXA_PCT 15
#define BATERIA_DESLIGAR_PCT 2
#define SINAL_FRACO_DBM -85
#define INTERVALO_PADRAO_S 60

// Rede: tempo para conectar e para procurar redes de novo depois de cair.
#define TEMPO_CONEXAO_WIFI_MS 20000UL
#define INTERVALO_RECONEXAO_MS 10000UL
// Potencia de transmissao do Wi-Fi. A antena do ESP32-C3 Super Mini falha na autenticacao (AUTH_EXPIRE) na potencia
// maxima; 8,5 dBm foi o que conectou na bancada (18/10/2026).
#define POTENCIA_WIFI WIFI_POWER_8_5dBm
