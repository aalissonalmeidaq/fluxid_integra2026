#pragma once

// Fila de leituras do lacre (Spec 012, "Requisitos para o firmware", item 5): toda mensagem e gravada antes do envio e so sai
// da fila depois que o FluxID decide sobre ela (stored, duplicate ou refused). Sem resposta, 401, 429 ou 503, tudo fica e e
// reenviado em lotes de ate 50, com os mesmos message_id. O armazenamento e uma interface: LittleFS no lacre, memoria nos testes.

#include <stdint.h>
#include <string>
#include <vector>

#include "Protocolo.h"

namespace fluxid
{
    class Armazenamento
    {
    public:
        virtual ~Armazenamento() = default;
        // Numeros de sequencia gravados, em qualquer ordem.
        virtual bool Listar(std::vector<uint32_t>& sequencias) = 0;
        virtual bool Ler(uint32_t sequencia, std::string& conteudo) = 0;
        // Grava de forma atomica (arquivo temporario e depois renomeia).
        virtual bool Gravar(uint32_t sequencia, const std::string& conteudo) = 0;
        virtual bool Remover(uint32_t sequencia) = 0;
    };

    struct ItemDaFila
    {
        uint32_t sequencia;
        std::string messageId;
        std::string mensagem; // objeto JSON pronto para o pedido
    };

    class Fila
    {
    public:
        // Capacidade em mensagens; cheia, a mais antiga da lugar a nova (a flash do lacre e finita).
        explicit Fila(Armazenamento& armazenamento, size_t capacidade = 2000);

        // Le o que ficou gravado (inclusive depois de um reinicio).
        bool Iniciar();
        bool Adicionar(const std::string& messageId, const std::string& mensagem);
        // As mais antigas primeiro, ate MAXIMO_POR_LOTE.
        std::vector<ItemDaFila> ProximoLote(size_t maximo = MAXIMO_POR_LOTE);
        // Resposta 200: sai da fila tudo que o FluxID decidiu (gravada, repetida ou recusada). Retorna quantas sairam.
        size_t AplicarResultados(const std::vector<Resultado>& resultados);
        // Resposta 400 (corpo fora do formato): o lote e defeito do firmware e reenviar nao resolve.
        void DescartarLote(const std::vector<ItemDaFila>& lote);
        size_t Tamanho() const;
        uint32_t Descartadas() const;

    private:
        struct Indice
        {
            uint32_t sequencia;
            std::string messageId;
        };

        bool RemoverIndice(size_t posicao);

        Armazenamento& armazenamento;
        size_t capacidade;
        std::vector<Indice> indices;
        uint32_t proximaSequencia = 1;
        uint32_t descartadas = 0;
    };

    // O que fazer depois de cada envio (contracts/mensagens-do-lacre.md, "Respostas de erro").
    enum class AcaoDoEnvio
    {
        AplicarResultados, // 200
        DescartarLote,     // 400: corpo fora do formato
        Manter             // sem resposta, 401, 429, 503 ou outro: tenta de novo no proximo intervalo
    };

    AcaoDoEnvio ClassificarResposta(int codigoHttp);

    // Espera ate o proximo envio: o intervalo combinado; com 429, o Retry-After se for maior.
    uint32_t EsperaAteProximoEnvioMs(int codigoHttp, uint32_t intervaloS, uint32_t retryAfterS);

    // Le o cabecalho Retry-After em segundos (RFC 9110). Data HTTP ou texto: false. Valores enormes saturam.
    bool InterpretarRetryAfter(const char* valor, uint32_t& segundos);

    // Identificadores unicos de mensagem, mesmo depois de reinicios: o contador e reservado em blocos na memoria do lacre,
    // para nao gravar a NVS a cada mensagem. Ao reiniciar, pula para o bloco seguinte.
    class GeradorDeIds
    {
    public:
        static const uint32_t BLOCO = 100;

        // reservado: ultimo valor gravado na memoria (0 na primeira vez).
        GeradorDeIds(const std::string& codigoDispositivo, uint32_t reservado);
        // Novo identificador ("DSP-7KQ2M9XT-0000000101"). Se precisarReservar ficar true, grave Reservado() na memoria.
        std::string Proximo(bool& precisarReservar);
        uint32_t Reservado() const;

    private:
        std::string codigo;
        uint32_t atual;
        uint32_t reservado;
    };
}
