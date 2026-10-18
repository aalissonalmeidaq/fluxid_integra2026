#pragma once

// Modelo dos segredos do lacre (Spec 012, CA-012). Copie para include/secrets.h (fora do git) e preencha com os valores
// reais. Este arquivo versionado NUNCA traz chave, senha ou endereco real.
//
//   cp include/secrets.example.h include/secrets.h

// Endereco do FluxID: so HTTPS. O lacre confere o certificado do servidor e acerta a hora por SNTP antes da primeira chamada.
#define FLUXID_URL "https://<projeto>.supabase.co"

// Codigo e chave do dispositivo, mostrados uma unica vez no cadastro do lacre no FluxID (tela Lacres > Cadastrar dispositivo).
#define FLUXID_DISPOSITIVO "DSP-<codigo>"
#define FLUXID_CHAVE "fxk_<chave-do-dispositivo>"

// Rede padrao, gravada no firmware e nunca apagada pelo FluxID. As outras (ate 5) chegam pelo sistema.
#define FLUXID_WIFI_SSID "<rede-padrao>"
#define FLUXID_WIFI_SENHA "<senha-da-rede-padrao>"

// So na bancada, contra o Supabase local sem TLS (http://<ip-do-computador>:54321). Nunca em lacre de campo.
// #define FLUXID_PERMITIR_HTTP_LOCAL
