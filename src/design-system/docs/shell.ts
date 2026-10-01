import type { DocumentacaoDeComponente } from './tipos';

// Documentação do shell da aplicação (RF-011, RF-012 a RF-015 da Spec 003; RF-005 a RF-020 da Spec 004). O shell vive em
// src/app/shell/ e não é exportado pelo design system; esta documentação só descreve a anatomia e os estados para o catálogo.
export const documentacaoDoShell: readonly DocumentacaoDeComponente[] = [
  {
    nome: 'AppShell',
    descricao: 'Estrutura única de toda tela: link de pular, cabeçalho, barra de conexão, menu de navegação, conteúdo principal e rodapé.',
    variantes: ['deslogado', 'autenticado', 'menu recolhido (menos de 768 px)', 'menu fixo (768 px ou mais)'],
    estados: ['online', 'offline', 'sincronizando'],
    orientacaoDeUso:
      'Envolve a rota já decidida e nunca decide permissão. Deslogado não mostra dado de organização nem menu; autenticado mostra organização ativa, sair e o menu (o perfil fica no menu). Em 360 px o cabeçalho quebra em linhas sem rolagem horizontal.',
    acessibilidade: [
      'O link "Pular para o conteúdo principal" é o primeiro item da ordem de Tab e leva o foco ao main.',
      'Um único landmark main, com id main-content e tabindex -1, e um único h1 (o logotipo no cabeçalho).',
      'A barra de conexão anuncia a perda de rede como status e oferece o botão de reconectar também na entrada.',
      'O idioma do documento é pt-BR.',
      'O menu fica ao lado do main, fora dele, e o botão do menu entra depois do link de pular na ordem de Tab.',
    ],
  },
  {
    nome: 'NavigationMenu',
    descricao: 'Menu de navegação do shell: mostra só as telas que as permissões confirmadas pelo servidor liberam para a pessoa.',
    variantes: ['coluna fixa (768 px ou mais)', 'painel recolhido sob o cabeçalho (menos de 768 px)'],
    estados: ['pronto', 'carregando', 'erro com "Tentar de novo"', 'offline com as últimas telas', 'offline sem cache', 'item atual', 'foco'],
    orientacaoDeUso:
      'É conveniência de interface, nunca barreira: esconder um item não protege nada, e o servidor decide o acesso a cada tela. Início e Meu perfil aparecem sempre que há sessão; os demais só depois da confirmação do servidor. Sem sessão, ou com a sessão limitada à verificação em duas etapas, o menu não existe. Ao trocar de organização ou de pessoa, os itens anteriores somem antes do novo contexto aparecer.',
    acessibilidade: [
      'É um nav com o nome acessível "Navegação principal", com lista, itens e links; um só landmark main na página.',
      'O item atual usa aria-current="page", o texto "(página atual)" para tecnologia assistiva e uma barra lateral com peso de fonte, nunca só a cor.',
      'Cada item tem alvo mínimo de 44 por 44 px, anel de foco de 3:1 ou mais e quebra texto longo dentro do próprio item, sem rolagem horizontal de 320 a 1920 px.',
      'Abrir leva o foco ao primeiro item; Escape e o toque ou clique fora do painel aberto o fecham e devolvem o foco ao botão; ativar um item leva o foco ao título da tela de destino.',
      'Carregamento, erro e offline usam uma única região de status, anunciada uma vez, sem mover o foco nem bloquear o teclado.',
      'Com movimento reduzido o menu não anima.',
    ],
  },
  {
    nome: 'MenuToggle',
    descricao: 'Botão "Menu" que abre e fecha o painel de navegação abaixo de 768 px.',
    variantes: ['fechado', 'aberto'],
    estados: ['foco', 'fechado', 'aberto'],
    orientacaoDeUso:
      'Entra à esquerda do logotipo, depois do link de pular. A partir de 768 px o menu é fixo e o botão deixa de existir.',
    acessibilidade: [
      'Informa se o painel está aberto por aria-expanded e aponta o painel por aria-controls.',
      'Tem alvo de 44 por 44 px e recebe o foco de volta quando o painel fecha por Escape ou por toque fora dele.',
    ],
  },
];
