import React from 'react';
import type { TestView } from '@/application/cylinders/cylinder-views';
import { formatDate } from '@/domain/cylinders/format';
import { StatusBadge } from '@/design-system';

export interface HydrostaticTestsProps {
  tests: readonly TestView[];
  // Ação por registro (retificar), entregue pela tela só a quem tem `cylinder.test`.
  renderActions?: (test: TestView) => React.ReactNode;
}

// Testes hidrostáticos do cilindro (RF-019, RF-022): o registro original continua visível depois de retificado.
export function HydrostaticTests({ tests, renderActions }: HydrostaticTestsProps): React.JSX.Element {
  if (tests.length === 0) return <p className="text-corpo">Nenhum teste registrado para este cilindro.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {tests.map((test) => (
        <li key={test.id} className="flex flex-col gap-2 rounded-card border border-borda-suave p-4">
          <div className="flex flex-wrap items-center gap-2">
            <time dateTime={test.performedOn} className="text-corpo font-semibold text-navy">{formatDate(test.performedOn)}</time>
            <StatusBadge variant={test.result === 'approved' ? 'ativo' : 'erro'}>{test.result === 'approved' ? 'Aprovado' : 'Reprovado'}</StatusBadge>
            {test.superseded && <StatusBadge variant="bloqueado">Substituído por retificação</StatusBadge>}
            {test.rectifiesTestId && <StatusBadge variant="pendente">Retificação</StatusBadge>}
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-corpo tablet:grid-cols-2">
            <div><dt className="text-legenda text-texto-secundario">Executor</dt><dd>{test.executor}</dd></div>
            <div><dt className="text-legenda text-texto-secundario">Laudo</dt><dd>{test.reportNumber ?? '—'}</dd></div>
            <div><dt className="text-legenda text-texto-secundario">Próxima data</dt><dd>{test.nextDueOn ? <time dateTime={test.nextDueOn}>{formatDate(test.nextDueOn)}</time> : '—'}</dd></div>
            {test.notes && <div><dt className="text-legenda text-texto-secundario">Observações</dt><dd className="break-words">{test.notes}</dd></div>}
          </dl>
          {test.rectificationJustification && <p className="text-corpo text-texto-secundario">Justificativa da retificação: {test.rectificationJustification}</p>}
          {renderActions?.(test)}
        </li>
      ))}
    </ul>
  );
}
