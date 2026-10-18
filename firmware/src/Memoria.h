#pragma once

#include <nucleo/Fila.h>
#include <nucleo/Trava.h>

// Memoria do lacre: fila de leituras no LittleFS e o resto (trava, redes, vigilancia, contador de ids) na NVS.
// Nada disso vai para o serial: a lista de redes tem senhas.

// Fila no LittleFS: um arquivo por mensagem, gravado num .tmp e renomeado (queda de energia nao corrompe).
class ArmazenamentoFlash : public fluxid::Armazenamento
{
public:
    // Monta o LittleFS SEM formatar: falhar ao montar nao prova que a particao esta vazia.
    bool Montar();
    bool Listar(std::vector<uint32_t>& sequencias) override;
    bool Ler(uint32_t sequencia, std::string& conteudo) override;
    bool Gravar(uint32_t sequencia, const std::string& conteudo) override;
    bool Remover(uint32_t sequencia) override;
};

class MemoriaDaTravaNvs : public fluxid::MemoriaDaTrava
{
public:
    bool Ler(bool& fechada) override;
    bool Gravar(bool fechada) override;
};

bool AbrirMemoria();
std::string LerTexto(const char* chave);
bool GravarTexto(const char* chave, const std::string& valor);
uint32_t LerNumero(const char* chave, uint32_t padrao);
bool GravarNumero(const char* chave, uint32_t valor);
