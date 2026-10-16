import React from 'react';
import { ExampleBadge } from '@/design-system';

export interface PreviaBaseProps {
  titulo: string;
  // Descrição textual equivalente da ilustração, lida por tecnologias assistivas no lugar do desenho.
  descricao: string;
  children: React.ReactNode;
  compacto?: boolean;
}

// Moldura das prévias ilustradas (Spec 011, RF-013): uma "tela" branca com o selo "Exemplo" sempre visível e a ilustração como imagem
// descrita. O título e o selo abrem a tela, na mesma linha (polimento de 14/10/2026: o selo sozinho deixava a primeira linha vazia e o
// título ficava fora, em letra miúda); os dois ficam fora da imagem, para serem lidos como texto. Dados fictícios, de landing-content.ts.
export function PreviaBase({ titulo, descricao, children, compacto = false }: PreviaBaseProps): React.JSX.Element {
  return (
    <figure className={['m-0 flex flex-col rounded-card border border-borda-suave bg-branco p-4 text-grafite shadow-dialogo', compacto ? 'gap-2' : 'gap-4'].join(' ')} data-revelar>
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-corpo font-bold text-navy">{titulo}</span>
        <ExampleBadge />
      </figcaption>
      <div role="img" aria-label={descricao} className={compacto ? 'flex flex-col' : 'flex flex-col gap-2'}>
        {children}
      </div>
    </figure>
  );
}
