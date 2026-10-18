#pragma once

// Contrato das mensagens do lacre com o FluxID (Spec 012, contracts/mensagens-do-lacre.md). Monta cada mensagem e o pedido,
// e le a resposta do seal-gateway. Os exemplos canonicos de tests/fixtures/seal-protocol/ sao a referencia exata e sao
// conferidos em test/test_protocolo. Sem Arduino.h: roda no lacre e no computador.

#include <stdint.h>
#include <string>
#include <vector>
#include "Rede.h"

namespace fluxid
{
    const int VERSAO_PROTOCOLO = 1;
    const size_t MAXIMO_POR_LOTE = 50;

    struct Ponto
    {
        double latitude;
        double longitude;
    };

    // Rede Wi-Fi em uso, informada em toda comunicacao (nunca a senha).
    struct RedeEmUso
    {
        std::string ssid;
        bool padrao; // "default" (gravada no firmware) ou "list" (recebida do FluxID)
        int rssi;
    };

    // Leitura do lacre: posicao, bateria, sinal e estado.
    struct Leitura
    {
        Ponto ponto;
        bool comGps;      // "gps"; sem fix atual, vai a ultima conhecida ("last_known")
        double precisaoM; // negativo: sem precisao (vai null)
        int bateriaPct;   // negativo: sem medicao (vai null; o lacre nunca inventa a bateria)
        int sinalDbm;
        std::string estadoLacre; // "closed", "open", "broken" ou "unknown"
        bool temRede;
        RedeEmUso rede;
        std::vector<RedeVisivel> redesVisiveis; // última varredura; somente SSID e sinal
    };

    std::string MensagemPosicao(const std::string& id, const std::string& lidoEm, const Leitura& leitura);
    std::string MensagemAtivacao(const std::string& id, const std::string& lidoEm, const Leitura& leitura, bool valvulaFechada);
    std::string MensagemDesligamento(const std::string& id, const std::string& lidoEm, const Leitura& leitura);
    std::string MensagemEvento(const std::string& id, const std::string& lidoEm, const std::string& codigo, const std::string& detalhe = "");
    std::string MensagemAlerta(const std::string& id, const std::string& lidoEm, const std::string& codigo, bool temValor = false, double valor = 0);
    // motivo vazio vai como ausente; com erro: wifi_not_found, wifi_auth, wifi_no_internet, actuator ou unknown.
    std::string MensagemResultado(const std::string& id, const std::string& lidoEm, const std::string& comandoId, bool executado, const std::string& motivo = "");
    std::string MensagemTrocaDeRede(const std::string& id, const std::string& lidoEm, const RedeEmUso& rede, const std::vector<std::string>& guardadas);
    std::string MensagemTravaAutomatica(const std::string& id, const std::string& lidoEm, const std::string& travadoEm, const Leitura& leitura);

    // Corpo do pedido com as mensagens ja montadas (cada uma um objeto JSON).
    std::string MontarPedido(const std::string& versaoFirmware, uint32_t versaoVigilancia, const std::vector<std::string>& mensagens);

    enum class Situacao
    {
        Gravada,  // stored
        Repetida, // duplicate: o FluxID ja tinha recebido
        Recusada  // refused, com motivo: reenviar nao adianta
    };

    struct Resultado
    {
        std::string messageId;
        Situacao situacao;
        std::string motivo;
    };

    enum class TipoComando
    {
        Nenhum,
        Travar,
        Destravar,
        AdicionarRede,
        RemoverRede,
        ResetarRedes,
        Desconhecido
    };

    struct Comando
    {
        TipoComando tipo = TipoComando::Nenhum;
        std::string id;
        std::string ssid;
        bool aberta = false;
        std::string senha; // so em wifi_add; nunca vai para log
    };

    struct Cerca
    {
        bool circulo;
        Ponto centro;   // circulo
        double raioM;   // circulo
        std::vector<Ponto> vertices; // poligono
    };

    struct DadosVigilancia
    {
        bool ativa = false;
        uint32_t versao = 0;
        bool temCercas = false; // as cercas so vem quando a versao muda
        std::vector<Cerca> cercas;
    };

    struct Resposta
    {
        std::string horaServidor;
        std::vector<Resultado> resultados;
        Comando comando;
        DadosVigilancia vigilancia;
        uint32_t intervaloS = 60;
    };

    // Le a resposta 200. Retorna false se o corpo nao seguir o contrato.
    bool LerResposta(const std::string& corpo, Resposta& saida);

    // Horario ISO 8601 em UTC ("2026-10-17T14:03:00Z") a partir dos segundos desde 1970.
    std::string FormatarHorario(int64_t segundos);

    // Segundos desde 1970 (UTC) a partir da data e hora do GPS. Sem internet, o lacre acerta o relogio pelos satelites.
    // Retorna -1 para data fora do intervalo aceito (antes de 2026 ou campos invalidos, como o GPS ainda sem hora).
    int64_t SegundosDesde1970(int ano, int mes, int dia, int hora, int minuto, int segundo);
}
