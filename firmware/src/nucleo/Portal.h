#pragma once

// Nucleo do portal de configuracao do lacre (Spec 013, RF-001 a RF-006, RN-004; contracts/portal-do-lacre.md). Sem Arduino.h: valida,
// escapa e monta o JSON das rotas e decide quando a rede de configuracao fica aberta. O softAP, o DNS e o servidor web ficam em
// src/PortalWiFi. A senha da rede escolhida nunca volta para a pagina nem para o serial.

#include <stdint.h>
#include <string>
#include <vector>

namespace fluxid
{
    // "FluxID-Lacre-" + 4 ultimos caracteres do codigo (RF-001).
    std::string NomeDaRedeDeConfiguracao(const std::string& codigo);

    // As mesmas regras do dominio das redes (Spec 012): nome de 1 a 32 bytes; senha de 8 a 63 caracteres, ou rede aberta.
    bool NomeDeRedeValido(const std::string& ssid);
    bool SenhaDeRedeValida(const std::string& senha, bool aberta);

    // Todo nome de rede vindo da varredura passa por aqui antes de entrar no HTML (um nome malicioso nao injeta codigo).
    std::string EscaparHtml(const std::string& texto);

    // Forte (>= -60 dBm), medio (-61 a -75) ou fraco (< -75): sempre a palavra, nunca so o icone.
    const char* SinalEmTexto(int rssi);

    struct RedeDoPortal
    {
        std::string ssid;
        int rssi;
        bool aberta;
    };

    // GET /redes: o codigo do lacre e as redes ao alcance, sem nome vazio, sem repetidos (fica a de sinal mais forte) e ordenadas pelo sinal.
    std::string RedesJson(const std::string& codigo, const std::vector<RedeDoPortal>& visiveis);

    bool MotivoDoPortalValido(const std::string& motivo);

    enum class AprovacaoNoPortal
    {
        Nenhuma,  // ainda nao falou com o FluxID por esta rede
        Pendente, // 202: aguardando a decisao do Master
        Aprovado  // 200: em operacao
    };

    // Spec 013 (RF-024): a conexao atual do lacre, para a pagina mostrar ao abrir. `rede` vazia: sem conexao.
    struct ConexaoDoLacre
    {
        std::string rede;
        bool alcancouFluxID = false;
    };

    // POST /testar e GET /situacao: um teste de rede por vez.
    class TesteDoPortal
    {
    public:
        // Falso se ja ha um teste em andamento (409 "ocupado").
        bool Iniciar();
        void Concluir(bool conectou, const std::string& motivo);
        bool EmAndamento() const;
        // `conexao.aprovacao` so aparece quando o lacre chega ao FluxID pela rede atual.
        std::string SituacaoJson(AprovacaoNoPortal aprovacao, const ConexaoDoLacre& conexao) const;

    private:
        enum class Estado { Ocioso, Testando, Conectado, Falhou };
        Estado estado = Estado::Ocioso;
        std::string motivo;
    };

    // Quando a rede de configuracao fica aberta. Sem rede salva, abre sozinha; sem ninguem conectado por 15 min, fecha por 5 min e
    // reabre. Com rede salva, so pelo botao (RN-004). Depois do sucesso, continua aberta enquanto houver cliente e fecha apenas
    // depois de 15 min sem ninguem, para que a pessoa consiga conferir a rede e o acesso ao FluxID.
    class JanelaDoPortal
    {
    public:
        static const uint32_t ABERTO_MS;
        static const uint32_t FECHADO_MS;

        // Devolve se a rede de configuracao deve estar aberta agora.
        bool Atualizar(uint32_t agoraMs, bool temRedeSalva, bool temCliente);
        void PedirAbertura(uint32_t agoraMs);
        bool Aberta() const;

    private:
        bool aberta = false;
        bool pedida = false;
        bool comecou = false;
        uint32_t marcoMs = 0;     // abriu, fechou ou o ultimo cliente

        void Abrir(uint32_t agoraMs);
        void Fechar(uint32_t agoraMs);
    };

    // Botao BOOT segurado por 5 s: uma abertura por pressionamento (RF-006).
    class BotaoDoPortal
    {
    public:
        static const uint32_t SEGURAR_MS;
        bool Atualizar(uint32_t agoraMs, bool pressionado);

    private:
        bool pressionado = false;
        bool disparou = false;
        uint32_t desdeMs = 0;
    };

    // A rede de configuracao so abre sozinha sem rede salva (RN-004).
    inline bool AbreSozinho(bool temRedeSalva) { return !temRedeSalva; }
}
