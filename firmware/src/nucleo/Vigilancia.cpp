#include "Vigilancia.h"

#include <ArduinoJson.h>
#include <math.h>

namespace fluxid
{
    namespace
    {
        const double RAIO_DA_TERRA_M = 6371000.0;
        const double GRAUS_PARA_RADIANOS = 3.14159265358979323846 / 180.0;

        // Raio de casting em latitude e longitude: suficiente para geocercas de unidade (centenas de metros).
        bool DentroDoPoligono(const Ponto& ponto, const std::vector<Ponto>& vertices)
        {
            bool dentro = false;
            for (size_t i = 0, j = vertices.size() - 1; i < vertices.size(); j = i++)
            {
                const Ponto& a = vertices[i];
                const Ponto& b = vertices[j];
                if ((a.latitude > ponto.latitude) != (b.latitude > ponto.latitude))
                {
                    const double longitudeNoCruzamento =
                        (b.longitude - a.longitude) * (ponto.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude;
                    if (ponto.longitude < longitudeNoCruzamento)
                        dentro = !dentro;
                }
            }
            return dentro;
        }

        // Distancia do ponto ao segmento, numa projecao plana local centrada no ponto (erro desprezivel em poucos km).
        double DistanciaAoSegmentoM(const Ponto& ponto, const Ponto& a, const Ponto& b)
        {
            const double escalaLongitude = cos(ponto.latitude * GRAUS_PARA_RADIANOS) * RAIO_DA_TERRA_M * GRAUS_PARA_RADIANOS;
            const double escalaLatitude = RAIO_DA_TERRA_M * GRAUS_PARA_RADIANOS;
            const double ax = (a.longitude - ponto.longitude) * escalaLongitude;
            const double ay = (a.latitude - ponto.latitude) * escalaLatitude;
            const double bx = (b.longitude - ponto.longitude) * escalaLongitude;
            const double by = (b.latitude - ponto.latitude) * escalaLatitude;
            const double dx = bx - ax;
            const double dy = by - ay;
            const double comprimento2 = dx * dx + dy * dy;
            double t = comprimento2 > 0 ? -(ax * dx + ay * dy) / comprimento2 : 0;
            t = t < 0 ? 0 : (t > 1 ? 1 : t);
            const double x = ax + t * dx;
            const double y = ay + t * dy;
            return sqrt(x * x + y * y);
        }
    }

    double DistanciaM(const Ponto& a, const Ponto& b)
    {
        const double lat1 = a.latitude * GRAUS_PARA_RADIANOS;
        const double lat2 = b.latitude * GRAUS_PARA_RADIANOS;
        const double dLat = lat2 - lat1;
        const double dLng = (b.longitude - a.longitude) * GRAUS_PARA_RADIANOS;
        const double h = sin(dLat / 2) * sin(dLat / 2) + cos(lat1) * cos(lat2) * sin(dLng / 2) * sin(dLng / 2);
        return 2 * RAIO_DA_TERRA_M * atan2(sqrt(h), sqrt(1 - h));
    }

    double DistanciaAteCercaM(const Ponto& ponto, const Cerca& cerca)
    {
        if (cerca.circulo)
        {
            const double distancia = DistanciaM(ponto, cerca.centro) - cerca.raioM;
            return distancia > 0 ? distancia : 0;
        }
        if (cerca.vertices.size() < 3)
            return INFINITY;
        if (DentroDoPoligono(ponto, cerca.vertices))
            return 0;
        double menor = INFINITY;
        for (size_t i = 0, j = cerca.vertices.size() - 1; i < cerca.vertices.size(); j = i++)
        {
            const double distancia = DistanciaAoSegmentoM(ponto, cerca.vertices[j], cerca.vertices[i]);
            if (distancia < menor)
                menor = distancia;
        }
        return menor;
    }

    bool DentroDaGeocerca(const Ponto& ponto, const std::vector<Cerca>& cercas, double toleranciaM)
    {
        for (const Cerca& cerca : cercas)
            if (DistanciaAteCercaM(ponto, cerca) <= toleranciaM)
                return true;
        return false;
    }

    void Vigilancia::Aplicar(const DadosVigilancia& dados)
    {
        versao = dados.versao;
        if (!dados.ativa)
        {
            ativa = false;
            cercas.clear();
            return;
        }
        ativa = true;
        if (dados.temCercas)
            cercas = dados.cercas;
    }

    bool Vigilancia::Ativa() const
    {
        return ativa;
    }

    uint32_t Vigilancia::Versao() const
    {
        return versao;
    }

    const std::vector<Cerca>& Vigilancia::Cercas() const
    {
        return cercas;
    }

    void Vigilancia::RegistrarEnvio(bool respondeu)
    {
        if (respondeu)
        {
            enviosSemResposta = 0;
            posicoesFora = 0;
            travou = false;
            return;
        }
        if (enviosSemResposta < 0xFF)
            enviosSemResposta++;
    }

    bool Vigilancia::SemComunicacao() const
    {
        return enviosSemResposta >= ENVIOS_SEM_RESPOSTA_PARA_VIGIAR;
    }

    bool Vigilancia::RegistrarPosicao(const Ponto& ponto, bool comGps, bool valvulaFechada)
    {
        if (!ativa || cercas.empty() || !SemComunicacao() || travou || !comGps)
            return false;
        if (DentroDaGeocerca(ponto, cercas))
        {
            posicoesFora = 0;
            return false;
        }
        if (posicoesFora < 0xFF)
            posicoesFora++;
        if (posicoesFora < POSICOES_FORA_PARA_TRAVAR || valvulaFechada)
            return false;
        travou = true;
        return true;
    }

    std::string Vigilancia::Serializar() const
    {
        JsonDocument documento;
        documento["a"] = ativa;
        documento["v"] = versao;
        JsonArray lista = documento["c"].to<JsonArray>();
        for (const Cerca& cerca : cercas)
        {
            JsonObject item = lista.add<JsonObject>();
            if (cerca.circulo)
            {
                item["t"] = "c";
                item["lat"] = cerca.centro.latitude;
                item["lng"] = cerca.centro.longitude;
                item["r"] = cerca.raioM;
            }
            else
            {
                item["t"] = "p";
                JsonArray vertices = item["v"].to<JsonArray>();
                for (const Ponto& vertice : cerca.vertices)
                {
                    JsonArray par = vertices.add<JsonArray>();
                    par.add(vertice.latitude);
                    par.add(vertice.longitude);
                }
            }
        }
        std::string texto;
        serializeJson(documento, texto);
        return texto;
    }

    bool Vigilancia::Restaurar(const std::string& conteudo)
    {
        JsonDocument documento;
        if (deserializeJson(documento, conteudo) || !documento["c"].is<JsonArrayConst>())
            return false;
        std::vector<Cerca> lidas;
        for (JsonObjectConst item : documento["c"].as<JsonArrayConst>())
        {
            Cerca cerca;
            cerca.centro = {0, 0};
            cerca.raioM = 0;
            const std::string tipo = item["t"] | "";
            cerca.circulo = tipo == "c";
            if (cerca.circulo)
            {
                cerca.centro = {item["lat"] | 0.0, item["lng"] | 0.0};
                cerca.raioM = item["r"] | 0.0;
            }
            else
            {
                for (JsonArrayConst par : item["v"].as<JsonArrayConst>())
                    cerca.vertices.push_back({par[0] | 0.0, par[1] | 0.0});
            }
            lidas.push_back(cerca);
        }
        ativa = documento["a"] | false;
        versao = documento["v"] | 0u;
        cercas = lidas;
        return true;
    }
}
