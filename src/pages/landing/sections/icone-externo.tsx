import React from 'react';

// Seta de link externo (abre em nova aba), no mesmo traço dos ícones da landing. Decorativa: o nome acessível do link já diz que é externo.
export function IconeExterno(): React.JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
