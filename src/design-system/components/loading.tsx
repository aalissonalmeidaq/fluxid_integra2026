import React from 'react';

export type LoadingVariant = 'pagina' | 'secao' | 'botao';

export interface LoadingProps {
  label: string;
  variant?: LoadingVariant;
  // Marca a região como ocupada (aria-busy) quando o conteúdo protegido ainda não pode ser exibido.
  busy?: boolean;
}

const VARIANTES: Record<LoadingVariant, string> = {
  pagina: 'flex w-full items-center justify-center gap-2 py-12',
  secao: 'flex w-full items-center justify-center gap-2 py-6',
  botao: 'inline-flex items-center gap-2',
};

// Indicador de carregamento: uma região de status com texto, anunciada uma única vez, que não captura o foco nem
// bloqueia o teclado. O giro só existe sem preferência por movimento reduzido (RF-021, RF-023, CA-009).
export function Loading({ label, variant = 'secao', busy = false }: LoadingProps): React.JSX.Element {
  return (
    <div role="status" aria-live="polite" {...(busy ? { 'aria-busy': true } : {})} data-variant={variant} className={`${VARIANTES[variant]} text-corpo text-grafite`}>
      <span
        data-indicador
        aria-hidden="true"
        className="inline-block size-4 shrink-0 rounded-full border-2 border-azul-royal border-t-transparent motion-safe:animate-spin"
      />
      <span>{label}</span>
    </div>
  );
}
