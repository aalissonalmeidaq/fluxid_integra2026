#pragma once

// include/secrets.h fica fora do git (CA-012). Sem ele, compila com o modelo (o CI faz assim) e o lacre nao conecta.
#if __has_include(<secrets.h>)
#include <secrets.h>
#else
#warning "include/secrets.h ausente: compilando com o modelo; o lacre nao vai conectar ao FluxID."
#include <secrets.example.h>
#endif
