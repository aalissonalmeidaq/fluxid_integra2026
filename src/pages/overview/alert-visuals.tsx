import React from 'react';
import { StatusBadge, type StatusBadgeVariant } from '@/design-system';
import type { AlertSeverity } from '@/domain/overview/overview-types';

const SEVERIDADE: Record<AlertSeverity, { rotulo: string; variante: StatusBadgeVariant }> = {
  critico: { rotulo: 'Crítico', variante: 'erro' },
  atencao: { rotulo: 'Atenção', variante: 'pendente' },
  informativo: { rotulo: 'Informativo', variante: 'conectado' },
};

// Gravidade em texto com ícone: nunca só cor.
export function SeverityBadge({ severity }: { severity: AlertSeverity }): React.JSX.Element {
  const { rotulo, variante } = SEVERIDADE[severity];
  return <StatusBadge variant={variante}>{rotulo}</StatusBadge>;
}

// Destaque de alerta que acabou de ser disparado. É texto ("Novo") com um ponto, sem animação (movimento reduzido).
export function NewBadge(): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 text-legenda font-semibold text-erro">
      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-erro" />
      Novo
    </span>
  );
}
