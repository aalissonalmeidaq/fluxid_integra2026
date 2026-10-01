import React, { useId } from 'react';

interface ControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

export interface FormFieldProps {
  label: string;
  error?: string | undefined;
  className?: string;
  children: (control: ControlProps) => React.ReactNode;
}

// Rótulo visível associado ao controle; o erro fica fora do rótulo (para não compor o nome acessível)
// e é ligado ao controle por aria-describedby (RA-001, RA-006).
export function FormField({ label, error, className, children }: FormFieldProps): React.JSX.Element {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children({ id, 'aria-invalid': Boolean(error), ...(error ? { 'aria-describedby': errorId } : {}) })}
      {error && <p id={errorId} className="mt-1 text-sm text-rose-900">{error}</p>}
    </div>
  );
}
