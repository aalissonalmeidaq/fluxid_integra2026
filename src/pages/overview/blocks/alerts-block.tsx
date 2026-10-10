import React from 'react';
import { Icon } from '@/design-system';
import { NewBadge } from '../alert-visuals';
import { OverviewBlock } from '../overview-block';
import { useOverviewBlock } from '../use-overview-block';

// Lista curta de eventos de exemplo. Os alertas recém-disparados levam o destaque "Novo" e um resumo no topo; cada alerta
// abre a página de alertas já com ele selecionado (RF-014).
export function AlertsBlock(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('alertas');
  const novos = state.status === 'ready' ? state.data.items.filter((item) => item.isNew).length : 0;
  return (
    <OverviewBlock id="alertas" title="Alertas recentes" state={state} onRetry={retry}>
      {state.status === 'ready' && (
        <>
          {novos > 0 && (
            <p className="m-0 flex items-center gap-2 text-corpo font-semibold text-erro">
              <Icon name="alerta" size={16} />
              {novos === 1 ? '1 novo alerta' : `${novos} novos alertas`}
            </p>
          )}
          <ul role="list" className="m-0 flex list-none flex-col gap-2 p-0">
            {state.data.items.map((item) => (
              <li key={item.id} className="min-w-0">
                <a
                  href={`/alertas?alerta=${encodeURIComponent(item.id)}`}
                  className={`flex min-h-alvo min-w-0 items-start gap-2 rounded-controle border p-2 hover:bg-info-fundo ${item.isNew ? 'border-erro bg-erro-fundo' : 'border-borda-suave bg-branco'}`}
                >
                  <span className={`mt-1 ${item.isNew ? 'text-erro' : 'text-azul-profundo'}`}><Icon name="alerta" size={16} /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={`break-words text-corpo ${item.isNew ? 'text-erro' : 'text-grafite'}`}>{item.text}</span>
                    <span className="flex flex-wrap items-center gap-2 text-legenda text-texto-secundario">
                      {item.isNew && <NewBadge />}
                      <span className={item.isNew ? 'text-erro' : ''}>{item.type} · {item.when}</span>
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </OverviewBlock>
  );
}
