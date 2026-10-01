import React from 'react';
import { LARGURA_MINIMA_DIGITAL } from './constantes';
import horizontal from './oficial/logo-horizontal.svg';
import negativaBranca from './oficial/logo-negativa-branca.svg';
import vertical from './oficial/logo-vertical.svg';

// As versões usadas pelo aplicativo: a assinatura secundária (cabeçalho), a vertical (telas de entrada) e a negativa
// branca (fundos azul e navy). As demais ficam só no catálogo (logo-variacoes.ts) e não entram no pacote de produção.
export type VarianteDoLogotipo = 'horizontal' | 'vertical' | 'negativa-branca';

// Arquivo e proporção (viewBox) de cada versão.
const VERSOES: Record<VarianteDoLogotipo, { origem: string; largura: number; altura: number }> = {
  horizontal: { origem: horizontal, largura: 374, altura: 130 },
  vertical: { origem: vertical, largura: 159, altura: 164 },
  'negativa-branca': { origem: negativaBranca, largura: 214, altura: 79 },
};

export interface LogoProps {
  variant: VarianteDoLogotipo;
  // Largura em px, no mínimo 120 (redução mínima digital); a altura segue a proporção do arquivo.
  width: number;
  // Decorativo quando o nome "FluxID" já aparece ao lado em texto.
  decorative?: boolean;
  className?: string;
}

// Logotipo da FluxID a partir dos arquivos da equipe de marca, hospedados no aplicativo. Nunca distorce: a altura é
// calculada pela proporção do arquivo.
export function Logo({ variant, width, decorative = false, className }: LogoProps): React.JSX.Element {
  if (width < LARGURA_MINIMA_DIGITAL) throw new Error(`Largura mínima do logotipo: ${LARGURA_MINIMA_DIGITAL} px (recebido ${width}).`);
  const { origem, largura, altura } = VERSOES[variant];
  return (
    <img
      src={origem}
      alt={decorative ? '' : 'FluxID'}
      width={width}
      height={Math.round((width * altura) / largura)}
      decoding="async"
      {...(className ? { className } : {})}
    />
  );
}
