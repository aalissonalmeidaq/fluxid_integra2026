import type { DocumentacaoDeComponente } from './tipos';

// Documentação dos estados de interface e dos utilitários de acessibilidade (RF-011, RF-021).
export const documentacaoDosEstados: readonly DocumentacaoDeComponente[] = [
  {
    nome: 'Loading',
    descricao: 'Indicador de carregamento com texto, anunciado como região de status.',
    variantes: ['pagina', 'secao', 'botao'],
    estados: ['carregando'],
    orientacaoDeUso:
      'Use quando a tela ou a seção espera dados. Informe sempre um texto que diga o que está sendo carregado. Prefira a variante "botao" dentro de ações que enviam dados.',
    acessibilidade: [
      'role="status" com aria-live="polite": anunciado uma vez, sem mover o foco.',
      'Não captura o foco nem usa aria-modal: o teclado continua livre.',
      'O giro só existe sem a preferência por movimento reduzido (motion-safe).',
    ],
  },
  {
    nome: 'EmptyState',
    descricao: 'Estado vazio com título, orientação e a ação possível.',
    variantes: ['com ação', 'sem ação'],
    estados: ['padrao'],
    orientacaoDeUso:
      'Use quando uma consulta ou lista não retorna itens. Explique por que está vazio e ofereça o próximo passo. Não use para erros.',
    acessibilidade: [
      'Título em cabeçalho (nível configurável, 2 por padrão) que respeita a hierarquia da tela.',
      'A ação é um botão de 44 px com nome visível.',
    ],
  },
  {
    nome: 'ErrorState',
    descricao: 'Mensagem de erro de seção ou de tela, com ação de tentar de novo quando for recuperável.',
    variantes: ['recuperavel', 'sem-permissao'],
    estados: ['erro'],
    orientacaoDeUso:
      'Use para falhas de carregamento e de operação. "Sem permissão" mantém a mensagem de acesso negado da Spec 002 e não oferece nova tentativa.',
    acessibilidade: [
      'role="alert": anunciado de imediato.',
      'Sempre com texto e ícone; a cor nunca é o único indicador.',
      'Texto em erro sobre erro-fundo com 5,75:1 de contraste.',
    ],
  },
  {
    nome: 'SyncStatus',
    descricao: 'Estado de conexão e de sincronização: sincronizado, sincronizando, sem conexão e conflito.',
    variantes: ['sincronizado', 'sincronizando', 'offline', 'conflito'],
    estados: ['sincronizado', 'sincronizando', 'offline', 'conflito'],
    orientacaoDeUso:
      'Use na barra de conexão do shell e perto de dados que dependem de sincronização. Nunca mostre sucesso que o servidor não confirmou.',
    acessibilidade: [
      'role="status" com aria-live="polite": a mudança de estado é anunciada sem mover o foco.',
      'Texto e ícone em todos os estados; o ícone é decorativo (aria-hidden).',
      'Só o estado sincronizando gira, e sem animação com movimento reduzido.',
    ],
  },
  {
    nome: 'SkipLink',
    descricao: 'Link "Pular para o conteúdo principal", primeiro item da ordem de Tab.',
    variantes: ['padrao'],
    estados: ['padrao', 'foco'],
    orientacaoDeUso: 'Um por página, antes do cabeçalho. Aponta para o landmark principal (id main-content).',
    acessibilidade: [
      'Fica oculto até receber o foco; ao ativar, leva o foco ao conteúdo principal.',
      'O destino tem tabIndex -1 para poder receber o foco.',
    ],
  },
  {
    nome: 'VisuallyHidden',
    descricao: 'Texto disponível apenas para tecnologia assistiva.',
    variantes: ['padrao'],
    estados: ['padrao'],
    orientacaoDeUso: 'Use para dar contexto a leitores de tela sem ocupar espaço visual, por exemplo o nome de um ícone-botão.',
    acessibilidade: ['Mantém o texto na árvore de acessibilidade com a classe sr-only.'],
  },
];
