import icone from './oficial/icone.svg';
import escalaDeCinza from './oficial/logo-escala-de-cinza.svg';
import horizontal from './oficial/logo-horizontal.svg';
import monocromaticaAzul from './oficial/logo-monocromatica-azul.svg';
import monocromaticaPreta from './oficial/logo-monocromatica-preta.svg';
import negativaBranca from './oficial/logo-negativa-branca.svg';
import negativaNavy from './oficial/logo-negativa-navy.svg';
import principal from './oficial/logo-principal.svg';
import vertical from './oficial/logo-vertical.svg';
import wordmark from './oficial/logo-wordmark.svg';

// As nove versões da prancha de variações da marca (RF-024), cada uma com seu arquivo. As quatro usadas no aplicativo
// são a assinatura secundária (cabeçalho), a vertical (entrada), a negativa branca (fundos azul e navy) e o símbolo; as
// demais existem só no catálogo. Origem: oficial = arquivo enviado pela equipe de marca; derivada = gerada dele por
// scripts/design-system/gerar-variacoes-da-marca.mjs, sem redesenho.
export interface VariacaoDoCatalogo {
  nome: string;
  descricao: string;
  usadaNoApp: boolean;
  origem: 'oficial' | 'derivada';
  arquivo: string;
  // Tamanho de exibição no catálogo, em px de largura (0 no símbolo, que tem os tamanhos próprios).
  larguraNoCatalogo: number;
  // Proporção (viewBox) do arquivo, para calcular a altura.
  proporcao: { largura: number; altura: number };
  // Fundo aprovado em que a amostra aparece (a negativa só em azul e navy).
  fundo: 'branco' | 'navy';
}

const COMPACTA = { largura: 214, altura: 79 } as const;

export const VARIACOES_DO_CATALOGO: readonly VariacaoDoCatalogo[] = [
  { nome: 'Assinatura principal (horizontal com slogan)', descricao: 'Uso institucional.', usadaNoApp: false, origem: 'oficial', arquivo: principal, larguraNoCatalogo: 320, proporcao: { largura: 374, altura: 130 }, fundo: 'branco' },
  { nome: 'Assinatura secundária (horizontal sem slogan)', descricao: 'Uso digital; cabeçalho do aplicativo.', usadaNoApp: true, origem: 'derivada', arquivo: horizontal, larguraNoCatalogo: 280, proporcao: { largura: 374, altura: 130 }, fundo: 'branco' },
  { nome: 'Assinatura vertical', descricao: 'Símbolo acima; telas de entrada e aplicações compactas.', usadaNoApp: true, origem: 'oficial', arquivo: vertical, larguraNoCatalogo: 160, proporcao: { largura: 159, altura: 164 }, fundo: 'branco' },
  { nome: 'Wordmark', descricao: 'Lettering isolado.', usadaNoApp: false, origem: 'derivada', arquivo: wordmark, larguraNoCatalogo: 240, proporcao: { largura: 256, altura: 65 }, fundo: 'branco' },
  { nome: 'Monocromática azul', descricao: 'Uma cor, no azul do logotipo.', usadaNoApp: false, origem: 'derivada', arquivo: monocromaticaAzul, larguraNoCatalogo: 240, proporcao: COMPACTA, fundo: 'branco' },
  { nome: 'Monocromática preta', descricao: 'Uma cor, em preto.', usadaNoApp: false, origem: 'oficial', arquivo: monocromaticaPreta, larguraNoCatalogo: 240, proporcao: COMPACTA, fundo: 'branco' },
  { nome: 'Escala de cinza', descricao: 'Uma cor, em cinza.', usadaNoApp: false, origem: 'derivada', arquivo: escalaDeCinza, larguraNoCatalogo: 240, proporcao: COMPACTA, fundo: 'branco' },
  { nome: 'Negativa branca', descricao: 'Branca, para fundos azul e navy.', usadaNoApp: true, origem: 'oficial', arquivo: negativaBranca, larguraNoCatalogo: 240, proporcao: COMPACTA, fundo: 'navy' },
  { nome: 'Símbolo', descricao: 'Ícone isolado: avatar, favicon e ícones de instalação (256, 64, 32 e 16 px).', usadaNoApp: true, origem: 'oficial', arquivo: icone, larguraNoCatalogo: 0, proporcao: { largura: 104, altura: 126 }, fundo: 'branco' },
];

// Versão com o ID em verde sobre fundo navy (arquivo oficial da marca), usada na amostra de fundos aprovados.
export const LOGO_NEGATIVA_NAVY = negativaNavy;
