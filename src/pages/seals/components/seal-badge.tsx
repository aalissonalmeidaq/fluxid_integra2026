import React from 'react';
import { Icon } from '@/design-system';
import type { Presentation, Tone } from '@/domain/seals/seal-vocabulary';

// Selo do lacre (saúde, trava, severidade, comando): ícone oficial e texto sempre juntos, nunca só cor (RF-042). Mesmas cores do
// selo de status do design system (Spec 003), com o ícone que o vocabulário do lacre escolhe para cada valor.
const TONES: Record<Tone, string> = {
  ativo: 'bg-sucesso-fundo text-verde-acessivel',
  conectado: 'bg-info-fundo text-azul-profundo',
  pendente: 'bg-alerta-fundo text-alerta-texto',
  bloqueado: 'bg-cinza-gelo text-grafite',
  erro: 'bg-erro-fundo text-erro',
};

export function SealBadge({ presentation }: { presentation: Presentation }): React.JSX.Element {
  return (
    <span data-tone={presentation.tone} className={`inline-flex items-center gap-1 rounded-controle px-2 py-1 text-legenda font-semibold ${TONES[presentation.tone]}`}>
      <Icon name={presentation.icon} size={16} variant="monocromatica" />
      <span>{presentation.label}</span>
    </span>
  );
}
