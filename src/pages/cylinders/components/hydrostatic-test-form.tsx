import React, { useEffect, useRef, useState } from 'react';
import type { CylinderOutcome } from '@/application/cylinders/cylinder-service';
import type { TestView } from '@/application/cylinders/cylinder-views';
import {
  validateHydrostaticTestForm, validateJustification, type FieldErrors, type HydrostaticTestFormValue,
} from '@/domain/cylinders/cylinder-validation';
import { Alert, Button, Field, Select, TextField } from '@/design-system';
import { textareaClass } from '@/components/identity/confirmation-dialog';

export interface HydrostaticTestFormProps {
  mode: 'register' | 'rectify';
  // Registro original a retificar: os campos já vêm preenchidos.
  initial?: TestView;
  online: boolean;
  // Dia de hoje em AAAA-MM-DD (injetável nos testes).
  today?: string;
  onSubmit: (value: HydrostaticTestFormValue, justification: string) => Promise<CylinderOutcome<unknown>>;
  onDone: () => void;
  onCancel: () => void;
}

interface Values { performedOn: string; result: string; reportNumber: string; executor: string; nextDueOn: string; notes: string; justification: string }

const SERVER_FIELDS: Record<string, keyof Values | 'form'> = {
  performed_on: 'performedOn', result: 'result', report_number: 'reportNumber', executor: 'executor', next_due_on: 'nextDueOn', notes: 'notes',
  test_id: 'form',
};

const initialValues = (test?: TestView): Values => ({
  performedOn: test?.performedOn ?? '', result: test?.result ?? '', reportNumber: test?.reportNumber ?? '', executor: test?.executor ?? '',
  nextDueOn: test?.nextDueOn ?? '', notes: test?.notes ?? '', justification: '',
});

// Registro e retificação de teste hidrostático (RF-019, RF-022): uma página, um envio, erros junto dos campos e foco no primeiro erro.
export function HydrostaticTestForm({ mode, initial, online, today, onSubmit, onDone, onCancel }: HydrostaticTestFormProps): React.JSX.Element {
  const rectifying = mode === 'rectify';
  const [values, setValues] = useState<Values>(() => initialValues(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorTick, setErrorTick] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errorTick > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorTick]);
  useEffect(() => { if (banner) bannerRef.current?.focus(); }, [banner]);

  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };
  const fail = (next: FieldErrors): void => { setErrors(next); setErrorTick((tick) => tick + 1); };

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy || !online) return;
    setBanner(null);
    const parsed = validateHydrostaticTestForm(values, today);
    const justification = rectifying ? validateJustification(values.justification) : null;
    const found: FieldErrors = {};
    if (!parsed.ok) Object.assign(found, parsed.errors);
    if (justification && !justification.ok) found.justification = justification.errors.justification ?? 'Explique o motivo.';
    if (!parsed.ok || Object.keys(found).length > 0) return fail(found);
    setErrors({});

    setBusy(true);
    const outcome = await onSubmit(parsed.value, justification && justification.ok ? justification.value : '');
    setBusy(false);
    if (outcome.kind === 'success') return onDone();
    if (outcome.kind === 'invalid' || outcome.kind === 'justification_required') {
      const mapped: FieldErrors = {};
      for (const [field, message] of Object.entries(outcome.kind === 'invalid' ? outcome.fields ?? {} : { justification: 'Explique o motivo com pelo menos 5 caracteres.' })) {
        const target = field === 'justification' ? 'justification' : SERVER_FIELDS[field] ?? 'form';
        mapped[target] = message;
      }
      if (mapped.form) { setBanner(mapped.form); delete mapped.form; }
      return Object.keys(mapped).length > 0 ? fail(mapped) : undefined;
    }
    if (outcome.kind === 'cylinder_inactive') return setBanner('Este cilindro está inativo e não aceita testes.');
    if (outcome.kind === 'access_denied' || outcome.kind === 'mfa_required') return setBanner('Você não tem permissão para esta ação.');
    if (outcome.kind === 'offline') return setBanner('Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.');
    if (outcome.kind === 'not_found') return setBanner('Registro não encontrado. Recarregue a tela.');
    return setBanner('Não foi possível confirmar se o teste foi salvo. Confira o cilindro antes de tentar de novo.');
  };

  return (
    <form ref={formRef} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 rounded-card border border-borda-suave p-4">
      <h4 className="text-h3 font-semibold text-navy">{rectifying ? 'Retificar teste hidrostático' : 'Registrar teste hidrostático'}</h4>
      {!online && <Alert variant="informacao">Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.</Alert>}
      {banner && <Alert ref={bannerRef} tabIndex={-1} variant="erro">{banner}</Alert>}
      <div className="grid gap-4 tablet:grid-cols-2">
        <TextField label="Data de realização" name="performedOn" type="date" value={values.performedOn} onChange={set('performedOn')} error={errors.performedOn} />
        <Select label="Resultado" name="result" value={values.result} onChange={set('result')} error={errors.result}>
          <option value="" disabled>Selecione</option>
          <option value="approved">Aprovado</option>
          <option value="rejected">Reprovado</option>
        </Select>
        <TextField label="Executor" name="executor" value={values.executor} onChange={set('executor')} maxLength={120} autoComplete="off" error={errors.executor} />
        <TextField label="Número do laudo" name="reportNumber" value={values.reportNumber} onChange={set('reportNumber')} maxLength={60} autoComplete="off" error={errors.reportNumber} />
        <TextField label="Próxima data" name="nextDueOn" type="date" value={values.nextDueOn} onChange={set('nextDueOn')} help="Obrigatória quando o teste é aprovado." error={errors.nextDueOn} />
        <Field label="Observações" error={errors.notes} className="tablet:col-span-2">
          {(control) => <textarea {...control} name="notes" rows={2} maxLength={500} value={values.notes} onChange={set('notes')} className={textareaClass} />}
        </Field>
        {rectifying && (
          <Field label="Justificativa da retificação" help="O registro original continua no histórico; esta retificação o substitui na leitura." error={errors.justification} className="tablet:col-span-2">
            {(control) => <textarea {...control} name="justification" rows={3} maxLength={500} value={values.justification} onChange={set('justification')} className={textareaClass} />}
          </Field>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!online} loading={busy} loadingLabel="Salvando…">{rectifying ? 'Registrar retificação' : 'Registrar teste'}</Button>
        <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}
