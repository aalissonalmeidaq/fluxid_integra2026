#pragma once

// Trava da valvula pela solenoide (Spec 012, RN-010; "Requisitos para o firmware", item 9). A valvula fica aberta no uso
// normal e so fecha pelo comando de travar. A solenoide e biestavel, acionada por pulso: nao gasta bateria para segurar a
// posicao. O comando so e confirmado depois do acionamento, e o ultimo estado confirmado fica gravado na memoria do lacre.

#include <string>

#include "Protocolo.h"

namespace fluxid
{
    class Acionador
    {
    public:
        virtual ~Acionador() = default;
        // Um pulso para fechar ou abrir. false se o acionador falhou.
        virtual bool Pulsar(bool fechar) = 0;
    };

    class MemoriaDaTrava
    {
    public:
        virtual ~MemoriaDaTrava() = default;
        // false se nunca houve estado gravado.
        virtual bool Ler(bool& fechada) = 0;
        virtual bool Gravar(bool fechada) = 0;
    };

    struct DesfechoDoComando
    {
        bool executado;
        std::string motivo; // "actuator" quando o acionador falha
    };

    class Trava
    {
    public:
        Trava(Acionador& acionador, MemoriaDaTrava& memoria);

        // Sem estado gravado: aberta, sem acionar. Com estado: reafirma o ultimo confirmado com um pulso.
        // Retorna false se o pulso de reafirmacao falhou (o estado informado continua o gravado).
        bool Iniciar();
        bool Fechada() const;
        DesfechoDoComando Executar(bool fechar);

    private:
        Acionador& acionador;
        MemoriaDaTrava& memoria;
        bool fechada = false;
    };

    // Comandos ja executados: o FluxID repete o comando entregue ate receber a confirmacao; o lacre nao executa duas vezes.
    class RegistroDeComandos
    {
    public:
        static const size_t LEMBRAR = 8;

        bool JaExecutado(const std::string& comandoId) const;
        void Lembrar(const std::string& comandoId);

    private:
        std::string ids[LEMBRAR];
        size_t proximo = 0;
    };
}
