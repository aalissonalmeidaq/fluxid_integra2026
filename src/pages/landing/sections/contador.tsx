import React, { useRef } from 'react';
import { VisuallyHidden } from '@/design-system';
import { useContagem } from '../use-contagem';

export interface ContadorProps {
  valor: number;
  formatar: (valor: number) => string;
  className?: string;
  // Algarismos de largura fixa: o número não "pula" enquanto conta. Num número curto e grande (como 130), o "1" largo parece recuado.
  tabular?: boolean;
}

// Número grande que conta até o valor ao aparecer (Spec 011, adaptação ao pitch). A contagem é só visual (aria-hidden); o valor final vai
// em texto para o leitor de tela. Algarismos de largura fixa evitam que o número "pule" enquanto conta.
export function Contador({ valor, formatar, className, tabular = true }: ContadorProps): React.JSX.Element {
  const alvo = useRef<HTMLSpanElement>(null);
  const atual = useContagem(valor, alvo);
  return (
    <span ref={alvo} className={[tabular ? 'tabular-nums' : '', className].filter(Boolean).join(' ')} data-contador={formatar(valor)}>
      <span aria-hidden="true">{formatar(atual)}</span>
      <VisuallyHidden>{formatar(valor)}</VisuallyHidden>
    </span>
  );
}
