#include "Protocolo.h"

#include <ArduinoJson.h>
#include <stdio.h>

namespace fluxid
{
    namespace
    {
        void Cabecalho(JsonDocument& mensagem, const std::string& id, const char* tipo, const std::string& lidoEm)
        {
            mensagem["message_id"] = id;
            mensagem["type"] = tipo;
            mensagem["read_at"] = lidoEm;
        }

        void PreencherLeitura(JsonDocument& mensagem, const Leitura& leitura)
        {
            mensagem["latitude"] = leitura.ponto.latitude;
            mensagem["longitude"] = leitura.ponto.longitude;
            mensagem["quality"] = leitura.comGps ? "gps" : "last_known";
            if (leitura.precisaoM >= 0)
                mensagem["accuracy_m"] = leitura.precisaoM;
            else
                mensagem["accuracy_m"] = nullptr;
            if (leitura.bateriaPct >= 0)
                mensagem["battery_pct"] = leitura.bateriaPct;
            else
                mensagem["battery_pct"] = nullptr;
            mensagem["signal_dbm"] = leitura.sinalDbm;
            mensagem["seal_state"] = leitura.estadoLacre;
            if (leitura.temRede)
            {
                JsonObject wifi = mensagem["wifi"].to<JsonObject>();
                wifi["ssid"] = leitura.rede.ssid;
                wifi["kind"] = leitura.rede.padrao ? "default" : "list";
                wifi["rssi"] = leitura.rede.rssi;
            }
            if (!leitura.redesVisiveis.empty())
            {
                JsonArray visiveis = mensagem["available_networks"].to<JsonArray>();
                for (const RedeVisivel& rede : leitura.redesVisiveis)
                {
                    JsonObject item = visiveis.add<JsonObject>();
                    item["ssid"] = rede.ssid;
                    item["rssi"] = rede.rssi;
                }
            }
        }

        std::string Texto(const JsonDocument& documento)
        {
            std::string texto;
            serializeJson(documento, texto);
            return texto;
        }

        TipoComando LerTipo(const char* tipo)
        {
            const std::string valor = tipo == nullptr ? "" : tipo;
            if (valor == "lock")
                return TipoComando::Travar;
            if (valor == "unlock")
                return TipoComando::Destravar;
            if (valor == "wifi_add")
                return TipoComando::AdicionarRede;
            if (valor == "wifi_remove")
                return TipoComando::RemoverRede;
            if (valor == "wifi_reset")
                return TipoComando::ResetarRedes;
            return TipoComando::Desconhecido;
        }

        bool LerCerca(JsonObjectConst origem, Cerca& cerca)
        {
            const std::string forma = origem["shape"] | "";
            cerca.centro = {0, 0};
            cerca.raioM = 0;
            if (forma == "circle")
            {
                if (!origem["lat"].is<double>() || !origem["lng"].is<double>() || !origem["radius_m"].is<double>())
                    return false;
                cerca.circulo = true;
                cerca.centro = {origem["lat"].as<double>(), origem["lng"].as<double>()};
                cerca.raioM = origem["radius_m"].as<double>();
                return cerca.raioM > 0;
            }
            if (forma == "polygon")
            {
                JsonArrayConst vertices = origem["vertices"];
                if (vertices.isNull() || vertices.size() < 3)
                    return false;
                cerca.circulo = false;
                for (JsonArrayConst vertice : vertices)
                {
                    if (vertice.size() != 2)
                        return false;
                    cerca.vertices.push_back({vertice[0].as<double>(), vertice[1].as<double>()});
                }
                return true;
            }
            return false;
        }

        // Dias desde 1970-01-01 para ano, mes e dia (algoritmo civil de Howard Hinnant).
        void DataCivil(int64_t dias, int& ano, unsigned& mes, unsigned& dia)
        {
            dias += 719468;
            const int64_t era = (dias >= 0 ? dias : dias - 146096) / 146097;
            const unsigned doe = static_cast<unsigned>(dias - era * 146097);
            const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
            const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
            const unsigned mp = (5 * doy + 2) / 153;
            dia = doy - (153 * mp + 2) / 5 + 1;
            mes = mp < 10 ? mp + 3 : mp - 9;
            ano = static_cast<int>(yoe + era * 400 + (mes <= 2 ? 1 : 0));
        }
    }

    std::string MensagemPosicao(const std::string& id, const std::string& lidoEm, const Leitura& leitura)
    {
        JsonDocument mensagem;
        Cabecalho(mensagem, id, "position", lidoEm);
        PreencherLeitura(mensagem, leitura);
        return Texto(mensagem);
    }

    std::string MensagemAtivacao(const std::string& id, const std::string& lidoEm, const Leitura& leitura, bool valvulaFechada)
    {
        JsonDocument mensagem;
        Cabecalho(mensagem, id, "activation", lidoEm);
        PreencherLeitura(mensagem, leitura);
        mensagem["valve"] = valvulaFechada ? "closed" : "open";
        return Texto(mensagem);
    }

    std::string MensagemDesligamento(const std::string& id, const std::string& lidoEm, const Leitura& leitura)
    {
        JsonDocument mensagem;
        Cabecalho(mensagem, id, "shutdown", lidoEm);
        PreencherLeitura(mensagem, leitura);
        return Texto(mensagem);
    }

    std::string MensagemEvento(const std::string& id, const std::string& lidoEm, const std::string& codigo, const std::string& detalhe)
    {
        JsonDocument mensagem;
        Cabecalho(mensagem, id, "event", lidoEm);
        mensagem["code"] = codigo;
        if (!detalhe.empty())
            mensagem["detail"] = detalhe;
        return Texto(mensagem);
    }

    std::string MensagemAlerta(const std::string& id, const std::string& lidoEm, const std::string& codigo, bool temValor, double valor)
    {
        JsonDocument mensagem;
        Cabecalho(mensagem, id, "alert", lidoEm);
        mensagem["code"] = codigo;
        if (temValor)
            mensagem["value"] = valor;
        return Texto(mensagem);
    }

    std::string MensagemResultado(const std::string& id, const std::string& lidoEm, const std::string& comandoId, bool executado, const std::string& motivo)
    {
        JsonDocument mensagem;
        Cabecalho(mensagem, id, "command_result", lidoEm);
        mensagem["command_id"] = comandoId;
        mensagem["result"] = executado ? "executed" : "error";
        if (!executado && !motivo.empty())
            mensagem["reason"] = motivo;
        return Texto(mensagem);
    }

    std::string MensagemTrocaDeRede(const std::string& id, const std::string& lidoEm, const RedeEmUso& rede, const std::vector<std::string>& guardadas)
    {
        JsonDocument mensagem;
        Cabecalho(mensagem, id, "network_change", lidoEm);
        JsonObject wifi = mensagem["wifi"].to<JsonObject>();
        wifi["ssid"] = rede.ssid;
        wifi["kind"] = rede.padrao ? "default" : "list";
        wifi["rssi"] = rede.rssi;
        JsonArray lista = mensagem["saved"].to<JsonArray>();
        for (const std::string& nome : guardadas)
            lista.add(nome);
        return Texto(mensagem);
    }

    std::string MensagemTravaAutomatica(const std::string& id, const std::string& lidoEm, const std::string& travadoEm, const Leitura& leitura)
    {
        JsonDocument mensagem;
        Cabecalho(mensagem, id, "auto_lock", lidoEm);
        mensagem["locked_at"] = travadoEm;
        PreencherLeitura(mensagem, leitura);
        return Texto(mensagem);
    }

    std::string MontarPedido(const std::string& versaoFirmware, uint32_t versaoVigilancia, const std::vector<std::string>& mensagens)
    {
        JsonDocument pedido;
        pedido["protocol"] = VERSAO_PROTOCOLO;
        pedido["firmware_version"] = versaoFirmware;
        pedido["watch_version"] = versaoVigilancia;
        JsonArray lista = pedido["messages"].to<JsonArray>();
        for (const std::string& mensagem : mensagens)
            lista.add(serialized(mensagem));
        return Texto(pedido);
    }

    bool LerResposta(const std::string& corpo, Resposta& saida)
    {
        JsonDocument documento;
        if (deserializeJson(documento, corpo))
            return false;
        JsonArrayConst resultados = documento["results"];
        JsonObjectConst vigilancia = documento["watch"];
        if (!documento["results"].is<JsonArrayConst>() || !documento["watch"].is<JsonObjectConst>())
            return false;

        Resposta lida;
        lida.horaServidor = documento["server_time"] | "";
        for (JsonObjectConst resultado : resultados)
        {
            const std::string situacao = resultado["status"] | "";
            Resultado item;
            item.messageId = resultado["message_id"] | "";
            item.motivo = resultado["reason"] | "";
            if (situacao == "stored")
                item.situacao = Situacao::Gravada;
            else if (situacao == "duplicate")
                item.situacao = Situacao::Repetida;
            else if (situacao == "refused")
                item.situacao = Situacao::Recusada;
            else
                return false;
            lida.resultados.push_back(item);
        }

        if (documento["command"].is<JsonObjectConst>())
        {
            JsonObjectConst comando = documento["command"];
            lida.comando.tipo = LerTipo(comando["kind"]);
            lida.comando.id = comando["id"] | "";
            lida.comando.ssid = comando["ssid"] | "";
            lida.comando.aberta = comando["open"] | false;
            lida.comando.senha = comando["password"] | "";
            if (lida.comando.id.empty())
                lida.comando = Comando();
        }

        lida.vigilancia.ativa = vigilancia["active"] | false;
        lida.vigilancia.versao = vigilancia["version"] | 0u;
        if (vigilancia["fences"].is<JsonArrayConst>())
        {
            lida.vigilancia.temCercas = true;
            for (JsonObjectConst origem : vigilancia["fences"].as<JsonArrayConst>())
            {
                Cerca cerca;
                if (LerCerca(origem, cerca))
                    lida.vigilancia.cercas.push_back(cerca);
            }
        }

        uint32_t intervalo = documento["report_interval_s"] | 60u;
        lida.intervaloS = intervalo < 30 ? 30 : (intervalo > 900 ? 900 : intervalo);
        saida = lida;
        return true;
    }

    int64_t SegundosDesde1970(int ano, int mes, int dia, int hora, int minuto, int segundo)
    {
        if (ano < 2026 || ano > 2099 || mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora < 0 || hora > 23 || minuto < 0 || minuto > 59 || segundo < 0 || segundo > 60)
            return -1;
        // Dias desde 1970-01-01 (inverso de DataCivil, algoritmo de Howard Hinnant).
        const int y = ano - (mes <= 2 ? 1 : 0);
        const int era = y / 400;
        const unsigned yoe = static_cast<unsigned>(y - era * 400);
        const unsigned doy = (153 * static_cast<unsigned>(mes > 2 ? mes - 3 : mes + 9) + 2) / 5 + static_cast<unsigned>(dia) - 1;
        const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        const int64_t dias = static_cast<int64_t>(era) * 146097 + static_cast<int64_t>(doe) - 719468;
        return dias * 86400 + hora * 3600 + minuto * 60 + segundo;
    }

    std::string FormatarHorario(int64_t segundos)
    {
        int64_t dias = segundos / 86400;
        int64_t resto = segundos % 86400;
        if (resto < 0)
        {
            resto += 86400;
            dias -= 1;
        }
        int ano;
        unsigned mes;
        unsigned dia;
        DataCivil(dias, ano, mes, dia);
        char texto[24];
        snprintf(texto, sizeof(texto), "%04d-%02u-%02uT%02u:%02u:%02uZ", ano, mes, dia,
            static_cast<unsigned>(resto / 3600), static_cast<unsigned>((resto % 3600) / 60), static_cast<unsigned>(resto % 60));
        return texto;
    }
}
