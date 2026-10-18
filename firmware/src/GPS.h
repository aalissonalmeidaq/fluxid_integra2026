#pragma once

#include <nucleo/Protocolo.h>

// GPS na UART1 com TinyGPSPlus (adaptado do firmware de origem). Sem fix atual, fica a ultima posicao conhecida.
void IniciarGPS(int8_t pinoRx, int8_t pinoTx);
void LerGPS();
// false antes do primeiro fix. comGps: fix com menos de 5 s. precisaoM: estimativa pelo HDOP, ou -1 sem fix atual.
bool PosicaoAtual(fluxid::Ponto& ponto, bool& comGps, double& precisaoM);
// Hora UTC dos satelites, em segundos desde 1970; false sem hora valida e recente.
bool HoraDoGps(int64_t& segundos);
// Satelites em uso (diagnostico de bancada).
uint32_t SatelitesDoGps();
