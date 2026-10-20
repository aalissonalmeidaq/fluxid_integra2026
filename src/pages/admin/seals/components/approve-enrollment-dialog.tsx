import React, { useId, useRef, useState } from 'react';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { approvalCandidate, type EnrollmentView, type OrganizationRef } from '@/application/seals/platform-seal-views';
import { Alert, Button, Dialog, Field, Select } from '@/design-system';
import { approvalBlock, validateJustification } from '@/domain/seals/seal-enrollment';
import { SEAL_LIMITS } from '@/domain/seals/seal-limits';

// Aprovar e destinar o lacre a um tenant (Spec 013, RF-012, RN-006; contracts/telas.md). O código fica em destaque para conferir com o
// lacre em mãos. O que impede a aprovação (conflito, redes de outro tenant) aparece em texto e desabilita o envio; o banco decide de novo.

export interface ApproveEnrollmentDialogProps {
  enrollment: EnrollmentView;
  tenants: readonly OrganizationRef[] | null;
  busy: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (organizationId: string, justification: string) => void;
}

export function ApproveEnrollmentDialog({ enrollment, tenants, busy, error, returnFocusTo, onCancel, onConfirm }: ApproveEnrollmentDialogProps): React.JSX.Element {
  const formId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [tenant, setTenant] = useState(enrollment.lastOrganization?.id ?? '');
  const [tenantError, setTenantError] = useState<string | undefined>();
  const [fieldError, setFieldError] = useState<string | undefined>();
  const block = tenant ? approvalBlock(approvalCandidate(enrollment), tenant) : null;

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy || block) return;
    if (!tenant) {
      setTenantError('Escolha o tenant que vai receber o lacre.');
      selectRef.current?.focus();
      return;
    }
    setTenantError(undefined);
    const parsed = validateJustification(String(new FormData(event.currentTarget).get('justification') ?? ''));
    if (!parsed.ok) {
      setFieldError(parsed.error);
      fieldRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    onConfirm(tenant, parsed.value);
  };

  return (
    <Dialog
      title={`Aprovar o lacre ${enrollment.deviceCode}`}
      onClose={onCancel}
      size="padrao"
      initialFocusRef={selectRef}
      returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} disabled={Boolean(block)} loading={busy} loadingLabel="Aprovando…">Aprovar e destinar</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-1 rounded-card border border-borda-suave bg-cinza-gelo p-4">
        <p className="m-0 text-legenda font-semibold text-texto-secundario">Confira se é o código do lacre em mãos</p>
        <p className="m-0 text-h3 font-semibold tracking-wide text-navy">{enrollment.deviceCode}</p>
      </div>
      <p className="m-0 text-corpo">
        O lacre passa a pertencer ao tenant escolhido, em funcionamento e sem cilindro, e fica sabendo da aprovação na próxima chamada.
      </p>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert variant="erro">{error}</Alert>}
        <Select ref={selectRef} label="Tenant de destino" value={tenant} error={tenantError} disabled={tenants === null}
          help={tenants === null ? 'Carregando os tenants ativos…' : undefined} onChange={(event) => setTenant(event.target.value)}>
          <option value="">Escolha o tenant</option>
          {(tenants ?? []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </Select>
        {block && <Alert variant="alerta">{block}</Alert>}
        <Field label="Justificativa" error={fieldError} help={`De ${SEAL_LIMITS.justificationMin} a ${SEAL_LIMITS.justificationMax} caracteres. Fica na auditoria.`}>
          {(control) => <textarea ref={fieldRef} name="justification" rows={3} maxLength={SEAL_LIMITS.justificationMax} {...control} className={textareaClass} />}
        </Field>
      </form>
    </Dialog>
  );
}
