// Spec 012 (T107): fila persistente com armazenamento simulado, lotes de ate 50, mesmos message_id no reenvio, saida so
// depois da decisao do FluxID, e 401, 429 e 503 mantendo a fila.

#include <map>
#include <unity.h>

#include "nucleo/Fila.h"

using namespace fluxid;

namespace
{
    // Armazenamento em memoria que sobrevive a "reinicios" (uma nova Fila sobre o mesmo objeto).
    class Memoria : public Armazenamento
    {
    public:
        std::map<uint32_t, std::string> arquivos;
        bool falharGravacao = false;

        bool Listar(std::vector<uint32_t>& sequencias) override
        {
            for (const auto& par : arquivos)
                sequencias.push_back(par.first);
            return true;
        }
        bool Ler(uint32_t sequencia, std::string& conteudo) override
        {
            auto achado = arquivos.find(sequencia);
            if (achado == arquivos.end())
                return false;
            conteudo = achado->second;
            return true;
        }
        bool Gravar(uint32_t sequencia, const std::string& conteudo) override
        {
            if (falharGravacao)
                return false;
            arquivos[sequencia] = conteudo;
            return true;
        }
        bool Remover(uint32_t sequencia) override
        {
            return arquivos.erase(sequencia) == 1;
        }
    };

    std::string Id(int i)
    {
        return "MSG-" + std::to_string(i);
    }

    std::string Mensagem(int i)
    {
        return "{\"message_id\":\"" + Id(i) + "\",\"type\":\"event\",\"read_at\":\"2026-10-17T14:00:00Z\",\"code\":\"boot\"}";
    }

    void Encher(Fila& fila, int quantas)
    {
        for (int i = 1; i <= quantas; i++)
            TEST_ASSERT_TRUE(fila.Adicionar(Id(i), Mensagem(i)));
    }
}

void test_lote_de_ate_50_com_as_mais_antigas_primeiro()
{
    Memoria memoria;
    Fila fila(memoria);
    TEST_ASSERT_TRUE(fila.Iniciar());
    Encher(fila, 120);
    auto lote = fila.ProximoLote();
    TEST_ASSERT_EQUAL(50, lote.size());
    TEST_ASSERT_EQUAL_STRING("MSG-1", lote.front().messageId.c_str());
    TEST_ASSERT_EQUAL_STRING("MSG-50", lote.back().messageId.c_str());
    TEST_ASSERT_EQUAL_STRING(Mensagem(1).c_str(), lote.front().mensagem.c_str());
}

void test_sem_resposta_o_reenvio_leva_os_mesmos_ids()
{
    Memoria memoria;
    Fila fila(memoria);
    fila.Iniciar();
    Encher(fila, 3);
    auto primeiro = fila.ProximoLote();
    TEST_ASSERT_TRUE(ClassificarResposta(-1) == AcaoDoEnvio::Manter);
    auto segundo = fila.ProximoLote();
    TEST_ASSERT_EQUAL(primeiro.size(), segundo.size());
    for (size_t i = 0; i < primeiro.size(); i++)
        TEST_ASSERT_EQUAL_STRING(primeiro[i].messageId.c_str(), segundo[i].messageId.c_str());
}

void test_gravada_repetida_e_recusada_saem_da_fila()
{
    Memoria memoria;
    Fila fila(memoria);
    fila.Iniciar();
    Encher(fila, 4);
    std::vector<Resultado> resultados = {
        {Id(1), Situacao::Gravada, ""},
        {Id(2), Situacao::Repetida, ""},
        {Id(3), Situacao::Recusada, "invalid_field"},
    };
    TEST_ASSERT_EQUAL(3, fila.AplicarResultados(resultados));
    TEST_ASSERT_EQUAL(1, fila.Tamanho());
    TEST_ASSERT_EQUAL(1, memoria.arquivos.size());
    TEST_ASSERT_EQUAL_STRING("MSG-4", fila.ProximoLote()[0].messageId.c_str());
}

void test_sem_resultado_para_a_mensagem_ela_fica()
{
    Memoria memoria;
    Fila fila(memoria);
    fila.Iniciar();
    Encher(fila, 2);
    TEST_ASSERT_EQUAL(0, fila.AplicarResultados({{"outra", Situacao::Gravada, ""}}));
    TEST_ASSERT_EQUAL(2, fila.Tamanho());
}

void test_401_429_e_503_mantem_e_400_descarta_o_lote()
{
    TEST_ASSERT_TRUE(ClassificarResposta(200) == AcaoDoEnvio::AplicarResultados);
    TEST_ASSERT_TRUE(ClassificarResposta(401) == AcaoDoEnvio::Manter);
    TEST_ASSERT_TRUE(ClassificarResposta(429) == AcaoDoEnvio::Manter);
    TEST_ASSERT_TRUE(ClassificarResposta(503) == AcaoDoEnvio::Manter);
    TEST_ASSERT_TRUE(ClassificarResposta(500) == AcaoDoEnvio::Manter);
    TEST_ASSERT_TRUE(ClassificarResposta(400) == AcaoDoEnvio::DescartarLote);

    Memoria memoria;
    Fila fila(memoria);
    fila.Iniciar();
    Encher(fila, 60);
    auto lote = fila.ProximoLote();
    fila.DescartarLote(lote);
    TEST_ASSERT_EQUAL(10, fila.Tamanho());
    TEST_ASSERT_EQUAL(50, fila.Descartadas());
}

void test_a_fila_sobrevive_ao_reinicio_e_continua_a_sequencia()
{
    Memoria memoria;
    {
        Fila fila(memoria);
        fila.Iniciar();
        Encher(fila, 3);
        fila.AplicarResultados({{Id(1), Situacao::Gravada, ""}});
    }
    Fila depois(memoria);
    TEST_ASSERT_TRUE(depois.Iniciar());
    TEST_ASSERT_EQUAL(2, depois.Tamanho());
    TEST_ASSERT_EQUAL_STRING("MSG-2", depois.ProximoLote()[0].messageId.c_str());
    TEST_ASSERT_TRUE(depois.Adicionar("MSG-nova", "{\"message_id\":\"MSG-nova\"}"));
    TEST_ASSERT_EQUAL_STRING("MSG-nova", depois.ProximoLote().back().messageId.c_str());
}

void test_cheia_a_mais_antiga_da_lugar()
{
    Memoria memoria;
    Fila fila(memoria, 5);
    fila.Iniciar();
    Encher(fila, 7);
    TEST_ASSERT_EQUAL(5, fila.Tamanho());
    TEST_ASSERT_EQUAL(2, fila.Descartadas());
    TEST_ASSERT_EQUAL_STRING("MSG-3", fila.ProximoLote()[0].messageId.c_str());
}

void test_falha_ao_gravar_nao_entra_na_fila()
{
    Memoria memoria;
    Fila fila(memoria);
    fila.Iniciar();
    memoria.falharGravacao = true;
    TEST_ASSERT_FALSE(fila.Adicionar(Id(1), Mensagem(1)));
    TEST_ASSERT_EQUAL(0, fila.Tamanho());
}

void test_espera_ate_o_proximo_envio()
{
    TEST_ASSERT_EQUAL(60000, EsperaAteProximoEnvioMs(200, 60, 0));
    TEST_ASSERT_EQUAL(60000, EsperaAteProximoEnvioMs(-1, 60, 0));
    TEST_ASSERT_EQUAL(60000, EsperaAteProximoEnvioMs(503, 60, 0));
    TEST_ASSERT_EQUAL(120000, EsperaAteProximoEnvioMs(429, 60, 120));
    TEST_ASSERT_EQUAL(60000, EsperaAteProximoEnvioMs(429, 60, 10));
    TEST_ASSERT_EQUAL(30000, EsperaAteProximoEnvioMs(200, 30, 0));
}

void test_retry_after()
{
    uint32_t segundos = 0;
    TEST_ASSERT_TRUE(InterpretarRetryAfter("42", segundos));
    TEST_ASSERT_EQUAL(42, segundos);
    TEST_ASSERT_TRUE(InterpretarRetryAfter("  7 ", segundos));
    TEST_ASSERT_EQUAL(7, segundos);
    TEST_ASSERT_FALSE(InterpretarRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT", segundos));
    TEST_ASSERT_FALSE(InterpretarRetryAfter(nullptr, segundos));
    TEST_ASSERT_TRUE(InterpretarRetryAfter("99999999999999", segundos));
    TEST_ASSERT_EQUAL(0xFFFFFFFFUL, segundos);
}

void test_ids_unicos_mesmo_depois_de_reiniciar()
{
    bool reservar = false;
    GeradorDeIds primeiro("DSP-7KQ2M9XT", 0);
    std::string a = primeiro.Proximo(reservar);
    TEST_ASSERT_TRUE(reservar);
    TEST_ASSERT_EQUAL_STRING("DSP-7KQ2M9XT-0000000001", a.c_str());
    TEST_ASSERT_EQUAL(GeradorDeIds::BLOCO, primeiro.Reservado());
    std::string b = primeiro.Proximo(reservar);
    TEST_ASSERT_FALSE(reservar);
    TEST_ASSERT_EQUAL_STRING("DSP-7KQ2M9XT-0000000002", b.c_str());

    // Reinicio: o gerador novo comeca depois do bloco reservado, sem repetir nenhum id ja usado.
    GeradorDeIds depois("DSP-7KQ2M9XT", primeiro.Reservado());
    std::string c = depois.Proximo(reservar);
    TEST_ASSERT_EQUAL_STRING("DSP-7KQ2M9XT-0000000101", c.c_str());
    TEST_ASSERT_TRUE(reservar);
    TEST_ASSERT_LESS_OR_EQUAL(64, c.size());
}

int main()
{
    UNITY_BEGIN();
    RUN_TEST(test_lote_de_ate_50_com_as_mais_antigas_primeiro);
    RUN_TEST(test_sem_resposta_o_reenvio_leva_os_mesmos_ids);
    RUN_TEST(test_gravada_repetida_e_recusada_saem_da_fila);
    RUN_TEST(test_sem_resultado_para_a_mensagem_ela_fica);
    RUN_TEST(test_401_429_e_503_mantem_e_400_descarta_o_lote);
    RUN_TEST(test_a_fila_sobrevive_ao_reinicio_e_continua_a_sequencia);
    RUN_TEST(test_cheia_a_mais_antiga_da_lugar);
    RUN_TEST(test_falha_ao_gravar_nao_entra_na_fila);
    RUN_TEST(test_espera_ate_o_proximo_envio);
    RUN_TEST(test_retry_after);
    RUN_TEST(test_ids_unicos_mesmo_depois_de_reiniciar);
    return UNITY_END();
}
