#include "Rede.h"

#include <ArduinoJson.h>

namespace fluxid
{
    ListaDeRedes::ListaDeRedes(const std::string& ssidPadrao, const std::string& senhaPadrao)
        : padrao{ssidPadrao, senhaPadrao, senhaPadrao.empty()}
    {
    }

    FalhaNaLista ListaDeRedes::Guardar(const RedeGuardada& rede)
    {
        for (RedeGuardada& existente : redes)
        {
            if (existente.ssid == rede.ssid)
            {
                existente = rede;
                return FalhaNaLista::Nenhuma;
            }
        }
        if (redes.size() >= MAXIMO)
            return FalhaNaLista::ListaCheia;
        redes.push_back(rede);
        return FalhaNaLista::Nenhuma;
    }

    bool ListaDeRedes::Remover(const std::string& ssid)
    {
        for (size_t i = 0; i < redes.size(); i++)
        {
            if (redes[i].ssid == ssid)
            {
                redes.erase(redes.begin() + static_cast<long>(i));
                return true;
            }
        }
        return false;
    }

    void ListaDeRedes::Limpar()
    {
        redes.clear();
    }

    bool ListaDeRedes::Contem(const std::string& ssid) const
    {
        for (const RedeGuardada& rede : redes)
            if (rede.ssid == ssid)
                return true;
        return false;
    }

    std::vector<std::string> ListaDeRedes::Nomes() const
    {
        std::vector<std::string> nomes;
        for (const RedeGuardada& rede : redes)
            nomes.push_back(rede.ssid);
        return nomes;
    }

    const std::vector<RedeGuardada>& ListaDeRedes::Redes() const
    {
        return redes;
    }

    EscolhaDeRede ListaDeRedes::Escolher(const std::vector<RedeVisivel>& visiveis) const
    {
        const RedeGuardada* melhor = nullptr;
        int melhorRssi = -1000;
        for (const RedeVisivel& visivel : visiveis)
        {
            for (const RedeGuardada& rede : redes)
            {
                if (rede.ssid == visivel.ssid && visivel.rssi > melhorRssi)
                {
                    melhor = &rede;
                    melhorRssi = visivel.rssi;
                }
            }
        }
        if (melhor == nullptr)
            return Padrao();
        return {false, melhor->ssid, melhor->senha};
    }

    EscolhaDeRede ListaDeRedes::Padrao() const
    {
        if (padrao.ssid.empty() && !fabrica.ssid.empty())
            return {true, fabrica.ssid, fabrica.senha};
        return {true, padrao.ssid, padrao.senha};
    }

    void ListaDeRedes::DefinirRedeDeFabrica(const std::string& ssid, const std::string& senha)
    {
        fabrica = RedeGuardada{ssid, senha, senha.empty()};
    }

    bool ListaDeRedes::TemRedeParaTentar() const
    {
        return TemAlgumaRede() || !fabrica.ssid.empty();
    }

    std::string ListaDeRedes::Serializar() const
    {
        JsonDocument documento;
        JsonArray lista = documento.to<JsonArray>();
        for (const RedeGuardada& rede : redes)
        {
            JsonObject item = lista.add<JsonObject>();
            item["s"] = rede.ssid;
            item["p"] = rede.senha;
            item["a"] = rede.aberta;
        }
        std::string texto;
        serializeJson(documento, texto);
        return texto;
    }

    bool ListaDeRedes::Restaurar(const std::string& conteudo)
    {
        JsonDocument documento;
        if (deserializeJson(documento, conteudo) || !documento.is<JsonArrayConst>())
            return false;
        std::vector<RedeGuardada> lidas;
        for (JsonObjectConst item : documento.as<JsonArrayConst>())
        {
            const std::string ssid = item["s"] | "";
            if (ssid.empty() || ssid.size() > 32 || lidas.size() >= MAXIMO)
                return false;
            lidas.push_back({ssid, item["p"] | "", item["a"] | false});
        }
        redes = lidas;
        return true;
    }

    bool ListaDeRedes::TemPrincipal() const
    {
        return !padrao.ssid.empty();
    }

    bool ListaDeRedes::TemAlgumaRede() const
    {
        return TemPrincipal() || !redes.empty();
    }

    const RedeGuardada& ListaDeRedes::Principal() const
    {
        return padrao;
    }

    void ListaDeRedes::DefinirPrincipal(const RedeGuardada& rede, bool peloPortal)
    {
        padrao = rede;
        principalDoPortal = peloPortal;
    }

    bool ListaDeRedes::PrincipalDoPortalDesdeAAprovacao() const
    {
        return TemPrincipal() && principalDoPortal;
    }

    void ListaDeRedes::MarcarAprovado()
    {
        principalDoPortal = false;
    }

    void ListaDeRedes::Esquecer(Esquecimento escopo)
    {
        if (escopo == Esquecimento::Nenhum)
            return;
        redes.clear();
        if (escopo == Esquecimento::Todas && !principalDoPortal)
            padrao = RedeGuardada{"", "", true};
    }

    std::string ListaDeRedes::SerializarPrincipal() const
    {
        JsonDocument documento;
        documento["s"] = padrao.ssid;
        documento["p"] = padrao.senha;
        documento["a"] = padrao.aberta;
        documento["portal"] = principalDoPortal;
        std::string texto;
        serializeJson(documento, texto);
        return texto;
    }

    bool ListaDeRedes::RestaurarPrincipal(const std::string& conteudo)
    {
        JsonDocument documento;
        if (deserializeJson(documento, conteudo) || !documento.is<JsonObjectConst>())
            return false;
        const std::string ssid = documento["s"] | "";
        if (ssid.size() > 32)
            return false;
        padrao = {ssid, documento["p"] | "", documento["a"] | false};
        principalDoPortal = documento["portal"] | false;
        return true;
    }

    const char* MotivoDaFalhaDeRede(bool estavaVisivel, bool conectou)
    {
        if (!estavaVisivel)
            return "wifi_not_found";
        if (!conectou)
            return "wifi_auth";
        return "wifi_no_internet";
    }

    void TrocaDeRede::Iniciar(const std::string& id, const RedeGuardada& nova, const EscolhaDeRede& antes, uint32_t agoraMs)
    {
        emTeste = true;
        comandoId = id;
        candidata = nova;
        anterior = antes;
        inicioMs = agoraMs;
    }

    bool TrocaDeRede::EmTeste() const
    {
        return emTeste;
    }

    bool TrocaDeRede::Expirou(uint32_t agoraMs) const
    {
        return emTeste && agoraMs - inicioMs >= PRAZO_MS;
    }

    const RedeGuardada& TrocaDeRede::Candidata() const
    {
        return candidata;
    }

    const EscolhaDeRede& TrocaDeRede::Anterior() const
    {
        return anterior;
    }

    const std::string& TrocaDeRede::ComandoId() const
    {
        return comandoId;
    }

    FalhaNaLista TrocaDeRede::Concluir(ListaDeRedes& lista)
    {
        const FalhaNaLista falha = lista.Guardar(candidata);
        Desistir();
        return falha;
    }

    void TrocaDeRede::Desistir()
    {
        emTeste = false;
        candidata.senha.clear();
    }
}
