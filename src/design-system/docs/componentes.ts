import type { DocumentacaoDeComponente } from './tipos';

// Documentação dos componentes base (RF-011, CA-010). Os estados de interface (Loading, EmptyState, ErrorState,
// SyncStatus) e os utilitários ficam em estados.ts; ícones e logotipo, em marca.ts.
export const documentacaoDosComponentes: readonly DocumentacaoDeComponente[] = [
  {
    nome: 'Button',
    descricao: 'Botão de ação com três variantes, alvo de toque de 44 px e estados de foco, desabilitado e carregando.',
    variantes: ['primario', 'secundario', 'perigoso'],
    estados: ['normal', 'hover', 'foco', 'desabilitado', 'carregando'],
    orientacaoDeUso:
      'Use uma ação primária por tela. O secundário serve a ações alternativas, e o perigoso a ações destrutivas, sempre com texto explícito. Durante o envio use "carregando" em vez de desabilitar, para o foco não se perder.',
    acessibilidade: [
      'É um button nativo; type="button" por padrão.',
      'Alvo mínimo de 44 por 44 px (min-h-alvo e min-w-alvo).',
      'Carregando mantém o botão focável, marca aria-busy e aria-disabled e ignora o clique.',
      'Rótulo com contraste de 4,5:1 ou mais em todas as variantes.',
      'Foco visível pelo anel de 3 px do estilo global.',
    ],
  },
  {
    nome: 'Field',
    descricao: 'Estrutura de rótulo, ajuda e erro associados a qualquer controle de formulário (compatível com o FormField da Spec 002).',
    variantes: ['com ajuda', 'com erro'],
    estados: ['padrao', 'erro'],
    orientacaoDeUso: 'Use para controles que não são campo de texto nem seletor, como a área de texto da justificativa. Campo de texto e seletor já a usam.',
    acessibilidade: [
      'Rótulo visível ligado ao controle por htmlFor.',
      'Ajuda e erro ligados por aria-describedby; o erro fica fora do rótulo e não compõe o nome acessível.',
      'O erro tem ícone e texto, nunca só cor.',
    ],
  },
  {
    nome: 'TextField',
    descricao: 'Campo de texto, e-mail, senha ou arquivo com rótulo visível, ajuda e erro.',
    variantes: ['text', 'email', 'password', 'file'],
    estados: ['padrao', 'foco', 'desabilitado', 'erro'],
    orientacaoDeUso:
      'Use um rótulo curto e claro, ajuda para formato esperado e uma mensagem de erro que diga como corrigir. Não use o placeholder no lugar do rótulo.',
    acessibilidade: [
      'Rótulo visível por label; aria-invalid reflete o erro.',
      'Ajuda e erro descrevem o campo por aria-describedby.',
      'Alvo de 44 px e borda de 3:1 de contraste (borda-controle).',
      'Erro com borda de erro, ícone e texto.',
    ],
  },
  {
    nome: 'Select',
    descricao: 'Seletor nativo com rótulo visível, ajuda e erro.',
    variantes: ['padrao'],
    estados: ['padrao', 'foco', 'desabilitado', 'erro'],
    orientacaoDeUso: 'Use para escolher uma opção de uma lista curta. Inclua uma opção inicial neutra quando a escolha for obrigatória.',
    acessibilidade: [
      'Seletor nativo: teclado e leitores de tela funcionam sem trabalho extra.',
      'Mesmas associações de rótulo, ajuda e erro do campo de texto.',
      'Alvo de 44 px.',
    ],
  },
  {
    nome: 'StatusBadge',
    descricao: 'Indicador de status com texto e ícone: ativo, conectado, pendente, bloqueado ou erro.',
    variantes: ['ativo', 'conectado', 'pendente', 'bloqueado', 'erro'],
    estados: ['padrao'],
    orientacaoDeUso: 'Use para a situação de um vínculo, organização ou conexão. O texto deve dizer a situação; a cor só reforça.',
    acessibilidade: [
      'Sempre texto visível; o ícone é decorativo (aria-hidden).',
      'Texto sobre o fundo de cada variante com 4,5:1 ou mais.',
    ],
  },
  {
    nome: 'Alert',
    descricao: 'Mensagem de informação, sucesso, alerta ou erro, com ícone e texto.',
    variantes: ['informacao', 'sucesso', 'alerta', 'erro'],
    estados: ['padrao'],
    orientacaoDeUso:
      'Use perto do que a mensagem explica. Sucesso só depois da confirmação do servidor. Erro diz o que houve e o que fazer.',
    acessibilidade: [
      'Erro usa role="alert" (anúncio imediato); as demais usam role="status".',
      'Ícone decorativo e texto em todas as variantes: a informação nunca depende só da cor.',
      'Texto sobre o fundo suave com 4,5:1 ou mais.',
    ],
  },
  {
    nome: 'Dialog',
    descricao: 'Diálogo modal que prende o foco, fecha com Escape e devolve o foco ao acionador.',
    variantes: ['confirmacao', 'formulario'],
    estados: ['aberto', 'conteudo longo'],
    orientacaoDeUso:
      'Use para confirmar ações sensíveis ou coletar dados curtos. Clicar fora não fecha, para não descartar ações por engano. Coloque as ações no rodapé.',
    acessibilidade: [
      'role="dialog" e aria-modal; o título anuncia o diálogo (aria-labelledby).',
      'Foco inicial no primeiro controle ou no indicado; Tab e Shift+Tab ficam dentro do diálogo.',
      'Escape fecha; o foco volta ao elemento que abriu.',
      'Conteúdo longo rola dentro do diálogo e as ações continuam alcançáveis.',
    ],
  },
  {
    nome: 'Card',
    descricao: 'Cartão com raio de 12 px, padding de 24 px, borda de 1 px e sombra suave.',
    variantes: ['informativo', 'indicador', 'alerta'],
    estados: ['padrao'],
    orientacaoDeUso: 'Agrupe conteúdo relacionado. Use "indicador" para um número ou métrica e "alerta" para algo que precisa de atenção.',
    acessibilidade: [
      'Pode ser section ou article para criar regiões nomeadas (aria-label).',
      'Texto do cartão de alerta com 4,5:1 sobre o fundo de alerta.',
    ],
  },
  {
    nome: 'List',
    descricao: 'Lista semântica simples ou em cartões.',
    variantes: ['simples', 'cartoes'],
    estados: ['padrao'],
    orientacaoDeUso: 'Use para conjuntos curtos de itens do mesmo tipo. Em cartões, cada item ganha o padrão de card. Nomes longos quebram sem estourar.',
    acessibilidade: ['O papel list é explícito, para preservar a semântica mesmo sem marcadores.', 'Itens com min-w-0 e quebra de palavra: nenhum conteúdo causa rolagem horizontal.'],
  },
  {
    nome: 'ListItem',
    descricao: 'Item de uma lista; assume a aparência da variante da lista que o contém.',
    variantes: ['simples', 'cartoes'],
    estados: ['padrao'],
    orientacaoDeUso: 'Use sempre dentro de uma List. Coloque ações dentro do item como botões com alvo de 44 px.',
    acessibilidade: ['É um li dentro de uma lista com papel list.'],
  },
  {
    nome: 'FormSection',
    descricao: 'Seção de formulário longo na mesma página, com fieldset e legend.',
    variantes: ['padrao'],
    estados: ['padrao'],
    orientacaoDeUso: 'Divida formulários longos em seções com títulos claros e mantenha um único envio. Não crie etapas de avançar e voltar.',
    acessibilidade: ['fieldset com legend: o grupo é anunciado com o nome da seção.', 'A descrição opcional descreve o grupo (aria-describedby).'],
  },
  {
    nome: 'DataTable',
    descricao: 'Tabela de dados que vira cartões em largura estreita, na mesma árvore de elementos.',
    variantes: ['tabela', 'cartoes em largura estreita'],
    estados: ['padrao', 'carregando', 'vazio'],
    orientacaoDeUso:
      'Use para registros com várias colunas. Marque a coluna que identifica a linha como cabeçalho da linha. Ações ficam em uma coluna própria, com botões de 44 px.',
    acessibilidade: [
      'Legenda (caption) dá o nome da tabela; cabeçalhos com scope e papéis explícitos preservam a semântica quando o CSS troca o display.',
      'Cada célula tem data-label com o nome da coluna, exibido nos cartões; nenhuma informação ou ação se perde.',
      'Sem segunda árvore para mobile: cada linha aparece uma única vez para leitores de tela.',
      'Estado vazio e carregando reaproveitam EmptyState e Loading.',
    ],
  },
];
