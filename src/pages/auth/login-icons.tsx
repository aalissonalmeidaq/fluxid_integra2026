import React from 'react';

// Ícones decorativos da entrada (envelope, cadeado e seta). Ficam aqui porque o catálogo do design system não os tem e só
// esta tela os usa; o nome do controle vem sempre do rótulo visível.
function Base({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const MailIcon = (): React.JSX.Element => (
  <Base>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </Base>
);

export const LockIcon = (): React.JSX.Element => (
  <Base>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Base>
);

export const ArrowRightIcon = (): React.JSX.Element => (
  <Base>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Base>
);
