#include <Arduino.h>
#include <LittleFS.h>
#include <Preferences.h>

#include <Memoria.h>

namespace
{
    const char* DIRETORIO = "/fila";
    Preferences preferencias;
    bool aberta = false;

    String Caminho(uint32_t sequencia, const char* extensao = ".msg")
    {
        char nome[40];
        snprintf(nome, sizeof(nome), "/fila/%010lu%s", static_cast<unsigned long>(sequencia), extensao);
        return String(nome);
    }

    // Numero do arquivo "0000000042.msg"; false para temporarios e nomes estranhos.
    bool NumeroDoArquivo(const char* nome, uint32_t& sequencia)
    {
        const char* base = strrchr(nome, '/');
        base = base == nullptr ? nome : base + 1;
        if (strlen(base) != 14 || strcmp(base + 10, ".msg") != 0)
            return false;
        sequencia = strtoul(base, nullptr, 10);
        return true;
    }
}

bool ArmazenamentoFlash::Montar()
{
    if (!LittleFS.begin(false))
        return false;
    if (!LittleFS.exists(DIRETORIO) && !LittleFS.mkdir(DIRETORIO))
        return false;
    // Temporarios de uma gravacao interrompida.
    File diretorio = LittleFS.open(DIRETORIO);
    std::vector<String> temporarios;
    for (File arquivo = diretorio.openNextFile(); arquivo; arquivo = diretorio.openNextFile())
    {
        String nome = arquivo.name();
        if (nome.endsWith(".tmp"))
            temporarios.push_back(String(DIRETORIO) + "/" + nome.substring(nome.lastIndexOf('/') + 1));
        arquivo.close();
    }
    diretorio.close();
    for (const String& caminho : temporarios)
        LittleFS.remove(caminho);
    return true;
}

bool ArmazenamentoFlash::Listar(std::vector<uint32_t>& sequencias)
{
    File diretorio = LittleFS.open(DIRETORIO);
    if (!diretorio || !diretorio.isDirectory())
        return false;
    for (File arquivo = diretorio.openNextFile(); arquivo; arquivo = diretorio.openNextFile())
    {
        uint32_t sequencia;
        if (!arquivo.isDirectory() && NumeroDoArquivo(arquivo.name(), sequencia))
            sequencias.push_back(sequencia);
        arquivo.close();
    }
    diretorio.close();
    return true;
}

bool ArmazenamentoFlash::Ler(uint32_t sequencia, std::string& conteudo)
{
    File arquivo = LittleFS.open(Caminho(sequencia), "r");
    if (!arquivo)
        return false;
    conteudo.clear();
    conteudo.reserve(arquivo.size());
    while (arquivo.available())
        conteudo.push_back(static_cast<char>(arquivo.read()));
    arquivo.close();
    return !conteudo.empty();
}

bool ArmazenamentoFlash::Gravar(uint32_t sequencia, const std::string& conteudo)
{
    const String temporario = Caminho(sequencia, ".tmp");
    File arquivo = LittleFS.open(temporario, "w");
    if (!arquivo)
        return false;
    const size_t escritos = arquivo.write(reinterpret_cast<const uint8_t*>(conteudo.data()), conteudo.size());
    arquivo.close();
    if (escritos != conteudo.size())
    {
        LittleFS.remove(temporario);
        return false;
    }
    return LittleFS.rename(temporario, Caminho(sequencia));
}

bool ArmazenamentoFlash::Remover(uint32_t sequencia)
{
    return LittleFS.remove(Caminho(sequencia));
}

bool MemoriaDaTravaNvs::Ler(bool& fechada)
{
    if (!aberta || !preferencias.isKey("trava"))
        return false;
    fechada = preferencias.getBool("trava", false);
    return true;
}

bool MemoriaDaTravaNvs::Gravar(bool fechada)
{
    return aberta && preferencias.putBool("trava", fechada) > 0;
}

bool AbrirMemoria()
{
    if (!aberta)
        aberta = preferencias.begin("fluxid", false);
    return aberta;
}

std::string LerTexto(const char* chave)
{
    if (!aberta || !preferencias.isKey(chave))
        return "";
    return preferencias.getString(chave, "").c_str();
}

bool GravarTexto(const char* chave, const std::string& valor)
{
    return aberta && preferencias.putString(chave, valor.c_str()) == valor.size();
}

uint32_t LerNumero(const char* chave, uint32_t padrao)
{
    return aberta ? preferencias.getUInt(chave, padrao) : padrao;
}

bool GravarNumero(const char* chave, uint32_t valor)
{
    return aberta && preferencias.putUInt(chave, valor) > 0;
}
