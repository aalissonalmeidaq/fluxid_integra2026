#include "Identidade.h"

#include <string.h>

namespace fluxid
{
    namespace
    {
        const uint32_t K[64] = {
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};

        uint32_t Girar(uint32_t x, uint32_t n) { return (x >> n) | (x << (32 - n)); }

        void Bloco(uint32_t estado[8], const uint8_t bloco[64])
        {
            uint32_t w[64];
            for (int i = 0; i < 16; i++)
                w[i] = (uint32_t(bloco[i * 4]) << 24) | (uint32_t(bloco[i * 4 + 1]) << 16) | (uint32_t(bloco[i * 4 + 2]) << 8) | bloco[i * 4 + 3];
            for (int i = 16; i < 64; i++)
            {
                const uint32_t s0 = Girar(w[i - 15], 7) ^ Girar(w[i - 15], 18) ^ (w[i - 15] >> 3);
                const uint32_t s1 = Girar(w[i - 2], 17) ^ Girar(w[i - 2], 19) ^ (w[i - 2] >> 10);
                w[i] = w[i - 16] + s0 + w[i - 7] + s1;
            }
            uint32_t a = estado[0], b = estado[1], c = estado[2], d = estado[3], e = estado[4], f = estado[5], g = estado[6], h = estado[7];
            for (int i = 0; i < 64; i++)
            {
                const uint32_t t1 = h + (Girar(e, 6) ^ Girar(e, 11) ^ Girar(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
                const uint32_t t2 = (Girar(a, 2) ^ Girar(a, 13) ^ Girar(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
                h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
            }
            estado[0] += a; estado[1] += b; estado[2] += c; estado[3] += d; estado[4] += e; estado[5] += f; estado[6] += g; estado[7] += h;
        }

        const char* const BASE32_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        const char* const BASE64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    }

    void Sha256(const uint8_t* dados, size_t tamanho, uint8_t saida[32])
    {
        uint32_t estado[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
        uint8_t bloco[64];
        size_t i = 0;
        for (; i + 64 <= tamanho; i += 64)
            Bloco(estado, dados + i);
        const size_t resto = tamanho - i;
        memset(bloco, 0, sizeof(bloco));
        memcpy(bloco, dados + i, resto);
        bloco[resto] = 0x80;
        if (resto >= 56)
        {
            Bloco(estado, bloco);
            memset(bloco, 0, sizeof(bloco));
        }
        const uint64_t bits = uint64_t(tamanho) * 8;
        for (int j = 0; j < 8; j++)
            bloco[63 - j] = uint8_t(bits >> (8 * j));
        Bloco(estado, bloco);
        for (int j = 0; j < 8; j++)
        {
            saida[j * 4] = uint8_t(estado[j] >> 24);
            saida[j * 4 + 1] = uint8_t(estado[j] >> 16);
            saida[j * 4 + 2] = uint8_t(estado[j] >> 8);
            saida[j * 4 + 3] = uint8_t(estado[j]);
        }
    }

    std::string Sha256Hex(const std::string& texto)
    {
        uint8_t resumo[32];
        Sha256(reinterpret_cast<const uint8_t*>(texto.data()), texto.size(), resumo);
        static const char* const HEX = "0123456789abcdef";
        std::string saida;
        for (uint8_t byte : resumo)
        {
            saida += HEX[byte >> 4];
            saida += HEX[byte & 0x0f];
        }
        return saida;
    }

    std::string MacEmHexadecimal(const uint8_t mac[6])
    {
        static const char* const HEX = "0123456789ABCDEF";
        std::string saida;
        for (int i = 0; i < 6; i++)
        {
            saida += HEX[mac[i] >> 4];
            saida += HEX[mac[i] & 0x0f];
        }
        return saida;
    }

    std::string CodigoDoChip(const uint8_t mac[6])
    {
        const std::string entrada = "fluxid-lacre:" + MacEmHexadecimal(mac);
        uint8_t resumo[32];
        Sha256(reinterpret_cast<const uint8_t*>(entrada.data()), entrada.size(), resumo);
        uint64_t bits = 0;
        for (int i = 0; i < 5; i++)
            bits = (bits << 8) | resumo[i];
        std::string codigo = "DSP-";
        for (int i = 0; i < 8; i++)
            codigo += BASE32_CROCKFORD[(bits >> (35 - 5 * i)) & 31];
        return codigo;
    }

    std::string ChaveDeBytes(const uint8_t bytes[32])
    {
        std::string saida = "fxk_";
        for (int i = 0; i < 32; i += 3)
        {
            const uint32_t n = (uint32_t(bytes[i]) << 16) | (i + 1 < 32 ? uint32_t(bytes[i + 1]) << 8 : 0) | (i + 2 < 32 ? bytes[i + 2] : 0);
            saida += BASE64_URL[(n >> 18) & 63];
            saida += BASE64_URL[(n >> 12) & 63];
            if (i + 1 < 32) saida += BASE64_URL[(n >> 6) & 63];
            if (i + 2 < 32) saida += BASE64_URL[n & 63];
        }
        return saida;
    }

    bool ChaveNoFormato(const std::string& chave)
    {
        if (chave.size() != 47 || chave.rfind("fxk_", 0) != 0)
            return false;
        for (size_t i = 4; i < chave.size(); i++)
            if (strchr(BASE64_URL, chave[i]) == nullptr)
                return false;
        return true;
    }

    Identidade DefinirIdentidade(const uint8_t mac[6], const std::string& chaveGuardada, const std::string& codigoManual,
        const std::string& chaveManual, GeradorAleatorio gerador)
    {
        if (!codigoManual.empty() && !chaveManual.empty())
            return {codigoManual, chaveManual, false, true};
        if (ChaveNoFormato(chaveGuardada))
            return {CodigoDoChip(mac), chaveGuardada, false, false};
        uint8_t bytes[32];
        gerador(bytes, sizeof(bytes));
        return {CodigoDoChip(mac), ChaveDeBytes(bytes), true, false};
    }
}
