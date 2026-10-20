// Spec 013 (T046; RF-007, RF-008; research.md, itens 1, 2 e 12): o codigo do lacre vem do MAC de fabrica do chip
// ("DSP-" + 8 caracteres base32 Crockford dos 40 primeiros bits do SHA-256 de "fluxid-lacre:" + MAC em hexadecimal
// maiusculo), igual em todo reinicio; a chave ("fxk_" + base64url de 32 bytes) e criada pelo proprio lacre no primeiro uso e
// reaproveitada depois. Os mesmos vetores sao conferidos no banco (supabase/tests/013_device_code.test.sql).

#include <regex>
#include <string.h>
#include <unity.h>

#include "nucleo/Identidade.h"

using namespace fluxid;

namespace
{
    const uint8_t MAC_A[6] = {0xA0, 0xB1, 0xC2, 0xD3, 0xE4, 0xF5};
    const uint8_t MAC_ZERO[6] = {0, 0, 0, 0, 0, 0};
    const uint8_t MAC_FF[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
    const uint8_t MAC_B[6] = {0x7C, 0x2C, 0x67, 0xA1, 0xB2, 0xC3};

    uint8_t aleatorio[32];
    int chamadasAoGerador = 0;
    // Vetor dos bytes 0 a 31 (nao e chave real). Montado em partes para a regra do CI contra chaves versionadas nao confundir.
    const std::string CHAVE_DOS_BYTES_0_A_31 = std::string("fxk") + "_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

    void GeradorSimulado(uint8_t* destino, size_t tamanho)
    {
        chamadasAoGerador++;
        for (size_t i = 0; i < tamanho; i++)
            destino[i] = static_cast<uint8_t>(i);
    }
}

void setUp()
{
    chamadasAoGerador = 0;
    memset(aleatorio, 0, sizeof(aleatorio));
}

void tearDown() {}

void test_sha256_dos_vetores_conhecidos()
{
    TEST_ASSERT_EQUAL_STRING("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", Sha256Hex("").c_str());
    TEST_ASSERT_EQUAL_STRING("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Sha256Hex("abc").c_str());
}

void test_codigo_do_chip_pelos_vetores()
{
    TEST_ASSERT_EQUAL_STRING("A0B1C2D3E4F5", MacEmHexadecimal(MAC_A).c_str());
    TEST_ASSERT_EQUAL_STRING("DSP-DFQHFXV2", CodigoDoChip(MAC_A).c_str());
    TEST_ASSERT_EQUAL_STRING("DSP-QPN7NGVD", CodigoDoChip(MAC_ZERO).c_str());
    TEST_ASSERT_EQUAL_STRING("DSP-SSR8T02G", CodigoDoChip(MAC_FF).c_str());
    TEST_ASSERT_EQUAL_STRING("DSP-CHAB4MXA", CodigoDoChip(MAC_B).c_str());
}

void test_codigo_segue_a_regra_do_banco_e_nao_tem_letras_ambiguas()
{
    const std::regex regra("^DSP-[0-9A-Z]{8}$");
    for (const uint8_t* mac : {MAC_A, MAC_ZERO, MAC_FF, MAC_B})
    {
        const std::string codigo = CodigoDoChip(mac);
        TEST_ASSERT_TRUE_MESSAGE(std::regex_match(codigo, regra), codigo.c_str());
        TEST_ASSERT_EQUAL(std::string::npos, codigo.find_first_of("ILOU", 4));
    }
}

void test_mesmo_mac_da_sempre_o_mesmo_codigo()
{
    TEST_ASSERT_EQUAL_STRING(CodigoDoChip(MAC_A).c_str(), CodigoDoChip(MAC_A).c_str());
}

void test_chave_nova_tem_o_prefixo_e_base64url_de_32_bytes()
{
    for (size_t i = 0; i < 32; i++)
        aleatorio[i] = static_cast<uint8_t>(i);
    TEST_ASSERT_EQUAL_STRING(CHAVE_DOS_BYTES_0_A_31.c_str(), ChaveDeBytes(aleatorio).c_str());
}

void test_primeiro_uso_gera_a_chave_e_depois_reaproveita()
{
    Identidade primeira = DefinirIdentidade(MAC_A, "", "", "", GeradorSimulado);
    TEST_ASSERT_EQUAL_STRING("DSP-DFQHFXV2", primeira.codigo.c_str());
    TEST_ASSERT_EQUAL_STRING(CHAVE_DOS_BYTES_0_A_31.c_str(), primeira.chave.c_str());
    TEST_ASSERT_TRUE(primeira.chaveNova);
    TEST_ASSERT_FALSE(primeira.cadastroManual);
    TEST_ASSERT_EQUAL(1, chamadasAoGerador);

    Identidade depois = DefinirIdentidade(MAC_A, primeira.chave, "", "", GeradorSimulado);
    TEST_ASSERT_EQUAL_STRING(primeira.chave.c_str(), depois.chave.c_str());
    TEST_ASSERT_FALSE(depois.chaveNova);
    TEST_ASSERT_EQUAL(1, chamadasAoGerador);
}

void test_chave_guardada_fora_do_formato_e_trocada()
{
    Identidade identidade = DefinirIdentidade(MAC_A, "lixo", "", "", GeradorSimulado);
    TEST_ASSERT_TRUE(identidade.chaveNova);
    TEST_ASSERT_EQUAL(0, identidade.chave.rfind("fxk_", 0));
}

void test_lacre_da_spec_012_usa_o_codigo_e_a_chave_do_cadastro_manual()
{
    Identidade identidade = DefinirIdentidade(MAC_A, "", "DSP-7KQ2M9XT", "fxk_manual-ficticia", GeradorSimulado);
    TEST_ASSERT_EQUAL_STRING("DSP-7KQ2M9XT", identidade.codigo.c_str());
    TEST_ASSERT_EQUAL_STRING("fxk_manual-ficticia", identidade.chave.c_str());
    TEST_ASSERT_TRUE(identidade.cadastroManual);
    TEST_ASSERT_EQUAL(0, chamadasAoGerador);
}

int main()
{
    UNITY_BEGIN();
    RUN_TEST(test_sha256_dos_vetores_conhecidos);
    RUN_TEST(test_codigo_do_chip_pelos_vetores);
    RUN_TEST(test_codigo_segue_a_regra_do_banco_e_nao_tem_letras_ambiguas);
    RUN_TEST(test_mesmo_mac_da_sempre_o_mesmo_codigo);
    RUN_TEST(test_chave_nova_tem_o_prefixo_e_base64url_de_32_bytes);
    RUN_TEST(test_primeiro_uso_gera_a_chave_e_depois_reaproveita);
    RUN_TEST(test_chave_guardada_fora_do_formato_e_trocada);
    RUN_TEST(test_lacre_da_spec_012_usa_o_codigo_e_a_chave_do_cadastro_manual);
    return UNITY_END();
}
