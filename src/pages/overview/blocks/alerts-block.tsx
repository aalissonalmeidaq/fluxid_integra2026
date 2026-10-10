import React from 'react';
import { Icon } from '@/design-system';
import type { AlertSeverity } from '@/domain/overview/overview-types';
import { NewBadge, SeverityBadge } from '../alert-visuals';
import { OverviewBlock } from '../overview-block';
import { useOverviewBlock } from '../use-overview-block';

const ORDEM: Record<AlertSeverity, number> = { critico: 0, atencao: 1, informativo: 2 };

// Cada severidade tem borda e fundo próprios; o texto do alerta fica em grafite e a gravidade vai em texto no selo, nunca só em cor.
const TOM: Record<AlertSeverity, string> = {
  critico: 'border-erro bg-erro-fundo',
  atencao: 'border-alerta-faixa bg-alerta-fundo',
  informativo: 'border-borda-suave bg-branco',
};
const ICONE: Record<AlertSeverity, 'rompimento' | 'alerta' | 'verificado'> = { critico: 'rompimento', atencao: 'alerta', informativo: 'verificado' };

// Lista curta de eventos de exemplo, da maior para a menor gravidade e, dentro dela, os novos primeiro. O resumo no topo diz quantos
// são novos e quantos são críticos; cada alerta abre a página de alertas já com ele selecionado (RF-014).
export function AlertsBlock(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('alertas');
  const itens = state.status === 'ready'
    ? [...state.data.items].sort((a, b) => ORDEM[a.severity] - ORDEM[b.severity] || Number(b.isNew) - Number(a.isNew))
    : [];
  const novos = itens.filter((item) => item.isNew).length;
  const criticos = itens.filter((item) => item.severity === 'critico').length;
  const resumo = [
    novos > 0 ? (novos === 1 ? '1 novo' : `${novos} novos`) : '',
    criticos > 0 ? (criticos === 1 ? '1 crítico' : `${criticos} críticos`) : '',
  ].filter(Boolean).join(' · ');
  return (
    <OverviewBlock id="alertas" title="Alertas recentes" state={state} onRetry={retry}>
      {state.status === 'ready' && (
        <>
          {resumo !== '' && (
            <p className="m-0 flex items-center gap-2 text-corpo font-semibold text-navy">
              <Icon name="alerta" size={16} />
              {novos === 1 && criticos === 0 ? '1 novo alerta' : novos > 1 && criticos === 0 ? `${novos} novos alertas` : resumo}
            </p>
          )}
          <ul role="list" className="m-0 flex list-none flex-col gap-2 p-0">
            {itens.map((item) => (
              <li key={item.id} className="min-w-0">
                <a
                  href={`/alertas?alerta=${encodeURIComponent(item.id)}`}
                  className={`flex min-h-alvo min-w-0 items-start gap-2 rounded-controle border p-2 hover:bg-info-fundo ${TOM[item.severity]}`}
                >
                  <span className={`mt-1 ${item.severity === 'critico' ? 'text-erro' : item.severity === 'atencao' ? 'text-alerta-texto' : 'text-azul-profundo'}`}><Icon name={ICONE[item.severity]} size={16} /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="break-words text-corpo text-grafite">{item.text}</span>
                    <span className="flex flex-wrap items-center gap-2 text-legenda text-texto-secundario">
                      <SeverityBadge severity={item.severity} />
                      {item.isNew && <NewBadge />}
                      <span>{item.type} · {item.when} · {item.status}</span>
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
