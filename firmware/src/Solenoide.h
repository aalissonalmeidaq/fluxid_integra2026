#pragma once

#include <nucleo/Trava.h>

// Solenoide biestavel por ponte H: um pulso curto em cada sentido; nada de corrente para segurar a posicao.
// Sem sensor de posicao da valvula, o pulso enviado e considerado executado; pinos nao configurados (-1) falham.
class Solenoide : public fluxid::Acionador
{
public:
    Solenoide(int pinoFechar, int pinoAbrir, uint32_t duracaoMs);
    void Iniciar();
    bool Pulsar(bool fechar) override;

private:
    int pinoFechar;
    int pinoAbrir;
    uint32_t duracaoMs;
};
