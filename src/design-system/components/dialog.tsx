import React, { useEffect, useId, useRef } from 'react';

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  // Ações do diálogo (confirmar, cancelar), sempre alcançáveis mesmo com conteúdo longo.
  footer?: React.ReactNode;
  // Controle que recebe o foco ao abrir; sem ele, o primeiro controle focável.
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  // Elemento que recebe o foco ao fechar; sem ele, o que tinha o foco quando o diálogo abriu.
  returnFocusTo?: HTMLElement | null;
}

const FOCAVEIS = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Diálogo modal acessível (RF-009): anuncia o título, prende o foco, fecha com Escape, devolve o foco ao acionador e
// rola por dentro quando o conteúdo é longo. Clicar fora não fecha, para não descartar ações sensíveis por engano.
export function Dialog({ title, onClose, children, footer, initialFocusRef, returnFocusTo }: DialogProps): React.JSX.Element {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<Element | null>(null);
  const aoFechar = useRef(returnFocusTo);
  useEffect(() => {
    aoFechar.current = returnFocusTo;
  }, [returnFocusTo]);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    const alvo = initialFocusRef?.current ?? dialogRef.current?.querySelector<HTMLElement>(FOCAVEIS) ?? dialogRef.current;
    alvo?.focus();
    return () => {
      const destino = aoFechar.current ?? (previousFocus.current as HTMLElement | null);
      destino?.focus?.();
    };
  }, [initialFocusRef]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focaveis = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? []);
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (!primeiro || !ultimo) return;
    if (event.shiftKey && document.activeElement === primeiro) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault();
      primeiro.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy/50 p-4 tablet:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="max-h-full w-full max-w-compacto overflow-y-auto rounded-card bg-branco p-6 text-grafite shadow-dialogo"
      >
        <h2 id={titleId} className="text-h3 font-semibold text-navy">
          {title}
        </h2>
        <div className="mt-4 flex flex-col gap-4">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
