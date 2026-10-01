import React from 'react';
import { Button } from '@/design-system/components/button';

export interface MenuToggleProps {
  expanded: boolean;
  // Identificador do painel que o botão abre e fecha.
  controls: string;
  onToggle: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}

// Botão que recolhe e abre o menu abaixo de 768 px; a partir de 768 px o menu é fixo e o botão deixa de existir (RF-011).
export function MenuToggle({ expanded, controls, onToggle, ref }: MenuToggleProps): React.JSX.Element {
  return (
    <Button ref={ref} variant="secundario" aria-expanded={expanded} aria-controls={controls} onClick={onToggle} className="tablet:hidden">
      Menu
    </Button>
  );
}
