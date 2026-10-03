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
  // Controle ao final do campo (por exemplo, mostrar ou ocultar a senha); reserva o espaço dele dentro do campo.
  trailing?: React.ReactNode;
  // Ícone decorativo no início do campo; reserva o espaço dele e não recebe foco nem clique.
  leading?: React.ReactNode;
}

const CLASSES_DE_ARQUIVO =
  'file:mr-4 file:min-h-alvo file:rounded-controle file:border-0 file:bg-info-fundo file:px-4 file:font-semibold file:text-azul-profundo';

// Campo de texto, e-mail, senha ou arquivo, com rótulo visível, ajuda e erro (RF-007, RF-010).
export function TextField({ label, help, error, type = 'text', className, wrapperClassName, trailing, leading, ...props }: TextFieldProps): React.JSX.Element {
  return (
    <Field label={label} help={help} error={error} {...(wrapperClassName ? { className: wrapperClassName } : {})}>
      {(controle) => {
        const campo = (
          <input
            {...props}
            {...controle}
            type={type}
            className={[classesDoControle(Boolean(error)), type === 'file' ? CLASSES_DE_ARQUIVO : '', trailing ? 'pe-16' : '', leading ? 'ps-12' : '', className].filter(Boolean).join(' ')}
          />
        );
        if (!trailing && !leading) return campo;
        return (
          <div className="relative">
            {campo}
            {leading && <span aria-hidden="true" className="pointer-events-none absolute bottom-0 start-4 flex min-h-alvo items-center text-texto-secundario">{leading}</span>}
            {trailing && <div className="absolute bottom-0 end-0 flex min-h-alvo items-center">{trailing}</div>}
          </div>
        );
      }}
    </Field>
  );
}
