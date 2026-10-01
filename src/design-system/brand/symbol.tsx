import React from 'react';
import { PROPORCAO_DO_SIMBOLO, type TamanhoDoSimbolo } from './constantes';
import icone from './oficial/icone.svg';

export interface SimboloProps {
  // Altura em px: 256, 64, 32 ou 16 (a largura segue a proporção do arquivo oficial).
  size: TamanhoDoSimbolo | number;
  // Decorativo quando o nome "FluxID" já aparece ao lado em texto.
  decorative?: boolean;
  className?: string;
}

// Símbolo oficial da marca (escudo com pino de localização e órbita de conexão): o arquivo icone.svg da equipe de marca,
// em todos os tamanhos, sem versão simplificada (RF-025).
export function Simbolo({ size, decorative = false, className }: SimboloProps): React.JSX.Element {
  return (
    <img
      src={icone}
      alt={decorative ? '' : 'FluxID'}
      width={Math.round(size * PROPORCAO_DO_SIMBOLO)}
      height={size}
      decoding="async"
      {...(className ? { className } : {})}
    />
  );
}
