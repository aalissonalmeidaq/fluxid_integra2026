import React from 'react';
import { Field } from './field';
import { classesDoControle } from './classes-do-controle';

export interface SelectProps extends React.ComponentProps<'select'> {
  label: string;
  help?: string;
  error?: string | undefined;
  wrapperClassName?: string;
}

// Seletor nativo com rótulo visível, ajuda e erro (RF-007, RF-010).
export function Select({ label, help, error, className, wrapperClassName, children, ...props }: SelectProps): React.JSX.Element {
  return (
    <Field label={label} help={help} error={error} {...(wrapperClassName ? { className: wrapperClassName } : {})}>
      {(controle) => (
        <select {...props} {...controle} className={[classesDoControle(Boolean(error)), className].filter(Boolean).join(' ')}>
          {children}
        </select>
      )}
    </Field>
  );
}
