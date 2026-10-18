#include <Arduino.h>
#include <LED.h>
#include <Estado.h>

uint8_t ledVerde;
uint8_t ledVermelho;
bool ledVerdeLigado = false;
bool ledVermelhoLigado = false;
uint32_t ultimoEnvioLED = 0;

enum SimbolosCodigo
{
    CURTO,
    LONGO
};

SimbolosCodigo erro1[] = {CURTO, CURTO, LONGO, CURTO};
uint8_t indiceAtual = 0;

const uint32_t TEMPO_CURTO = 150;
const uint32_t TEMPO_LONGO = 500;
const uint32_t INTERVALO_SIMBOLOS = TEMPO_CURTO;
const uint32_t INTERVALO_CODIGO = 1000;

// Estado cujo padrao esta sendo exibido. Ao mudar, os dois LEDs sao
// apagados e os temporizadores reiniciados (EntrarNoPadrao).
EstadoDispositivo estadoLED = OPERACIONAL;
bool padraoIniciado = false;

void PiscarLED(uint8_t pino, bool& ligado,
               uint32_t tempoLigado, uint32_t tempoDesligado)
{
uint32_t agora = millis();

    if (ligado)
    {
        if (agora - ultimoEnvioLED >= tempoLigado)
        {
            digitalWrite(pino, LOW);

            ligado = false;
            
        
            ultimoEnvioLED = agora;
        }
        
    }
    else
    {
        if (agora - ultimoEnvioLED >= tempoDesligado)
        {
            digitalWrite(pino, HIGH);
            
            ligado = true;
        
            ultimoEnvioLED = agora;
        }
    }
}

void EntrarNoPadrao(EstadoDispositivo estado)
{
    digitalWrite(ledVerde, LOW);
    digitalWrite(ledVermelho, LOW);

    ledVerdeLigado = false;
    ledVermelhoLigado = false;
    indiceAtual = 0;
    ultimoEnvioLED = millis();

    estadoLED = estado;
    padraoIniciado = true;
}

void ReproduzirCodigoErro()
{
uint32_t agora = millis();


    if (indiceAtual >= sizeof(erro1)/sizeof(erro1[0]))
    {
        if (agora-ultimoEnvioLED >= INTERVALO_CODIGO) indiceAtual = 0;
        return;
    }

    if (!ledVermelhoLigado)
    {
        if (agora-ultimoEnvioLED >= INTERVALO_SIMBOLOS)
        {
            ledVermelhoLigado = true;        
            ultimoEnvioLED = agora;
            return;
        }
    }

    switch (erro1[indiceAtual])
    {
    case CURTO:
        if (ledVermelhoLigado && agora-ultimoEnvioLED>=TEMPO_CURTO)
        {
            ledVermelhoLigado = false;
            indiceAtual++;
            ultimoEnvioLED = agora;
        }
            break;

    case LONGO:
        if (ledVermelhoLigado && agora-ultimoEnvioLED>=TEMPO_LONGO)
        {
            ledVermelhoLigado = false;
            indiceAtual++;
            ultimoEnvioLED = agora;
        }
        break;

    default:
        break;
    }
digitalWrite(ledVermelho, ledVermelhoLigado);
}

void InicializarLEDs(uint8_t pinoVerde, uint8_t pinoVermelho)
{
    ledVerde = pinoVerde;
    ledVermelho = pinoVermelho;
    pinMode(pinoVerde, OUTPUT);
    pinMode(pinoVermelho, OUTPUT);
    digitalWrite(pinoVerde, LOW);
    digitalWrite(pinoVermelho, LOW);

    padraoIniciado = false;
}

// Padroes (nao bloqueantes):
//   NAO_CADASTRADO  verde fixo, vermelho apagado (401/404)
//   OPERACIONAL     verde pisca 100 ms a cada 4 s, vermelho apagado
//   LACRE_ROMPIDO   vermelho fixo, verde apagado (sem sensor ainda)
//   ERRO            vermelho repete curto-curto-longo-curto, verde apagado
//   DESATIVADO      vermelho pisca 1 s / 1 s, verde apagado (403)
//   MANUTENCAO      verde e vermelho alternam a cada 500 ms
void AtualizarLEDs()
{
    if (!padraoIniciado || estadoAtual != estadoLED)
    {
        EntrarNoPadrao(estadoAtual);
    }

    switch (estadoAtual)
    {
    case NAO_CADASTRADO:
        digitalWrite(ledVerde, HIGH);
        digitalWrite(ledVermelho, LOW);
        break;

    case OPERACIONAL:
    {
        digitalWrite(ledVermelho, LOW);
        PiscarLED(ledVerde, ledVerdeLigado, 100, 4000);
        
        break;
    }

    case LACRE_ROMPIDO:
        digitalWrite(ledVerde, LOW);
        digitalWrite(ledVermelho, HIGH);
        break;

    case ERRO:
        digitalWrite(ledVerde, LOW);
        ReproduzirCodigoErro();
        break;

    case DESATIVADO:
        digitalWrite(ledVerde, LOW);
        PiscarLED(ledVermelho, ledVermelhoLigado, 1000, 1000);
        break;

    case MANUTENCAO:
        PiscarLED(ledVerde, ledVerdeLigado, 500, 500);
        digitalWrite(ledVermelho, ledVerdeLigado ? LOW : HIGH);
        break;
    
    default:
        break;
    }
}
