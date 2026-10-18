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
    return UNITY_END();
}
