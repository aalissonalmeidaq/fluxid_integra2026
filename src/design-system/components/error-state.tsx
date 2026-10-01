import React from 'react';
import { Icon } from '../icons/icon';

export interface ErrorStateProps {
  title: string;
  message: string;
  variant?: 'recuperavel' | 'sem-permissao';
  onRetry?: () => void;
  // Permite levar o foco ao aviso sem criar um elemento extra.
  ref?: React.Ref<HTMLDivElement>;
  tabIndex?: number;
}

// Estado de erro anunciado como alerta, sempre com texto e ícone (nunca só cor). "Sem permissão" não oferece nova
// tentativa: mantém a mensagem de acesso negado da Spec 002 (RF-021, RA-005).
export function ErrorState({ title, message, variant = 'recuperavel', onRetry, ref, tabIndex }: ErrorStateProps): React.JSX.Element {
  return (
    <div ref={ref} {...(tabIndex !== undefined ? { tabIndex } : {})} role="alert" data-variant={variant} className="flex items-start gap-4 rounded-card border border-erro bg-erro-fundo p-4 text-erro">
      <Icon name={variant === 'sem-permissao' ? 'bloqueio' : 'alerta'} variant="monocromatica" />
      <div className="flex flex-col gap-2">
        <p className="text-corpo font-semibold">{title}</p>
        <p className="text-corpo">{message}</p>
        {variant === 'recuperavel' && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-alvo items-center justify-center self-start rounded-controle border border-erro bg-branco px-4 text-corpo font-semibold text-erro"
          >
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
