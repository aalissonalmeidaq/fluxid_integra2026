#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include <Transporte.h>
#include <nucleo/Fila.h>
#include <Segredos.h>

// Pacote de certificados raiz (formato do esp_crt_bundle), embutido no binario pelo platformio.ini (board_build.embed_files);
// gerado por ferramentas/gerar_pacote_certificados.py a partir da lista do Mozilla.
extern const uint8_t pacote_certificados_inicio[] asm("_binary_certificados_x509_crt_bundle_bin_start");

namespace
{
    const char* CAMINHO = "/functions/v1/seal-gateway";
    const uint16_t TEMPO_RESPOSTA_MS = 10000;
    const char* CABECALHOS[] = {"Retry-After"};

    bool EnderecoLocalSemTls()
    {
        return strncmp(FLUXID_URL, "http://", 7) == 0;
    }

    RespostaHttp Chamar(HTTPClient& http, const std::string& corpo, const std::string& codigo, const std::string& chave)
    {
        RespostaHttp resposta = {-1, "", 0};
        http.setTimeout(TEMPO_RESPOSTA_MS);
        http.setReuse(false);
        http.collectHeaders(CABECALHOS, 1);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("X-Device-Id", codigo.c_str());
        http.addHeader("X-Device-Key", chave.c_str());
        resposta.codigo = http.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(corpo.data())), corpo.size());
        if (resposta.codigo > 0)
        {
            String texto = http.getString();
            resposta.corpo = texto.c_str();
            fluxid::InterpretarRetryAfter(http.header("Retry-After").c_str(), resposta.retryAfterS);
        }
        http.end();
        return resposta;
    }
}

RespostaHttp EnviarAoFluxID(const std::string& corpo, const std::string& codigo, const std::string& chave)
{
    const String url = String(FLUXID_URL) + CAMINHO;
    HTTPClient http;

    if (EnderecoLocalSemTls())
    {
#ifdef FLUXID_PERMITIR_HTTP_LOCAL
        WiFiClient cliente;
        if (!http.begin(cliente, url))
            return {-1, "", 0};
        return Chamar(http, corpo, codigo, chave);
#else
        // Sem TLS so na bancada, com a opcao ligada de proposito no secrets.h local.
        return {-1, "", 0};
#endif
    }

    WiFiClientSecure cliente;
    cliente.setCACertBundle(pacote_certificados_inicio);
    if (!http.begin(cliente, url))
        return {-1, "", 0};
    return Chamar(http, corpo, codigo, chave);
}
