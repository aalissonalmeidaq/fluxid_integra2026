import type { DocumentacaoDeComponente } from './tipos';

// Documentação do shell da aplicação (RF-011, RF-012 a RF-015). O shell vive em src/app/shell/ e não é exportado pelo
// design system; esta documentação só descreve a anatomia e os estados para o catálogo.
export const documentacaoDoShell: readonly DocumentacaoDeComponente[] = [
  {
    nome: 'AppShell',
    descricao: 'Estrutura única de toda tela: link de pular, cabeçalho, barra de conexão, conteúdo principal e rodapé.',
    variantes: ['deslogado', 'autenticado'],
    estados: ['online', 'offline', 'sincronizando'],
    orientacaoDeUso:
      'Envolve a rota já decidida e nunca decide permissão. Deslogado não mostra dado de organização; autenticado mostra organização ativa, perfil e sair. Em 360 px o cabeçalho quebra em linhas sem rolagem horizontal.',
    acessibilidade: [
      'O link "Pular para o conteúdo principal" é o primeiro item da ordem de Tab e leva o foco ao main.',
      'Um único landmark main, com id main-content e tabindex -1, e um único h1 (o logotipo no cabeçalho).',
      'A barra de conexão anuncia a perda de rede como status e oferece o botão de reconectar também na entrada.',
      'O idioma do documento é pt-BR.',
    ],
  },
];
