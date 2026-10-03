import React, { useState } from 'react';
import { TextField, type TextFieldProps } from '@/design-system/components/text-field';

export type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'trailing'>;

// Campo de senha com botão para mostrar ou ocultar (RF-005). A senha começa oculta; alternar mantém o foco no campo e o
// valor, e o botão informa o estado por aria-pressed. A senha nunca vai para outro atributo, log ou armazenamento (RF-033).
export function PasswordField(props: PasswordFieldProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          // Não tira o foco do campo ao apertar com o mouse; o teclado continua alcançando o botão por Tab.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((value) => !value)}
          className="inline-flex min-h-alvo min-w-alvo items-center justify-center rounded-controle px-2 text-legenda font-semibold text-azul-profundo hover:bg-info-fundo"
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      }
    />
  );
}
