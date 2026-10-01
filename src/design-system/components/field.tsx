import React, { useId } from 'react';
import { Icon } from '../icons/icon';

export interface ControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

export interface FieldProps {
  label: string;
  help?: string | undefined;
  error?: string | undefined;
  className?: string;
  // Recebe as propriedades de acessibilidade que o controle (input, select, textarea) deve aplicar.
  children: (control: ControlProps) => React.ReactNode;
}

// Rótulo visível, ajuda e erro associados ao controle (RF-010, RA-001, RA-003). O erro fica fora do rótulo, para não
// compor o nome acessível, e é ligado ao controle por aria-describedby. Compatível com o FormField da Spec 002.
export function Field({ label, help, error, className, children }: FieldProps): React.JSX.Element {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <label htmlFor={id} className="text-corpo font-medium text-grafite">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), ...(describedBy ? { 'aria-describedby': describedBy } : {}) })}
      {help && (
        <p id={helpId} className="mt-1 text-legenda text-texto-secundario">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 flex items-start gap-2 text-legenda font-medium text-erro">
          <Icon name="alerta" size={16} variant="monocromatica" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
