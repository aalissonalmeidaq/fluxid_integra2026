#pragma once

#include <string>

// Bateria medida de verdade pelo ADC (antes era um valor fixo) e estado do lacre pelo sensor, quando houver.
void IniciarSensores();
// 0 a 100, pela tensao entre BATERIA_VAZIA_MV e BATERIA_CHEIA_MV (aproximacao linear). -1 sem medicao: pino sem divisor
// (le perto de 0 V, impossivel com o lacre ligado) ou desligado em config.h.
int BateriaPct();
// "closed", "open" ou "unknown" (sem sensor).
std::string EstadoDoLacre();
