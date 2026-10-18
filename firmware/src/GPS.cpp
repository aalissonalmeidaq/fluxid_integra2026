#include <Arduino.h>
#include <TinyGPS++.h>

#include <GPS.h>

namespace
{
    HardwareSerial serialGps(1);
    TinyGPSPlus gps;
    fluxid::Ponto ultima = {0, 0};
    bool temPosicao = false;

    // Erro de posicao do usuario tipico de um receptor comum (UERE ~5 m) vezes o HDOP: uma estimativa, nao uma medida.
    const double UERE_M = 5.0;
    const uint32_t IDADE_MAXIMA_MS = 5000;
}

void IniciarGPS(int8_t pinoRx, int8_t pinoTx)
{
    // So vale antes do begin(). 2 KB guardam ~2 s de NMEA a 9600 baud durante uma chamada HTTPS; o resto se perde e a
    // posicao seguinte sai como ultima conhecida se o fix envelhecer (docs/PINOUT.md).
    serialGps.setRxBufferSize(2048);
    serialGps.begin(9600, SERIAL_8N1, pinoRx, pinoTx);
}

void LerGPS()
{
    while (serialGps.available() > 0)
        gps.encode(serialGps.read());
}

bool HoraDoGps(int64_t& segundos)
{
    if (!gps.date.isValid() || !gps.time.isValid() || gps.time.age() > IDADE_MAXIMA_MS)
        return false;
    segundos = fluxid::SegundosDesde1970(gps.date.year(), gps.date.month(), gps.date.day(), gps.time.hour(), gps.time.minute(), gps.time.second());
    return segundos > 0;
}

uint32_t SatelitesDoGps()
{
    return gps.satellites.isValid() ? gps.satellites.value() : 0;
}

bool PosicaoAtual(fluxid::Ponto& ponto, bool& comGps, double& precisaoM)
{
    comGps = gps.location.isValid() && gps.location.age() <= IDADE_MAXIMA_MS;
    if (comGps)
    {
        ultima = {gps.location.lat(), gps.location.lng()};
        temPosicao = true;
    }
    precisaoM = comGps && gps.hdop.isValid() ? gps.hdop.hdop() * UERE_M : -1;
    ponto = ultima;
    return temPosicao;
}
