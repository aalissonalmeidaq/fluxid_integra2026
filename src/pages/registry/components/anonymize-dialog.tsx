import React, { useId, useRef, useState } from 'react';
import type { AnonymizationRequest } from '@/application/registry/registry-service';
import { textareaClass } from '@/components/identity/confirmation-dialog';
import { validateJustification } from '@/domain/registry/registry-validation';
import { ANONYMIZATION_REASON_LABELS, ANONYMIZATION_REASONS, type AnonymizationReason } from '@/domain/registry/registry-vocabulary';
import { Alert, Button, Dialog, Field, Select, TextField } from '@/design-system';

const CONFIRMATION_WORD = 'ANONIMIZAR';

export type AnonymizationSubject = 'driver' | 'customer' | 'contact';

// O que a anonimização remove e o que permanece (RF-057, RF-063, RF-062): mostrado antes da confirmação.
const EFFECTS: Record<AnonymizationSubject, { title: string; removed: string[]; kept: string[] }> = {
  driver: {
    title: 'Anonimizar dados pessoais do motorista',
    removed: ['Nome (vira "Motorista anonimizado")', 'CPF', 'Número da CNH', 'Telefone', 'Vínculo com o usuário do aplicativo'],
    kept: ['Categoria e validade da CNH', 'Situação cadastral (inativo)', 'Histórico e auditoria, que não guardam os valores pessoais'],
  },
  customer: {
    title: 'Anonimizar dados pessoais do cliente',
    removed: [
      'Nome (vira "Cliente anonimizado"), nome fantasia, CPF e observações',
      'De todos os contatos: nome, função, telefone e e-mail',
      'De todas as unidades: nome, responsável pelo recebimento e telefone, instruções de acesso, complemento, número e coordenadas',
    ],
    kept: ['Segmento e situação cadastral (inativo)', 'CEP, logradouro, bairro, cidade e UF das unidades, e as geocercas', 'Histórico e auditoria, que não guardam os valores pessoais'],
  },
  contact: {
    title: 'Anonimizar dados pessoais do contato',
    removed: ['Nome (vira "Contato anonimizado")', 'Função', 'Telefone', 'E-mail'],
    kept: ['O cadastro do cliente e o contato na lista, com o nome fixo', 'Histórico e auditoria, que não guardam os valores pessoais'],
  },
};

export interface AnonymizeDialogProps {
  subject: AnonymizationSubject;
  // Nome só para o texto do diálogo; nunca é enviado.
  name: string;
  busy?: boolean;
  // Erro do servidor, mostrado dentro do diálogo (por exemplo, falta do segundo fator).
  error?: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (request: AnonymizationRequest) => void;
}

// Diálogo de anonimização (RF-062, História 8): lista o que será removido e o que permanece, avisa que é irreversível, exige motivo,
// justificativa e a palavra ANONIMIZAR digitada, e devolve o foco ao acionador ao fechar.
export function AnonymizeDialog({ subject, name, busy = false, error = null, returnFocusTo, onCancel, onConfirm }: AnonymizeDialogProps): React.JSX.Element {
  const formId = useId();
  const effects = EFFECTS[subject];
  const reasonRef = useRef<HTMLSelectElement>(null);
  const [reason, setReason] = useState<AnonymizationReason | ''>('');
  const [justification, setJustification] = useState('');
  const [word, setWord] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; justification?: string; word?: string }>({});

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const found: typeof errors = {};
    if (reason === '') found.reason = 'Escolha o motivo.';
    const parsed = validateJustification(justification);
    if (!parsed.ok) found.justification = 'Explique em 5 a 500 caracteres.';
    if (word.trim() !== CONFIRMATION_WORD) found.word = `Digite ${CONFIRMATION_WORD} para confirmar.`;
    setErrors(found);
    if (found.reason || found.justification || found.word || reason === '' || !parsed.ok) return;
    onConfirm({ reason, justification: parsed.value });
  };

  return (
    <Dialog
      title={effects.title}
      onClose={onCancel}
      initialFocusRef={reasonRef}
      returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} disabled={busy}>{busy ? 'Anonimizando…' : 'Anonimizar dados pessoais'}</Button>
        </>
      )}
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Alert variant="alerta" title="Esta ação é irreversível">
          Os dados de {name} abaixo deixam de existir no FluxID e não podem ser recuperados. Cópias de segurança e registros da plataforma seguem os prazos próprios de retenção.
        </Alert>
        <div className="grid gap-4 tablet:grid-cols-2">
          <section aria-labelledby={`${formId}-removed`}>
            <h4 id={`${formId}-removed`} className="text-corpo font-semibold text-navy">O que será removido</h4>
            <ul className="mt-2 list-disc ps-6 text-corpo">{effects.removed.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section aria-labelledby={`${formId}-kept`}>
            <h4 id={`${formId}-kept`} className="text-corpo font-semibold text-navy">O que permanece</h4>
            <ul className="mt-2 list-disc ps-6 text-corpo">{effects.kept.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>
        {error && <Alert variant="erro">{error}</Alert>}
        <Select ref={reasonRef} label="Motivo" name="reason" value={reason} onChange={(event) => setReason(event.target.value as AnonymizationReason | '')} error={errors.reason}>
          <option value="" disabled>Escolha o motivo</option>
          {ANONYMIZATION_REASONS.map((item) => <option key={item} value={item}>{ANONYMIZATION_REASON_LABELS[item]}</option>)}
        </Select>
        <Field label="Justificativa" error={errors.justification}>
          {(control) => <textarea {...control} name="justification" rows={3} maxLength={500} value={justification} onChange={(event) => setJustification(event.target.value)} className={textareaClass} />}
        </Field>
        <TextField label={`Digite ${CONFIRMATION_WORD} para confirmar`} name="confirmation" value={word} onChange={(event) => setWord(event.target.value)} autoComplete="off" error={errors.word} />
      </form>
    </Dialog>
  );
}
