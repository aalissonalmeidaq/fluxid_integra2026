import React from 'react';
import { classesDoControle } from '@/design-system/components/classes-do-controle';
import { WEEK_DAY_LABELS } from '@/domain/registry/registry-vocabulary';

export interface ReceivingWindowValue { days: readonly number[]; from: string; to: string }

export interface ReceivingWindowFieldProps {
  value: ReceivingWindowValue;
  onChange: (value: ReceivingWindowValue) => void;
  error?: string | undefined;
  disabled?: boolean;
}

// Janela de recebimento da unidade: dias da semana e uma faixa de horário (RF-005). A validação da faixa fica no domínio.
export function ReceivingWindowField({ value, onChange, error, disabled = false }: ReceivingWindowFieldProps): React.JSX.Element {
  const toggle = (day: number): void => {
    const days = value.days.includes(day) ? value.days.filter((current) => current !== day) : [...value.days, day].sort((a, b) => a - b);
    onChange({ ...value, days });
  };
  const errorId = 'receiving-window-error';
  return (
    <fieldset className="flex flex-col gap-4" aria-describedby={error ? errorId : undefined} disabled={disabled}>
      <legend className="text-corpo font-medium text-grafite">Horário de recebimento</legend>
      <div className="flex flex-wrap gap-2">
        {WEEK_DAY_LABELS.map((label, day) => (
          <label key={label} className="flex min-h-alvo items-center gap-2 rounded-card border border-borda px-4 text-corpo text-grafite">
            <input type="checkbox" className="size-6" checked={value.days.includes(day)} onChange={() => toggle(day)} />
            {label}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-corpo text-grafite">
          Das
          <input type="time" className={classesDoControle(Boolean(error))} value={value.from} aria-invalid={error ? true : undefined} onChange={(event) => onChange({ ...value, from: event.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-corpo text-grafite">
          Às
          <input type="time" className={classesDoControle(Boolean(error))} value={value.to} aria-invalid={error ? true : undefined} onChange={(event) => onChange({ ...value, to: event.target.value })} />
        </label>
      </div>
      {error ? <p id={errorId} className="text-legenda text-erro">{error}</p> : null}
    </fieldset>
  );
}
