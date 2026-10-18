// Spec 012 (T110; RN-010): lock e unlock acionam o pulso e so entao confirmam executed; falha do acionador confirma error
// com actuator; sem estado gravado, a valvula comeca aberta sem acionar; depois do reinicio, restaura o ultimo estado
// confirmado e o informa na ativacao.

#include <unity.h>
#include <vector>

#include "nucleo/Trava.h"

using namespace fluxid;

namespace
{
    class AcionadorFalso : public Acionador
    {
    public:
        std::vector<bool> pulsos;
        bool falhar = false;
        bool Pulsar(bool fechar) override
        {
            pulsos.push_back(fechar);
            return !falhar;
        }
    };

    class MemoriaFalsa : public MemoriaDaTrava
    {
    public:
        bool temEstado = false;
        bool fechada = false;
        int gravacoes = 0;
        bool Ler(bool& valor) override
        {
            if (!temEstado)
                return false;
            valor = fechada;
            return true;
        }
        bool Gravar(bool valor) override
        {
            temEstado = true;
            fechada = valor;
            gravacoes++;
            return true;
        }
    };
}

void test_primeiro_uso_valvula_aberta_sem_acionar()
{
    AcionadorFalso acionador;
    MemoriaFalsa memoria;
    Trava trava(acionador, memoria);
    TEST_ASSERT_TRUE(trava.Iniciar());
    TEST_ASSERT_FALSE(trava.Fechada());
    TEST_ASSERT_EQUAL(0, acionador.pulsos.size());
}

void test_travar_aciona_e_so_entao_confirma()
{
    AcionadorFalso acionador;
    MemoriaFalsa memoria;
    Trava trava(acionador, memoria);
    trava.Iniciar();
    DesfechoDoComando desfecho = trava.Executar(true);
    TEST_ASSERT_TRUE(desfecho.executado);
    TEST_ASSERT_EQUAL(1, acionador.pulsos.size());
    TEST_ASSERT_TRUE(acionador.pulsos[0]);
    TEST_ASSERT_TRUE(trava.Fechada());
    TEST_ASSERT_TRUE(memoria.fechada);

    desfecho = trava.Executar(false);
    TEST_ASSERT_TRUE(desfecho.executado);
    TEST_ASSERT_FALSE(acionador.pulsos[1]);
    TEST_ASSERT_FALSE(trava.Fechada());
    TEST_ASSERT_FALSE(memoria.fechada);
}

void test_falha_do_acionador_confirma_erro_e_mantem_o_estado()
{
    AcionadorFalso acionador;
    MemoriaFalsa memoria;
    Trava trava(acionador, memoria);
    trava.Iniciar();
    acionador.falhar = true;
    DesfechoDoComando desfecho = trava.Executar(true);
    TEST_ASSERT_FALSE(desfecho.executado);
    TEST_ASSERT_EQUAL_STRING("actuator", desfecho.motivo.c_str());
    TEST_ASSERT_FALSE(trava.Fechada());
    TEST_ASSERT_EQUAL(0, memoria.gravacoes);
}

void test_depois_do_reinicio_restaura_o_ultimo_estado_confirmado()
{
    AcionadorFalso acionador;
    MemoriaFalsa memoria;
    memoria.temEstado = true;
    memoria.fechada = true;
    Trava trava(acionador, memoria);
    TEST_ASSERT_TRUE(trava.Iniciar());
    TEST_ASSERT_TRUE(trava.Fechada());
    TEST_ASSERT_EQUAL(1, acionador.pulsos.size());
    TEST_ASSERT_TRUE(acionador.pulsos[0]);
}

void test_falha_ao_restaurar_informa_o_estado_gravado()
{
    AcionadorFalso acionador;
    acionador.falhar = true;
    MemoriaFalsa memoria;
    memoria.temEstado = true;
    memoria.fechada = true;
    Trava trava(acionador, memoria);
    TEST_ASSERT_FALSE(trava.Iniciar());
    TEST_ASSERT_TRUE(trava.Fechada());
}

void test_comando_repetido_nao_e_executado_duas_vezes()
{
    RegistroDeComandos registro;
    TEST_ASSERT_FALSE(registro.JaExecutado("c1"));
    registro.Lembrar("c1");
    TEST_ASSERT_TRUE(registro.JaExecutado("c1"));
    for (int i = 0; i < 8; i++)
        registro.Lembrar("outro-" + std::to_string(i));
    TEST_ASSERT_FALSE(registro.JaExecutado("c1"));
    TEST_ASSERT_FALSE(registro.JaExecutado(""));
}

int main()
{
    UNITY_BEGIN();
    RUN_TEST(test_primeiro_uso_valvula_aberta_sem_acionar);
    RUN_TEST(test_travar_aciona_e_so_entao_confirma);
    RUN_TEST(test_falha_do_acionador_confirma_erro_e_mantem_o_estado);
    RUN_TEST(test_depois_do_reinicio_restaura_o_ultimo_estado_confirmado);
    RUN_TEST(test_falha_ao_restaurar_informa_o_estado_gravado);
    RUN_TEST(test_comando_repetido_nao_e_executado_duas_vezes);
    return UNITY_END();
}
