#pragma once

#include <stdint.h>
#include <string>

// Chamada ao seal-gateway do FluxID (contracts/mensagens-do-lacre.md, "Chamada"): HTTPS com o certificado do servidor
// conferido pelo pacote de certificados raiz embutido, sem setInsecure. A chave vai so no cabecalho e nunca no serial.
struct RespostaHttp
{
    int codigo;           // status HTTP; negativo quando nao houve resposta
    std::string corpo;
    uint32_t retryAfterS; // 0 sem Retry-After
};

RespostaHttp EnviarAoFluxID(const std::string& corpo);
