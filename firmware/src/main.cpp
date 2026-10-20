// Firmware do lacre FluxID (Spec 012, "Requisitos para o firmware"). A cada intervalo combinado (padrao 1 minuto), mesmo
// parado, le a posicao, guarda na fila e chama o seal-gateway com o lote; le o comando da resposta, executa e confirma.
// Spec 013: um unico firmware para todos os lacres. O codigo vem do chip e a chave e criada pelo lacre (nucleo/Identidade); sem rede
// salva (ou com o botao BOOT segurado), abre a rede de configuracao (PortalWiFi); ate o Master aprovar, so pede aprovacao, sem
// leituras na fila (nucleo/Aprovacao). As regras ficam em src/nucleo (testadas no computador); aqui so o hardware e a ordem das coisas.

#include <Arduino.h>
#include <WiFi.h>
#include <esp_random.h>
#include <esp_sleep.h>
#include <esp_system.h>

#include <ConexaoWiFi.h>
#include <Estado.h>
#include <GPS.h>
#include <LED.h>
#include <Memoria.h>
#include <PortalWiFi.h>
#include <Relogio.h>
#include <Sensores.h>
#include <Solenoide.h>
#include <Transporte.h>
#include <config.h>
#include <nucleo/Aprovacao.h>
#include <nucleo/Fila.h>
#include <nucleo/Identidade.h>
#include <nucleo/Portal.h>
#include <nucleo/Protocolo.h>
#include <nucleo/Rede.h>
#include <nucleo/Trava.h>
#include <nucleo/Vigilancia.h>
#include <Segredos.h>

using namespace fluxid;

namespace
{
    const uint32_t INTERVALO_REMONTAGEM_MS = 30000UL;
    // Depois de avisar o desligamento por bateria, dorme e confere de novo a cada 30 min.
    const uint64_t SONO_BATERIA_US = 30ULL * 60ULL * 1000000ULL;

    ArmazenamentoFlash armazenamento;
    Fila fila(armazenamento);
    MemoriaDaTravaNvs memoriaDaTrava;
    Solenoide solenoide(PINO_SOLENOIDE_FECHAR, PINO_SOLENOIDE_ABRIR, DURACAO_PULSO_SOLENOIDE_MS);
    Trava trava(solenoide, memoriaDaTrava);
    // Spec 013 (RF-019, RN-006): nenhuma rede vem do firmware; a principal vem do portal e fica na NVS.
    ListaDeRedes redes("", "");
    ConexaoWiFi conexao(redes);
    Vigilancia vigilancia;
    TrocaDeRede troca;
    RegistroDeComandos registro;
    GeradorDeIds ids("DSP-00000000", 0);
    Identidade identidade;
    Aprovacao aprovacao;
    PortalWiFi portal;
    JanelaDoPortal janela;
    BotaoDoPortal botao;
    uint32_t proximaChamadaEmEsperaMs = 0;

    bool filaDisponivel = false;
    uint32_t intervaloS = INTERVALO_PADRAO_S;
    uint32_t proximaLeituraMs = 0;
    uint32_t proximoEnvioMs = 0;
    uint32_t ultimaMontagemMs = 0;
    bool envioImediato = false;
    // Depois de um 429, nem o envio imediato de uma confirmacao fura o Retry-After.
    bool aguardandoLimite = false;
    bool bootRegistrado = false;
    bool ativacaoPendente = true;
    bool bateriaBaixaAvisada = false;
    bool sinalFracoAvisado = false;
    bool desligar = false;

    std::string NovoId()
    {
        bool reservar = false;
        const std::string id = ids.Proximo(reservar);
        if (reservar)
            GravarNumero("ids", ids.Reservado());
        return id;
    }

    std::string Agora()
    {
        return FormatarHorario(AgoraSegundos());
    }

    // Toda mensagem passa pela fila antes de ir ao FluxID: sem resposta, ela fica e vai de novo com o mesmo id.
    void Guardar(const std::string& id, const std::string& mensagem)
    {
        if (!filaDisponivel || !fila.Adicionar(id, mensagem))
            Serial.println("ERRO: nao foi possivel guardar a mensagem na fila.");
    }

    void GuardarResultado(const std::string& comandoId, bool executado, const std::string& motivo)
    {
        const std::string id = NovoId();
        Guardar(id, MensagemResultado(id, Agora(), comandoId, executado, motivo));
        registro.Lembrar(comandoId);
        envioImediato = true;
    }

    void GuardarTrocaDeRede()
    {
        const std::string id = NovoId();
        Guardar(id, MensagemTrocaDeRede(id, Agora(), conexao.EmUso(), redes.Nomes()));
    }

    void SalvarRedes()
    {
        GravarTexto("redes", redes.Serializar());
        GravarTexto("principal", redes.SerializarPrincipal());
    }

    Leitura LerLeitura(const Ponto& ponto, bool comGps, double precisaoM)
    {
        Leitura leitura;
        leitura.ponto = ponto;
        leitura.comGps = comGps;
        leitura.precisaoM = precisaoM;
        leitura.bateriaPct = BateriaPct();
        leitura.estadoLacre = EstadoDoLacre();
        leitura.rede = conexao.EmUso();
        leitura.temRede = conexao.Conectado();
        leitura.sinalDbm = leitura.rede.rssi;
        leitura.redesVisiveis = conexao.Visiveis();
        return leitura;
    }

    // Rede nova (RF-034d): falou com o FluxID por ela, entao entra na lista e o comando e confirmado.
    void ConcluirTrocaDeRede()
    {
        const std::string comandoId = troca.ComandoId();
        const bool guardada = troca.Concluir(redes) == FalhaNaLista::Nenhuma;
        if (guardada)
            SalvarRedes();
        GuardarResultado(comandoId, guardada, guardada ? "" : "unknown");
        GuardarTrocaDeRede();
    }

    // Nao alcancou o FluxID pela rede nova: volta para a anterior e confirma com erro.
    void DesistirDaTrocaDeRede(const char* motivo)
    {
        const std::string comandoId = troca.ComandoId();
        troca.Desistir();
        if (!conexao.Conectar(troca.Anterior()))
            conexao.ProcurarEConectar();
        GuardarResultado(comandoId, false, motivo);
        GuardarTrocaDeRede();
    }

    void SalvarAprovacao()
    {
        GravarTexto("aprovacao", aprovacao.Serializar());
    }

    RespostaHttp Chamar(const std::string& pedido)
    {
        return EnviarAoFluxID(pedido, identidade.codigo, identidade.chave);
    }

    void GeradorDeHardware(uint8_t* destino, size_t tamanho)
    {
        esp_fill_random(destino, tamanho);
    }

    void EsvaziarFila()
    {
        while (filaDisponivel && fila.Tamanho() > 0)
            fila.DescartarLote(fila.ProximoLote());
    }

    // Devolvido ou retirado (RN-006): apaga as redes pedidas, a fila e a vigilancia (nada do tenant antigo segue com o lacre) e
    // confirma nas proximas chamadas.
    void AplicarEsquecimento()
    {
        const Esquecimento escopo = aprovacao.EsquecimentoPedido();
        if (escopo == Esquecimento::Nenhum)
            return;
        redes.Esquecer(escopo);
        SalvarRedes();
        EsvaziarFila();
        vigilancia.Aplicar(DadosVigilancia{});
        GravarTexto("vigilancia", vigilancia.Serializar());
        aprovacao.EsquecimentoFeito(escopo);
        SalvarAprovacao();
        Serial.printf("Redes esquecidas (%s); rede principal %s.\n", escopo == Esquecimento::Todas ? "todas" : "extras",
            redes.TemPrincipal() ? "mantida" : "nenhuma");
        if (!redes.TemAlgumaRede())
            WiFi.disconnect();
    }

    // Toda resposta do FluxID passa por aqui: muda o modo (aguardando, operando, recusado) e aplica o esquecimento das redes.
    void RegistrarRespostaDoPedido(int codigo, const std::string& corpo)
    {
        const ModoDoLacre antes = aprovacao.Modo();
        aprovacao.AoResponder(codigo, corpo);
        if (aprovacao.AcabouDeSerAprovado())
        {
            // A rede principal passa a ser do tenant em que o lacre opera (RN-006).
            redes.MarcarAprovado();
            SalvarRedes();
            ativacaoPendente = true;
            Serial.println("Lacre aprovado pelo Master: passa a operar.");
        }
        if (antes == ModoDoLacre::Operando && aprovacao.Modo() == ModoDoLacre::Aguardando)
        {
            EsvaziarFila();
            bootRegistrado = false;
            Serial.println("Lacre fora de operacao: volta a pedir aprovacao.");
        }
        AplicarEsquecimento();
        SalvarAprovacao();
        if (aprovacao.Modo() == ModoDoLacre::Aguardando)
            estadoAtual = NAO_CADASTRADO;
        portal.DefinirAprovacao(aprovacao.Modo() == ModoDoLacre::Operando ? AprovacaoNoPortal::Aprovado : AprovacaoNoPortal::Pendente);
    }

    // Enquanto aguarda (research.md, item 4): so boot, a rede em uso e a confirmacao do esquecimento, sem leituras na fila.
    int ChamarEmEspera()
    {
        if (!conexao.Conectado() || !RelogioAcertado())
            return -1;
        const std::vector<std::string> mensagens = aprovacao.MensagensDeEspera(NovoId, Agora(), conexao.EmUso(), redes.Nomes());
        const RespostaHttp resposta = Chamar(MontarPedido(FLUXID_VERSAO_FIRMWARE, 0, mensagens));
        Serial.printf("Pedido de aprovacao: HTTP %d\n", resposta.codigo);
        conexao.RegistrarEnvio(resposta.codigo > 0 && resposta.codigo < 500);
        if (resposta.codigo > 0)
            RegistrarRespostaDoPedido(resposta.codigo, resposta.corpo);
        return resposta.codigo;
    }

    void ExecutarComando(const Comando& comando)
    {
        if (comando.tipo == TipoComando::Nenhum || registro.JaExecutado(comando.id))
            return;
        if (troca.EmTeste() && troca.ComandoId() == comando.id)
            return;

        switch (comando.tipo)
        {
        case TipoComando::Travar:
        case TipoComando::Destravar:
        {
            // So confirma depois de acionar a solenoide (RN-010).
            const DesfechoDoComando desfecho = trava.Executar(comando.tipo == TipoComando::Travar);
            GuardarResultado(comando.id, desfecho.executado, desfecho.motivo);
            break;
        }
        case TipoComando::AdicionarRede:
        {
            if (!redes.Contem(comando.ssid) && redes.Nomes().size() >= ListaDeRedes::MAXIMO)
            {
                GuardarResultado(comando.id, false, "unknown");
                break;
            }
            troca.Iniciar(comando.id, {comando.ssid, comando.senha, comando.aberta}, conexao.Escolha(), millis());
            std::string motivo;
            if (conexao.TestarRede(troca.Candidata(), motivo))
            {
                // O proximo envio vai pela rede nova; com resposta, ConcluirTrocaDeRede.
                GuardarTrocaDeRede();
                envioImediato = true;
            }
            else
                DesistirDaTrocaDeRede(motivo.c_str());
            break;
        }
        case TipoComando::RemoverRede:
            redes.Remover(comando.ssid);
            SalvarRedes();
            GuardarResultado(comando.id, true, "");
            if (!conexao.Escolha().padrao && conexao.Escolha().ssid == comando.ssid)
                conexao.ProcurarEConectar();
            GuardarTrocaDeRede();
            break;
        case TipoComando::ResetarRedes:
            redes.Limpar();
            SalvarRedes();
            GuardarResultado(comando.id, true, "");
            if (!conexao.Escolha().padrao)
                conexao.Conectar(redes.Padrao());
            GuardarTrocaDeRede();
            break;
        default:
            GuardarResultado(comando.id, false, "unknown");
            break;
        }
    }

    void AplicarResposta(const Resposta& resposta)
    {
        fila.AplicarResultados(resposta.resultados);
        if (resposta.intervaloS != intervaloS)
        {
            intervaloS = resposta.intervaloS;
            GravarNumero("intervalo", intervaloS);
        }
        const bool mudou = resposta.vigilancia.temCercas || resposta.vigilancia.versao != vigilancia.Versao() || resposta.vigilancia.ativa != vigilancia.Ativa();
        vigilancia.Aplicar(resposta.vigilancia);
        if (mudou)
            GravarTexto("vigilancia", vigilancia.Serializar());
        if (troca.EmTeste())
            ConcluirTrocaDeRede();
        ExecutarComando(resposta.comando);
    }

    void Enviar()
    {
        if (!filaDisponivel || !RelogioAcertado())
            return;
        const std::vector<ItemDaFila> lote = fila.ProximoLote();
        if (lote.empty())
            return;

        RespostaHttp resposta = {-1, "", 0};
        if (conexao.Conectado())
        {
            std::vector<std::string> mensagens;
            for (const ItemDaFila& item : lote)
                mensagens.push_back(item.mensagem);
            resposta = Chamar(MontarPedido(FLUXID_VERSAO_FIRMWARE, vigilancia.Versao(), mensagens));
        }
        // 5xx ou nada: o FluxID nao respondeu (conta para a trava por perda de comunicacao e para trocar de rede).
        const bool respondeu = resposta.codigo > 0 && resposta.codigo < 500;
        vigilancia.RegistrarEnvio(respondeu);
        conexao.RegistrarEnvio(respondeu);
        Serial.printf("Envio de %u mensagens: HTTP %d; na fila: %u\n", static_cast<unsigned>(lote.size()), resposta.codigo, static_cast<unsigned>(fila.Tamanho()));

        // Spec 013: devolvido ou retirado (202) e recusado (403) tiram o lacre de operacao; nada mais deste lote vale.
        if (resposta.codigo == 202 || resposta.codigo == 403)
        {
            RegistrarRespostaDoPedido(resposta.codigo, resposta.corpo);
            return;
        }

        switch (ClassificarResposta(resposta.codigo))
        {
        case AcaoDoEnvio::AplicarResultados:
        {
            Resposta lida;
            if (LerResposta(resposta.corpo, lida))
            {
                estadoAtual = OPERACIONAL;
                AplicarResposta(lida);
            }
            break;
        }
        case AcaoDoEnvio::DescartarLote:
            // Corpo fora do formato: defeito do firmware; reenviar o mesmo lote nao resolve.
            fila.DescartarLote(lote);
            estadoAtual = ERRO;
            break;
        case AcaoDoEnvio::Manter:
            if (resposta.codigo == 401)
                estadoAtual = NAO_CADASTRADO;
            break;
        }
        if (troca.EmTeste() && !respondeu)
            DesistirDaTrocaDeRede("wifi_no_internet");

        aguardandoLimite = resposta.codigo == 429;
        proximoEnvioMs = millis() + EsperaAteProximoEnvioMs(resposta.codigo, intervaloS, resposta.retryAfterS);
    }

    void LerEGuardar()
    {
        // Sem internet, a hora vem dos satelites: as leituras ficam na fila com o horario certo e vao quando a rede voltar.
        int64_t horaGps = 0;
        if (!RelogioAcertado() && HoraDoGps(horaGps))
        {
            AcertarRelogio(horaGps);
            Serial.println("Relogio acertado pela hora do GPS.");
        }
        if (!RelogioAcertado())
        {
            Serial.printf("Aguardando a hora (rede %s, GPS com %lu satelites).\n", conexao.Conectado() ? "conectada" : "desconectada",
                static_cast<unsigned long>(SatelitesDoGps()));
            return;
        }
        if (!filaDisponivel)
            return;
        if (!bootRegistrado)
        {
            const std::string id = NovoId();
            Guardar(id, MensagemEvento(id, Agora(), "boot"));
            bootRegistrado = true;
        }
        Ponto ponto;
        bool comGps = false;
        double precisaoM = -1;
        // Sem nenhuma posicao ainda (antes do primeiro fix), nao ha leitura para guardar.
        if (!PosicaoAtual(ponto, comGps, precisaoM))
        {
            Serial.println("GPS: aguardando o primeiro fix (leve o lacre para ceu aberto).");
            return;
        }

        const Leitura leitura = LerLeitura(ponto, comGps, precisaoM);
        // Diagnostico de bancada: qualidade, precisao, bateria e rede; nunca coordenada, chave ou senha.
        Serial.printf("Leitura: %s, precisao %.0f m, bateria %s, lacre %s, rede %s (%d dBm)\n", comGps ? "com GPS" : "ultima conhecida",
            precisaoM, leitura.bateriaPct < 0 ? "sem medicao" : (std::to_string(leitura.bateriaPct) + "%").c_str(), leitura.estadoLacre.c_str(), leitura.temRede ? (leitura.rede.padrao ? "padrao" : "da lista") : "desconectada",
            leitura.sinalDbm);
        const std::string id = NovoId();
        if (ativacaoPendente)
        {
            // Ativacao: informa a valvula como esta gravada (RN-010) no primeiro envio depois de ligar.
            Guardar(id, MensagemAtivacao(id, Agora(), leitura, trava.Fechada()));
            ativacaoPendente = false;
        }
        else
            Guardar(id, MensagemPosicao(id, Agora(), leitura));

        const bool bateriaMedida = leitura.bateriaPct >= 0;
        if (bateriaMedida && leitura.bateriaPct <= BATERIA_BAIXA_PCT && !bateriaBaixaAvisada)
        {
            const std::string alerta = NovoId();
            Guardar(alerta, MensagemAlerta(alerta, Agora(), "low_battery", true, leitura.bateriaPct));
            bateriaBaixaAvisada = true;
        }
        else if (leitura.bateriaPct > BATERIA_BAIXA_PCT + 5)
            bateriaBaixaAvisada = false;

        if (leitura.temRede && leitura.sinalDbm < SINAL_FRACO_DBM && !sinalFracoAvisado)
        {
            const std::string alerta = NovoId();
            Guardar(alerta, MensagemAlerta(alerta, Agora(), "weak_signal", true, leitura.sinalDbm));
            sinalFracoAvisado = true;
        }
        else if (leitura.sinalDbm >= SINAL_FRACO_DBM + 5)
            sinalFracoAvisado = false;

        // Sob vigilancia e sem falar com o FluxID: duas posicoes com GPS fora da geocerca travam a valvula (RN-011).
        if (vigilancia.RegistrarPosicao(ponto, comGps, trava.Fechada()))
        {
            const DesfechoDoComando desfecho = trava.Executar(true);
            if (desfecho.executado)
            {
                const std::string aviso = NovoId();
                const std::string agora = Agora();
                Guardar(aviso, MensagemTravaAutomatica(aviso, agora, agora, leitura));
            }
        }

        if (bateriaMedida && leitura.bateriaPct <= BATERIA_DESLIGAR_PCT)
        {
            const std::string aviso = NovoId();
            Guardar(aviso, MensagemDesligamento(aviso, Agora(), leitura));
            desligar = true;
            envioImediato = true;
        }
    }

    // Teste da rede escolhida no portal (RF-004, RF-005): conecta e confere a chegada ao FluxID antes de guardar. Falhou: nada e
    // guardado e o lacre volta para a rede em que estava.
    void TestarRedeDoPortal(const RedeGuardada& rede)
    {
        const EscolhaDeRede anterior = conexao.Escolha();
        std::string motivo;
        if (!conexao.TestarRede(rede, motivo))
        {
            portal.ConcluirTeste(false, motivo);
            if (!anterior.ssid.empty())
                conexao.Conectar(anterior);
            return;
        }
        // A chamada ao FluxID exige a hora certa (TLS e read_at): espera o SNTP por ate 10 s na rede nova.
        IniciarRelogio();
        const uint32_t inicio = millis();
        while (!RelogioAcertado() && millis() - inicio < 10000UL)
            delay(200);
        const int codigo = ChamarEmEspera();
        if (codigo == 200 || codigo == 202 || codigo == 403)
        {
            redes.DefinirPrincipal(rede, true);
            SalvarRedes();
            portal.ConcluirTeste(true, "");
            janela.Sucesso(millis());
            return;
        }
        portal.ConcluirTeste(false, "wifi_no_internet");
        if (!anterior.ssid.empty())
            conexao.Conectar(anterior);
    }

    void AtenderPortal(uint32_t agora)
    {
        if (botao.Atualizar(agora, digitalRead(PINO_BOTAO_PORTAL) == LOW))
        {
            Serial.println("Botao BOOT: abrindo a rede de configuracao.");
            janela.PedirAbertura(agora);
        }
        const bool aberta = janela.Atualizar(agora, redes.TemAlgumaRede(), portal.TemCliente());
        portal.DefinirConexao({conexao.RedeAtual(), conexao.ChegaAoFluxID()});
        if (aberta && !portal.Aberto())
        {
            portal.DefinirAprovacao(aprovacao.Modo() == ModoDoLacre::Operando ? AprovacaoNoPortal::Aprovado : AprovacaoNoPortal::Pendente);
            portal.Abrir(identidade.codigo, FLUXID_PORTAL_SENHA);
            estadoAtual = MANUTENCAO;
        }
        else if (!aberta && portal.Aberto())
        {
            portal.Fechar();
            estadoAtual = aprovacao.Modo() == ModoDoLacre::Operando ? OPERACIONAL : NAO_CADASTRADO;
        }
        portal.Atender();
        RedeGuardada pedida;
        if (portal.PegarPedidoDeTeste(pedida))
            TestarRedeDoPortal(pedida);
    }

    void MontarFila()
    {
        ultimaMontagemMs = millis();
        filaDisponivel = armazenamento.Montar() && fila.Iniciar();
        if (!filaDisponivel)
        {
            Serial.println("ERRO: nao foi possivel montar o LittleFS. Nenhum dado foi apagado.");
            estadoAtual = ERRO;
        }
    }
}

void setup()
{
    Serial.begin(115200);
    InicializarLEDs(PINO_LED_VERDE, PINO_LED_VERMELHO);
    IniciarGPS(PINO_GPS_RX, PINO_GPS_TX);
    IniciarSensores();
    solenoide.Iniciar();

    AbrirMemoria();
    pinMode(PINO_BOTAO_PORTAL, INPUT_PULLUP);
    uint8_t mac[6];
    esp_efuse_mac_get_default(mac);
#if defined(FLUXID_DISPOSITIVO) && defined(FLUXID_CHAVE)
    identidade = DefinirIdentidade(mac, LerTexto("chave"), FLUXID_DISPOSITIVO, FLUXID_CHAVE, GeradorDeHardware);
#else
    identidade = DefinirIdentidade(mac, LerTexto("chave"), "", "", GeradorDeHardware);
#endif
    if (identidade.chaveNova)
        GravarTexto("chave", identidade.chave);
    aprovacao = Aprovacao(identidade.cadastroManual);
    aprovacao.Restaurar(LerTexto("aprovacao"));
    ids = GeradorDeIds(identidade.codigo, LerNumero("ids", 0));
    intervaloS = LerNumero("intervalo", INTERVALO_PADRAO_S);
    redes.Restaurar(LerTexto("redes"));
    redes.RestaurarPrincipal(LerTexto("principal"));
#ifdef FLUXID_REDE_FABRICA_SSID
    // Spec 013 (RF-023): a rede padrao da plataforma, so enquanto ninguem escolhe a rede do local pelo portal.
    redes.DefinirRedeDeFabrica(FLUXID_REDE_FABRICA_SSID, FLUXID_REDE_FABRICA_SENHA);
#endif
    vigilancia.Restaurar(LerTexto("vigilancia"));
    if (!trava.Iniciar())
        Serial.println("ERRO: a solenoide nao respondeu ao restaurar a trava.");

    MontarFila();
    conexao.Iniciar();
    conexao.ProcurarEConectar();
    IniciarRelogio();
    estadoAtual = aprovacao.Modo() == ModoDoLacre::Operando ? OPERACIONAL : NAO_CADASTRADO;
    // Diagnostico de bancada: o codigo (publico: o Master o confere com o lacre em maos), nunca a chave.
    Serial.printf("FluxID lacre %s, codigo %s, %s, valvula %s, fila %u\n", FLUXID_VERSAO_FIRMWARE, identidade.codigo.c_str(),
        aprovacao.Modo() == ModoDoLacre::Operando ? "operando" : "aguardando aprovacao", trava.Fechada() ? "fechada" : "aberta",
        static_cast<unsigned>(fila.Tamanho()));
}

void loop()
{
    const uint32_t agora = millis();
    LerGPS();
    AtualizarLEDs();

    if (!filaDisponivel && agora - ultimaMontagemMs >= INTERVALO_REMONTAGEM_MS)
        MontarFila();

    if (conexao.Atualizar(agora) && RelogioAcertado())
    {
        if (conexao.CaiuNaPadrao())
        {
            const std::string id = NovoId();
            Guardar(id, MensagemEvento(id, Agora(), "wifi_fallback_default", "lista sem rede ao alcance"));
        }
        GuardarTrocaDeRede();
    }

    if (troca.EmTeste() && troca.Expirou(agora))
        DesistirDaTrocaDeRede("wifi_no_internet");

    AtenderPortal(agora);

    // Sem aprovacao, nada vira leitura nem vai para a fila (RN-003): so o pedido, no intervalo (ou de hora em hora, recusado).
    if (aprovacao.Modo() == ModoDoLacre::Aguardando)
    {
        if (static_cast<int32_t>(agora - proximaChamadaEmEsperaMs) >= 0)
        {
            ChamarEmEspera();
            proximaChamadaEmEsperaMs = millis() + aprovacao.EsperaS() * 1000UL;
        }
        return;
    }

    if (static_cast<int32_t>(agora - proximaLeituraMs) >= 0)
    {
        proximaLeituraMs = agora + intervaloS * 1000UL;
        LerEGuardar();
    }

    if ((envioImediato && !aguardandoLimite) || static_cast<int32_t>(agora - proximoEnvioMs) >= 0)
    {
        envioImediato = false;
        Enviar();
    }

    if (desligar)
    {
        // Avisou o desligamento (ou tentou): dorme para nao descarregar a bateria ate apagar no meio de uma gravacao.
        Serial.println("Bateria no fim: lacre dormindo.");
        WiFi.disconnect(true);
        esp_sleep_enable_timer_wakeup(SONO_BATERIA_US);
        esp_deep_sleep_start();
    }
}
