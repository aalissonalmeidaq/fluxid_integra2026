// Spec 012 (T106; CA-011): o firmware monta cada pedido e le cada resposta exatamente como os exemplos canonicos de
// tests/fixtures/seal-protocol/, os mesmos usados pela borda (seal-gateway) e pelo simulador.

#include <ArduinoJson.h>
#include <fstream>
#include <sstream>
#include <string.h>
#include <unity.h>

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

    // Compara o JSON montado com o exemplo, campo a campo (ordem das chaves nao importa).
    void ConferirIgual(const char* nome, const std::string& montado)
    {
        JsonDocument esperado;
        JsonDocument obtido;
        TEST_ASSERT_FALSE(deserializeJson(esperado, LerExemplo(nome)));
        TEST_ASSERT_FALSE_MESSAGE(deserializeJson(obtido, montado), montado.c_str());
        if (esperado.as<JsonVariantConst>() != obtido.as<JsonVariantConst>())
        {
            std::string texto;
            serializeJson(obtido, texto);
            TEST_FAIL_MESSAGE((std::string(nome) + " difere do montado: " + texto).c_str());
        }
    }

    Leitura LeituraPadrao()
    {
        Leitura leitura;
        leitura.ponto = {-7.209194, -39.306367};
        leitura.comGps = true;
        leitura.precisaoM = 6.5;
        leitura.bateriaPct = 87;
        leitura.sinalDbm = -61;
        leitura.estadoLacre = "closed";
        leitura.temRede = false;
        return leitura;
    }

    std::string Pedido(uint32_t versao, const std::string& mensagem)
    {
        return MontarPedido("2.0.0", versao, {mensagem});
    }
}

void test_posicao_com_gps_e_rede()
{
    Leitura leitura = LeituraPadrao();
    leitura.temRede = true;
    leitura.rede = {"Rede-Ficticia-02", false, -61};
    ConferirIgual("pedido-position.json", Pedido(0, MensagemPosicao("01JA0000000000000000000001", "2026-10-17T14:03:00Z", leitura)));
}

void test_posicao_sem_gps_vai_como_ultima_conhecida_sem_precisao()
{
    Leitura leitura = LeituraPadrao();
    leitura.comGps = false;
    leitura.precisaoM = -1;
    ConferirIgual("pedido-position-sem-gps.json", Pedido(0, MensagemPosicao("01JA0000000000000000000002", "2026-10-17T14:04:00Z", leitura)));
}

void test_bateria_sem_medicao_vai_null()
{
    Leitura leitura = LeituraPadrao();
    leitura.bateriaPct = -1;
    JsonDocument mensagem;
    TEST_ASSERT_FALSE(deserializeJson(mensagem, MensagemPosicao("id-1", "2026-10-17T14:03:00Z", leitura)));
    // Presente e nulo (o contrato exige o campo), nunca um valor inventado.
    TEST_ASSERT_TRUE(mensagem["battery_pct"].isNull());
    TEST_ASSERT_NOT_NULL(strstr(MensagemPosicao("id-1", "2026-10-17T14:03:00Z", leitura).c_str(), "\"battery_pct\":null"));
}

void test_posicao_informa_redes_visiveis_sem_senhas()
{
    Leitura leitura = LeituraPadrao();
    leitura.redesVisiveis = {{"Rede-Cliente", -48}, {"Rede-Deposito", -67}};
    JsonDocument mensagem;
    TEST_ASSERT_FALSE(deserializeJson(mensagem, MensagemPosicao("id-redes", "2026-10-17T14:03:00Z", leitura)));
    JsonArrayConst redes = mensagem["available_networks"];
    TEST_ASSERT_EQUAL(2, redes.size());
    TEST_ASSERT_EQUAL_STRING("Rede-Cliente", redes[0]["ssid"]);
    TEST_ASSERT_EQUAL(-48, redes[0]["rssi"]);
    TEST_ASSERT_TRUE(mensagem["password"].isNull());
}

void test_lote_de_varias_mensagens()
{
    std::vector<std::string> mensagens;
    for (int i = 1; i <= 5; i++)
    {
        char id[32];
        char hora[32];
        snprintf(id, sizeof(id), "01JB000000000000000000000%d", i);
        snprintf(hora, sizeof(hora), "2026-10-17T13:0%d:00Z", i);
        mensagens.push_back(MensagemPosicao(id, hora, LeituraPadrao()));
    }
    ConferirIgual("pedido-lote.json", MontarPedido("2.0.0", 0, mensagens));
}

void test_ativacao_informa_a_valvula()
{
    ConferirIgual("pedido-activation.json", Pedido(0, MensagemAtivacao("01JA0000000000000000000007", "2026-10-17T14:00:00Z", LeituraPadrao(), false)));
}

void test_desligamento()
{
    ConferirIgual("pedido-shutdown.json", Pedido(0, MensagemDesligamento("01JA0000000000000000000008", "2026-10-17T18:00:00Z", LeituraPadrao())));
}

void test_evento_alerta_e_resultados()
{
    ConferirIgual("pedido-event.json", Pedido(0, MensagemEvento("01JA0000000000000000000003", "2026-10-17T14:05:00Z", "wifi_fallback_default", "lista sem rede ao alcance")));
    ConferirIgual("pedido-alert.json", Pedido(0, MensagemAlerta("01JA0000000000000000000004", "2026-10-17T14:06:00Z", "low_battery", true, 14)));
    ConferirIgual("pedido-command-result.json",
        Pedido(0, MensagemResultado("01JA0000000000000000000005", "2026-10-17T14:07:00Z", "6c1f0000-0000-4000-8000-000000000001", true)));
    ConferirIgual("pedido-command-result-erro.json",
        Pedido(0, MensagemResultado("01JA0000000000000000000006", "2026-10-17T14:08:00Z", "6c1f0000-0000-4000-8000-000000000002", false, "wifi_auth")));
}

void test_troca_de_rede_e_trava_automatica()
{
    ConferirIgual("pedido-network-change.json", Pedido(0, MensagemTrocaDeRede("01JA0000000000000000000009", "2026-10-17T14:09:00Z",
        {"Rede-Padrao-Ficticia", true, -70}, {"Rede-Ficticia-01", "Rede-Ficticia-02"})));
    Leitura leitura = LeituraPadrao();
    leitura.ponto = {-7.215, -39.31};
    ConferirIgual("pedido-auto-lock.json",
        Pedido(4, MensagemTravaAutomatica("01JA0000000000000000000010", "2026-10-17T15:00:00Z", "2026-10-17T14:58:00Z", leitura)));
}

void test_resposta_sem_comando()
{
    Resposta resposta;
    TEST_ASSERT_TRUE(LerResposta(LerExemplo("resposta-200-sem-comando.json"), resposta));
    TEST_ASSERT_EQUAL_STRING("2026-10-17T14:03:01Z", resposta.horaServidor.c_str());
    TEST_ASSERT_EQUAL(1, resposta.resultados.size());
    TEST_ASSERT_TRUE(resposta.resultados[0].situacao == Situacao::Gravada);
    TEST_ASSERT_TRUE(resposta.comando.tipo == TipoComando::Nenhum);
    TEST_ASSERT_FALSE(resposta.vigilancia.ativa);
    TEST_ASSERT_EQUAL(60, resposta.intervaloS);
}

void test_resposta_repetida_e_recusada()
{
    Resposta repetida;
    TEST_ASSERT_TRUE(LerResposta(LerExemplo("resposta-200-repetida.json"), repetida));
    TEST_ASSERT_TRUE(repetida.resultados[0].situacao == Situacao::Repetida);
    Resposta recusada;
    TEST_ASSERT_TRUE(LerResposta(LerExemplo("resposta-200-recusada.json"), recusada));
    TEST_ASSERT_TRUE(recusada.resultados[0].situacao == Situacao::Recusada);
    TEST_ASSERT_EQUAL_STRING("unknown_command", recusada.resultados[0].motivo.c_str());
}

void test_resposta_com_comando_de_trava()
{
    Resposta resposta;
    TEST_ASSERT_TRUE(LerResposta(LerExemplo("resposta-200-trava.json"), resposta));
    TEST_ASSERT_TRUE(resposta.comando.tipo == TipoComando::Travar);
    TEST_ASSERT_FALSE(resposta.comando.id.empty());
}

void test_resposta_com_comandos_de_rede()
{
    Resposta adicionar;
    TEST_ASSERT_TRUE(LerResposta(LerExemplo("resposta-200-wifi-add.json"), adicionar));
    TEST_ASSERT_TRUE(adicionar.comando.tipo == TipoComando::AdicionarRede);
    TEST_ASSERT_EQUAL_STRING("Rede-Ficticia-03", adicionar.comando.ssid.c_str());
    TEST_ASSERT_FALSE(adicionar.comando.aberta);
    TEST_ASSERT_EQUAL_STRING("senha-ficticia-123", adicionar.comando.senha.c_str());

    Resposta remover;
    TEST_ASSERT_TRUE(LerResposta(LerExemplo("resposta-200-wifi-remove.json"), remover));
    TEST_ASSERT_TRUE(remover.comando.tipo == TipoComando::RemoverRede);
    TEST_ASSERT_FALSE(remover.comando.ssid.empty());
    TEST_ASSERT_TRUE(remover.comando.senha.empty());

    Resposta resetar;
    TEST_ASSERT_TRUE(LerResposta(LerExemplo("resposta-200-wifi-reset.json"), resetar));
    TEST_ASSERT_TRUE(resetar.comando.tipo == TipoComando::ResetarRedes);
}

void test_resposta_com_vigilancia_e_cercas()
{
    Resposta resposta;
    TEST_ASSERT_TRUE(LerResposta(LerExemplo("resposta-200-vigilancia.json"), resposta));
    TEST_ASSERT_TRUE(resposta.vigilancia.ativa);
    TEST_ASSERT_EQUAL(4, resposta.vigilancia.versao);
    TEST_ASSERT_TRUE(resposta.vigilancia.temCercas);
    TEST_ASSERT_EQUAL(2, resposta.vigilancia.cercas.size());
    TEST_ASSERT_TRUE(resposta.vigilancia.cercas[0].circulo);
    TEST_ASSERT_EQUAL_DOUBLE(120, resposta.vigilancia.cercas[0].raioM);
    TEST_ASSERT_FALSE(resposta.vigilancia.cercas[1].circulo);
    TEST_ASSERT_EQUAL(3, resposta.vigilancia.cercas[1].vertices.size());
    // O ArduinoJson le numeros curtos em precisao float (~1e-6 grau, cerca de 10 cm): irrelevante para a tolerancia de 50 m.
    TEST_ASSERT_DOUBLE_WITHIN(1e-5, -39.31, resposta.vigilancia.cercas[1].vertices[1].longitude);
}

void test_resposta_com_vigilancia_sem_cercas_mantem_as_guardadas()
{
    Resposta resposta;
    TEST_ASSERT_TRUE(LerResposta(LerExemplo("resposta-200-vigilancia-sem-cercas.json"), resposta));
    TEST_ASSERT_TRUE(resposta.vigilancia.ativa);
    TEST_ASSERT_FALSE(resposta.vigilancia.temCercas);
}

void test_corpo_fora_do_contrato_e_recusado()
{
    Resposta resposta;
    TEST_ASSERT_FALSE(LerResposta("nao e json", resposta));
    TEST_ASSERT_FALSE(LerResposta(LerExemplo("erro-401.json"), resposta));
    TEST_ASSERT_FALSE(LerResposta("{\"results\": 3}", resposta));
}

void test_comando_desconhecido_nao_e_executado()
{
    Resposta resposta;
    TEST_ASSERT_TRUE(LerResposta("{\"results\":[],\"command\":{\"id\":\"c1\",\"kind\":\"explodir\"},\"watch\":{\"active\":false,\"version\":0},\"report_interval_s\":60}", resposta));
    TEST_ASSERT_TRUE(resposta.comando.tipo == TipoComando::Desconhecido);
    TEST_ASSERT_EQUAL_STRING("c1", resposta.comando.id.c_str());
}

void test_horario_iso_em_utc()
{
    TEST_ASSERT_EQUAL_STRING("2026-10-17T14:03:00Z", FormatarHorario(1792245780).c_str());
    TEST_ASSERT_EQUAL_STRING("1970-01-01T00:00:00Z", FormatarHorario(0).c_str());
    TEST_ASSERT_EQUAL_STRING("2024-02-29T23:59:59Z", FormatarHorario(1709251199).c_str());
}

void test_hora_do_gps_em_segundos()
{
    TEST_ASSERT_EQUAL_INT64(1792245780, SegundosDesde1970(2026, 10, 17, 14, 3, 0));
    TEST_ASSERT_EQUAL_STRING("2028-02-29T23:59:59Z", FormatarHorario(SegundosDesde1970(2028, 2, 29, 23, 59, 59)).c_str());
    TEST_ASSERT_EQUAL_STRING("2026-12-31T00:00:00Z", FormatarHorario(SegundosDesde1970(2026, 12, 31, 0, 0, 0)).c_str());
    // GPS sem hora ainda (TinyGPS devolve 2000-00-00) ou relogio zerado: nao acerta.
    TEST_ASSERT_EQUAL_INT64(-1, SegundosDesde1970(2000, 0, 0, 0, 0, 0));
    TEST_ASSERT_EQUAL_INT64(-1, SegundosDesde1970(2026, 13, 1, 0, 0, 0));
}

int main()
{
    UNITY_BEGIN();
    RUN_TEST(test_posicao_com_gps_e_rede);
    RUN_TEST(test_posicao_sem_gps_vai_como_ultima_conhecida_sem_precisao);
    RUN_TEST(test_bateria_sem_medicao_vai_null);
    RUN_TEST(test_posicao_informa_redes_visiveis_sem_senhas);
    RUN_TEST(test_lote_de_varias_mensagens);
    RUN_TEST(test_ativacao_informa_a_valvula);
    RUN_TEST(test_desligamento);
    RUN_TEST(test_evento_alerta_e_resultados);
    RUN_TEST(test_troca_de_rede_e_trava_automatica);
    RUN_TEST(test_resposta_sem_comando);
    RUN_TEST(test_resposta_repetida_e_recusada);
    RUN_TEST(test_resposta_com_comando_de_trava);
    RUN_TEST(test_resposta_com_comandos_de_rede);
    RUN_TEST(test_resposta_com_vigilancia_e_cercas);
    RUN_TEST(test_resposta_com_vigilancia_sem_cercas_mantem_as_guardadas);
    RUN_TEST(test_corpo_fora_do_contrato_e_recusado);
    RUN_TEST(test_comando_desconhecido_nao_e_executado);
    RUN_TEST(test_horario_iso_em_utc);
    RUN_TEST(test_hora_do_gps_em_segundos);
    return UNITY_END();
}
