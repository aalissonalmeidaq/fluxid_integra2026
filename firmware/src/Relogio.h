#pragma once

#include <stdint.h>

// Hora pela rede (SNTP). A conferencia do certificado HTTPS e o horario das leituras precisam de relogio certo: antes de
// acertar, o lacre nao cria leituras nem chama o FluxID.
void IniciarRelogio();
bool RelogioAcertado();
// Acerta pelo GPS quando nao ha internet (segundos desde 1970, UTC). A SNTP continua valendo quando a rede voltar.
void AcertarRelogio(int64_t segundos);
// Segundos desde 1970, em UTC.
int64_t AgoraSegundos();
