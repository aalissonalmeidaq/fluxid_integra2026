#include "Portal.h"

#include <ArduinoJson.h>
#include <algorithm>
#include <config.h>

namespace fluxid
{
    const uint32_t JanelaDoPortal::ABERTO_MS = PORTAL_ABERTO_S * 1000UL;
    const uint32_t JanelaDoPortal::FECHADO_MS = PORTAL_FECHADO_S * 1000UL;
    const uint32_t BotaoDoPortal::SEGURAR_MS = BOTAO_PORTAL_S * 1000UL;

    std::string NomeDaRedeDeConfiguracao(const std::string& codigo)
    {
        return "FluxID-Lacre-" + (codigo.size() >= 4 ? codigo.substr(codigo.size() - 4) : codigo);
    }

    bool NomeDeRedeValido(const std::string& ssid)
    {
        return !ssid.empty() && ssid.size() <= 32;
    }

    bool SenhaDeRedeValida(const std::string& senha, bool aberta)
    {
        return aberta || (senha.size() >= 8 && senha.size() <= 63);
    }

    std::string EscaparHtml(const std::string& texto)
    {
        std::string saida;
        for (char c : texto)
        {
            switch (c)
            {
            case '&': saida += "&amp;"; break;
            case '<': saida += "&lt;"; break;
            case '>': saida += "&gt;"; break;
            case '"': saida += "&quot;"; break;
            case '\'': saida += "&#39;"; break;
            default: saida += c;
            }
        }
        return saida;
    }

    const char* SinalEmTexto(int rssi)
    {
        if (rssi >= -60)
            return "forte";
        if (rssi >= -75)
            return "m\xC3\xA9" "dio";
        return "fraco";
    }

    std::string RedesJson(const std::string& codigo, const std::vector<RedeDoPortal>& visiveis)
    {
        std::vector<RedeDoPortal> unicas;
        for (const RedeDoPortal& rede : visiveis)
        {
            if (!NomeDeRedeValido(rede.ssid))
                continue;
            auto igual = std::find_if(unicas.begin(), unicas.end(), [&](const RedeDoPortal& r) { return r.ssid == rede.ssid; });
            if (igual == unicas.end())
                unicas.push_back(rede);
            else if (rede.rssi > igual->rssi)
                *igual = rede;
        }
        std::stable_sort(unicas.begin(), unicas.end(), [](const RedeDoPortal& a, const RedeDoPortal& b) { return a.rssi > b.rssi; });
        JsonDocument documento;
        documento["codigo"] = codigo;
        JsonArray redes = documento["redes"].to<JsonArray>();
        for (const RedeDoPortal& rede : unicas)
        {
            JsonObject item = redes.add<JsonObject>();
            item["ssid"] = rede.ssid;
            item["sinal"] = SinalEmTexto(rede.rssi);
            item["rssi"] = rede.rssi;
            item["aberta"] = rede.aberta;
        }
        std::string texto;
        serializeJson(documento, texto);
        return texto;
    }

    bool MotivoDoPortalValido(const std::string& motivo)
    {
        return motivo == "wifi_auth" || motivo == "wifi_not_found" || motivo == "wifi_no_internet";
    }

    bool TesteDoPortal::Iniciar()
    {
        if (estado == Estado::Testando)
            return false;
        estado = Estado::Testando;
        motivo.clear();
        return true;
    }

    void TesteDoPortal::Concluir(bool conectou, const std::string& motivoDaFalha)
    {
        estado = conectou ? Estado::Conectado : Estado::Falhou;
        motivo = conectou ? "" : (MotivoDoPortalValido(motivoDaFalha) ? motivoDaFalha : "wifi_no_internet");
    }

    bool TesteDoPortal::EmAndamento() const
    {
        return estado == Estado::Testando;
    }

    std::string TesteDoPortal::SituacaoJson(AprovacaoNoPortal aprovacao, const ConexaoDoLacre& conexao) const
    {
        JsonDocument documento;
        documento["situacao"] = estado == Estado::Testando ? "testando" : estado == Estado::Conectado ? "conectado" : estado == Estado::Falhou ? "falhou" : "ocioso";
        if (motivo.empty())
            documento["motivo"] = nullptr;
        else
            documento["motivo"] = motivo;
        if (estado != Estado::Conectado || aprovacao == AprovacaoNoPortal::Nenhuma)
            documento["aprovacao"] = nullptr;
        else
            documento["aprovacao"] = aprovacao == AprovacaoNoPortal::Aprovado ? "aprovado" : "pendente";
        JsonObject atual = documento["conexao"].to<JsonObject>();
        if (conexao.rede.empty())
            atual["rede"] = nullptr;
        else
            atual["rede"] = conexao.rede;
        const bool chega = !conexao.rede.empty() && conexao.alcancouFluxID;
        atual["fluxid"] = chega;
        if (!chega || aprovacao == AprovacaoNoPortal::Nenhuma)
            atual["aprovacao"] = nullptr;
        else
            atual["aprovacao"] = aprovacao == AprovacaoNoPortal::Aprovado ? "aprovado" : "pendente";
        std::string texto;
        serializeJson(documento, texto);
        return texto;
    }

    void JanelaDoPortal::Abrir(uint32_t agoraMs)
    {
        aberta = true;
        marcoMs = agoraMs;
    }

    void JanelaDoPortal::Fechar(uint32_t agoraMs)
    {
        aberta = false;
        pedida = false;
        marcoMs = agoraMs;
    }

    bool JanelaDoPortal::Atualizar(uint32_t agoraMs, bool temRedeSalva, bool temCliente)
    {
        if (fecharDepoisDoSucesso)
        {
            if (agoraMs - sucessoMs >= DEPOIS_DO_SUCESSO_MS)
            {
                fecharDepoisDoSucesso = false;
                Fechar(agoraMs);
            }
            return aberta;
        }
        if (aberta && temCliente)
            marcoMs = agoraMs;
        if (aberta)
        {
            if (agoraMs - marcoMs >= ABERTO_MS)
                Fechar(agoraMs);
            return aberta;
        }
        if (pedida || (!temRedeSalva && (!comecou || agoraMs - marcoMs >= FECHADO_MS)))
        {
            comecou = true;
            Abrir(agoraMs);
        }
        return aberta;
    }

    void JanelaDoPortal::PedirAbertura(uint32_t)
    {
        pedida = true;
    }

    void JanelaDoPortal::Sucesso(uint32_t agoraMs)
    {
        fecharDepoisDoSucesso = true;
        sucessoMs = agoraMs;
    }

    bool JanelaDoPortal::Aberta() const
    {
        return aberta;
    }

    bool BotaoDoPortal::Atualizar(uint32_t agoraMs, bool agoraPressionado)
    {
        if (!agoraPressionado)
        {
            pressionado = false;
            disparou = false;
            return false;
        }
        if (!pressionado)
        {
            pressionado = true;
            desdeMs = agoraMs;
        }
        if (!disparou && agoraMs - desdeMs >= SEGURAR_MS)
        {
            disparou = true;
            return true;
        }
        return false;
    }
}
