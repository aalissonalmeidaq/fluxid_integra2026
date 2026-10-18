#include <Arduino.h>
#include <WiFi.h>
#include <algorithm>

#include <ConexaoWiFi.h>
#include <config.h>

ConexaoWiFi::ConexaoWiFi(fluxid::ListaDeRedes& lista) : lista(lista), atual(lista.Padrao())
{
}

void ConexaoWiFi::Iniciar()
{
    WiFi.mode(WIFI_STA);
    // A escolha da rede e do lacre (lista e padrao), nao da reconexao automatica do ESP32.
    WiFi.setAutoReconnect(false);
    WiFi.persistent(false);
    // Motivo de cada queda ou recusa (senha, seguranca, rede fora), sem a senha.
    WiFi.onEvent([](WiFiEvent_t, WiFiEventInfo_t info) {
        const uint8_t motivo = info.wifi_sta_disconnected.reason;
        Serial.printf("Wi-Fi: desconectado, motivo %u (%s)\n", motivo, WiFi.disconnectReasonName(static_cast<wifi_err_reason_t>(motivo)));
    }, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
}

std::vector<fluxid::RedeVisivel> ConexaoWiFi::Procurar()
{
    std::vector<fluxid::RedeVisivel> visiveis;
    const int16_t quantidade = WiFi.scanNetworks();
    for (int16_t i = 0; i < quantidade; i++)
    {
        const std::string ssid = WiFi.SSID(i).c_str();
        if (ssid.empty())
            continue;
        bool repetida = false;
        for (fluxid::RedeVisivel& rede : visiveis)
            if (rede.ssid == ssid)
            {
                rede.rssi = std::max(rede.rssi, static_cast<int>(WiFi.RSSI(i)));
                repetida = true;
            }
        if (!repetida)
            visiveis.push_back({ssid, WiFi.RSSI(i)});
    }
    WiFi.scanDelete();
    ultimasVisiveis = visiveis;
    return visiveis;
}

bool ConexaoWiFi::Conectar(const fluxid::EscolhaDeRede& escolha)
{
    WiFi.disconnect();
    WiFi.begin(escolha.ssid.c_str(), escolha.senha.empty() ? nullptr : escolha.senha.c_str());
    // ESP32-C3 Super Mini: com a potencia maxima a antena da placa faz a autenticacao expirar (AUTH_EXPIRE); 8,5 dBm resolve.
    WiFi.setTxPower(POTENCIA_WIFI);
    const uint32_t inicio = millis();
    wl_status_t situacao = WiFi.status();
    while (situacao != WL_CONNECTED && situacao != WL_CONNECT_FAILED && millis() - inicio < TEMPO_CONEXAO_WIFI_MS)
    {
        delay(100);
        situacao = WiFi.status();
    }
    ultimaTentativaMs = millis();
    if (situacao != WL_CONNECTED)
    {
        Serial.printf("Wi-Fi: nao conectou (%s), estado %d\n", escolha.padrao ? "rede padrao" : "rede da lista", static_cast<int>(situacao));
        return false;
    }
    atual = escolha;
    falhasSeguidas = 0;
    procurarOutra = false;
    Serial.printf("Wi-Fi conectado (%s), sinal %d dBm\n", atual.padrao ? "rede padrao" : "rede da lista", WiFi.RSSI());
    return true;
}

bool ConexaoWiFi::ProcurarEConectar()
{
    const std::string antes = atual.ssid;
    const bool conectadoAntes = Conectado();
    const std::vector<fluxid::RedeVisivel> visiveis = Procurar();
    const auto visivel = [&](const std::string& ssid) {
        for (const fluxid::RedeVisivel& rede : visiveis)
            if (rede.ssid == ssid)
                return true;
        return false;
    };
    const fluxid::EscolhaDeRede escolha = lista.Escolher(visiveis);
    // Rede fora do alcance: nem tenta (conectar bloqueia o laco por ate TEMPO_CONEXAO_WIFI_MS e o GPS perde frases).
    if (visivel(escolha.ssid))
    {
        if (!Conectar(escolha) && !escolha.padrao && visivel(lista.Padrao().ssid))
            Conectar(lista.Padrao());
    }
    else
    {
        ultimaTentativaMs = millis();
        Serial.printf("Wi-Fi: rede %s fora do alcance (%u redes visiveis).\n", escolha.padrao ? "padrao" : "da lista", static_cast<unsigned>(visiveis.size()));
        // Diagnostico de bancada: so os nomes das redes ao alcance (publicos), para conferir a rede padrao.
        for (const fluxid::RedeVisivel& rede : visiveis)
            Serial.printf("  - %s (%d dBm)\n", rede.ssid.c_str(), rede.rssi);
    }
    return Conectado() && (!conectadoAntes || atual.ssid != antes);
}

bool ConexaoWiFi::Atualizar(uint32_t agoraMs)
{
    if (Conectado() && !procurarOutra)
        return false;
    if (agoraMs - ultimaTentativaMs < INTERVALO_RECONEXAO_MS)
        return false;
    return ProcurarEConectar();
}

void ConexaoWiFi::RegistrarEnvio(bool alcancouFluxID)
{
    if (alcancouFluxID)
    {
        falhasSeguidas = 0;
        return;
    }
    if (falhasSeguidas < 0xFF)
        falhasSeguidas++;
    // Fica na rede enquanto der acesso ao FluxID; depois de falhas seguidas, procura outra.
    if (falhasSeguidas >= fluxid::ListaDeRedes::FALHAS_PARA_PROCURAR_OUTRA)
        procurarOutra = true;
}

bool ConexaoWiFi::TestarRede(const fluxid::RedeGuardada& rede, std::string& motivo)
{
    bool visivel = false;
    for (const fluxid::RedeVisivel& encontrada : Procurar())
        visivel = visivel || encontrada.ssid == rede.ssid;
    if (!visivel)
    {
        motivo = fluxid::MotivoDaFalhaDeRede(false, false);
        return false;
    }
    if (!Conectar({false, rede.ssid, rede.aberta ? "" : rede.senha}))
    {
        motivo = fluxid::MotivoDaFalhaDeRede(true, false);
        return false;
    }
    return true;
}

bool ConexaoWiFi::Conectado() const
{
    return WiFi.status() == WL_CONNECTED;
}

const fluxid::EscolhaDeRede& ConexaoWiFi::Escolha() const
{
    return atual;
}

fluxid::RedeEmUso ConexaoWiFi::EmUso() const
{
    const int rssi = Conectado() ? WiFi.RSSI() : -127;
    return {atual.ssid, atual.padrao, rssi < -127 ? -127 : (rssi > 0 ? 0 : rssi)};
}

const std::vector<fluxid::RedeVisivel>& ConexaoWiFi::Visiveis() const
{
    return ultimasVisiveis;
}

bool ConexaoWiFi::CaiuNaPadrao() const
{
    return atual.padrao && !lista.Nomes().empty();
}
