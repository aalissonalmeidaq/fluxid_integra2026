#pragma once

// Pedido de aprovacao do lacre (Spec 013, RF-009, RN-003, RN-006; contracts/pedido-de-aprovacao.md; research.md, itens 4 e 5). Enquanto
// nao recebe 200, o lacre so manda boot, a rede em uso e, quando houver, networks_forgotten, sem leituras na fila (nada antes da
// aprovacao vira dado de tenant). 202 mantem a espera; 403 (recusado) passa a tentar de hora em hora; 200 liga a operacao. Sem Arduino.h.

#include <stdint.h>
#include <functional>
#include <string>
#include <vector>
#include "Protocolo.h"
#include "Rede.h"

namespace fluxid
{
    enum class ModoDoLacre
    {
        Aguardando,
        Operando
    };

    class Aprovacao
    {
    public:
        // O lacre da Spec 012 (codigo e chave do cadastro manual) ja comeca operando.
        explicit Aprovacao(bool cadastroManual = false);

        ModoDoLacre Modo() const;
        bool PodeGuardarLeituras() const;
        bool Recusado() const;
        bool ComErro() const;
        // Segundos ate a proxima chamada: o intervalo normal ou 1 h depois de recusado.
        uint32_t EsperaS() const;

        // Le a resposta da chamada (status HTTP e corpo).
        void AoResponder(int status, const std::string& corpo);
        // Verdadeiro uma unica vez, na primeira resposta 200 depois de aguardar (para a rede principal virar "do tenant").
        bool AcabouDeSerAprovado();

        // O que o FluxID pediu para esquecer e ainda nao foi feito.
        Esquecimento EsquecimentoPedido() const;
        // O lacre apagou as redes: a confirmacao vai nas proximas chamadas ate o 202 deixar de pedir.
        void EsquecimentoFeito(Esquecimento escopo);
        Esquecimento ConfirmacaoPendente() const;

        // As mensagens de uma chamada enquanto aguarda (cada uma um objeto JSON, para MontarPedido).
        std::vector<std::string> MensagensDeEspera(const std::function<std::string()>& novoId, const std::string& lidoEm,
            const RedeEmUso& rede, const std::vector<std::string>& guardadas) const;

        // Persistencia na NVS: so o modo e a confirmacao pendente (nunca chave nem senha).
        std::string Serializar() const;
        bool Restaurar(const std::string& conteudo);

    private:
        ModoDoLacre modo;
        bool recusado = false;
        bool erro = false;
        bool aprovadoAgora = false;
        uint32_t intervaloS = 60;
        Esquecimento pedido = Esquecimento::Nenhum;
        Esquecimento confirmacao = Esquecimento::Nenhum;
    };
}
