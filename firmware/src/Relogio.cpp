#include <Arduino.h>
#include <sys/time.h>
#include <time.h>

#include <Relogio.h>

namespace
{
    // 2026-01-01: qualquer hora antes disso e o relogio ainda zerado do ESP32.
    const time_t HORA_MINIMA = 1767225600;
}

void IniciarRelogio()
{
    configTime(0, 0, "pool.ntp.org", "time.google.com", "a.st1.ntp.br");
}

bool RelogioAcertado()
{
    return time(nullptr) >= HORA_MINIMA;
}

void AcertarRelogio(int64_t segundos)
{
    timeval agora = {static_cast<time_t>(segundos), 0};
    settimeofday(&agora, nullptr);
}

int64_t AgoraSegundos()
{
    return static_cast<int64_t>(time(nullptr));
}
