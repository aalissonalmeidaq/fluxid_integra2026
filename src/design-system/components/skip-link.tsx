import React from 'react';

export interface SkipLinkProps {
  targetId: string;
  children: React.ReactNode;
}

// Primeiro item da ordem de Tab; aparece ao receber o foco e leva o foco ao conteúdo principal (RF-012).
export function SkipLink({ targetId, children }: SkipLinkProps): React.JSX.Element {
  return (
    <a
      href={`#${targetId}`}
      onClick={() => document.getElementById(targetId)?.focus()}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-alvo focus:items-center focus:rounded-controle focus:bg-branco focus:px-4 focus:text-navy"
    >
      {children}
    </a>
  );
}
