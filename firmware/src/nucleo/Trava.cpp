#include "Trava.h"

namespace fluxid
{
    Trava::Trava(Acionador& acionador, MemoriaDaTrava& memoria) : acionador(acionador), memoria(memoria)
    {
    }

    bool Trava::Iniciar()
    {
        bool gravada = false;
        if (!memoria.Ler(gravada))
        {
            // Primeiro uso: a valvula fica aberta e a solenoide nao e acionada.
            fechada = false;
            return true;
        }
        // O estado informado e sempre o ultimo confirmado; o pulso so reafirma a posicao fisica.
        fechada = gravada;
        return acionador.Pulsar(gravada);
    }

    bool Trava::Fechada() const
    {
        return fechada;
    }

    DesfechoDoComando Trava::Executar(bool fechar)
    {
        if (!acionador.Pulsar(fechar))
            return {false, "actuator"};
        fechada = fechar;
        memoria.Gravar(fechar);
        return {true, ""};
    }

    bool RegistroDeComandos::JaExecutado(const std::string& comandoId) const
    {
        if (comandoId.empty())
            return false;
        for (const std::string& id : ids)
            if (id == comandoId)
                return true;
        return false;
    }

    void RegistroDeComandos::Lembrar(const std::string& comandoId)
    {
        ids[proximo] = comandoId;
        proximo = (proximo + 1) % LEMBRAR;
    }
}
