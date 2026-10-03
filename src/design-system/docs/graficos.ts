import type { DocumentacaoDeComponente } from './tipos';

// Documentação dos gráficos da Visão geral (Spec 005, RF-012, RF-013, RF-018). Os gráficos vivem em src/design-system/charts/.
export const documentacaoDosGraficos: readonly DocumentacaoDeComponente[] = [
  {
    nome: 'LineChart',
    descricao: 'Gráfico de linha em SVG próprio, sem biblioteca, para séries ao longo do tempo (por exemplo, entradas e saídas de cilindros por dia).',
    variantes: ['duas ou mais séries'],
    estados: ['padrao'],
    orientacaoDeUso: 'Sempre com título, descrição, eixos rotulados, legenda em texto e a tabela equivalente logo abaixo. Cores só dos tokens navy, azul-royal, ciano-acessivel e verde-acessivel (3:1 ou mais contra o branco).',
    acessibilidade: [
      'role="img" com título e descrição; a tabela traz os mesmos dados do desenho.',
      'Cada série tem traçado e marcador próprios: a informação nunca depende só da cor.',
      'Sem animação nem transição; a tabela rola dentro do bloco e recebe o foco do teclado.',
    ],
  },
  {
    nome: 'DonutChart',
    descricao: 'Rosca em SVG próprio com o total no centro, para a distribuição por categoria (por exemplo, cilindros por situação).',
    variantes: ['até quatro categorias'],
    estados: ['padrao'],
    orientacaoDeUso: 'A soma dos percentuais fecha 100%. A legenda traz valor e percentual em texto; a tabela equivalente acompanha o desenho.',
    acessibilidade: [
      'role="img" com título e descrição, legenda em texto e tabela equivalente.',
      'Cada fatia tem um padrão de preenchimento próprio (sólido, diagonal, pontos, horizontal), além da cor.',
      'Sem animação nem transição.',
    ],
  },
];
