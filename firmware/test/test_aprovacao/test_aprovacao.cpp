// Spec 013 (T049; RF-009, RN-006; contracts/pedido-de-aprovacao.md; research.md, itens 4 e 5): o lacre que aguarda aprovacao manda so
// boot, a rede em uso e, quando houver, networks_forgotten, sem leituras na fila; 202 mantem a espera, 403 passa a tentar de hora em
// hora, 200 liga a operacao. forget_networks pede o esquecimento das redes, confirmado na chamada seguinte ate o 202 deixar de pedir.
// Os exemplos enrollment-* de tests/fixtures/seal-protocol/ sao a referencia exata, os mesmos da borda e do simulador.

#include <ArduinoJson.h>
#include <fstream>
#include <sstream>
#include <unity.h>

#include "nucleo/Aprovacao.h"
#include "nucleo/Protocolo.h"

using namespace fluxid;

namespace
{
    std::string LerExemplo(const char* nome)
    {
        std::ifstream arquivo(std::string(FLUXID_EXEMPLOS) + "/" + nome);
        TEST_ASSERT_TRUE_MESSAGE(arquivo.good(), nome);
        std::stringstream conteudo;
        conteudo << arquivo.rdbuf();
        return conteudo.str();
    }

    void ConferirIgual(const char* nome, const std::string& montado)
    {
        JsonDocument esperado;
        JsonDocument obtido;
        TEST_ASSERT_FALSE(deserializeJson(esperado, LerExemplo(nome)));
        TEST_ASSERT_FALSE_MESSAGE(deserializeJson(obtido, montado), montado.c_str());
        if (esperado.as<JsonVariantConst>() != obtido.as<JsonVariantConst>())
            TEST_FAIL_MESSAGE((std::string(nome) + " difere do montado: " + montado).c_str());
    }

    int sequencia = 0;
    std::string ProximoId()
    {
        sequencia++;
        char texto[40];
        snprintf(texto, sizeof(texto), "01JB%022d", sequencia);
        return texto;
    }
}

void setUp() { sequencia = 0; }
void tearDown() {}

void test_enquanto_aguarda_manda_so_boot_e_a_rede_em_uso()
{
    Aprovacao aprovacao;
    TEST_ASSERT_TRUE(aprovacao.Modo() == ModoDoLacre::Aguardando);
    TEST_ASSERT_FALSE(aprovacao.PodeGuardarLeituras());
    const std::vector<std::string> mensagens = aprovacao.MensagensDeEspera(ProximoId, "2026-10-19T12:00:00Z",
        {"Rede-Deposito-Ficticia", true, -58}, {"Rede-Deposito-Ficticia"});
    ConferirIgual("enrollment-pending-request.json", MontarPedido("3.0.0", 0, mensagens));
}

void test_202_mantem_a_espera_no_intervalo_normal()
{
    Aprovacao aprovacao;
    aprovacao.AoResponder(202, LerExemplo("enrollment-pending-approval-202.json"));
    TEST_ASSERT_TRUE(aprovacao.Modo() == ModoDoLacre::Aguardando);
    TEST_ASSERT_EQUAL(60, aprovacao.EsperaS());
    TEST_ASSERT_FALSE(aprovacao.PodeGuardarLeituras());
    TEST_ASSERT_TRUE(aprovacao.EsquecimentoPedido() == Esquecimento::Nenhum);
}

void test_403_recusado_tenta_de_hora_em_hora()
{
    Aprovacao aprovacao;
    aprovacao.AoResponder(403, LerExemplo("enrollment-refused-403.json"));
    TEST_ASSERT_TRUE(aprovacao.Recusado());
    TEST_ASSERT_EQUAL(3600, aprovacao.EsperaS());
    TEST_ASSERT_FALSE(aprovacao.PodeGuardarLeituras());
}

void test_401_tenta_no_proximo_intervalo_e_marca_erro()
{
    Aprovacao aprovacao;
    aprovacao.AoResponder(401, LerExemplo("enrollment-conflict-401.json"));
    TEST_ASSERT_EQUAL(60, aprovacao.EsperaS());
    TEST_ASSERT_TRUE(aprovacao.ComErro());
}

void test_200_liga_a_operacao_e_so_entao_as_leituras_entram_na_fila()
{
    Aprovacao aprovacao;
    aprovacao.AoResponder(202, LerExemplo("enrollment-pending-approval-202.json"));
    aprovacao.AoResponder(200, LerExemplo("enrollment-approved-200.json"));
    TEST_ASSERT_TRUE(aprovacao.Modo() == ModoDoLacre::Operando);
    TEST_ASSERT_TRUE(aprovacao.PodeGuardarLeituras());
    TEST_ASSERT_FALSE(aprovacao.Recusado());
    TEST_ASSERT_TRUE(aprovacao.AcabouDeSerAprovado());
    TEST_ASSERT_FALSE(aprovacao.AcabouDeSerAprovado());
}

void test_devolvido_volta_a_aguardar_e_pede_esquecer_todas_as_redes()
{
    Aprovacao aprovacao;
    aprovacao.AoResponder(200, LerExemplo("enrollment-approved-200.json"));
    aprovacao.AoResponder(202, LerExemplo("enrollment-returned-202.json"));
    TEST_ASSERT_TRUE(aprovacao.Modo() == ModoDoLacre::Aguardando);
    TEST_ASSERT_FALSE(aprovacao.PodeGuardarLeituras());
    TEST_ASSERT_TRUE(aprovacao.EsquecimentoPedido() == Esquecimento::Todas);
}

void test_retirado_pede_esquecer_so_as_extras()
{
    Aprovacao aprovacao;
    aprovacao.AoResponder(202, LerExemplo("enrollment-withdrawn-202.json"));
    TEST_ASSERT_TRUE(aprovacao.EsquecimentoPedido() == Esquecimento::Extras);
}

void test_confirma_o_esquecimento_ate_o_202_deixar_de_pedir()
{
    Aprovacao aprovacao;
    aprovacao.AoResponder(202, LerExemplo("enrollment-returned-202.json"));
    aprovacao.EsquecimentoFeito(Esquecimento::Todas);
    TEST_ASSERT_TRUE(aprovacao.EsquecimentoPedido() == Esquecimento::Nenhum);
    sequencia = 2;
    const std::vector<std::string> mensagens = aprovacao.MensagensDeEspera(ProximoId, "2026-10-19T12:01:00Z",
        {"Rede-Nova-Ficticia", true, -64}, {"Rede-Nova-Ficticia"});
    ConferirIgual("enrollment-networks-forgotten.json", MontarPedido("3.0.0", 0, mensagens));
    // O FluxID ainda pede (a confirmacao nao chegou): repetir o esquecimento e seguro e a confirmacao segue pendente.
    aprovacao.AoResponder(202, LerExemplo("enrollment-returned-202.json"));
    TEST_ASSERT_TRUE(aprovacao.ConfirmacaoPendente() == Esquecimento::Todas);
    aprovacao.AoResponder(202, LerExemplo("enrollment-pending-approval-202.json"));
    TEST_ASSERT_TRUE(aprovacao.ConfirmacaoPendente() == Esquecimento::Nenhum);
    TEST_ASSERT_EQUAL(2, aprovacao.MensagensDeEspera(ProximoId, "2026-10-19T12:02:00Z", {"Rede-Nova-Ficticia", true, -64}, {}).size());
}

void test_a_confirmacao_pendente_sobrevive_ao_reinicio()
{
    Aprovacao aprovacao;
    aprovacao.AoResponder(202, LerExemplo("enrollment-returned-202.json"));
    aprovacao.EsquecimentoFeito(Esquecimento::Todas);
    Aprovacao depois;
    TEST_ASSERT_TRUE(depois.Restaurar(aprovacao.Serializar()));
    TEST_ASSERT_TRUE(depois.ConfirmacaoPendente() == Esquecimento::Todas);
    TEST_ASSERT_FALSE(depois.Restaurar("lixo"));
}

void test_lacre_da_spec_012_com_cadastro_manual_ja_comeca_operando()
{
    Aprovacao aprovacao(true);
    TEST_ASSERT_TRUE(aprovacao.Modo() == ModoDoLacre::Operando);
    TEST_ASSERT_TRUE(aprovacao.PodeGuardarLeituras());
}

int main()
{
    UNITY_BEGIN();
    RUN_TEST(test_enquanto_aguarda_manda_so_boot_e_a_rede_em_uso);
    RUN_TEST(test_202_mantem_a_espera_no_intervalo_normal);
    RUN_TEST(test_403_recusado_tenta_de_hora_em_hora);
    RUN_TEST(test_401_tenta_no_proximo_intervalo_e_marca_erro);
    RUN_TEST(test_200_liga_a_operacao_e_so_entao_as_leituras_entram_na_fila);
    RUN_TEST(test_devolvido_volta_a_aguardar_e_pede_esquecer_todas_as_redes);
    RUN_TEST(test_retirado_pede_esquecer_so_as_extras);
    RUN_TEST(test_confirma_o_esquecimento_ate_o_202_deixar_de_pedir);
    RUN_TEST(test_a_confirmacao_pendente_sobrevive_ao_reinicio);
    RUN_TEST(test_lacre_da_spec_012_com_cadastro_manual_ja_comeca_operando);
    return UNITY_END();
}
