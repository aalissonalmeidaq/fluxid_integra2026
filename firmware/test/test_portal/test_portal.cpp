// Spec 013 (T048; RF-001 a RF-006, RN-004; contracts/portal-do-lacre.md): o nucleo do portal de configuracao. Valida o nome e a senha
// da rede como o dominio da Spec 012, escapa nomes de rede maliciosos, monta a lista e a situacao em JSON, permite um teste por vez e
// decide quando a rede de configuracao fica aberta. Roda no computador; o servidor web e o softAP ficam em src/PortalWiFi.

#include <ArduinoJson.h>
#include <unity.h>

#include "nucleo/Portal.h"

using namespace fluxid;

namespace
{
    const uint32_t MIN = 60UL * 1000UL;

    JsonDocument Json(const std::string& texto)
    {
        JsonDocument documento;
        TEST_ASSERT_FALSE_MESSAGE(deserializeJson(documento, texto), texto.c_str());
        return documento;
    }
}

void test_nome_da_rede_de_configuracao()
{
    TEST_ASSERT_EQUAL_STRING("FluxID-Lacre-M9XT", NomeDaRedeDeConfiguracao("DSP-7KQ2M9XT").c_str());
}

void test_nome_de_1_a_32_bytes_com_acentos_contando_em_bytes()
{
    TEST_ASSERT_FALSE(NomeDeRedeValido(""));
    TEST_ASSERT_TRUE(NomeDeRedeValido("R"));
    TEST_ASSERT_TRUE(NomeDeRedeValido(std::string(32, 'x')));
    TEST_ASSERT_FALSE(NomeDeRedeValido(std::string(33, 'x')));
    std::string acentos;
    for (int i = 0; i < 16; i++)
        acentos += "\xC3\xA9"; // "é" tem 2 bytes
    TEST_ASSERT_TRUE(NomeDeRedeValido(acentos));
    TEST_ASSERT_FALSE(NomeDeRedeValido(acentos + "x"));
}

void test_senha_de_8_a_63_ou_rede_aberta()
{
    TEST_ASSERT_FALSE(SenhaDeRedeValida("1234567", false));
    TEST_ASSERT_TRUE(SenhaDeRedeValida("12345678", false));
    TEST_ASSERT_TRUE(SenhaDeRedeValida(std::string(63, 'x'), false));
    TEST_ASSERT_FALSE(SenhaDeRedeValida(std::string(64, 'x'), false));
    TEST_ASSERT_TRUE(SenhaDeRedeValida("", true));
}

void test_escape_de_html_de_nomes_maliciosos()
{
    TEST_ASSERT_EQUAL_STRING("&lt;script&gt;alert(1)&lt;/script&gt;", EscaparHtml("<script>alert(1)</script>").c_str());
    TEST_ASSERT_EQUAL_STRING("a&amp;b &quot;c&quot; &#39;d&#39;", EscaparHtml("a&b \"c\" 'd'").c_str());
}

void test_sinal_em_texto()
{
    TEST_ASSERT_EQUAL_STRING("forte", SinalEmTexto(-40));
    TEST_ASSERT_EQUAL_STRING("forte", SinalEmTexto(-60));
    TEST_ASSERT_EQUAL_STRING("m\xC3\xA9" "dio", SinalEmTexto(-61));
    TEST_ASSERT_EQUAL_STRING("m\xC3\xA9" "dio", SinalEmTexto(-75));
    TEST_ASSERT_EQUAL_STRING("fraco", SinalEmTexto(-76));
}

void test_lista_de_redes_ordenada_pelo_sinal_sem_repetidos_e_em_json_valido()
{
    const std::string json = RedesJson("DSP-7KQ2M9XT", {
        {"Deposito", -70, false}, {"Vizinho \"aspas\" \\ <b>", -50, true}, {"Deposito", -55, false}, {"", -40, true}, {"Fraca", -90, false}});
    JsonDocument documento = Json(json);
    TEST_ASSERT_EQUAL_STRING("DSP-7KQ2M9XT", documento["codigo"]);
    JsonArrayConst redes = documento["redes"];
    TEST_ASSERT_EQUAL(3, redes.size());
    TEST_ASSERT_EQUAL_STRING("Vizinho \"aspas\" \\ <b>", redes[0]["ssid"]);
    TEST_ASSERT_TRUE(redes[0]["aberta"]);
    TEST_ASSERT_EQUAL_STRING("forte", redes[0]["sinal"]);
    TEST_ASSERT_EQUAL_STRING("Deposito", redes[1]["ssid"]);
    TEST_ASSERT_EQUAL(-55, redes[1]["rssi"]);
    TEST_ASSERT_EQUAL_STRING("fraco", redes[2]["sinal"]);
}

void test_um_teste_por_vez_e_a_situacao_com_o_motivo()
{
    TesteDoPortal teste;
    TEST_ASSERT_EQUAL_STRING("ocioso", Json(teste.SituacaoJson(AprovacaoNoPortal::Nenhuma, {}))["situacao"]);
    TEST_ASSERT_TRUE(teste.Iniciar());
    TEST_ASSERT_FALSE(teste.Iniciar());
    TEST_ASSERT_EQUAL_STRING("testando", Json(teste.SituacaoJson(AprovacaoNoPortal::Nenhuma, {}))["situacao"]);
    teste.Concluir(false, "wifi_auth");
    JsonDocument falhou = Json(teste.SituacaoJson(AprovacaoNoPortal::Nenhuma, {}));
    TEST_ASSERT_EQUAL_STRING("falhou", falhou["situacao"]);
    TEST_ASSERT_EQUAL_STRING("wifi_auth", falhou["motivo"]);
    TEST_ASSERT_TRUE(falhou["aprovacao"].isNull());
    TEST_ASSERT_TRUE(teste.Iniciar());
    teste.Concluir(true, "");
    JsonDocument conectado = Json(teste.SituacaoJson(AprovacaoNoPortal::Pendente, {}));
    TEST_ASSERT_EQUAL_STRING("conectado", conectado["situacao"]);
    TEST_ASSERT_TRUE(conectado["motivo"].isNull());
    TEST_ASSERT_EQUAL_STRING("pendente", conectado["aprovacao"]);
    TEST_ASSERT_EQUAL_STRING("aprovado", Json(teste.SituacaoJson(AprovacaoNoPortal::Aprovado, {}))["aprovacao"]);
}

// Spec 013 (RF-024): ao entrar na rede de configuracao, a pagina mostra se o lacre ja esta conectado, por qual rede e se chega ao FluxID.
void test_situacao_traz_a_conexao_atual_do_lacre()
{
    TesteDoPortal teste;
    JsonDocument semRede = Json(teste.SituacaoJson(AprovacaoNoPortal::Nenhuma, {"", false}));
    TEST_ASSERT_TRUE(semRede["conexao"]["rede"].isNull());
    TEST_ASSERT_FALSE(semRede["conexao"]["fluxid"].as<bool>());
    TEST_ASSERT_TRUE(semRede["conexao"]["aprovacao"].isNull());

    JsonDocument semFluxID = Json(teste.SituacaoJson(AprovacaoNoPortal::Pendente, {"FluxID", false}));
    TEST_ASSERT_EQUAL_STRING("FluxID", semFluxID["conexao"]["rede"]);
    TEST_ASSERT_FALSE(semFluxID["conexao"]["fluxid"].as<bool>());
    TEST_ASSERT_TRUE(semFluxID["conexao"]["aprovacao"].isNull());

    JsonDocument aguardando = Json(teste.SituacaoJson(AprovacaoNoPortal::Pendente, {"FluxID", true}));
    TEST_ASSERT_EQUAL_STRING("ocioso", aguardando["situacao"]);
    TEST_ASSERT_TRUE(aguardando["conexao"]["fluxid"].as<bool>());
    TEST_ASSERT_EQUAL_STRING("pendente", aguardando["conexao"]["aprovacao"]);
    TEST_ASSERT_EQUAL_STRING("aprovado", Json(teste.SituacaoJson(AprovacaoNoPortal::Aprovado, {"FluxID", true}))["conexao"]["aprovacao"]);

    // Um nome de rede com aspas e barra sai como texto JSON valido.
    TEST_ASSERT_EQUAL_STRING("Rede \"x\" \ y", Json(teste.SituacaoJson(AprovacaoNoPortal::Nenhuma, {"Rede \"x\" \ y", false}))["conexao"]["rede"]);
}

void test_motivos_de_falha_conhecidos()
{
    for (const char* motivo : {"wifi_auth", "wifi_not_found", "wifi_no_internet"})
        TEST_ASSERT_TRUE(MotivoDoPortalValido(motivo));
    TEST_ASSERT_FALSE(MotivoDoPortalValido("senha=123"));
}

void test_sem_rede_salva_abre_15_min_fecha_5_e_reabre()
{
    JanelaDoPortal janela;
    TEST_ASSERT_TRUE(janela.Atualizar(0, false, false));
    TEST_ASSERT_TRUE(janela.Atualizar(15 * MIN - 1, false, false));
    TEST_ASSERT_FALSE(janela.Atualizar(15 * MIN, false, false));
    TEST_ASSERT_FALSE(janela.Atualizar(20 * MIN - 1, false, false));
    TEST_ASSERT_TRUE(janela.Atualizar(20 * MIN, false, false));
}

void test_com_alguem_conectado_a_rede_de_configuracao_continua_aberta()
{
    JanelaDoPortal janela;
    janela.Atualizar(0, false, false);
    TEST_ASSERT_TRUE(janela.Atualizar(10 * MIN, false, true));
    TEST_ASSERT_TRUE(janela.Atualizar(24 * MIN, false, false));
    TEST_ASSERT_FALSE(janela.Atualizar(25 * MIN, false, false));
}

void test_com_rede_salva_nunca_abre_sozinha()
{
    JanelaDoPortal janela;
    TEST_ASSERT_FALSE(janela.Atualizar(0, true, false));
    TEST_ASSERT_FALSE(janela.Atualizar(60 * MIN, true, false));
    TEST_ASSERT_FALSE(AbreSozinho(true));
    TEST_ASSERT_TRUE(AbreSozinho(false));
}

void test_botao_segurado_5_s_abre_mesmo_com_rede_salva()
{
    BotaoDoPortal botao;
    TEST_ASSERT_FALSE(botao.Atualizar(0, true));
    TEST_ASSERT_FALSE(botao.Atualizar(4999, true));
    TEST_ASSERT_TRUE(botao.Atualizar(5000, true));
    TEST_ASSERT_FALSE(botao.Atualizar(6000, true)); // uma vez por pressionamento
    TEST_ASSERT_FALSE(botao.Atualizar(6100, false));
    TEST_ASSERT_FALSE(botao.Atualizar(7000, true));
    TEST_ASSERT_FALSE(botao.Atualizar(9000, false)); // soltou antes dos 5 s

    JanelaDoPortal janela;
    janela.PedirAbertura(0);
    TEST_ASSERT_TRUE(janela.Atualizar(0, true, false));
    TEST_ASSERT_FALSE(janela.Atualizar(15 * MIN, true, false));
}

void test_depois_do_sucesso_continua_aberto_enquanto_houver_cliente()
{
    JanelaDoPortal janela;
    janela.Atualizar(0, false, true);
    TEST_ASSERT_TRUE(janela.Atualizar(2 * MIN, true, true));
    TEST_ASSERT_TRUE(janela.Atualizar(30 * MIN, true, true));
    TEST_ASSERT_TRUE(janela.Atualizar(44 * MIN, true, false));
    TEST_ASSERT_FALSE(janela.Atualizar(45 * MIN, true, false));
}

int main()
{
    UNITY_BEGIN();
    RUN_TEST(test_nome_da_rede_de_configuracao);
    RUN_TEST(test_nome_de_1_a_32_bytes_com_acentos_contando_em_bytes);
    RUN_TEST(test_senha_de_8_a_63_ou_rede_aberta);
    RUN_TEST(test_escape_de_html_de_nomes_maliciosos);
    RUN_TEST(test_sinal_em_texto);
    RUN_TEST(test_lista_de_redes_ordenada_pelo_sinal_sem_repetidos_e_em_json_valido);
    RUN_TEST(test_um_teste_por_vez_e_a_situacao_com_o_motivo);
    RUN_TEST(test_motivos_de_falha_conhecidos);
    RUN_TEST(test_situacao_traz_a_conexao_atual_do_lacre);
    RUN_TEST(test_sem_rede_salva_abre_15_min_fecha_5_e_reabre);
    RUN_TEST(test_com_alguem_conectado_a_rede_de_configuracao_continua_aberta);
    RUN_TEST(test_com_rede_salva_nunca_abre_sozinha);
    RUN_TEST(test_botao_segurado_5_s_abre_mesmo_com_rede_salva);
    RUN_TEST(test_depois_do_sucesso_continua_aberto_enquanto_houver_cliente);
    return UNITY_END();
}
