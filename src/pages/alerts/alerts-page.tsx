import React, { useId } from 'react';
import { useTenant } from '@/app/tenant/tenant-context';
import { ExampleBadge } from '@/design-system/components/example-badge';
import { Icon } from '@/design-system';
import type { AlertItem } from '@/domain/overview/overview-types';
import { NewBadge, SeverityBadge } from '../overview/alert-visuals';
import { OverviewBlock } from '../overview/overview-block';
import { useOverviewBlock } from '../overview/use-overview-block';

function Detalhe({ alert, organization }: { alert: AlertItem | null; organization: string }): React.JSX.Element {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4 rounded-card border border-borda-suave bg-branco p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={titleId} className="m-0 min-w-0 text-h3 font-semibold text-navy">Detalhe do alerta</h3>
        <ExampleBadge />
      </div>
      {!alert ? (
        <p className="m-0 text-corpo text-grafite">Alerta não encontrado. Escolha um alerta da lista.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            {alert.isNew && <NewBadge />}
          </div>
          <p className="m-0 break-words text-corpo font-semibold text-grafite">{alert.text}</p>
          <dl className="m-0 grid grid-cols-1 gap-4 tablet:grid-cols-2">
            {([
              ['Alerta', alert.id],
              ['Organização', organization],
              ['Cilindro', alert.cylinderId],
              ['Tipo', alert.type],
              ['Situação', alert.status],
              ['Quando', alert.when],
            ] as const).map(([rotulo, valor]) => (
              <div key={rotulo} className="flex min-w-0 flex-col gap-1">
                <dt className="text-legenda text-texto-secundario">{rotulo}</dt>
                <dd className="m-0 break-words text-corpo text-grafite">{valor}</dd>
              </div>
            ))}
            <div className="flex min-w-0 flex-col gap-1 tablet:col-span-2">
              <dt className="text-legenda text-texto-secundario">Ocorrência</dt>
              <dd className="m-0 break-words text-corpo text-grafite">{alert.occurrence}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}

// Página de alertas (dados de exemplo): lista os alertas e mostra o detalhe do escolhido pela URL (`?alerta=`), com a
// organização ativa. A entrega em tempo real dos alertas de cada organização depende da spec dos alertas; aqui só há exemplo.
export function AlertsPage(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('alertas');
  const { selection } = useTenant();
  const organization = selection.kind === 'selected' ? selection.option.displayName : 'não selecionada';
  const requested = new URLSearchParams(window.location.search).get('alerta');
  const items = state.status === 'ready' ? state.data.items : [];
  const selected = requested === null ? (items[0] ?? null) : (items.find((item) => item.id === requested) ?? null);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-h3 font-semibold text-navy">Alertas</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">
          Alertas da organização ativa. Os dados abaixo são de exemplo, até a leitura dos alertas reais.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 desktop:grid-cols-2">
        <OverviewBlock id="alertas" title="Alertas recebidos" state={state} onRetry={retry}>
          <ul role="list" aria-label="Lista de alertas" className="m-0 flex list-none flex-col gap-2 p-0">
            {items.map((item) => (
              <li key={item.id} className="min-w-0">
                <a
                  href={`/alertas?alerta=${encodeURIComponent(item.id)}`}
                  {...(item.id === selected?.id ? { 'aria-current': 'true' as const } : {})}
                  className={`flex min-h-alvo min-w-0 items-start gap-2 rounded-controle border p-2 hover:bg-info-fundo ${item.id === selected?.id ? 'border-azul-profundo bg-info-fundo' : 'border-borda-suave bg-branco'}`}
                >
                  <span className="mt-1 text-azul-profundo"><Icon name="alerta" size={16} /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="break-words text-corpo text-grafite">{item.text}</span>
                    <span className="flex flex-wrap items-center gap-2 text-legenda text-texto-secundario">
                      {item.isNew && <NewBadge />}
                      <span>{item.type} · {item.when}</span>
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </OverviewBlock>
        {state.status === 'ready' && <Detalhe alert={selected} organization={organization} />}
      </div>
    </div>
  );
}
