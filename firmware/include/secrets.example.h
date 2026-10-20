#pragma once

// Modelo dos segredos do lacre (Specs 012 e 013, CA-012, RF-019). Copie para include/secrets.h (fora do git) e preencha com os
// valores reais. Este arquivo versionado NUNCA traz senha nem endereco real.
//
//   cp include/secrets.example.h include/secrets.h
//
// Spec 013: um unico firmware para todos os lacres. Nao ha codigo, chave nem rede por lacre: o codigo vem do chip, a chave e criada
// pelo proprio lacre e a rede e escolhida no local, pelo portal de configuracao.

// Endereco do FluxID: so HTTPS. O lacre confere o certificado do servidor e acerta a hora por SNTP antes da primeira chamada.
#define FLUXID_URL "https://<projeto>.supabase.co"

// Senha da rede de configuracao FluxID-Lacre-XXXX (WPA2, exatamente 8 caracteres), a mesma para toda a frota. O Master a consulta no
// FluxID (Lacres da plataforma > Mostrar a senha); o mesmo valor fica no Vault do servidor como seal_portal_password.
#define FLUXID_PORTAL_SENHA "<senha-da-rede-de-configuracao>"
// Marca o modelo: so compila (CI), sem conferir o tamanho da senha. Apague esta linha no seu secrets.h.
#define FLUXID_SEGREDOS_DO_MODELO

// Opcional (Spec 013, RF-023): a rede padrao da plataforma, usada so enquanto ninguem escolhe a rede do local pelo portal. Nao e de
// tenant nenhum: o lacre nunca a esquece e nunca a grava na memoria. Sem ela, o lacre so conecta pela rede escolhida no portal.
// #define FLUXID_REDE_FABRICA_SSID "FluxID"
// #define FLUXID_REDE_FABRICA_SENHA "<senha-da-rede-padrao>"

// So para os lacres da Spec 012 ja cadastrados a mao: o codigo e a chave mostrados no cadastro antigo. Lacres novos nao usam isto.
// #define FLUXID_DISPOSITIVO "DSP-<codigo>"
// #define FLUXID_CHAVE "fxk_<chave-do-dispositivo>"

// So na bancada, contra o Supabase local sem TLS (http://<ip-do-computador>:54321). Nunca em lacre de campo.
// #define FLUXID_PERMITIR_HTTP_LOCAL
