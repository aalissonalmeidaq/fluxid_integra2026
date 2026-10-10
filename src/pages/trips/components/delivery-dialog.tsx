import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TripDeliveryView, TripItemView, TripStopView } from '@/application/trips/trip-views';
import { Alert, Button, Dialog, Field, TextField } from '@/design-system';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { RECIPIENT_RESTRICTED } from '@/domain/trips/trip-vocabulary';
import { TRIP_LIMITS } from '@/domain/trips/trip-limits';
import { formatDateTime } from '@/domain/cylinders/format';
import { validateDeliveryForm, type DeliveryFormInput, type DeliveryFormValue, type DeliveryResultInput } from '@/domain/trips/trip-validation';
import type { FieldErrors } from '@/domain/registry/registry-validation';

export interface DeliveryDialogProps {
  stop: TripStopView;
  // Cilindros que a entrega registra: os em trânsito (registro original) ou os não entregues (correção).
  items: readonly TripItemView[];
  // Registro anterior da parada, mostrado à vista na correção (o nome pode chegar "(restrito)").
  previous: TripDeliveryView | null;
  busy: boolean;
  // Erro do servidor para a tela inteira e por campo (nomes do formulário), mostrados dentro do diálogo.
  error: string | null;
  serverErrors: FieldErrors;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onSubmit: (value: DeliveryFormValue) => void;
}

// Data e hora local no formato do campo `datetime-local`, sem segundos.
const localNow = (): string => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

// Diálogo de entrega por parada (RF-013 a RF-017): resultado de cada cilindro, recebedor, horário, posição opcional e justificativa por
// cilindro não entregue. Na correção, o registro anterior fica à vista e só os cilindros que faltaram entram na lista. Não guarda
// nada no aparelho: o nome do recebedor vive só neste estado até o envio.
export function DeliveryDialog({ stop, items, previous, busy, error, serverErrors, returnFocusTo, onCancel, onSubmit }: DeliveryDialogProps): React.JSX.Element {
  const formId = useId();
  const correction = previous !== null;
  const restricted = previous?.recipientName === RECIPIENT_RESTRICTED;
  const [form, setForm] = useState<Omit<DeliveryFormInput, 'results'>>({
    deliveredAt: localNow(),
    recipientName: correction && !restricted ? previous.recipientName : '',
    recipientRole: correction && !restricted && previous.recipientRole !== null ? previous.recipientRole : '',
    latitude: '', longitude: '', atSiteAddress: false,
  });
  const [results, setResults] = useState<DeliveryResultInput[]>(() => items.map((item) => ({ itemId: item.id, delivered: true, reason: '' })));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tick, setTick] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => ({ ...errors, ...serverErrors }), [errors, serverErrors]);

  useEffect(() => {
    if (tick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [tick, serverErrors]);

  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>): void => {
    setForm((current) => ({ ...current, [field]: field === 'atSiteAddress' ? event.target.checked : event.target.value }));
  };
  const setResult = (itemId: string, patch: Partial<DeliveryResultInput>): void => setResults((current) => current.map((result) => (result.itemId === itemId ? { ...result, ...patch } : result)));

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const parsed = validateDeliveryForm({ ...form, results }, new Date(), { allowNoResults: correction });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setTick((current) => current + 1);
      return;
    }
    setErrors({});
    onSubmit(parsed.value);
  };

  return (
    <Dialog
      title={`${correction ? 'Corrigir entrega' : 'Registrar entrega'} · Parada ${stop.position ?? ''}`}
      onClose={onCancel}
      size="padrao"
      initialFocusRef={nameRef}
      returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Registrando…">{correction ? 'Registrar correção' : 'Registrar entrega'}</Button>
        </>
      )}
    >
      <form id={formId} ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-6">
        <p className="text-corpo">{`${stop.site.name} · ${stop.site.customerName} · ${stop.site.city}/${stop.site.state}`}</p>
        {error && <Alert variant="erro">{error}</Alert>}

        {previous && (
          <div className="rounded-card border border-borda-suave bg-cinza-gelo p-4">
            <p className="text-corpo font-semibold text-navy">Registro anterior</p>
            <p className="mt-1 text-corpo">{`Entrega em ${formatDateTime(previous.deliveredAt)} · recebido por ${previous.recipientName}${previous.recipientRole && previous.recipientRole !== RECIPIENT_RESTRICTED ? ` (${previous.recipientRole})` : ''}.`}</p>
            <p className="mt-1 text-corpo">A correção cria um novo registro; o anterior é mantido no histórico.</p>
          </div>
        )}

        <fieldset className="flex min-w-0 flex-col gap-4">
          <legend className="mb-2 text-h3 font-semibold text-navy">{correction ? 'Cilindros que faltaram' : 'Cilindros da parada'}</legend>
          {items.length === 0 && <p className="text-corpo">Não há cilindros pendentes nesta parada. A correção só atualiza os dados do recebedor.</p>}
          {items.map((item) => {
            const result = results.find((candidate) => candidate.itemId === item.id)!;
            const reasonError = shown[`results.${item.id}`];
            return (
              <div key={item.id} className="flex flex-col gap-2 rounded-controle border border-borda-suave p-4">
                <p className="text-corpo font-semibold text-navy">{`${item.cylinder.serialNumber} · ${item.cylinder.gas} ${item.cylinder.capacityValue} ${item.cylinder.capacityUnit}`}</p>
                <div role="radiogroup" aria-label={`Resultado de ${item.cylinder.serialNumber}`} className="flex flex-wrap gap-6">
                  <label className="inline-flex min-h-alvo items-center gap-2 text-corpo">
                    <input type="radio" name={`result-${item.id}`} checked={result.delivered} onChange={() => setResult(item.id, { delivered: true })} className="size-6" />
                    Entregue
                  </label>
                  <label className="inline-flex min-h-alvo items-center gap-2 text-corpo">
                    <input type="radio" name={`result-${item.id}`} checked={!result.delivered} onChange={() => setResult(item.id, { delivered: false })} className="size-6" />
                    Não entregue
                  </label>
                </div>
                {!result.delivered && (
                  <Field label={`Por que ${item.cylinder.serialNumber} não foi entregue`} error={reasonError}>
                    {(control) => <textarea name={`reason-${item.id}`} rows={2} maxLength={TRIP_LIMITS.justificationMax} value={result.reason} onChange={(event) => setResult(item.id, { reason: event.target.value })} {...control} className={textareaClass} />}
                  </Field>
                )}
              </div>
            );
          })}
          {shown.results && <p role="alert" className="text-corpo font-semibold text-erro">{shown.results}</p>}
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-4">
          <legend className="mb-2 text-h3 font-semibold text-navy">Recebimento</legend>
          <div className="grid gap-4 tablet:grid-cols-2">
            <TextField ref={nameRef} label="Nome de quem recebeu" name="recipientName" value={form.recipientName} onChange={set('recipientName')} maxLength={TRIP_LIMITS.recipientNameMax}
              autoComplete="off" error={shown.recipientName} help="Nome completo, de 2 a 120 caracteres. Fica restrito a quem pode ver recebedores." />
            <TextField label="Função (opcional)" name="recipientRole" value={form.recipientRole} onChange={set('recipientRole')} maxLength={TRIP_LIMITS.recipientRoleMax} autoComplete="off" error={shown.recipientRole} />
            <TextField label="Data e hora da entrega" name="deliveredAt" type="datetime-local" value={form.deliveredAt} onChange={set('deliveredAt')} error={shown.deliveredAt} />
          </div>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-4">
          <legend className="mb-2 text-h3 font-semibold text-navy">Posição (opcional)</legend>
          <p className="text-corpo">Informe a latitude e a longitude, ou marque que a entrega foi no endereço da unidade. Fora da geocerca da unidade é aceito, e o registro destaca isso.</p>
          <div className="grid gap-4 tablet:grid-cols-2">
            <TextField label="Latitude" name="latitude" inputMode="decimal" value={form.latitude} onChange={set('latitude')} error={shown.latitude} help="Exemplo: -23,5505" />
            <TextField label="Longitude" name="longitude" inputMode="decimal" value={form.longitude} onChange={set('longitude')} error={shown.longitude} help="Exemplo: -46,6333" />
          </div>
          <label className="inline-flex min-h-alvo items-center gap-2 text-corpo">
            <input type="checkbox" name="atSiteAddress" checked={form.atSiteAddress} onChange={set('atSiteAddress')} className="size-6" />
            Entrega no endereço da unidade
          </label>
        </fieldset>
      </form>
    </Dialog>
  );
}
