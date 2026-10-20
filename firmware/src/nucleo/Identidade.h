#pragma once

// Identidade do lacre (Spec 013, RF-007, RF-008; research.md, itens 1, 2 e 12). Um unico firmware para todos os lacres: o codigo vem do
// MAC de fabrica do chip e a chave e criada pelo proprio lacre no primeiro uso e guardada na NVS. Ninguem copia chave nenhuma. Sem
// Arduino.h: roda no lacre e no computador (test/test_identidade). A chave nunca vai para log.

#include <stddef.h>
#include <stdint.h>
#include <string>

namespace fluxid
{
    // SHA-256 em hexadecimal minusculo (implementacao propria, para o nucleo nao depender do mbedTLS do ESP32).
    std::string Sha256Hex(const std::string& texto);
    void Sha256(const uint8_t* dados, size_t tamanho, uint8_t saida[32]);

    // MAC em hexadecimal maiusculo, sem separadores ("A0B1C2D3E4F5").
    std::string MacEmHexadecimal(const uint8_t mac[6]);

    // "DSP-" + 8 caracteres base32 Crockford (sem I, L, O e U) dos 40 primeiros bits do SHA-256 de "fluxid-lacre:" + MAC.
    std::string CodigoDoChip(const uint8_t mac[6]);

    // "fxk_" + base64url sem preenchimento de 32 bytes aleatorios (o mesmo formato das chaves da Spec 012).
    std::string ChaveDeBytes(const uint8_t bytes[32]);
    bool ChaveNoFormato(const std::string& chave);

    // Gerador de bytes aleatorios: no lacre, esp_fill_random (o gerador de hardware); nos testes, um simulado.
    typedef void (*GeradorAleatorio)(uint8_t* destino, size_t tamanho);

    struct Identidade
    {
        std::string codigo;
        std::string chave;
        bool chaveNova;      // criada agora: guardar na NVS antes da primeira chamada
        bool cadastroManual; // lacre da Spec 012 com codigo e chave do secrets.h
    };

    // Com codigo e chave do cadastro manual (Spec 012), usa os dois. Senao, o codigo do chip e a chave guardada; sem chave valida, cria.
    Identidade DefinirIdentidade(const uint8_t mac[6], const std::string& chaveGuardada, const std::string& codigoManual,
        const std::string& chaveManual, GeradorAleatorio gerador);
}
