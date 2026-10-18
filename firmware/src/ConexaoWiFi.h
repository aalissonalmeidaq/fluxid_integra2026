#pragma once

#include <string>
#include <vector>

#include <nucleo/Protocolo.h>
#include <nucleo/Rede.h>

// Conexao Wi-Fi do lacre (RF-034d, RF-034e): escolhe pela lista (sinal mais forte entre as conhecidas, senao a padrao),
// fica na rede enquanto der acesso ao FluxID e testa redes novas antes de guarda-las. Nunca escreve senha no serial.
class ConexaoWiFi
{
public:
    explicit ConexaoWiFi(fluxid::ListaDeRedes& lista);

    void Iniciar();
    // Procura as redes ao alcance e conecta na melhor. Retorna true se a rede em uso mudou.
    bool ProcurarEConectar();
    bool Conectar(const fluxid::EscolhaDeRede& escolha);
    // Reconecta se caiu, ou procura outra rede depois de falhas seguidas. Retorna true se a rede em uso mudou.
    bool Atualizar(uint32_t agoraMs);
    void RegistrarEnvio(bool alcancouFluxID);
    // Conecta na rede nova. false com o motivo do contrato (wifi_not_found ou wifi_auth).
    bool TestarRede(const fluxid::RedeGuardada& rede, std::string& motivo);

    bool Conectado() const;
    const fluxid::EscolhaDeRede& Escolha() const;
    fluxid::RedeEmUso EmUso() const;
    // Última varredura feita pelo próprio ESP32. Contém somente nome e sinal, nunca senha.
    const std::vector<fluxid::RedeVisivel>& Visiveis() const;
    // Caiu na padrao com redes na lista: vira o evento wifi_fallback_default.
    bool CaiuNaPadrao() const;

private:
    std::vector<fluxid::RedeVisivel> Procurar();

    fluxid::ListaDeRedes& lista;
    fluxid::EscolhaDeRede atual;
    uint32_t ultimaTentativaMs = 0;
    uint8_t falhasSeguidas = 0;
    bool procurarOutra = false;
    std::vector<fluxid::RedeVisivel> ultimasVisiveis;
};
