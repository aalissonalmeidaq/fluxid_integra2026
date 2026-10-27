import type { IconName } from '@/design-system';
import type { CustoPorCapacidade } from './prejuizo';

// Fonte única de textos, links e ordem das seções da landing page (Spec 011, RF-005 e RF-007). A equipe troca texto e link aqui,
// sem tocar na apresentação. Tudo é público e estático: nenhum dado pessoal e nenhum segredo.
// A página segue o roteiro do pitch ("O cilindro que desapareceu"). Cada afirmação sobre o sistema cita a spec de origem (`origem`) e só
// descreve o que as Specs 002 a 010 entregaram; o que ainda está em protótipo (a trava física e o alerta de geocerca) aparece marcado
// como piloto, nunca como pronto (checklist do pitch: não declarar como concluída uma funcionalidade em prototipagem).

export type TipoDeMaterial = 'pasta' | 'repositorio' | 'canal' | 'video';

// Endereço público exibido nas molduras de navegador. Sem protocolo para manter a barra compacta; o canonical usa a URL completa.
export const ENDERECO_OFICIAL = 'fluxid.tec.br';

export interface MaterialDoProjeto {
  id: string;
  titulo: string;
  descricao: string;
  // Sempre https e só dos domínios drive.google.com, github.com, www.youtube.com e youtu.be (contracts/conteudo-e-links.md).
  url: string;
  tipo: TipoDeMaterial;
  // Só os vídeos: a miniatura é um cartão de marca desenhado em CSS/SVG, sem imagem de terceiros.
  miniatura?: true;
}

export const MATERIAIS: readonly MaterialDoProjeto[] = [
  {
    id: 'documentos',
    titulo: 'Documentos do projeto',
    descricao: 'Os documentos do projeto reunidos em uma pasta compartilhada. Ela fica no Google Drive e o acesso pode exigir permissão.',
    url: 'https://drive.google.com/drive/folders/1YLRicnjdatuBTYKyWaMewX0AQ3SbIH0a?usp=drive_link',
    tipo: 'pasta',
  },
  {
    id: 'repositorio-sistema',
    titulo: 'Repositório do sistema',
    descricao: 'Código do aplicativo web e de campo do FluxID, com as specs e o histórico de cada entrega.',
    url: 'https://github.com/aalissonalmeidaq/fluxid_integra2026',
    tipo: 'repositorio',
  },
  {
    id: 'repositorio-api',
    titulo: 'Repositório da API',
    descricao: 'Código da API usada pelo protótipo físico (ESP32).',
    url: 'https://github.com/NatBaracho/APIEsp32',
    tipo: 'repositorio',
  },
  {
    id: 'evidencias',
    titulo: 'Evidências',
    descricao: 'Registros e comprovações do desenvolvimento. A pasta fica no Google Drive e o acesso pode exigir permissão.',
    url: 'https://drive.google.com/drive/folders/1OKMqN2ZkS4g5TztreFCycmmGjT9zEni5?usp=sharing',
    tipo: 'pasta',
  },
  {
    id: 'canal-youtube',
    titulo: 'Canal do YouTube',
    descricao: 'Todos os vídeos do projeto reunidos em um só lugar.',
    url: 'https://www.youtube.com/channel/UCdPUZsu3yPHOae_sGLkX1oQ',
    tipo: 'canal',
  },
  {
    id: 'video-pitch',
    titulo: 'Vídeo do pitch',
    descricao: 'A história do cilindro C-262: os problemas enfrentados, o tamanho do prejuízo e as soluções propostas pelo FluxID.',
    url: 'https://www.youtube.com/watch?v=VBYOPnadE9M',
    tipo: 'video',
    miniatura: true,
  },
  {
    id: 'video-prototipo-fisico',
    titulo: 'Vídeo do protótipo físico',
    descricao: 'A trava inteligente na válvula: o anel, o pino do solenoide e o travamento na prática.',
    url: 'https://www.youtube.com/watch?v=oZAnkLHkd2k',
    tipo: 'video',
    miniatura: true,
  },
  {
    id: 'video-prototipo-sistema',
    titulo: 'Vídeo do protótipo do sistema',
    descricao: 'A plataforma em uso: cilindros, viagens, conferência e registro de entrega.',
    url: 'https://youtu.be/j7Qnq4MC9ZE',
    tipo: 'video',
    miniatura: true,
  },
];

// Onde cada vídeo toca na própria página (crítica de 14/10/2026: uma faixa só de vídeos repetia a página). Cada um fica na seção que ele
// comprova: o pitch logo depois do prejuízo, o protótipo físico na trava e o protótipo do sistema no que já funciona. O endereço, o título e a
// descrição continuam vindo da lista de materiais acima.
export const VIDEO_DA_SECAO = {
  pitch: 'video-pitch',
  trava: 'video-prototipo-fisico',
  funcionalidades: 'video-prototipo-sistema',
} as const satisfies Record<string, MaterialDoProjeto['id']>;

export type SpecDeOrigem = '002' | '003' | '004' | '005' | '006' | '007' | '008' | '009' | '010';

export interface FuncionalidadeDestaque {
  id: string;
  titulo: string;
  texto: string;
  icone: IconName;
  // Spec que sustenta a afirmação (usado em teste e na documentação; não aparece na página).
  origem: SpecDeOrigem;
}

// Só o que a jornada e as telas reais não mostram (distill de 15/10/2026): o cadastro com identificação e as viagens conferidas com entrega
// provada já aparecem, etapa por etapa, na jornada da solução e nas capturas logo acima da lista.
export const FUNCIONALIDADES: readonly FuncionalidadeDestaque[] = [
  {
    id: 'offline',
    titulo: 'Funciona mesmo sem sinal',
    texto: 'Sem conexão, os registros ficam no aparelho. Quando o sinal volta, são enviados em ordem e sem duplicar; conflitos seguem para decisão autorizada.',
    icone: 'sem-sinal',
    origem: '010',
  },
  {
    id: 'seguranca',
    titulo: 'Dados protegidos e ações auditadas',
    texto: 'Cada organização acessa apenas os próprios dados. Perfis limitam permissões, ações sensíveis exigem justificativa e são auditadas.',
    icone: 'escudo',
    origem: '004',
  },
];

// Onde cada parte da solução está hoje: já na plataforma (entregue por uma spec) ou em validação no piloto (protótipo).
export type SituacaoNaSolucao = 'plataforma' | 'piloto';

export const ROTULO_DA_SITUACAO: Record<SituacaoNaSolucao, string> = {
  plataforma: 'Na plataforma',
  piloto: 'Em validação no piloto',
};

// As quatro frentes do FluxID (roteiro do pitch, 2:50 a 3:30).
export interface FrenteDaSolucao {
  id: string;
  titulo: string;
  texto: string;
  icone: IconName;
  situacao: SituacaoNaSolucao;
  origem?: SpecDeOrigem;
}

export const FRENTES: readonly FrenteDaSolucao[] = [
  { id: 'identificar', titulo: 'Identificar', texto: 'Cada cilindro tem cadastro próprio, ligado a QR Code, Data Matrix ou etiqueta NFC.', icone: 'cilindro', situacao: 'plataforma', origem: '006' },
  { id: 'conectar', titulo: 'Conectar', texto: 'Estoque, viagens, entregas e devoluções no mesmo histórico, sem redigitar prancheta em planilha.', icone: 'rota', situacao: 'plataforma', origem: '008' },
  { id: 'monitorar', titulo: 'Monitorar', texto: 'A geocerca do cliente marca a área autorizada. A entrega já registra a posição; o alerta de saída da área entra no piloto.', icone: 'geocerca', situacao: 'piloto', origem: '009' },
  { id: 'proteger', titulo: 'Proteger', texto: 'Uma trava junto à válvula bloqueia o volante no transporte e só libera no destino autorizado.', icone: 'bloqueio', situacao: 'piloto' },
];

// A jornada do cilindro, da saída ao retorno (roteiro do pitch, 3:30 a 4:45). Cada etapa diz se já está na plataforma ou no piloto.
export type GrupoDaJornada = 'preparar' | 'entregar' | 'proteger';

export interface EtapaDaJornada {
  ordem: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  grupo: GrupoDaJornada;
  titulo: string;
  texto: string;
  icone: IconName;
  situacao: SituacaoNaSolucao;
  origem?: SpecDeOrigem;
}

export const JORNADA: readonly EtapaDaJornada[] = [
  { ordem: 1, grupo: 'preparar', titulo: 'Cadastro no estoque', texto: 'O cilindro é cadastrado e associado a um QR Code, Data Matrix ou identificador NFC.', icone: 'armazem', situacao: 'plataforma', origem: '006' },
  { ordem: 2, grupo: 'preparar', titulo: 'Planejamento da viagem', texto: 'O gestor escolhe veículo, motorista, clientes, paradas e os cilindros de cada local.', icone: 'mapa', situacao: 'plataforma', origem: '008' },
  { ordem: 3, grupo: 'preparar', titulo: 'Carregamento conferido', texto: 'Cada cilindro é conferido individualmente. Ele só participa de uma viagem aberta por vez: o servidor impede a duplicidade.', icone: 'verificado', situacao: 'plataforma', origem: '008' },
  { ordem: 4, grupo: 'entregar', titulo: 'Em trânsito e bloqueado', texto: 'Na saída, o cilindro passa a "em trânsito" e fica reservado e bloqueado no sistema até a entrega.', icone: 'caminhao', situacao: 'plataforma', origem: '008' },
  { ordem: 5, grupo: 'entregar', titulo: 'Entrega com evidência', texto: 'O motorista identifica o cilindro e registra horário, recebedor, local e resultado. A liberação é um registro próprio, separado da entrega.', icone: 'entrega', situacao: 'plataforma', origem: '009' },
  { ordem: 6, grupo: 'proteger', titulo: 'Permanência na geocerca', texto: 'Se o cilindro sair da área autorizada do cliente, a ocorrência gera alerta e a trava pode voltar ao bloqueio seguro.', icone: 'geocerca', situacao: 'piloto' },
  { ordem: 7, grupo: 'proteger', titulo: 'Retorno ao estoque', texto: 'A devolução também fica registrada. A jornada inteira é rastreável, da saída ao retorno.', icone: 'historico', situacao: 'plataforma', origem: '008' },
];

// Os três trechos da jornada (crítica de 14/10/2026: sete colunas passavam do limite de quatro itens por decisão). `estado` é a posição do
// C-262 na lista de estados do cartão de rastreio (TEXTOS.jornada.c262.estados) enquanto a pessoa lê aquele trecho.
export interface TrechoDaJornada {
  id: GrupoDaJornada;
  titulo: string;
  resumo: string;
  estado: number;
}

export const TRECHOS_DA_JORNADA: readonly TrechoDaJornada[] = [
  { id: 'preparar', titulo: 'Preparar', resumo: 'No estoque, antes de sair.', estado: 0 },
  { id: 'entregar', titulo: 'Entregar', resumo: 'Na rua, até o cliente.', estado: 2 },
  { id: 'proteger', titulo: 'Proteger e voltar', resumo: 'No cliente e na volta.', estado: 3 },
];

// Equipe do FluxID, como na apresentação do projeto (IntegraSENAI). Nomes, funções e fotos publicados por decisão da pessoa responsável em
// 14/10/2026; a autorização de cada integrante fica registrada em validation.md antes da publicação.
export interface IntegranteDaEquipe {
  id: string;
  nome: string;
  funcao: string;
  formacao: readonly string[];
  foto: string;
}

export const EQUIPE: readonly IntegranteDaEquipe[] = [
  { id: 'nata-baracho', nome: 'Natã Baracho', funcao: 'Engenheiro de software (backend)', formacao: ['Tecnólogo em Petróleo e Gás', 'Técnico em Desenvolvimento de Sistemas', 'Estudante de Engenharia de Software'], foto: '/landing/equipe/nata-baracho.webp' },
  { id: 'carlos-augusto', nome: 'Carlos Augusto', funcao: 'Gestor de produto', formacao: ['Bacharel em Engenharia de Produção', 'Técnico em Desenvolvimento de Sistemas'], foto: '/landing/equipe/carlos-augusto.webp' },
  { id: 'john-walter', nome: 'John Walter', funcao: 'Desenvolvedor frontend e mobile', formacao: ['Técnico em Desenvolvimento de Sistemas'], foto: '/landing/equipe/john-walter.webp' },
  { id: 'simao-bastos', nome: 'Simão Bastos', funcao: 'Engenheiro de IoT e prototipação física', formacao: ['Técnico em Desenvolvimento de Sistemas'], foto: '/landing/equipe/simao-bastos.webp' },
  { id: 'kauan-evangelista', nome: 'Kauan Evangelista', funcao: 'UI designer', formacao: ['Técnico em Desenvolvimento de Sistemas'], foto: '/landing/equipe/kauan-evangelista.webp' },
  { id: 'alisson-almeida', nome: 'Alisson Almeida', funcao: 'Mentor e orientador de inovação e tecnologia', formacao: ['Tecnólogo em Análise e Desenvolvimento de Sistemas', 'Especialização em Inteligência Artificial', 'MBA em Gestão de Projetos'], foto: '/landing/equipe/alisson-almeida.webp' },
];

// Logos institucionais (pedido da pessoa responsável em 15/10/2026), recortadas da folha enviada por ela com
// scripts/landing/recortar-logos-senai.mjs. Largura e altura são as do recorte, para a página não saltar enquanto a imagem carrega.
export interface LogoInstitucional {
  id: string;
  nome: string;
  arquivo: string;
  largura: number;
  altura: number;
}

export const INSTITUICOES: readonly LogoInstitucional[] = [
  { id: 'senai-ceara', nome: 'SENAI Ceará', arquivo: '/landing/instituicoes/senai-ceara.webp', largura: 289, altura: 112 },
  { id: 'saga-senai-inovacao', nome: 'Saga SENAI de Inovação', arquivo: '/landing/instituicoes/saga-senai-inovacao.webp', largura: 516, altura: 175 },
  { id: 'integra-senai', nome: 'Integra SENAI', arquivo: '/landing/instituicoes/integra-senai.webp', largura: 317, altura: 141 },
  { id: 'oxigenio-cariri', nome: 'Oxigênio Cariri', arquivo: '/landing/instituicoes/oxigenio-cariri.webp', largura: 227, altura: 42 },
];

// Marcos do projeto (linha do tempo da apresentação). Metas de longo prazo não entram (decisão de 14/10/2026). Um marco com data marcada
// que ainda não aconteceu fica "agendado", com selo em texto (crítica de 15/10/2026: a validação do protótipo aparecia como cumprida antes
// de acontecer); depois de realizado, a equipe o troca para "cumprido" (a data não basta para dar um marco como cumprido).
export type SituacaoDoMarco = 'cumprido' | 'agendado';

export interface MarcoDoProjeto {
  data: string;
  // Último dia, quando o marco dura mais de um dia.
  fim?: string;
  rotulo: string;
  texto: string;
  situacao: SituacaoDoMarco;
}

export const MARCOS: readonly MarcoDoProjeto[] = [
  { data: '2026-07-01', rotulo: '1º jul. 2026', texto: 'Fundação da FluxID', situacao: 'cumprido' },
  { data: '2026-07-09', rotulo: '9 jul. 2026', texto: 'Validação da ideia', situacao: 'cumprido' },
  { data: '2026-10-20', fim: '2026-10-22', rotulo: '20 a 22 out. 2026', texto: 'Validação do protótipo', situacao: 'agendado' },
];

// Planos e investimento (pedido de 16/10/2026): a contratação é uma assinatura mensal recorrente mais uma taxa única de implantação, as
// duas calculadas pelo tamanho da operação. Valores de referência, em reais, informados pela equipe; a página só os formata (formatarReais)
// e diz que são referência. Acima de 600 cilindros o plano é personalizado, sem valor na página.
export interface PlanoDeAssinatura {
  id: string;
  nome: string;
  faixa: string;
  // Limite de cilindros da faixa; null no plano personalizado.
  ateCilindros: number | null;
  implantacao: number | null;
  mensalidade: number | null;
}

export const PLANOS: readonly PlanoDeAssinatura[] = [
  { id: 'ate-250', nome: 'Operação inicial', faixa: 'Até 250 cilindros', ateCilindros: 250, implantacao: 3500, mensalidade: 2000 },
  { id: 'ate-600', nome: 'Operação em crescimento', faixa: 'Até 600 cilindros', ateCilindros: 600, implantacao: 7000, mensalidade: 4000 },
  { id: 'sob-medida', nome: 'Operação sob medida', faixa: 'Acima de 600 cilindros', ateCilindros: null, implantacao: null, mensalidade: null },
];

export type TemaDaSecao = 'escuro' | 'claro';

export interface SecaoDaLanding {
  id: string;
  titulo: string;
  tema: TemaDaSecao;
  // Rótulo curto no menu do cabeçalho; sem ele a seção não aparece no menu.
  menu?: string;
}

// Ordem das seções da página (RF-005), na sequência do pitch. A abertura é sempre escura (decisão de 13/10/2026). Depois da crítica de
// 14/10/2026: a trava vem logo após a solução, como segundo pico, e o que a plataforma já entrega fica num bloco só. Na segunda crítica do
// mesmo dia, a página encurtou: o pitch completo vem logo depois do prejuízo, a jornada passou a fazer parte da solução e a faixa só de vídeos
// saiu (cada vídeo foi para a seção que ele comprova).
export const SECOES: readonly SecaoDaLanding[] = [
  { id: 'inicio', titulo: 'FluxID', tema: 'escuro' },
  { id: 'historia', titulo: 'O cilindro que desapareceu', tema: 'claro', menu: 'A história' },
  { id: 'prejuizo', titulo: 'O tamanho do prejuízo', tema: 'escuro' },
  { id: 'causa', titulo: 'Por que isso acontece', tema: 'claro' },
  { id: 'solucao', titulo: 'A solução', tema: 'claro' },
  { id: 'trava', titulo: 'A trava física inteligente', tema: 'escuro', menu: 'Trava' },
  { id: 'funcionalidades', titulo: 'O que já funciona', tema: 'escuro' },
  { id: 'piloto', titulo: 'Operação piloto', tema: 'claro', menu: 'Piloto' },
  { id: 'planos', titulo: 'Planos e investimento', tema: 'claro', menu: 'Planos' },
  { id: 'equipe', titulo: 'Quem faz o FluxID', tema: 'claro' },
  { id: 'materiais', titulo: 'Materiais do projeto', tema: 'claro', menu: 'Materiais' },
  { id: 'pitch', titulo: 'O pitch, do começo ao fim', tema: 'claro', menu: 'Pitch' },
  { id: 'chamada-final', titulo: 'Quanto ainda custa continuar sem rastrear cada cilindro?', tema: 'escuro' },
];

// Telas reais do sistema (RF-013), capturadas do aplicativo com o backend simulado por tests/e2e/landing-telas.gerar.spec.ts. Os dados são
// FICTÍCIOS (cliente, unidade, motorista, placa e código de cilindro de exemplo), e a página sempre os marca "Exemplo". Refazer as capturas é
// rodar o gerador; nada aqui vem de cliente real. Esta é a fonte substituível dessas imagens.
export interface TelaCapturada {
  id: 'viagem-desktop' | 'campo-celular';
  arquivo: string;
  largura: number;
  altura: number;
  dispositivo: 'computador' | 'celular';
  titulo: string;
  alt: string;
}

export const TELAS: readonly TelaCapturada[] = [
  {
    id: 'viagem-desktop',
    arquivo: '/landing/telas/tela-viagem-desktop.webp',
    largura: 1920,
    altura: 1200,
    dispositivo: 'computador',
    titulo: 'No escritório, a entrega chega com quem recebeu, quando e onde',
    alt: 'Tela do FluxID no computador: a parada 1 de uma viagem entregue, com o recebedor, o horário, a posição lida pelo GPS dentro da geocerca e o cilindro no cliente. Dados de exemplo.',
  },
  {
    id: 'campo-celular',
    arquivo: '/landing/telas/tela-campo-celular.webp',
    largura: 780,
    altura: 1688,
    dispositivo: 'celular',
    titulo: 'Em campo, o mesmo registro no celular da motorista',
    alt: 'Tela do FluxID no celular: a mesma parada entregue, com o recebedor, a posição dentro da geocerca e os botões para acrescentar foto ou assinatura. Dados de exemplo.',
  },
];

// Prévia ilustrada da fila de envio sem sinal (Spec 010): desenhada com o visual do sistema, com dados de EXEMPLO e marcada "Exemplo".
export interface PreviaDeFila {
  titulo: string;
  descricao: string;
  itens: Array<{ texto: string; estado: 'Aguardando sinal' | 'Enviado' }>;
}

export const PREVIAS: { fila: PreviaDeFila } = {
  fila: {
    titulo: 'Fila de envio',
    descricao: 'Ilustração da fila de envio sem sinal: duas operações aguardando e uma já enviada.',
    itens: [
      { texto: 'Conferência do cilindro EX-000103', estado: 'Aguardando sinal' },
      { texto: 'Chegada na parada 2', estado: 'Aguardando sinal' },
      { texto: 'Entrega na parada 1', estado: 'Enviado' },
    ],
  },
};

// Valores de referência do prejuízo (roteiro do pitch, 1:00 a 2:00), levantados com a empresa onde o piloto começa. A página calcula os
// totais a partir destes valores (prejuizo.ts); nenhum total é digitado à mão. É a única fonte de valor em reais da página.
export const PREJUIZO: { fonte: string; ano: number; perdidosNoAno: number; custos: readonly CustoPorCapacidade[] } = {
  fonte: 'Estimativa feita com as informações levantadas com a Oxigênio Cariri.',
  ano: 2025,
  perdidosNoAno: 130,
  custos: [
    { capacidade: '1 m³', valor: 2800 },
    { capacidade: '7 m³', valor: 4000 },
    { capacidade: '10 m³', valor: 4500 },
  ],
};

export interface PilarDaProposta {
  id: string;
  titulo: string;
  texto: string;
  icone: IconName;
}

// Cena da história do C-262 (roteiro do pitch, 0:00 a 1:00). O código do cilindro é o do roteiro, fictício.
export interface CenaDaHistoria {
  hora: string;
  texto: string;
  icone: IconName;
}

// Textos de cada bloco da página, agrupados para a equipe revisar em um só lugar.
export const TEXTOS = {
  marca: { nome: 'FluxID', lema: 'Rastreabilidade que protege. Inteligência que conecta.' },
  abertura: {
    titulo: 'Saiba onde está cada cilindro.',
    gancho: 'Às 06:30, o C-262 saiu para um hospital. Horas depois, ninguém conseguia dizer onde ele estava.',
    subtitulo:
      'O FluxID conecta identificação, rastreio e trava inteligente para transformar cada movimentação em evidência — no computador e no celular, mesmo sem sinal.',
    acaoPrincipal: 'Assistir ao pitch',
    acaoSecundaria: 'Ver a trava funcionando',
    rolar: 'Conheça a história do cilindro C-262',
    cartao: {
      titulo: 'Cilindro C-262',
      detalhe: 'Oxigênio medicinal · 7 m³',
      estados: ['Conferido na saída', 'Em trânsito, trava ativa', 'Entregue com evidência'],
    },
  },
  historia: {
    titulo: 'O cilindro que desapareceu',
    introducao: 'Um hospital da região precisa receber cilindros de oxigênio para manter os atendimentos.',
    cenas: [
      { hora: '06:30', texto: 'Na distribuidora, a equipe separa a carga, faz a conferência e coloca os cilindros no caminhão. Entre eles está o C-262.', icone: 'armazem' },
      { hora: '06:45', texto: 'A saída do C-262 é anotada em uma prancheta. Mais tarde, alguém vai interpretar a anotação e passá-la para uma planilha.', icone: 'relatorios' },
      { hora: '07:00', texto: 'O caminhão inicia a rota.', icone: 'caminhao' },
      { hora: 'Horas depois', texto: 'Surge uma pergunta aparentemente simples.', icone: 'alerta' },
    ] satisfies CenaDaHistoria[],
    pergunta: 'Onde está o cilindro C-262?',
    duvidas: ['Foi entregue ao cliente certo?', 'Foi trocado com outro cilindro?', 'Ficou no caminhão?', 'Quem recebeu e quando volta?'],
    conclusao:
      'Quando as respostas estão divididas entre papel, memória e planilhas, uma pergunta simples pode representar a perda de um patrimônio de milhares de reais.',
  },
  prejuizo: {
    titulo: 'O tamanho do prejuízo',
    introducao: 'O C-262 não é um caso isolado. A distribuidora trabalha com cilindros de capacidades diferentes, e cada um é patrimônio.',
    rotuloCustos: 'Patrimônio por capacidade de cilindro',
    rotuloFonte: 'Fonte dos números',
    rotuloMedio: 'Patrimônio médio por cilindro',
    rotuloPerdidos: 'cilindros perdidos',
    ritmo: 'Quase 11 por mês. Praticamente um cilindro a cada três dias.',
    rotuloMes: 'de prejuízo estimado por mês',
    rotuloAno: 'de prejuízo estimado por ano',
    ressalva:
      'E esse valor considera só o cilindro. Não inclui o gás, o transporte, a mão de obra, o tempo de procura, a reposição e a receita de aluguel que deixa de entrar.',
  },
  causa: {
    titulo: 'Por que isso acontece',
    introducao: 'Não é falta de esforço da equipe. O problema está em um processo fragmentado.',
    etapas: [
      { id: 'prancheta', titulo: 'Prancheta', texto: 'As movimentações são anotadas à mão, na correria da expedição.' },
      { id: 'planilha', titulo: 'Planilha', texto: 'Depois, alguém interpreta e redigita tudo. Retrabalho e espaço para erro.' },
      { id: 'memoria', titulo: 'Memória', texto: 'Quando um cilindro não volta, a equipe reconstrói o caminho dele de cabeça.' },
    ],
    efeitos: ['Registros incompletos', 'Erros de identificação', 'Divergências no estoque', 'Trocas indevidas'],
    pergunta: 'E se cada cilindro pudesse contar a própria história?',
  },
  solucao: {
    titulo: 'Uma plataforma e uma trava, trabalhando juntas',
    introducao:
      'O FluxID combina uma plataforma digital com uma trava física inteligente para identificar, acompanhar e proteger cilindros de gases medicinais e industriais. O C-262 deixa de ser uma anotação: ganha uma trajetória digital própria.',
  },
  jornada: {
    titulo: 'Da saída ao retorno',
    introducao: 'O caminho do cilindro, etapa por etapa. Cada passo deixa evidência.',
    c262: {
      titulo: 'Cilindro C-262',
      detalhe: 'Oxigênio medicinal · 7 m³',
      estados: ['Conferido na saída', 'Em trânsito, bloqueado', 'Entregue com evidência', 'De volta ao estoque'],
    },
    regrasTitulo: 'Regras que protegem o registro',
    regrasAbrir: 'Ver as 4 regras',
    regras: [
      'Um cilindro só participa de uma viagem aberta por vez.',
      'Cilindro não entregue exige justificativa e continua em trânsito até uma decisão registrada.',
      'Correção não apaga o registro original: cria um novo, com justificativa.',
      'Entrega e liberação são registros separados, com quem fez e quando.',
    ],
  },
  trava: {
    titulo: 'A trava física inteligente',
    introducao:
      'Um dispositivo instalado junto à válvula, sem alterar a estrutura principal do cilindro. Um anel com doze aberturas fica abaixo do volante; o pino do solenoide avança, encaixa em uma delas e impede o volante de girar.',
    selo: 'Protótipo em validação no piloto',
    rotuloEstados: 'Veja a trava em cada momento',
    pausarTroca: 'Pausar a troca automática dos momentos',
    retomarTroca: 'Retomar a troca automática dos momentos',
    estados: [
      { id: 'transporte', rotulo: 'No transporte', titulo: 'Travado', texto: 'Durante o transporte, o pino fica encaixado no anel e o volante não gira.' },
      { id: 'destino', rotulo: 'No destino', titulo: 'Liberado', texto: 'No destino autorizado, a plataforma valida a entrega e comanda a liberação.' },
      { id: 'geocerca', rotulo: 'Fora da geocerca', titulo: 'Bloqueio seguro', texto: 'Se o cilindro sair da área autorizada, o FluxID registra a violação, emite o alerta e realiza o bloqueio da válvula novamente.' },
    ],
    componentesTitulo: 'O que vai dentro',
    componentesContagem: '6 componentes',
    componentes: ['ESP32-C3', 'Comunicação móvel', 'GPS', 'NFC', 'Sensor de violação', 'Bateria de longa duração'],
    segurancaTitulo: 'Segurança em primeiro lugar',
    seguranca: [
      'Não interfere no controle de vazão nem impede um procedimento de emergência.',
      'O acionamento depende do estado seguro do equipamento, de autorização registrada e das regras homologadas com a empresa.',
      'A trava só é dada como executada quando o próprio dispositivo confirma, e a confirmação fica registrada.',
    ],
  },
  pitch: {
    titulo: 'O pitch, do começo ao fim',
    introducao: 'A história do C-262 contada pela equipe: os problemas enfrentados e as soluções propostas pelo FluxID. O vídeo toca aqui mesmo.',
    verMateriais: 'Ver todos os materiais do projeto',
  },
  video: {
    assistir: 'Assistir',
    voltarACapa: 'Fechar o vídeo',
    capaSistema: 'A plataforma em uso',
    capaFisico: 'A trava em ação',
    demorou: 'O vídeo está demorando para carregar. Se não abrir, assista direto no YouTube.',
    abrirNoYoutube: 'Abrir no YouTube',
  },
  funcionalidades: {
    titulo: 'O que já funciona',
    introducao: 'A plataforma já roda em computadores, tablets e celulares, inclusive sem sinal. Estas são telas reais, com dados de exemplo.',
    telasTitulo: 'Uma entrega. A mesma evidência em cada tela.',
    telasRotulo: 'O que as telas comprovam',
    acaoVideo: 'Assistir ao protótipo do sistema em ação',
  },
  piloto: {
    titulo: 'Operação piloto e modelo de negócio',
    introducao: 'Uma proposta de valor clara e um plano objetivo para começar.',
    valorTitulo: 'O que a empresa ganha',
    valor: ['Reduzir perdas', 'Eliminar a redigitação', 'Diminuir erros', 'Agilizar a conferência', 'Evitar trocas indevidas', 'Facilitar a auditoria'],
    simuladorTitulo: 'Simulação do patrimônio preservado',
    simuladorSelo: 'Estimativa',
    simuladorRotulo: 'Perdas evitadas no ano',
    simuladorBase: 'Patrimônio médio por cilindro',
    simuladorResultado: 'em patrimônio que deixaria de ser perdido',
    simuladorRessalva: 'Hipótese para o piloto medir, não resultado. Considera só o valor do cilindro e as perdas levantadas em',
    etapasRotulo: 'Plano de execução',
    etapasTitulo: 'Como começamos',
    etapasIntroducao: 'Três fases progressivas para validar em campo, medir os ganhos e ampliar sem riscos.',
    etapas: [
      { id: 'lote', fase: 'Fase 1 · Implantação', foco: 'Oxigênio Cariri', titulo: 'Lote controlado', texto: 'Implantação assistida na Oxigênio Cariri: cadastro, estoque, viagens, conferência, entregas, geocercas e auditoria. A trava é validada em um lote controlado.' },
      { id: 'medir', fase: 'Fase 2 · Validação', foco: 'Métricas e auditoria', titulo: 'Medir', texto: 'Redução de perdas, tempo de conferência e confiabilidade dos registros.' },
      { id: 'ampliar', fase: 'Fase 3 · Escala', foco: 'Outros setores', titulo: 'Ampliar', texto: 'Com os resultados, a operação cresce, e o modelo atende distribuidoras de gases, hospitais, indústrias e outros negócios com ativos retornáveis.' },
    ],
    foco: 'Foco',
  },
  planos: {
    titulo: 'Planos e investimento',
    introducao: 'Uma assinatura mensal recorrente e uma taxa única de implantação, as duas calculadas pelo tamanho da operação.',
    modeloRotulo: 'Como o FluxID é contratado',
    implantacaoRotulo: 'Taxa de implantação',
    implantacaoNota: 'Pagamento único, no início',
    implantacaoTexto: 'Configuração, cadastro inicial, treinamento da equipe, acompanhamento e indicadores de resultado.',
    assinaturaRotulo: 'Assinatura da plataforma',
    assinaturaNota: 'Recorrente, todo mês',
    assinaturaTexto: 'Uso da plataforma no escritório e no celular de campo, enquanto a operação estiver ativa.',
    faixasRotulo: 'Pelo tamanho da operação',
    assinatura: 'Assinatura',
    porMes: '/mês',
    implantacao: 'Implantação',
    unico: 'pagamento único',
    personalizado: 'Sob consulta',
    personalizadoTexto: 'Implantação e assinatura dimensionadas para o tamanho e a rotina da operação.',
    cta: 'Falar sobre o plano',
    referencia: 'Valores de referência, em reais. A proposta considera a quantidade de cilindros, o número de usuários, os recursos contratados e os dispositivos instalados.',
  },
  equipe: {
    titulo: 'Quem faz o FluxID',
    introducao: 'Uma equipe formada no Integra SENAI, do backend à trava física.',
    integrantesTitulo: 'Integrantes',
    formacao: 'Formação',
    marcosTitulo: 'Marcos do projeto',
    cumprido: 'Concluído',
    agendado: 'Agendado',
    instituicoes: 'Instituições do projeto',
  },
  materiais: {
    titulo: 'Materiais do projeto',
    introducao: 'Documentos, código e evidências, em um só lugar. Os vídeos tocam nas próprias seções, e o canal reúne todos eles.',
    blocos: [
      { id: 'comecar', titulo: 'Comece por aqui', materiais: ['documentos'] },
      { id: 'codigo', titulo: 'Código e evidências', materiais: ['repositorio-sistema', 'repositorio-api', 'evidencias', 'canal-youtube'] },
    ],
    externo: 'Abre em nova aba',
    precisaConexao: 'Precisa de conexão',
  },
  chamadaFinal: {
    titulo: 'Quanto ainda custa continuar sem rastrear cada cilindro?',
    texto:
      'Com o FluxID, a pergunta "onde está o C-262?" passa a ter resposta com evidências: quando saiu, em qual veículo, para onde ia, quem registrou a entrega e quando voltou.',
    frase: 'Vamos transformar cada cilindro em um ativo protegido.',
    acaoPrincipal: 'Assistir ao pitch',
    respostaTitulo: 'A resposta, com evidências',
    // Dados fictícios, sempre marcados "Exemplo": o horário de saída é o do pitch; o resto é ilustrativo.
    resposta: [
      { rotulo: 'Saída', valor: '06:30, conferido item a item' },
      { rotulo: 'Veículo', valor: 'ABC-1234' },
      { rotulo: 'Destino', valor: 'Hospital Exemplo' },
      { rotulo: 'Recebido por', valor: 'Responsável do hospital, 09:40' },
      { rotulo: 'Retorno', valor: 'Devolvido ao estoque, 16:10' },
    ],
  },
  // Próximo passo de quem decide (crítica de 15/10/2026): o e-mail da equipe, informado pela pessoa responsável.
  contato: {
    acao: 'Quero conversar sobre um piloto',
    email: 'fluxid2026@gmail.com',
    assunto: 'Piloto do FluxID',
    alternativa: 'ou escreva para',
  },
  rodape: {
    identificacao: 'FluxID — Plataforma de Identidade e Rastreabilidade.',
    nota: 'Projeto em desenvolvimento. Os dados mostrados nas ilustrações são de exemplo; a trava física está em protótipo.',
  },
} as const;
