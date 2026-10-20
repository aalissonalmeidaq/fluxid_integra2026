#include <Arduino.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <WiFi.h>
#include <config.h>

#include <PortalPagina.h>
#include <PortalWiFi.h>

namespace
{
    const IPAddress ENDERECO(192, 168, 4, 1);
    const IPAddress MASCARA(255, 255, 255, 0);
    const uint8_t PORTA_DNS = 53;

    DNSServer dns;
    WebServer servidor(80);
    fluxid::TesteDoPortal teste;
    fluxid::AprovacaoNoPortal aprovacaoAtual = fluxid::AprovacaoNoPortal::Nenhuma;
    fluxid::ConexaoDoLacre conexaoAtual;
    bool pedidoPendente = false;
    fluxid::RedeGuardada pedido;
    std::string codigoDoLacre;

    void ResponderJson(int status, const std::string& corpo)
    {
        servidor.sendHeader("Cache-Control", "no-store");
        servidor.send(status, "application/json; charset=utf-8", corpo.c_str());
    }

    void Pagina()
    {
        servidor.sendHeader("Cache-Control", "no-store");
        servidor.send_P(200, "text/html; charset=utf-8", PORTAL_PAGINA);
    }

    void Redes()
    {
        std::vector<fluxid::RedeDoPortal> visiveis;
        const int16_t quantidade = WiFi.scanNetworks();
        for (int16_t i = 0; i < quantidade; i++)
            visiveis.push_back({WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.encryptionType(i) == WIFI_AUTH_OPEN});
        WiFi.scanDelete();
        ResponderJson(200, fluxid::RedesJson(codigoDoLacre, visiveis));
    }

    void Testar()
    {
        const std::string ssid = servidor.arg("ssid").c_str();
        const std::string senha = servidor.arg("senha").c_str();
        const bool aberta = servidor.arg("aberta") == "1";
        if (!fluxid::NomeDeRedeValido(ssid) || !fluxid::SenhaDeRedeValida(senha, aberta))
        {
            ResponderJson(400, "{\"situacao\":\"invalido\"}");
            return;
        }
        if (!teste.Iniciar())
        {
            ResponderJson(409, "{\"situacao\":\"ocupado\"}");
            return;
        }
        pedido = {ssid, aberta ? "" : senha, aberta};
        pedidoPendente = true;
        ResponderJson(202, "{\"situacao\":\"testando\"}");
    }

    void Situacao()
    {
        ResponderJson(200, teste.SituacaoJson(aprovacaoAtual, conexaoAtual));
    }
}

void PortalWiFi::Abrir(const std::string& codigoDoDispositivo, const char* senhaDoPortal)
{
    if (aberto)
        return;
    codigo = codigoDoDispositivo;
    codigoDoLacre = codigoDoDispositivo;
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAPConfig(ENDERECO, ENDERECO, MASCARA);
    const std::string nome = fluxid::NomeDaRedeDeConfiguracao(codigo);
    if (!WiFi.softAP(nome.c_str(), senhaDoPortal))
    {
        Serial.println("ERRO: nao foi possivel abrir a rede de configuracao.");
        return;
    }
    // ESP32-C3 Super Mini: com a potencia maxima a antena da placa deforma o sinal e a rede nem aparece no celular; a mesma potencia
    // reduzida da conexao (ConexaoWiFi) resolve.
    WiFi.setTxPower(POTENCIA_WIFI);
    dns.setErrorReplyCode(DNSReplyCode::NoError);
    dns.start(PORTA_DNS, "*", ENDERECO);
    servidor.on("/redes", HTTP_GET, Redes);
    servidor.on("/testar", HTTP_POST, Testar);
    servidor.on("/situacao", HTTP_GET, Situacao);
    servidor.on("/", HTTP_GET, Pagina);
    // Qualquer outro endereco (inclusive os testes de "portal cativo" dos sistemas) recebe a pagina.
    servidor.onNotFound(Pagina);
    servidor.begin();
    aberto = true;
    Serial.printf("Rede de configuracao aberta: %s\n", nome.c_str());
}

void PortalWiFi::Fechar()
{
    if (!aberto)
        return;
    servidor.stop();
    dns.stop();
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    aberto = false;
    pedidoPendente = false;
    Serial.println("Rede de configuracao fechada.");
}

bool PortalWiFi::Aberto() const
{
    return aberto;
}

void PortalWiFi::Atender()
{
    if (!aberto)
        return;
    dns.processNextRequest();
    servidor.handleClient();
}

bool PortalWiFi::TemCliente() const
{
    return aberto && WiFi.softAPgetStationNum() > 0;
}

bool PortalWiFi::PegarPedidoDeTeste(fluxid::RedeGuardada& rede)
{
    if (!pedidoPendente)
        return false;
    rede = pedido;
    pedido.senha.clear();
    pedidoPendente = false;
    return true;
}

void PortalWiFi::ConcluirTeste(bool conectou, const std::string& motivo)
{
    teste.Concluir(conectou, motivo);
}

void PortalWiFi::DefinirAprovacao(fluxid::AprovacaoNoPortal aprovacao)
{
    aprovacaoAtual = aprovacao;
}

void PortalWiFi::DefinirConexao(const fluxid::ConexaoDoLacre& conexao)
{
    conexaoAtual = conexao;
}
