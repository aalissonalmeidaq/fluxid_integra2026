#include <Arduino.h>

#include <Sensores.h>
#include <config.h>

void IniciarSensores()
{
#if PINO_BATERIA >= 0
    analogReadResolution(12);
    analogSetPinAttenuation(PINO_BATERIA, ADC_11db);
#endif
#if PINO_SENSOR_LACRE >= 0
    pinMode(PINO_SENSOR_LACRE, INPUT_PULLUP);
#endif
}

int BateriaPct()
{
#if PINO_BATERIA >= 0
    // Media de algumas leituras para tirar o ruido do ADC.
    uint32_t soma = 0;
    for (int i = 0; i < 8; i++)
        soma += analogReadMilliVolts(PINO_BATERIA);
    const float milivolts = (soma / 8.0f) * FATOR_DIVISOR_BATERIA;
    // Abaixo de 2,5 V a placa nem estaria ligada pela bateria: o divisor nao esta no pino (bancada pela USB).
    if (milivolts < BATERIA_SEM_MEDICAO_MV)
        return -1;
    const float fracao = (milivolts - BATERIA_VAZIA_MV) / static_cast<float>(BATERIA_CHEIA_MV - BATERIA_VAZIA_MV);
    const int pct = static_cast<int>(fracao * 100.0f + 0.5f);
    return pct < 0 ? 0 : (pct > 100 ? 100 : pct);
#else
    return -1;
#endif
}

std::string EstadoDoLacre()
{
#if PINO_SENSOR_LACRE >= 0
    return digitalRead(PINO_SENSOR_LACRE) == LOW ? "closed" : "open";
#else
    return "unknown";
#endif
}
