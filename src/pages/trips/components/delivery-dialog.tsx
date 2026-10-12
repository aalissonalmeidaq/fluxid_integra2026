import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TripDeliveryView, TripItemView, TripStopView } from '@/application/trips/trip-views';
import { Alert, Button, Dialog, Field, TextField } from '@/design-system';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { EMPTY_POSITION_DRAFT, isDraftStale, type PositionDraft } from '@/domain/field/position-draft';
import { decideDelivery, type ResolutionLike } from '@/domain/field/reading-result';
import { readingSourceSentence } from '@/domain/field/reading-source';
import type { GeolocationReader } from '@/infrastructure/field/geolocation-reader';
import type { ReadEvent, ReadFeedback } from '@/pages/field/identifier-reader-dialog';
import { PositionField } from '@/pages/field/position-field';
import { usePositionReader } from '@/pages/field/use-position-reader';
import { ReaderControls } from '@/pages/field/reader-controls';
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
  // Identifica o código lido (Spec 009). Sem ele, a entrega fica só com o resultado marcado à mão.
  resolve?: (event: ReadEvent) => Promise<ResolutionLike>;
  // Sem conexão a leitura abre, mas registrar exige conexão.
  online?: boolean;
  // Trocáveis nos testes: o leitor de posição e o relógio.
  geolocation?: GeolocationReader;
  now?: () => number;
}

// Data e hora local no formato do campo `datetime-local`, sem segundos.
const localNow = (): string => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

// Diálogo de entrega por parada (RF-013 a RF-017): resultado de cada cilindro, recebedor, horário, posição opcional e justificativa por
// cilindro não entregue. Na correção, o registro anterior fica à vista e só os cilindros que faltaram entram na lista. Não guarda
// nada no aparelho: o nome do recebedor vive só neste estado até o envio.
export function DeliveryDialog({ stop, items, previous, busy, error, serverErrors, returnFocusTo, onCancel, onSubmit, resolve, online = true, geolocation, now }: DeliveryDialogProps): React.JSX.Element {
  const formId = useId();
  const correction = previous !== null;
  const restricted = previous?.recipientName === RECIPIENT_RESTRICTED;
  const [form, setForm] = useState<Omit<DeliveryFormInput, 'results' | 'latitude' | 'longitude' | 'atSiteAddress' | 'gps'>>({
    deliveredAt: localNow(),
    recipientName: correction && !restricted ? previous.recipientName : '',
    recipientRole: correction && !restricted && previous.recipientRole !== null ? previous.recipientRole : '',
    correctionReason: '',
  });
  // Posição: leitura do GPS, coordenadas digitadas ou "no endereço da unidade", sempre opcional (Spec 009).
  const [draft, setDraft] = useState<PositionDraft>(EMPTY_POSITION_DRAFT);
  const position = usePositionReader(geolocation, now);
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

  // A posição é por coordenadas ou no endereço da unidade, nunca as duas (as regras ficam em `domain/field/position-draft.ts`).
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>): void => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };
  const setResult = (itemId: string, patch: Partial<DeliveryResultInput>): void => setResults((current) => current.map((result) => (result.itemId === itemId ? { ...result, ...patch } : result)));
  // Marcar à mão, em qualquer sentido, tira o método de leitura: o servidor assume "manual" para o entregue.
  const markByHand = (itemId: string, delivered: boolean): void => setResult(itemId, { delivered, source: undefined });

  // Leitura (Spec 009, RF-001a): o código identifica o cilindro e, sendo da parada, o marca "Entregue" com o método da leitura. Marcar não
  // salva nada: a entrega só vale ao salvar, uma vez. "Não entregue" e a justificativa continuam manuais.
  const readCylinder = async (event: ReadEvent): Promise<ReadFeedback> => {
    const outcome = await resolve!(event);
    const marked = new Set(results.filter((result) => result.delivered && result.source).map((result) => result.itemId));
    const decision = decideDelivery(outcome, items.map((item) => ({ id: item.id, cylinderId: item.cylinder.id, status: item.itemStatus })), marked, event.source);
    if (decision.action === 'none') return decision.message;
    setResult(decision.itemId, { delivered: true, reason: '', source: event.source });
    return { tone: 'success', message: `Cilindro ${decision.serial} marcado como entregue.` };
  };
  const readCount = results.filter((result) => result.delivered && result.source).length;

  const finish = (position: PositionDraft): void => {
    const parsed = validateDeliveryForm({ ...form, latitude: position.latitude, longitude: position.longitude, atSiteAddress: position.atSiteAddress, gps: position.gps, results }, new Date(), { allowNoResults: correction, correction });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setTick((current) => current + 1);
      return;
    }
    setErrors({});
    onSubmit(parsed.value);
  };
  // Leitura do GPS com mais de 2 minutos é descartada e lida de novo antes de salvar (RF-011); se a nova leitura falha, nada é enviado.
  // Sem leitura velha o envio é imediato, sem espera.
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    if (!isDraftStale(draft, (now ?? Date.now)())) { finish(draft); return; }
    void position.refreshIfStale(draft).then((fresh) => {
      if (!fresh) {
        setErrors({ position: 'Não foi possível atualizar a posição. Leia de novo ou digite as coordenadas.' });
        setTick((current) => current + 1);
        return;
      }
      setDraft(fresh);
      finish(fresh);
    });
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
      <div className="flex flex-col gap-6">
      {resolve && items.length > 0 && (
        <ReaderControls onRead={readCylinder} online={online} disabled={busy} summary={`${readCount} de ${items.length} lidos`} submitLabel="Marcar como entregue" />
      )}
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

        {correction && (
          <Field label="Justificativa da correção" help={`Explique por que a entrega é corrigida, de ${TRIP_LIMITS.justificationMin} a ${TRIP_LIMITS.justificationMax} caracteres. Fica no histórico da viagem.`} error={shown.correctionReason}>
            {(control) => (
              <textarea name="correctionReason" rows={3} maxLength={TRIP_LIMITS.justificationMax * 2} value={form.correctionReason ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, correctionReason: event.target.value }))} {...control} className={textareaClass} />
            )}
          </Field>
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
                {result.delivered && result.source && <p className="m-0 text-legenda text-texto-secundario">{readingSourceSentence('Entregue', result.source)}</p>}
                <div role="radiogroup" aria-label={`Resultado de ${item.cylinder.serialNumber}`} className="flex flex-wrap gap-6">
                  <label className="inline-flex min-h-alvo items-center gap-2 text-corpo">
                    <input type="radio" name={`result-${item.id}`} checked={result.delivered} onChange={() => markByHand(item.id, true)} className="size-6" />
                    Entregue
                  </label>
                  <label className="inline-flex min-h-alvo items-center gap-2 text-corpo">
                    <input type="radio" name={`result-${item.id}`} checked={!result.delivered} onChange={() => markByHand(item.id, false)} className="size-6" />
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
          <p className="text-corpo">Use a posição do aparelho, informe a latitude e a longitude ou marque que a entrega foi no endereço da unidade. Fora da geocerca da unidade é aceito, e o registro destaca isso.</p>
          <PositionField draft={draft} onChange={setDraft} position={position} allowSiteAddress disabled={busy}
            errors={{ latitude: shown.latitude, longitude: shown.longitude, atSiteAddress: shown.atSiteAddress, position: shown.position }} />
        </fieldset>
      </form>
      </div>
    </Dialog>
  );
}
