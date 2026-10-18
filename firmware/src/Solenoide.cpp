#include <Arduino.h>

#include <Solenoide.h>

Solenoide::Solenoide(int pinoFechar, int pinoAbrir, uint32_t duracaoMs) : pinoFechar(pinoFechar), pinoAbrir(pinoAbrir), duracaoMs(duracaoMs)
{
}

void Solenoide::Iniciar()
{
    if (pinoFechar < 0 || pinoAbrir < 0)
        return;
    pinMode(pinoFechar, OUTPUT);
    pinMode(pinoAbrir, OUTPUT);
    digitalWrite(pinoFechar, LOW);
    digitalWrite(pinoAbrir, LOW);
}

bool Solenoide::Pulsar(bool fechar)
{
    if (pinoFechar < 0 || pinoAbrir < 0)
        return false;
    const int pino = fechar ? pinoFechar : pinoAbrir;
    // Os dois lados nunca ficam ligados juntos.
    digitalWrite(fechar ? pinoAbrir : pinoFechar, LOW);
    digitalWrite(pino, HIGH);
    delay(duracaoMs);
    digitalWrite(pino, LOW);
    return true;
}
