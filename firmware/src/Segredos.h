#pragma once

// include/secrets.h fica fora do git (CA-012). Sem ele, compila com o modelo (o CI faz assim) e o lacre nao conecta.
#if __has_include(<secrets.h>)
#include <secrets.h>
#else
#warning "include/secrets.h ausente: compilando com o modelo; o lacre nao vai conectar ao FluxID."
#include <secrets.example.h>
#endif

// Spec 013 (RF-019): a senha da rede de configuracao e obrigatoria; sem ela, a pessoa no local nao teria como configurar o lacre.
#ifndef FLUXID_PORTAL_SENHA
#error "Defina FLUXID_PORTAL_SENHA em include/secrets.h (veja include/secrets.example.h)."
#endif

// Spec 013 (RF-022): a senha da rede de configuracao tem exatamente 8 caracteres, para ser digitada no celular. O WPA2 exige no
// minimo 8, e a decisao do responsavel (19/10/2026) e no maximo 8. O modelo do CI fica de fora: ele so compila, nao conecta.
#ifndef FLUXID_SEGREDOS_DO_MODELO
static_assert(sizeof(FLUXID_PORTAL_SENHA) - 1 == 8, "FLUXID_PORTAL_SENHA precisa ter exatamente 8 caracteres.");
#endif
