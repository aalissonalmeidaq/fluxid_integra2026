import React from 'react';
import { Button, TextField } from '@/design-system';
import type { ContactInput } from '@/domain/registry/registry-validation';
import { MAX_CONTACTS } from '@/domain/registry/registry-vocabulary';

export interface ContactListEditorProps {
  contacts: readonly ContactInput[];
  onChange: (contacts: ContactInput[]) => void;
  // Erros por campo no formato `contacts.<índice>.<campo>` e o erro geral em `contacts`.
  errors: Readonly<Record<string, string>>;
  disabled?: boolean;
}

const EMPTY_CONTACT: ContactInput = { name: '', role: '', phone: '', email: '', isPrimary: false };

// Lista de contatos repetíveis: até MAX_CONTACTS, um só principal (RF-003). Cada campo mostra o erro junto de si.
export function ContactListEditor({ contacts, onChange, errors, disabled = false }: ContactListEditorProps): React.JSX.Element {
  const update = (index: number, patch: Partial<ContactInput>): void => {
    onChange(contacts.map((contact, position) => (position === index ? { ...contact, ...patch } : contact)));
  };
  const markPrimary = (index: number): void => {
    onChange(contacts.map((contact, position) => ({ ...contact, isPrimary: position === index })));
  };
  const remove = (index: number): void => onChange(contacts.filter((_, position) => position !== index));
  const add = (): void => onChange([...contacts, { ...EMPTY_CONTACT, isPrimary: contacts.length === 0 }]);
  const generalError = errors.contacts;

  return (
    <div className="flex flex-col gap-4">
      {contacts.length === 0 ? <p className="text-corpo text-texto-secundario">Nenhum contato informado. Adicione quem atende pelo cliente.</p> : null}
      <ul className="flex flex-col gap-4">
        {contacts.map((contact, index) => (
          <li key={index} className="flex flex-col gap-4 rounded-card border border-borda bg-branco p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-corpo font-semibold text-grafite">Contato {index + 1}</h3>
              <Button variant="secundario" disabled={disabled} aria-label={`Remover contato ${index + 1}`} onClick={() => remove(index)}>Remover</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Nome" name={`contacts.${index}.name`} value={contact.name} maxLength={120} disabled={disabled} error={errors[`contacts.${index}.name`]} autoComplete="off" onChange={(event) => update(index, { name: event.target.value })} />
              <TextField label="Função" name={`contacts.${index}.role`} value={contact.role} maxLength={80} disabled={disabled} error={errors[`contacts.${index}.role`]} autoComplete="off" onChange={(event) => update(index, { role: event.target.value })} />
              <TextField label="Telefone" name={`contacts.${index}.phone`} value={contact.phone} inputMode="tel" autoComplete="off" disabled={disabled} error={errors[`contacts.${index}.phone`]} help="Com DDD." onChange={(event) => update(index, { phone: event.target.value })} />
              <TextField label="E-mail" name={`contacts.${index}.email`} value={contact.email} inputMode="email" autoComplete="off" maxLength={160} disabled={disabled} error={errors[`contacts.${index}.email`]} onChange={(event) => update(index, { email: event.target.value })} />
            </div>
            <label className="flex min-h-alvo items-center gap-4 text-corpo text-grafite">
              <input type="radio" name="primary-contact" className="size-6" aria-label={`Contato principal (contato ${index + 1})`} checked={contact.isPrimary} disabled={disabled} onChange={() => markPrimary(index)} />
              Contato principal
            </label>
          </li>
        ))}
      </ul>
      {generalError ? <p role="alert" className="text-legenda text-erro">{generalError}</p> : null}
      <div>
        <Button variant="secundario" disabled={disabled || contacts.length >= MAX_CONTACTS} onClick={add}>Adicionar contato</Button>
        {contacts.length >= MAX_CONTACTS ? <p className="mt-2 text-legenda text-texto-secundario">Limite de {MAX_CONTACTS} contatos atingido.</p> : null}
      </div>
    </div>
  );
}
