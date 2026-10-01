import React from 'react';
import { classesDoControle } from './classes-do-controle';
import { Field } from './field';

export type TextFieldType = 'text' | 'email' | 'password' | 'file' | 'datetime-local';

export interface TextFieldProps extends Omit<React.ComponentProps<'input'>, 'type'> {
  label: string;
  help?: string;
  error?: string | undefined;
  type?: TextFieldType;
  wrapperClassName?: string;
}

const CLASSES_DE_ARQUIVO =
  'file:mr-4 file:min-h-alvo file:rounded-controle file:border-0 file:bg-info-fundo file:px-4 file:font-semibold file:text-azul-profundo';

// Campo de texto, e-mail, senha ou arquivo, com rótulo visível, ajuda e erro (RF-007, RF-010).
export function TextField({ label, help, error, type = 'text', className, wrapperClassName, ...props }: TextFieldProps): React.JSX.Element {
  return (
    <Field label={label} help={help} error={error} {...(wrapperClassName ? { className: wrapperClassName } : {})}>
      {(controle) => (
        <input
          {...props}
          {...controle}
          type={type}
          className={[classesDoControle(Boolean(error)), type === 'file' ? CLASSES_DE_ARQUIVO : '', className].filter(Boolean).join(' ')}
        />
      )}
    </Field>
  );
}
