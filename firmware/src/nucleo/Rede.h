#pragma once

// Redes Wi-Fi do lacre (Spec 012, RF-034a a RF-034e; "Requisitos para o firmware", item 8). A rede padrao vem do firmware
// (include/secrets.h) e nunca e apagada. A lista recebida do FluxID guarda ate 5 redes; entre as ao alcance, o lacre usa a de
// sinal mais forte e fica nela enquanto der acesso ao FluxID. Uma rede nova so e guardada depois de falar com o FluxID por ela;
// se nao der no prazo, o lacre volta para a rede em que estava e confirma com erro e o motivo. Senhas nunca vao para log.

#include <stdint.h>
#include <string>
#include <vector>

namespace fluxid
{
    struct RedeGuardada
    {
        std::string ssid;
        std::string senha;
        bool aberta;
    };

    struct RedeVisivel
    {
        std::string ssid;
        int rssi;
    };

    // Rede escolhida para conectar: da lista ou a padrao.
    struct EscolhaDeRede
    {
        bool padrao;
        std::string ssid;
        std::string senha;
    };

    enum class FalhaNaLista
    {
        Nenhuma,
        ListaCheia
    };

    // Spec 013 (RN-006): o que o FluxID pede para o lacre esquecer quando ele e devolvido ou retirado.
    enum class Esquecimento
    {
        Nenhum,
        Extras, // as redes recebidas do sistema; a principal fica
        Todas   // todas, menos a principal configurada pelo portal depois da ultima aprovacao
    };

    class ListaDeRedes
    {
    public:
        static const size_t MAXIMO = 5;

        ListaDeRedes(const std::string& ssidPadrao, const std::string& senhaPadrao);

        // Mesma rede: troca a senha. Nova com a lista cheia: recusa.
        FalhaNaLista Guardar(const RedeGuardada& rede);
        bool Remover(const std::string& ssid);
        void Limpar();
        bool Contem(const std::string& ssid) const;
        std::vector<std::string> Nomes() const;
        const std::vector<RedeGuardada>& Redes() const;

        // A da lista com sinal mais forte entre as ao alcance; sem nenhuma, a padrao.
        EscolhaDeRede Escolher(const std::vector<RedeVisivel>& visiveis) const;
        EscolhaDeRede Padrao() const;

        // Fica na rede enquanto der acesso ao FluxID: so procura outra depois destas falhas seguidas.
        static const uint8_t FALHAS_PARA_PROCURAR_OUTRA = 3;

        // Persistencia na memoria do lacre (NVS), em JSON. Restaurar ignora conteudo invalido.
        std::string Serializar() const;
        bool Restaurar(const std::string& conteudo);

        // Spec 013: a rede principal (a "padrao" da Spec 012) vem do portal e pode faltar; o firmware novo nao grava rede nenhuma.
        bool TemPrincipal() const;
        bool TemAlgumaRede() const;
        const RedeGuardada& Principal() const;
        // So depois do teste com sucesso (RF-005). `peloPortal` marca a rede configurada no local desde a ultima aprovacao.
        void DefinirPrincipal(const RedeGuardada& rede, bool peloPortal);
        bool PrincipalDoPortalDesdeAAprovacao() const;
        // A cada 200: a rede principal passa a ser "do tenant em que o lacre operou".
        void MarcarAprovado();
        void Esquecer(Esquecimento escopo);
        std::string SerializarPrincipal() const;
        bool RestaurarPrincipal(const std::string& conteudo);

        // Spec 013 (RF-023): a rede padrao da plataforma (FluxID), vinda do secrets.h. Vale so enquanto nao ha principal escolhida
        // no portal; nao e de tenant nenhum, entao o esquecimento nunca a apaga, e ela nunca vai para a memoria do lacre. Nao conta
        // como rede salva: o portal continua abrindo sozinho para a pessoa escolher a rede do local.
        void DefinirRedeDeFabrica(const std::string& ssid, const std::string& senha);
        bool TemRedeParaTentar() const;

    private:
        RedeGuardada padrao;
        RedeGuardada fabrica{"", "", true};
        bool principalDoPortal = false;
        std::vector<RedeGuardada> redes;
    };

    // Motivo do erro ao testar uma rede nova (RF-034d).
    const char* MotivoDaFalhaDeRede(bool estavaVisivel, bool conectou);

    // Troca para uma rede recebida pelo FluxID: testa antes de guardar.
    class TrocaDeRede
    {
    public:
        static const uint32_t PRAZO_MS = 60000UL;

        // Comeca o teste: guarda a rede anterior para voltar se falhar.
        void Iniciar(const std::string& comandoId, const RedeGuardada& candidata, const EscolhaDeRede& anterior, uint32_t agoraMs);
        bool EmTeste() const;
        bool Expirou(uint32_t agoraMs) const;
        const RedeGuardada& Candidata() const;
        const EscolhaDeRede& Anterior() const;
        const std::string& ComandoId() const;

        // Falou com o FluxID pela rede nova: so agora ela entra na lista.
        FalhaNaLista Concluir(ListaDeRedes& lista);
        // Nao deu: volta para a anterior; o motivo vai no command_result.
        void Desistir();

    private:
        bool emTeste = false;
        std::string comandoId;
        RedeGuardada candidata;
        EscolhaDeRede anterior;
        uint32_t inicioMs = 0;
    };
}
