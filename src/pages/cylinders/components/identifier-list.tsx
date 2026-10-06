import React from 'react';
import type { IdentifierView } from '@/application/cylinders/cylinder-views';
import { formatDateTime } from '@/domain/cylinders/format';
import { IDENTIFIER_KIND_LABELS } from '@/domain/cylinders/cylinder-types';
import { StatusBadge } from '@/design-system';
import { IdentifierSymbol } from './identifier-symbol';

export interface IdentifierListProps {
  identifiers: readonly IdentifierView[];
  // Ações por identificador (desativar, transferir), entregues pela tela só a quem tem `cylinder.identifier`.
  renderActions?: (identifier: IdentifierView) => React.ReactNode;
}

// Identificadores ativos e desativados do cilindro (RF-007 a RF-010). O desativado continua listado e nunca é apagado.
export function IdentifierList({ identifiers, renderActions }: IdentifierListProps): React.JSX.Element {
  if (identifiers.length === 0) {
    return <p className="text-corpo">Nenhum identificador vinculado a este cilindro.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {identifiers.map((identifier) => (
        <li key={identifier.id} className="flex flex-col gap-2 rounded-card border border-borda-suave p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-legenda font-semibold uppercase text-texto-secundario">{IDENTIFIER_KIND_LABELS[identifier.kind]}</span>
            <StatusBadge variant={identifier.status === 'active' ? 'ativo' : 'bloqueado'}>{identifier.status === 'active' ? 'Ativo' : 'Desativado'}</StatusBadge>
          </div>
          <code className="break-all text-corpo font-semibold text-navy">{identifier.value}</code>
          {identifier.status === 'deactivated' && (
            <p className="text-corpo text-texto-secundario">
              Desativado em {formatDateTime(identifier.deactivatedAt)}. Motivo: {identifier.deactivationJustification ?? '—'}
              {identifier.transferred ? ' Transferido para outro cilindro.' : ''}
            </p>
          )}
          {(identifier.status === 'active' || renderActions) && (
            <div className="flex flex-wrap gap-2">
              {identifier.status === 'active' && <IdentifierSymbol kind={identifier.kind} value={identifier.value} />}
              {renderActions?.(identifier)}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
