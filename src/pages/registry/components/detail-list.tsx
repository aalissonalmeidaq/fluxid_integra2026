import React from 'react';
import { Card } from '@/design-system';

export interface DetailRow { label: string; value: React.ReactNode }

// Bloco de detalhe: uma lista de descrição (rótulo e valor) em grade responsiva. Valor vazio mostra "Não informado".
export function DetailBlock({ title, titleId, rows, action }: { title: string; titleId: string; rows: readonly DetailRow[]; action?: React.ReactNode }): React.JSX.Element {
  return (
    <Card>
      <section aria-labelledby={titleId} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={titleId} className="text-h3 font-semibold text-navy">{title}</h3>
          {action}
        </div>
        <dl className="grid gap-4 tablet:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-legenda font-semibold text-texto-secundario">{row.label}</dt>
              <dd className="mt-1 break-words text-corpo text-grafite">{row.value === null || row.value === undefined || row.value === '' ? 'Não informado' : row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Card>
  );
}

export const secondaryLinkClass =
  'inline-flex min-h-alvo items-center justify-center rounded-controle border border-azul-profundo bg-branco px-4 text-corpo font-semibold text-azul-profundo hover:bg-info-fundo';
