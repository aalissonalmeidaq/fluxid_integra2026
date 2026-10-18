#pragma once

enum EstadoDispositivo
{
    NAO_CADASTRADO,
    OPERACIONAL,
    LACRE_ROMPIDO,
    ERRO,
    MANUTENCAO,
    DESATIVADO
};

extern EstadoDispositivo estadoAtual;