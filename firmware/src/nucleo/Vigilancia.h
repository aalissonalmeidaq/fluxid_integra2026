#pragma once

// Vigilancia de geocerca guardada no lacre e trava por perda de comunicacao (Spec 012, RN-011, "Requisitos para o firmware",
// item 8a). Sob vigilancia, depois de 3 envios seguidos sem resposta do FluxID, o lacre compara as proprias posicoes com GPS
// com a geocerca e so trava com duas seguidas fora dela, alem de 50 m. Dentro da geocerca, rede caida nao trava.

#include <stdint.h>
#include <string>
#include <vector>

#include "Protocolo.h"

namespace fluxid
{
    const double TOLERANCIA_GEOCERCA_M = 50.0;
    const uint8_t ENVIOS_SEM_RESPOSTA_PARA_VIGIAR = 3;
    const uint8_t POSICOES_FORA_PARA_TRAVAR = 2;

    // Distancia em metros pela formula de haversine.
    double DistanciaM(const Ponto& a, const Ponto& b);
    // Distancia ate a cerca: 0 dentro ou na borda.
    double DistanciaAteCercaM(const Ponto& ponto, const Cerca& cerca);
    // Dentro de alguma cerca, considerando a tolerancia.
    bool DentroDaGeocerca(const Ponto& ponto, const std::vector<Cerca>& cercas, double toleranciaM = TOLERANCIA_GEOCERCA_M);

    class Vigilancia
    {
    public:
        // Aplica o "watch" da resposta: inativa apaga; com cercas, troca as guardadas; sem cercas, mantem.
        void Aplicar(const DadosVigilancia& dados);
        bool Ativa() const;
        uint32_t Versao() const;
        const std::vector<Cerca>& Cercas() const;

        // Cada envio: com resposta, zera a contagem e a sequencia de posicoes fora.
        void RegistrarEnvio(bool respondeu);
        bool SemComunicacao() const;

        // Cada posicao lida. Retorna true quando o lacre deve travar agora (uma vez por perda de comunicacao).
        bool RegistrarPosicao(const Ponto& ponto, bool comGps, bool valvulaFechada);

        // Persistencia na memoria do lacre: a vigilancia vale mesmo depois de um reinicio sem rede.
        std::string Serializar() const;
        bool Restaurar(const std::string& conteudo);

    private:
        bool ativa = false;
        uint32_t versao = 0;
        std::vector<Cerca> cercas;
        uint8_t enviosSemResposta = 0;
        uint8_t posicoesFora = 0;
        bool travou = false;
    };
}
