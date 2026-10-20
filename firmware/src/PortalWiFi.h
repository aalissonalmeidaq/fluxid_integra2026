#pragma once

#include <string>

#include <nucleo/Portal.h>
#include <nucleo/Rede.h>

// Portal de configuracao do lacre (Spec 013, RF-001 a RF-006; contracts/portal-do-lacre.md): rede FluxID-Lacre-XXXX com a senha padrao
// (WPA2), DNS que responde a qualquer nome com 192.168.4.1 (os celulares abrem a pagina sozinhos) e servidor web na porta 80 com a
// pagina, /redes, /testar e /situacao. O teste da rede escolhida roda no laco principal (main.cpp), nunca dentro do pedido HTTP.
// A senha da rede escolhida nunca volta para a pagina nem vai para o serial.
class PortalWiFi
{
public:
    void Abrir(const std::string& codigo, const char* senhaDoPortal);
    void Fechar();
    bool Aberto() const;
    // Atende o DNS e o servidor web; chamar a cada volta do laco enquanto aberto.
    void Atender();
    bool TemCliente() const;

    // Pedido de teste feito pela pagina e ainda nao executado pelo laco.
    bool PegarPedidoDeTeste(fluxid::RedeGuardada& rede);
    void ConcluirTeste(bool conectou, const std::string& motivo);
    void DefinirAprovacao(fluxid::AprovacaoNoPortal aprovacao);
    void DefinirConexao(const fluxid::ConexaoDoLacre& conexao);

private:
    bool aberto = false;
    std::string codigo;
};
