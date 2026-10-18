// Spec 012 (T109; RN-011, MS-011): ponto dentro e fora de circulo e poligono (haversine), borda conta como dentro, 50 m de
// tolerancia, duas posicoes seguidas, sem GPS nao conta, 3 envios sem resposta, trava so fora e rede caida dentro nao trava.

#include <unity.h>

#include "nucleo/Vigilancia.h"

using namespace fluxid;

namespace
{
    // Unidade do cliente: circulo de 100 m e um quadrado ao lado (~1,1 km de lado).
    const Ponto CENTRO = {-7.209194, -39.306367};

    Cerca Circulo()
    {
        Cerca cerca;
        cerca.circulo = true;
        cerca.centro = CENTRO;
        cerca.raioM = 100;
        return cerca;
    }

    Cerca Quadrado()
    {
        Cerca cerca;
        cerca.circulo = false;
        cerca.raioM = 0;
        cerca.centro = {0, 0};
        cerca.vertices = {{-7.25, -39.35}, {-7.25, -39.34}, {-7.24, -39.34}, {-7.24, -39.35}};
        return cerca;
    }

    // Ponto a "metros" ao norte do centro (1 grau de latitude ~ 111.195 m).
    Ponto AoNorte(double metros)
    {
        return {CENTRO.latitude + metros / 111195.0, CENTRO.longitude};
    }

    Vigilancia Vigiando()
    {
        DadosVigilancia dados;
        dados.ativa = true;
        dados.versao = 4;
        dados.temCercas = true;
        dados.cercas = {Circulo(), Quadrado()};
        Vigilancia vigilancia;
        vigilancia.Aplicar(dados);
        return vigilancia;
    }

    void PerderComunicacao(Vigilancia& vigilancia)
    {
        for (int i = 0; i < ENVIOS_SEM_RESPOSTA_PARA_VIGIAR; i++)
            vigilancia.RegistrarEnvio(false);
    }
}

void test_haversine()
{
    TEST_ASSERT_DOUBLE_WITHIN(1.0, 1000.0, DistanciaM(CENTRO, AoNorte(1000)));
    TEST_ASSERT_DOUBLE_WITHIN(0.001, 0.0, DistanciaM(CENTRO, CENTRO));
}

void test_circulo_borda_conta_como_dentro_e_tolerancia_de_50_m()
{
    std::vector<Cerca> cercas = {Circulo()};
    TEST_ASSERT_DOUBLE_WITHIN(0.001, 0.0, DistanciaAteCercaM(AoNorte(99.5), Circulo()));
    TEST_ASSERT_TRUE(DentroDaGeocerca(AoNorte(100), cercas));
    TEST_ASSERT_TRUE(DentroDaGeocerca(AoNorte(149), cercas));
    TEST_ASSERT_FALSE(DentroDaGeocerca(AoNorte(151), cercas));
    TEST_ASSERT_FALSE(DentroDaGeocerca(AoNorte(120), cercas, 0));
}

void test_poligono_dentro_fora_e_tolerancia()
{
    std::vector<Cerca> cercas = {Quadrado()};
    TEST_ASSERT_TRUE(DentroDaGeocerca({-7.245, -39.345}, cercas));
    TEST_ASSERT_DOUBLE_WITHIN(0.001, 0.0, DistanciaAteCercaM({-7.245, -39.345}, Quadrado()));
    // ~33 m a oeste da borda: fora do poligono, mas dentro da tolerancia.
    TEST_ASSERT_TRUE(DentroDaGeocerca({-7.245, -39.3503}, cercas));
    // ~550 m a oeste: fora.
    TEST_ASSERT_FALSE(DentroDaGeocerca({-7.245, -39.355}, cercas));
    TEST_ASSERT_DOUBLE_WITHIN(15.0, 552.0, DistanciaAteCercaM({-7.245, -39.355}, Quadrado()));
}

void test_com_comunicacao_nao_trava()
{
    Vigilancia vigilancia = Vigiando();
    vigilancia.RegistrarEnvio(false);
    vigilancia.RegistrarEnvio(false);
    TEST_ASSERT_FALSE(vigilancia.SemComunicacao());
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(600), true, false));
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(700), true, false));
}

void test_3_envios_sem_resposta_e_duas_posicoes_fora_travam()
{
    Vigilancia vigilancia = Vigiando();
    PerderComunicacao(vigilancia);
    TEST_ASSERT_TRUE(vigilancia.SemComunicacao());
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(600), true, false));
    TEST_ASSERT_TRUE(vigilancia.RegistrarPosicao(AoNorte(700), true, false));
    // Uma vez so por perda de comunicacao.
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(800), true, false));
}

void test_posicao_dentro_quebra_a_sequencia()
{
    Vigilancia vigilancia = Vigiando();
    PerderComunicacao(vigilancia);
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(600), true, false));
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(10), true, false));
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(700), true, false));
    TEST_ASSERT_TRUE(vigilancia.RegistrarPosicao(AoNorte(700), true, false));
}

void test_sem_gps_nao_conta()
{
    Vigilancia vigilancia = Vigiando();
    PerderComunicacao(vigilancia);
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(600), false, false));
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(700), false, false));
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(700), true, false));
    TEST_ASSERT_TRUE(vigilancia.RegistrarPosicao(AoNorte(700), true, false));
}

void test_rede_caida_dentro_da_geocerca_nao_trava()
{
    Vigilancia vigilancia = Vigiando();
    PerderComunicacao(vigilancia);
    for (int i = 0; i < 10; i++)
        TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(140), true, false));
}

void test_valvula_ja_fechada_nao_trava_de_novo()
{
    Vigilancia vigilancia = Vigiando();
    PerderComunicacao(vigilancia);
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(600), true, true));
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(700), true, true));
}

void test_resposta_volta_e_zera_tudo()
{
    Vigilancia vigilancia = Vigiando();
    PerderComunicacao(vigilancia);
    vigilancia.RegistrarPosicao(AoNorte(600), true, false);
    vigilancia.RegistrarEnvio(true);
    TEST_ASSERT_FALSE(vigilancia.SemComunicacao());
    PerderComunicacao(vigilancia);
    TEST_ASSERT_FALSE(vigilancia.RegistrarPosicao(AoNorte(700), true, false));
    TEST_ASSERT_TRUE(vigilancia.RegistrarPosicao(AoNorte(700), true, false));
}

void test_sem_vigilancia_ou_sem_cercas_nao_trava()
{
    Vigilancia nenhuma;
    PerderComunicacao(nenhuma);
    TEST_ASSERT_FALSE(nenhuma.RegistrarPosicao(AoNorte(600), true, false));
    TEST_ASSERT_FALSE(nenhuma.RegistrarPosicao(AoNorte(700), true, false));

    DadosVigilancia semCercas;
    semCercas.ativa = true;
    semCercas.versao = 1;
    Vigilancia vazia;
    vazia.Aplicar(semCercas);
    PerderComunicacao(vazia);
    TEST_ASSERT_FALSE(vazia.RegistrarPosicao(AoNorte(600), true, false));
    TEST_ASSERT_FALSE(vazia.RegistrarPosicao(AoNorte(700), true, false));
}

void test_resposta_sem_cercas_mantem_e_inativa_apaga()
{
    Vigilancia vigilancia = Vigiando();
    DadosVigilancia mesma;
    mesma.ativa = true;
    mesma.versao = 4;
    vigilancia.Aplicar(mesma);
    TEST_ASSERT_EQUAL(2, vigilancia.Cercas().size());
    DadosVigilancia inativa;
    inativa.versao = 5;
    vigilancia.Aplicar(inativa);
    TEST_ASSERT_FALSE(vigilancia.Ativa());
    TEST_ASSERT_EQUAL(5, vigilancia.Versao());
    TEST_ASSERT_EQUAL(0, vigilancia.Cercas().size());
}

void test_vigilancia_sobrevive_ao_reinicio()
{
    Vigilancia vigilancia = Vigiando();
    Vigilancia depois;
    TEST_ASSERT_TRUE(depois.Restaurar(vigilancia.Serializar()));
    TEST_ASSERT_TRUE(depois.Ativa());
    TEST_ASSERT_EQUAL(4, depois.Versao());
    TEST_ASSERT_EQUAL(2, depois.Cercas().size());
    TEST_ASSERT_EQUAL(4, depois.Cercas()[1].vertices.size());
    TEST_ASSERT_FALSE(depois.Restaurar("{"));
}

int main()
{
    UNITY_BEGIN();
    RUN_TEST(test_haversine);
    RUN_TEST(test_circulo_borda_conta_como_dentro_e_tolerancia_de_50_m);
    RUN_TEST(test_poligono_dentro_fora_e_tolerancia);
    RUN_TEST(test_com_comunicacao_nao_trava);
    RUN_TEST(test_3_envios_sem_resposta_e_duas_posicoes_fora_travam);
    RUN_TEST(test_posicao_dentro_quebra_a_sequencia);
    RUN_TEST(test_sem_gps_nao_conta);
    RUN_TEST(test_rede_caida_dentro_da_geocerca_nao_trava);
    RUN_TEST(test_valvula_ja_fechada_nao_trava_de_novo);
    RUN_TEST(test_resposta_volta_e_zera_tudo);
    RUN_TEST(test_sem_vigilancia_ou_sem_cercas_nao_trava);
    RUN_TEST(test_resposta_sem_cercas_mantem_e_inativa_apaga);
    RUN_TEST(test_vigilancia_sobrevive_ao_reinicio);
    return UNITY_END();
}
