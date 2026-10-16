import React, { useState } from 'react';
import { Logo } from '@/design-system';

export type UsoDoMascote = 'abertura' | 'cartao' | 'historia' | 'causa' | 'video' | 'explica' | 'contrato' | 'final';
export type PoseDoMascote = 'corpo' | 'rosto' | 'preocupado' | 'procurando' | 'indicando' | 'tablet' | 'cilindro';

export interface MascoteProps {
  uso: UsoDoMascote;
  className?: string;
}

interface ArteDaPose {
  base: string;
  larguras: readonly number[];
  // Versão do atributo src (a do meio do conjunto) e tamanho dela: a proporção vem daqui e a imagem tem dimensões fixas (sem deslocar o layout).
  padrao: number;
  largura: number;
  altura: number;
}

// Poses recortadas, já sem fundo (scripts/landing/otimizar-imagens.mjs): o mascote fica nítido sobre qualquer seção, sem máscara nem mistura
// de cores que o desfoquem. "corpo" e "rosto" vêm da arte original da Spec 011; as demais, da apresentação do FluxID (IntegraSENAI).
const ARTES: Record<PoseDoMascote, ArteDaPose> = {
  corpo: { base: 'mascote', larguras: [480, 768, 1200], padrao: 768, largura: 768, altura: 1152 },
  rosto: { base: 'mascote-rosto', larguras: [160, 320], padrao: 320, largura: 320, altura: 320 },
  preocupado: { base: 'mascote-preocupado', larguras: [240, 303], padrao: 303, largura: 303, altura: 418 },
  procurando: { base: 'mascote-procurando', larguras: [240, 323], padrao: 323, largura: 323, altura: 482 },
  indicando: { base: 'mascote-indicando', larguras: [240, 464], padrao: 464, largura: 464, altura: 744 },
  tablet: { base: 'mascote-tablet', larguras: [320, 588], padrao: 588, largura: 588, altura: 665 },
  cilindro: { base: 'mascote-cilindro', larguras: [320, 400, 749], padrao: 400, largura: 749, altura: 804 },
};

// Cada momento da história usa a pose que combina com ele: a abertura, o cartão e o fecho celebram; a perda e a causa mostram o mascote
// procurando o C-262 e preocupado; a explicação aponta; o modelo de contratação mostra o contrato no tablet.
const POSE: Record<UsoDoMascote, PoseDoMascote> = {
  abertura: 'cilindro',
  cartao: 'rosto',
  historia: 'procurando',
  causa: 'preocupado',
  video: 'procurando',
  explica: 'indicando',
  contrato: 'tablet',
  final: 'cilindro',
};

const CAMINHO = (base: string, largura: number): string => `/landing/${base}-${largura}.webp`;

// Só a abertura descreve a imagem; nos outros usos o mascote é enfeite e fica fora da leitura (alt vazio).
const DESCRICAO =
  'Mascote do FluxID ao lado de um cilindro azul equipado com o dispositivo inteligente de rastreio.';

const TAMANHOS: Record<UsoDoMascote, string> = {
  // Igual ao limite do palco da abertura (landing.css): 30rem no computador, 22rem abaixo; o navegador baixa a largura certa, sem ampliar.
  // Tamanho real do mascote sobre a captura da abertura (cerca de 18 rem no computador e 10 rem no celular): a versão de 400 px basta.
  abertura: '(min-width: 1024px) 19rem, 10rem',
  cartao: '6rem',
  historia: '(min-width: 768px) 12rem, 9rem',
  causa: '8rem',
  video: '(min-width: 1024px) 14rem, 8rem',
  explica: '(min-width: 768px) 12rem, 9rem',
  contrato: '(min-width: 768px) 14rem, 9rem',
  final: '(min-width: 768px) 16rem, 10rem',
};

// Mascote do FluxID (Spec 011, RF-009): WebP com transparência em várias larguras, dimensões fixas e, se a imagem falhar, o logotipo no lugar,
// sem quebrar a página. A abertura carrega com prioridade; os demais usos, sob demanda.
export function Mascote({ uso, className }: MascoteProps): React.JSX.Element {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return <Logo variant="negativa-branca" width={200} {...(className ? { className } : {})} />;
  const abertura = uso === 'abertura';
  const pose = POSE[uso];
  const arte = ARTES[pose];
  return (
    <img
      src={CAMINHO(arte.base, arte.padrao)}
      srcSet={arte.larguras.map((largura) => `${CAMINHO(arte.base, largura)} ${largura}w`).join(', ')}
      sizes={TAMANHOS[uso]}
      width={arte.largura}
      height={arte.altura}
      alt={abertura ? DESCRICAO : ''}
      decoding="async"
      {...(abertura ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
      onError={() => setFalhou(true)}
      className={['landing-mascote h-auto max-w-full', className].filter(Boolean).join(' ')}
      data-mascote={uso}
      data-pose={pose}
    />
  );
}
