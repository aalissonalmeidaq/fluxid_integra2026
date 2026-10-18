#include "Fila.h"

#include <algorithm>
#include <stdio.h>

namespace fluxid
{
    namespace
    {
        // Cada arquivo guarda "message_id\nmensagem", para casar os resultados sem ler o JSON.
        std::string Conteudo(const std::string& messageId, const std::string& mensagem)
        {
            return messageId + "\n" + mensagem;
        }

        bool Separar(const std::string& conteudo, std::string& messageId, std::string& mensagem)
        {
            const size_t quebra = conteudo.find('\n');
            if (quebra == std::string::npos || quebra == 0 || quebra + 1 >= conteudo.size())
                return false;
            messageId = conteudo.substr(0, quebra);
            mensagem = conteudo.substr(quebra + 1);
            return true;
        }

        bool Espaco(char c)
        {
            return c == ' ' || c == '\t';
        }
    }

    Fila::Fila(Armazenamento& armazenamento, size_t capacidade) : armazenamento(armazenamento), capacidade(capacidade)
    {
    }

    bool Fila::Iniciar()
    {
        indices.clear();
        std::vector<uint32_t> sequencias;
        if (!armazenamento.Listar(sequencias))
            return false;
        std::sort(sequencias.begin(), sequencias.end());
        for (uint32_t sequencia : sequencias)
        {
            std::string conteudo;
            std::string messageId;
            std::string mensagem;
            if (armazenamento.Ler(sequencia, conteudo) && Separar(conteudo, messageId, mensagem))
                indices.push_back({sequencia, messageId});
            else
                armazenamento.Remover(sequencia); // arquivo corrompido: reenviar nao adianta
            if (sequencia >= proximaSequencia)
                proximaSequencia = sequencia + 1;
        }
        return true;
    }

    bool Fila::Adicionar(const std::string& messageId, const std::string& mensagem)
    {
        if (messageId.empty() || mensagem.empty())
            return false;
        while (indices.size() >= capacidade && !indices.empty())
        {
            RemoverIndice(0);
            descartadas++;
        }
        const uint32_t sequencia = proximaSequencia++;
        if (!armazenamento.Gravar(sequencia, Conteudo(messageId, mensagem)))
            return false;
        indices.push_back({sequencia, messageId});
        return true;
    }

    std::vector<ItemDaFila> Fila::ProximoLote(size_t maximo)
    {
        std::vector<ItemDaFila> lote;
        for (size_t i = 0; i < indices.size() && lote.size() < maximo; i++)
        {
            std::string conteudo;
            std::string messageId;
            std::string mensagem;
            if (armazenamento.Ler(indices[i].sequencia, conteudo) && Separar(conteudo, messageId, mensagem))
                lote.push_back({indices[i].sequencia, messageId, mensagem});
        }
        return lote;
    }

    size_t Fila::AplicarResultados(const std::vector<Resultado>& resultados)
    {
        size_t removidas = 0;
        for (const Resultado& resultado : resultados)
        {
            for (size_t i = 0; i < indices.size(); i++)
            {
                if (indices[i].messageId == resultado.messageId)
                {
                    if (RemoverIndice(i))
                        removidas++;
                    break;
                }
            }
        }
        return removidas;
    }

    void Fila::DescartarLote(const std::vector<ItemDaFila>& lote)
    {
        for (const ItemDaFila& item : lote)
        {
            for (size_t i = 0; i < indices.size(); i++)
            {
                if (indices[i].sequencia == item.sequencia)
                {
                    RemoverIndice(i);
                    descartadas++;
                    break;
                }
            }
        }
    }

    size_t Fila::Tamanho() const
    {
        return indices.size();
    }

    uint32_t Fila::Descartadas() const
    {
        return descartadas;
    }

    bool Fila::RemoverIndice(size_t posicao)
    {
        const uint32_t sequencia = indices[posicao].sequencia;
        indices.erase(indices.begin() + static_cast<long>(posicao));
        return armazenamento.Remover(sequencia);
    }

    AcaoDoEnvio ClassificarResposta(int codigoHttp)
    {
        if (codigoHttp == 200)
            return AcaoDoEnvio::AplicarResultados;
        if (codigoHttp == 400)
            return AcaoDoEnvio::DescartarLote;
        return AcaoDoEnvio::Manter;
    }

    uint32_t EsperaAteProximoEnvioMs(int codigoHttp, uint32_t intervaloS, uint32_t retryAfterS)
    {
        uint32_t segundos = intervaloS;
        if (codigoHttp == 429 && retryAfterS > segundos)
            segundos = retryAfterS;
        const uint32_t maximo = 0xFFFFFFFFUL / 1000UL;
        return segundos > maximo ? 0xFFFFFFFFUL : segundos * 1000UL;
    }

    bool InterpretarRetryAfter(const char* valor, uint32_t& segundos)
    {
        segundos = 0;
        if (valor == nullptr)
            return false;
        while (Espaco(*valor))
            valor++;
        if (*valor < '0' || *valor > '9')
            return false;
        uint32_t acumulado = 0;
        bool saturado = false;
        while (*valor >= '0' && *valor <= '9')
        {
            const uint32_t digito = static_cast<uint32_t>(*valor - '0');
            if (saturado || acumulado > (0xFFFFFFFFUL - digito) / 10UL)
                saturado = true;
            else
                acumulado = acumulado * 10UL + digito;
            valor++;
        }
        while (Espaco(*valor))
            valor++;
        if (*valor != '\0')
            return false;
        segundos = saturado ? 0xFFFFFFFFUL : acumulado;
        return true;
    }

    GeradorDeIds::GeradorDeIds(const std::string& codigoDispositivo, uint32_t reservado)
        : codigo(codigoDispositivo), atual(reservado), reservado(reservado)
    {
    }

    std::string GeradorDeIds::Proximo(bool& precisarReservar)
    {
        atual++;
        precisarReservar = atual > reservado;
        if (precisarReservar)
            reservado = atual + BLOCO - 1;
        char numero[16];
        snprintf(numero, sizeof(numero), "%010lu", static_cast<unsigned long>(atual));
        return codigo + "-" + numero;
    }

    uint32_t GeradorDeIds::Reservado() const
    {
        return reservado;
    }
}
