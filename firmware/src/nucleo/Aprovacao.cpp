#include "Aprovacao.h"

#include <ArduinoJson.h>
#include <config.h>

namespace fluxid
{
    namespace
    {
        const char* NomeDoEscopo(Esquecimento escopo)
        {
            return escopo == Esquecimento::Todas ? "all" : escopo == Esquecimento::Extras ? "extras" : "";
        }

        Esquecimento EscopoDoNome(const std::string& nome)
        {
            if (nome == "all")
                return Esquecimento::Todas;
            if (nome == "extras")
                return Esquecimento::Extras;
            return Esquecimento::Nenhum;
        }
    }

    Aprovacao::Aprovacao(bool cadastroManual) : modo(cadastroManual ? ModoDoLacre::Operando : ModoDoLacre::Aguardando) {}

    ModoDoLacre Aprovacao::Modo() const { return modo; }
    bool Aprovacao::PodeGuardarLeituras() const { return modo == ModoDoLacre::Operando; }
    bool Aprovacao::Recusado() const { return recusado; }
    bool Aprovacao::ComErro() const { return erro; }
    uint32_t Aprovacao::EsperaS() const { return recusado ? RECUSADO_TENTA_DE_NOVO_S : intervaloS; }
    Esquecimento Aprovacao::EsquecimentoPedido() const { return pedido; }
    Esquecimento Aprovacao::ConfirmacaoPendente() const { return confirmacao; }

    void Aprovacao::AoResponder(int status, const std::string& corpo)
    {
        erro = false;
        if (status == 200)
        {
            if (modo == ModoDoLacre::Aguardando)
                aprovadoAgora = true;
            modo = ModoDoLacre::Operando;
            recusado = false;
            pedido = Esquecimento::Nenhum;
            confirmacao = Esquecimento::Nenhum;
            return;
        }
        if (status == 403)
        {
            modo = ModoDoLacre::Aguardando;
            recusado = true;
            return;
        }
        if (status != 202)
        {
            erro = status == 401;
            return;
        }
        modo = ModoDoLacre::Aguardando;
        recusado = false;
        JsonDocument documento;
        if (deserializeJson(documento, corpo))
            return;
        intervaloS = documento["report_interval_s"] | intervaloS;
        const Esquecimento escopo = EscopoDoNome(documento["forget_networks"] | "");
        if (escopo == Esquecimento::Nenhum)
        {
            // O 202 deixou de pedir: a confirmacao foi aceita.
            confirmacao = Esquecimento::Nenhum;
            pedido = Esquecimento::Nenhum;
        }
        else if (confirmacao != escopo)
            pedido = escopo;
    }

    bool Aprovacao::AcabouDeSerAprovado()
    {
        const bool agora = aprovadoAgora;
        aprovadoAgora = false;
        return agora;
    }

    void Aprovacao::EsquecimentoFeito(Esquecimento escopo)
    {
        pedido = Esquecimento::Nenhum;
        confirmacao = escopo;
    }

    std::vector<std::string> Aprovacao::MensagensDeEspera(const std::function<std::string()>& novoId, const std::string& lidoEm,
        const RedeEmUso& rede, const std::vector<std::string>& guardadas) const
    {
        std::vector<std::string> mensagens;
        mensagens.push_back(MensagemEvento(novoId(), lidoEm, "boot"));
        mensagens.push_back(MensagemTrocaDeRede(novoId(), lidoEm, rede, guardadas));
        if (confirmacao != Esquecimento::Nenhum)
            mensagens.push_back(MensagemEvento(novoId(), lidoEm, "networks_forgotten", NomeDoEscopo(confirmacao)));
        return mensagens;
    }

    std::string Aprovacao::Serializar() const
    {
        JsonDocument documento;
        documento["modo"] = modo == ModoDoLacre::Operando ? "operando" : "aguardando";
        documento["confirmar"] = NomeDoEscopo(confirmacao);
        std::string texto;
        serializeJson(documento, texto);
        return texto;
    }

    bool Aprovacao::Restaurar(const std::string& conteudo)
    {
        JsonDocument documento;
        if (deserializeJson(documento, conteudo) || !documento.is<JsonObjectConst>())
            return false;
        const std::string lido = documento["modo"] | "";
        if (lido != "operando" && lido != "aguardando")
            return false;
        modo = lido == "operando" ? ModoDoLacre::Operando : ModoDoLacre::Aguardando;
        confirmacao = EscopoDoNome(documento["confirmar"] | "");
        return true;
    }
}
