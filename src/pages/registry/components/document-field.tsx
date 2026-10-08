import React from 'react';
import { TextField } from '@/design-system';
import type { PersonType } from '@/domain/registry/registry-vocabulary';

export interface DocumentFieldProps {
  // Escolhe o rótulo, a ajuda e o teclado: CNPJ para pessoa jurídica e CPF para pessoa física (RF-002).
  personType: PersonType | '';
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean;
  name?: string;
  // Na edição o documento aparece mascarado e só muda se a pessoa digitar um valor novo (RF-004a, RF-029).
  placeholder?: string;
  help?: string;
}

const LABELS: Record<PersonType | '', string> = { legal: 'CNPJ', individual: 'CPF', '': 'Documento' };
const HELPS: Record<PersonType | '', string> = {
  legal: 'Aceita ponto, barra e hífen. O CNPJ com letras (alfanumérico) também vale.',
  individual: 'Só números; ponto e hífen são aceitos.',
  '': 'Escolha antes o tipo de pessoa.',
};

// Campo do documento do cliente: o rótulo e a ajuda seguem o tipo de pessoa; a validação dos dígitos fica no domínio.
export function DocumentField({ personType, value, onChange, error, disabled = false, name = 'document', placeholder, help }: DocumentFieldProps): React.JSX.Element {
  return (
    <TextField
      label={LABELS[personType]}
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode={personType === 'individual' ? 'numeric' : 'text'}
      autoComplete="off"
      maxLength={18}
      disabled={disabled}
      error={error}
      help={help ?? HELPS[personType]}
      {...(placeholder ? { placeholder } : {})}
    />
  );
}
