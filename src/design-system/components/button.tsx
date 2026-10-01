import React from 'react';

export type ButtonVariant = 'primario' | 'secundario' | 'perigoso';

const VARIANTES: Record<ButtonVariant, string> = {
  primario: 'border-azul-profundo bg-azul-profundo text-branco hover:bg-navy',
  secundario: 'border-azul-profundo bg-branco text-azul-profundo hover:bg-info-fundo',
  perigoso: 'border-erro bg-erro text-branco',
};

export interface ButtonProps extends React.ComponentProps<'button'> {
  variant?: ButtonVariant;
  // Carregando: o botão continua focável (não usa disabled), ignora o clique e informa aria-busy.
  loading?: boolean;
  // Texto exibido enquanto carrega; sem ele, o texto normal é mantido.
  loadingLabel?: string;
}

// Botão do design system. Alvo de toque de 44 px, foco visível pelo estilo global e estados desabilitado e carregando.
export function Button({
  variant = 'primario',
  loading = false,
  loadingLabel,
  type = 'button',
  className,
  children,
  onClick,
  ...props
}: ButtonProps): React.JSX.Element {
  const classes = [
    'inline-flex min-h-alvo min-w-alvo items-center justify-center gap-2 rounded-controle border px-4 text-corpo font-semibold',
    VARIANTES[variant],
    'disabled:cursor-not-allowed disabled:border-dashed disabled:opacity-60 aria-busy:cursor-progress',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      type={type}
      data-variant={variant}
      className={classes}
      {...(loading ? { 'aria-busy': true, 'aria-disabled': true } : {})}
      onClick={loading ? (event) => event.preventDefault() : onClick}
    >
      {loading && (
        <span
          data-indicador
          aria-hidden="true"
          className="inline-block size-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
        />
      )}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
