import React, { useState } from 'react';
import { Button, Select, TextField } from '@/design-system';
import { reportDefinition, type ReportQuery } from '@/domain/reports/report-catalog';

// Filtros do relatório (Spec 015, T083; RF-025, RF-040). A URL é a fonte: o formulário parte da consulta atual e, ao aplicar, devolve a
// consulta canônica. Período em data e hora locais; situação quando o tipo a usa. Ids de viagem, cilindro ou lacre chegam pelos links das
// outras telas e são preservados. Erros ficam junto do campo.
const STATUS_OPTIONS: Partial<Record<ReportQuery['type'], { value: string; label: string }[]>> = {
  trips: [{ value: 'planned', label: 'Planejada' }, { value: 'loading', label: 'Em carregamento' }, { value: 'in_progress', label: 'Em andamento' },
    { value: 'completed', label: 'Concluída' }, { value: 'cancelled', label: 'Cancelada' }],
  proximity: [{ value: 'open', label: 'Aberta' }, { value: 'acknowledged', label: 'Reconhecida' }, { value: 'closed', label: 'Encerrada' },
    { value: 'historical_only', label: 'Só no histórico' }],
  alerts: [{ value: 'open', label: 'Aberto' }, { value: 'acknowledged', label: 'Reconhecido' }, { value: 'closed', label: 'Encerrado' }],
};

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ReportFilters({ query, onApply }: { query: ReportQuery; onApply: (query: ReportQuery) => void }): React.JSX.Element {
  const [from, setFrom] = useState(toLocalInput(query.filters.from));
  const [to, setTo] = useState(toLocalInput(query.filters.to));
  const [status, setStatus] = useState(query.filters.status ?? '');
  const [error, setError] = useState<string | null>(null);
  const options = reportDefinition(query.type).filters.includes('status') ? STATUS_OPTIONS[query.type] ?? [] : [];

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return setError('Informe data e hora de início e de fim.');
    if (start >= end) return setError('O início deve ser antes do fim.');
    if (end.getTime() - start.getTime() > 366 * 24 * 3600_000) return setError('Escolha um período de até um ano.');
    setError(null);
    const filters = { ...query.filters, from: start.toISOString(), to: end.toISOString() };
    if (status) filters.status = status;
    else delete filters.status;
    onApply({ type: query.type, filters });
  };

  return (
    <form className="flex flex-col gap-4 tablet:flex-row tablet:flex-wrap tablet:items-end" noValidate onSubmit={apply} aria-label="Filtros do relatório">
      <TextField label="Início" type="datetime-local" value={from} error={error ?? undefined} onChange={(event) => setFrom(event.target.value)} />
      <TextField label="Fim" type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
      {options.length > 0 && (
        <Select label="Situação" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Todas</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      )}
      <div><Button type="submit" variant="secundario">Aplicar filtros</Button></div>
    </form>
  );
}
