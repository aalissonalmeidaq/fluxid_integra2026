import React from 'react';
import { Card } from '@/design-system';
import { describeTripPlanIssue, type TripPlanSummary } from '@/domain/trips/trip-summary';

export interface TripSummaryPanelProps {
  summary: TripPlanSummary;
  vehicleCapacity: number | null;
  // Avisos que não impedem salvar (CNH e licenciamento), já em texto.
  warnings: readonly string[];
}

// Resumo fixo do planejamento: paradas, cilindros, capacidade do veículo e avisos (RF-002, RF-003, premissa 5). Não é uma região de
// status: o anúncio da tela vai a um único `role="status"` no formulário, para o leitor de tela não repetir cada mudança.
export function TripSummaryPanel({ summary, vehicleCapacity, warnings }: TripSummaryPanelProps): React.JSX.Element {
  const over = summary.remainingCapacity !== null && summary.remainingCapacity < 0;
  return (
    <Card as="section" aria-labelledby="trip-summary-title" className="flex flex-col gap-4">
      <h3 id="trip-summary-title" className="text-h3 font-semibold text-navy">Resumo da viagem</h3>
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-legenda font-semibold text-texto-secundario">Paradas</dt>
          <dd className="mt-1 text-h3 font-bold text-navy">{summary.stopCount}</dd>
        </div>
        <div>
          <dt className="text-legenda font-semibold text-texto-secundario">Cilindros</dt>
          <dd className="mt-1 text-h3 font-bold text-navy">{vehicleCapacity === null ? summary.cylinderCount : `${summary.cylinderCount} de ${vehicleCapacity}`}</dd>
        </div>
      </dl>
      {vehicleCapacity === null && <p className="text-corpo">Escolha o veículo para ver a capacidade.</p>}
      {summary.remainingCapacity !== null && (
        <p className={`text-corpo font-semibold ${over ? 'text-erro' : 'text-grafite'}`}>
          {over ? `Passa ${Math.abs(summary.remainingCapacity)} da capacidade do veículo.` : `Ainda cabem ${summary.remainingCapacity} no veículo.`}
        </p>
      )}
      {warnings.length > 0 && (
        <ul role="list" aria-label="Avisos" className="flex flex-col gap-1 rounded-controle bg-alerta-fundo p-4 text-corpo text-alerta-texto">
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      {summary.issues.length > 0 && (
        <ul role="list" aria-label="O que falta para salvar" className="flex flex-col gap-1 text-corpo text-erro">
          {summary.issues.map((issue) => <li key={describeTripPlanIssue(issue)}>{describeTripPlanIssue(issue)}</li>)}
        </ul>
      )}
    </Card>
  );
}
