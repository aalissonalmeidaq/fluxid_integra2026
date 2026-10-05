import React from 'react';

export interface MenuToggleProps {
  expanded: boolean;
  // Identificador do painel que o botão abre e fecha.
  controls: string;
  onToggle: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}

// Ícone de menu fixado no canto direito da tela abaixo de 768 px: abre a gaveta e, aberta, vira um "X" que a fecha. Fica sem
// caixa nem borda, acima da gaveta (z-30). A partir de 768 px o menu é fixo e o botão deixa de existir (RF-011). O ícone não
// existe no catálogo de 30 ícones, então é um desenho local, decorativo; o nome acessível é "Menu".
export function MenuToggle({ expanded, controls, onToggle, ref }: MenuToggleProps): React.JSX.Element {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Menu"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      className="fixed end-2 top-2 z-30 inline-flex min-h-alvo min-w-alvo items-center justify-center rounded-controle text-azul-profundo hover:bg-info-fundo tablet:hidden"
    >
      <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" focusable="false">
        {expanded ? (
          <>
            <line x1={5} y1={5} x2={19} y2={19} />
            <line x1={19} y1={5} x2={5} y2={19} />
          </>
        ) : (
          <>
            <line x1={4} y1={7} x2={20} y2={7} />
            <line x1={4} y1={12} x2={20} y2={12} />
            <line x1={4} y1={17} x2={20} y2={17} />
          </>
        )}
      </svg>
    </button>
  );
}
