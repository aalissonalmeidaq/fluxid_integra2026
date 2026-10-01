import type { DocumentacaoDeComponente } from './tipos';

// Documentação do sistema de ícones e do logotipo (RF-011, RF-024 a RF-029, MS-009).
export const documentacaoDaMarca: readonly DocumentacaoDeComponente[] = [
  {
    nome: 'Icon',
    descricao: 'Ícone do sistema FluxID: 30 ícones em cinco grupos, na grade de 24 por 24 px com traço de 2 px e terminais arredondados.',
    variantes: ['contorno', 'duotone', 'monocromatica', 'negativa'],
    estados: ['padrao', 'ativo', 'desabilitado', 'erro'],
    orientacaoDeUso:
      'Acompanhe o ícone de texto quando o significado não for óbvio. Use os tamanhos 16, 24, 32 e 48 px. O estado ativo usa o verde escuro, que atende 3:1 sobre fundo claro; o verde vivo da prancha só aparece em decoração.',
    acessibilidade: [
      'Sem label o ícone é decorativo: aria-hidden e fora da ordem de foco.',
      'Com label vira role="img" com nome acessível.',
      'Cada estado atende 3:1 de contraste sobre branco e cinza-gelo.',
      'Traço proporcional ao tamanho, com 2 px efetivos a 16 px.',
    ],
  },
  {
    nome: 'Logo',
    descricao: 'Logotipo oficial da FluxID (arquivos da equipe de marca) nas versões usadas pelo aplicativo: horizontal sem slogan, vertical e negativa branca.',
    variantes: ['horizontal', 'vertical', 'negativa-branca'],
    estados: ['padrao'],
    orientacaoDeUso:
      'Use a horizontal no cabeçalho, a vertical nas telas de entrada e a negativa branca sobre fundos azul e navy. Respeite a área de proteção e a largura mínima digital de 120 px. Use só sobre fundo branco, azul, navy ou cinza-gelo. Não distorça, não altere as cores, não gire, não aplique sombras e não troque a tipografia. As outras versões da prancha estão na página Logotipo do catálogo.',
    acessibilidade: [
      'Imagem com texto alternativo "FluxID"; decorativo (alt vazio) quando o nome já aparece em texto ao lado.',
      'O logotipo é isento do contraste de texto da WCAG (critério 1.4.3).',
      'A altura é calculada pela proporção do arquivo: o componente nunca distorce e recusa largura abaixo de 120 px.',
    ],
  },
  {
    nome: 'Simbolo',
    descricao: 'Símbolo oficial isolado da marca (escudo com pino de localização e órbita) nos tamanhos 256, 64, 32 e 16 px de altura.',
    variantes: ['256', '64', '32', '16'],
    estados: ['padrao'],
    orientacaoDeUso:
      'Use como avatar, favicon e ícone de instalação da PWA. É sempre o arquivo icone.svg oficial, idêntico em todos os tamanhos: não existe versão simplificada. A 16 px os pontos da órbita ficam menores que 1 px e somem, mas o escudo e o pino continuam distintos.',
    acessibilidade: ['Imagem com texto alternativo "FluxID" ou decorativo ao lado do texto.', 'Verificação automática da legibilidade a 16 px (formas relevantes, cobertura e largura mínima).'],
  },
];
