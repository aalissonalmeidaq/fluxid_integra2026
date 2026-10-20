// Spec 012 (T108; RF-034d, RF-034e, CA-009): escolha da rede conhecida de sinal mais forte, volta a padrao sem nenhuma da
// lista ao alcance, lista de ate 5, rede nova so guardada depois de alcancar o FluxID por ela e falha voltando a anterior.

#include <unity.h>

#include "nucleo/Rede.h"

using namespace fluxid;

namespace
{
    ListaDeRedes Lista()
    {
        return ListaDeRedes("Rede-Padrao-Ficticia", "Senha-padrao-ficticia");
    }

    RedeGuardada Rede(const char* ssid)
    {
        return {ssid, "Senha-ficticia", false};
    }
}

void test_escolhe_a_conhecida_de_sinal_mais_forte()
{
    ListaDeRedes lista = Lista();
    lista.Guardar(Rede("Deposito"));
    lista.Guardar(Rede("Caminhao"));
    EscolhaDeRede escolha = lista.Escolher({{"Vizinho", -30}, {"Deposito", -80}, {"Caminhao", -55}});
    TEST_ASSERT_FALSE(escolha.padrao);
    TEST_ASSERT_EQUAL_STRING("Caminhao", escolha.ssid.c_str());
    TEST_ASSERT_EQUAL_STRING("Senha-ficticia", escolha.senha.c_str());
}

void test_sem_nenhuma_da_lista_ao_alcance_usa_a_padrao()
{
    ListaDeRedes lista = Lista();
    lista.Guardar(Rede("Deposito"));
    EscolhaDeRede escolha = lista.Escolher({{"Vizinho", -30}});
    TEST_ASSERT_TRUE(escolha.padrao);
    TEST_ASSERT_EQUAL_STRING("Rede-Padrao-Ficticia", escolha.ssid.c_str());
    TEST_ASSERT_TRUE(Lista().Escolher({}).padrao);
}

void test_lista_de_ate_5_e_mesma_rede_troca_a_senha()
{
    ListaDeRedes lista = Lista();
    const char* nomes[] = {"R1", "R2", "R3", "R4", "R5"};
    for (const char* nome : nomes)
        TEST_ASSERT_TRUE(lista.Guardar(Rede(nome)) == FalhaNaLista::Nenhuma);
    TEST_ASSERT_TRUE(lista.Guardar(Rede("R6")) == FalhaNaLista::ListaCheia);
    TEST_ASSERT_TRUE(lista.Guardar({"R5", "Outra-senha-ficticia", false}) == FalhaNaLista::Nenhuma);
    TEST_ASSERT_EQUAL(5, lista.Nomes().size());
    TEST_ASSERT_EQUAL_STRING("Outra-senha-ficticia", lista.Redes()[4].senha.c_str());
}

void test_remover_e_voltar_a_padrao_nunca_apagam_a_padrao()
{
    ListaDeRedes lista = Lista();
    lista.Guardar(Rede("R1"));
    lista.Guardar(Rede("R2"));
    TEST_ASSERT_TRUE(lista.Remover("R1"));
    TEST_ASSERT_FALSE(lista.Remover("R1"));
    TEST_ASSERT_EQUAL(1, lista.Nomes().size());
    lista.Limpar();
    TEST_ASSERT_EQUAL(0, lista.Nomes().size());
    TEST_ASSERT_EQUAL_STRING("Rede-Padrao-Ficticia", lista.Padrao().ssid.c_str());
}

void test_rede_nova_so_e_guardada_depois_de_alcancar_o_fluxid()
{
    ListaDeRedes lista = Lista();
    TrocaDeRede troca;
    troca.Iniciar("cmd-1", Rede("Cliente"), lista.Padrao(), 1000);
    TEST_ASSERT_TRUE(troca.EmTeste());
    TEST_ASSERT_FALSE(lista.Contem("Cliente"));
    TEST_ASSERT_TRUE(troca.Concluir(lista) == FalhaNaLista::Nenhuma);
    TEST_ASSERT_TRUE(lista.Contem("Cliente"));
    TEST_ASSERT_FALSE(troca.EmTeste());
}

void test_falha_volta_para_a_rede_anterior_com_o_motivo()
{
    ListaDeRedes lista = Lista();
    lista.Guardar(Rede("Deposito"));
    EscolhaDeRede anterior = lista.Escolher({{"Deposito", -60}});
    TrocaDeRede troca;
    troca.Iniciar("cmd-2", Rede("Cliente"), anterior, 1000);
    TEST_ASSERT_FALSE(troca.Expirou(1000 + TrocaDeRede::PRAZO_MS - 1));
    TEST_ASSERT_TRUE(troca.Expirou(1000 + TrocaDeRede::PRAZO_MS));
    TEST_ASSERT_EQUAL_STRING("Deposito", troca.Anterior().ssid.c_str());
    TEST_ASSERT_EQUAL_STRING("cmd-2", troca.ComandoId().c_str());
    troca.Desistir();
    TEST_ASSERT_FALSE(troca.EmTeste());
    TEST_ASSERT_FALSE(lista.Contem("Cliente"));
    TEST_ASSERT_EQUAL_STRING("wifi_not_found", MotivoDaFalhaDeRede(false, false));
    TEST_ASSERT_EQUAL_STRING("wifi_auth", MotivoDaFalhaDeRede(true, false));
    TEST_ASSERT_EQUAL_STRING("wifi_no_internet", MotivoDaFalhaDeRede(true, true));
}

void test_rede_nova_com_a_lista_cheia_nao_entra()
{
    ListaDeRedes lista = Lista();
    const char* nomes[] = {"R1", "R2", "R3", "R4", "R5"};
    for (const char* nome : nomes)
        lista.Guardar(Rede(nome));
    TrocaDeRede troca;
    troca.Iniciar("cmd-3", Rede("R6"), lista.Padrao(), 0);
    TEST_ASSERT_TRUE(troca.Concluir(lista) == FalhaNaLista::ListaCheia);
    TEST_ASSERT_FALSE(lista.Contem("R6"));
}

void test_lista_sobrevive_ao_reinicio()
{
    ListaDeRedes lista = Lista();
    lista.Guardar(Rede("Deposito"));
    lista.Guardar({"Visitantes", "", true});
    ListaDeRedes depois = Lista();
    TEST_ASSERT_TRUE(depois.Restaurar(lista.Serializar()));
    TEST_ASSERT_EQUAL(2, depois.Nomes().size());
    TEST_ASSERT_TRUE(depois.Redes()[1].aberta);
    TEST_ASSERT_FALSE(depois.Restaurar("lixo"));
    TEST_ASSERT_EQUAL(2, depois.Nomes().size());
}


// Spec 013 (T050; RF-005, RF-020, RN-006): a rede principal vem do portal, so depois do teste com sucesso, e soma com as redes extras do
// sistema. Esquecer as extras mantem a principal; esquecer todas mantem so a principal configurada pelo portal depois da ultima
// aprovacao (200) e, sem ela, deixa o lacre sem rede salva.
void test_sem_rede_no_firmware_comeca_sem_rede_salva()
{
    ListaDeRedes lista("", "");
    TEST_ASSERT_FALSE(lista.TemPrincipal());
    TEST_ASSERT_FALSE(lista.TemAlgumaRede());
}

void test_rede_do_portal_vira_a_principal_e_soma_com_as_extras()
{
    ListaDeRedes lista("", "");
    lista.DefinirPrincipal({"Rede-Do-Portal", "Senha-ficticia", false}, true);
    lista.Guardar(Rede("Extra-Do-Sistema"));
    TEST_ASSERT_TRUE(lista.TemPrincipal());
    TEST_ASSERT_EQUAL_STRING("Rede-Do-Portal", lista.Principal().ssid.c_str());
    EscolhaDeRede escolha = lista.Escolher({{"Extra-Do-Sistema", -50}});
    TEST_ASSERT_FALSE(escolha.padrao);
    TEST_ASSERT_TRUE(lista.Escolher({{"Vizinho", -40}}).padrao);
}

void test_esquecer_as_extras_mantem_a_principal()
{
    ListaDeRedes lista("", "");
    lista.DefinirPrincipal({"Rede-Do-Portal", "Senha-ficticia", false}, true);
    lista.Guardar(Rede("Extra-Do-Tenant-A"));
    lista.Esquecer(Esquecimento::Extras);
    TEST_ASSERT_EQUAL(0, lista.Nomes().size());
    TEST_ASSERT_TRUE(lista.TemPrincipal());
}

void test_esquecer_todas_ainda_no_local_antigo_apaga_tudo()
{
    ListaDeRedes lista("", "");
    lista.DefinirPrincipal({"Rede-Do-Tenant-A", "Senha-ficticia", false}, true);
    lista.MarcarAprovado(); // o lacre operou depois de configurar a rede
    lista.Guardar(Rede("Extra-Do-Tenant-A"));
    lista.Esquecer(Esquecimento::Todas);
    TEST_ASSERT_FALSE(lista.TemPrincipal());
    TEST_ASSERT_FALSE(lista.TemAlgumaRede());
}

void test_esquecer_todas_no_local_novo_mantem_a_rede_configurada_depois_da_ultima_aprovacao()
{
    ListaDeRedes lista("", "");
    lista.DefinirPrincipal({"Rede-Do-Tenant-A", "Senha-ficticia", false}, true);
    lista.MarcarAprovado();
    lista.Guardar(Rede("Extra-Do-Tenant-A"));
    // Chegou desligado ao novo local: a pessoa configurou a rede pelo botao BOOT.
    lista.DefinirPrincipal({"Rede-Do-Tenant-B", "Senha-ficticia", false}, true);
    lista.Esquecer(Esquecimento::Todas);
    TEST_ASSERT_TRUE(lista.TemPrincipal());
    TEST_ASSERT_EQUAL_STRING("Rede-Do-Tenant-B", lista.Principal().ssid.c_str());
    TEST_ASSERT_EQUAL(0, lista.Nomes().size());
}

void test_a_principal_sobrevive_ao_reinicio_com_a_marca_do_portal()
{
    ListaDeRedes lista("", "");
    lista.DefinirPrincipal({"Rede-Do-Portal", "Senha-ficticia", false}, true);
    ListaDeRedes depois("", "");
    TEST_ASSERT_TRUE(depois.RestaurarPrincipal(lista.SerializarPrincipal()));
    TEST_ASSERT_EQUAL_STRING("Rede-Do-Portal", depois.Principal().ssid.c_str());
    TEST_ASSERT_TRUE(depois.PrincipalDoPortalDesdeAAprovacao());
    TEST_ASSERT_FALSE(depois.RestaurarPrincipal("lixo"));
}

// Rede padrao da plataforma (Spec 013, RF-023): a rede FluxID, de fabrica, serve so enquanto ninguem escolheu rede no portal. Nao e
// de tenant nenhum: o esquecimento nunca a apaga e ela nunca vai para a memoria do lacre.
void test_sem_rede_do_portal_usa_a_rede_padrao_da_plataforma()
{
    ListaDeRedes lista("", "");
    lista.DefinirRedeDeFabrica("FluxID", "Senha-ficticia");
    TEST_ASSERT_FALSE(lista.TemPrincipal());
    TEST_ASSERT_FALSE(lista.TemAlgumaRede()); // o portal continua abrindo sozinho
    TEST_ASSERT_TRUE(lista.TemRedeParaTentar());
    const EscolhaDeRede escolha = lista.Escolher({{"Vizinho", -40}});
    TEST_ASSERT_TRUE(escolha.padrao);
    TEST_ASSERT_EQUAL_STRING("FluxID", escolha.ssid.c_str());
    TEST_ASSERT_EQUAL_STRING("Senha-ficticia", escolha.senha.c_str());
}

void test_a_rede_do_portal_vence_a_rede_padrao_da_plataforma()
{
    ListaDeRedes lista("", "");
    lista.DefinirRedeDeFabrica("FluxID", "Senha-ficticia");
    lista.DefinirPrincipal({"Rede-Do-Local", "Senha-ficticia", false}, true);
    TEST_ASSERT_EQUAL_STRING("Rede-Do-Local", lista.Escolher({}).ssid.c_str());
    TEST_ASSERT_EQUAL_STRING("Rede-Do-Local", lista.Padrao().ssid.c_str());
}

void test_a_rede_padrao_da_plataforma_nunca_e_esquecida_nem_guardada()
{
    ListaDeRedes lista("", "");
    lista.DefinirRedeDeFabrica("FluxID", "Senha-ficticia");
    lista.DefinirPrincipal({"Rede-Do-Tenant-A", "Senha-ficticia", false}, true);
    lista.MarcarAprovado();
    lista.Guardar(Rede("Extra-Do-Tenant-A"));
    lista.Esquecer(Esquecimento::Todas);
    TEST_ASSERT_FALSE(lista.TemPrincipal());
    TEST_ASSERT_EQUAL_STRING("FluxID", lista.Escolher({}).ssid.c_str());
    TEST_ASSERT_TRUE(lista.SerializarPrincipal().find("FluxID") == std::string::npos);
    TEST_ASSERT_TRUE(lista.Serializar().find("FluxID") == std::string::npos);
}

int main()
{
    UNITY_BEGIN();
    RUN_TEST(test_escolhe_a_conhecida_de_sinal_mais_forte);
    RUN_TEST(test_sem_nenhuma_da_lista_ao_alcance_usa_a_padrao);
    RUN_TEST(test_lista_de_ate_5_e_mesma_rede_troca_a_senha);
    RUN_TEST(test_remover_e_voltar_a_padrao_nunca_apagam_a_padrao);
    RUN_TEST(test_rede_nova_so_e_guardada_depois_de_alcancar_o_fluxid);
    RUN_TEST(test_falha_volta_para_a_rede_anterior_com_o_motivo);
    RUN_TEST(test_rede_nova_com_a_lista_cheia_nao_entra);
    RUN_TEST(test_lista_sobrevive_ao_reinicio);
    RUN_TEST(test_sem_rede_no_firmware_comeca_sem_rede_salva);
    RUN_TEST(test_rede_do_portal_vira_a_principal_e_soma_com_as_extras);
    RUN_TEST(test_esquecer_as_extras_mantem_a_principal);
    RUN_TEST(test_esquecer_todas_ainda_no_local_antigo_apaga_tudo);
    RUN_TEST(test_esquecer_todas_no_local_novo_mantem_a_rede_configurada_depois_da_ultima_aprovacao);
    RUN_TEST(test_a_principal_sobrevive_ao_reinicio_com_a_marca_do_portal);
    RUN_TEST(test_sem_rede_do_portal_usa_a_rede_padrao_da_plataforma);
    RUN_TEST(test_a_rede_do_portal_vence_a_rede_padrao_da_plataforma);
    RUN_TEST(test_a_rede_padrao_da_plataforma_nunca_e_esquecida_nem_guardada);
    return UNITY_END();
}
