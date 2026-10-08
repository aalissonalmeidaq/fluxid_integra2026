import React, { useRef, useState } from 'react';
import type { PostalAddressView, PostalCodeService, PostalLookupOutcome } from '@/application/registry/postal-code-service';
import { Button, TextField } from '@/design-system';
import { normalizePostalCode } from '@/domain/registry/phone-and-postal-code';

export interface PostalCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  organizationId: string;
  service: PostalCodeService | null;
  online: boolean;
  // Chamado com o endereço encontrado; quem usa decide o que preencher (nunca apagar o que a pessoa já digitou).
  onAddress: (address: PostalAddressView) => void;
  // Chamado depois do preenchimento bem-sucedido, para levar o foco ao campo "Número".
  onFound?: () => void;
  error?: string | undefined;
}

type Status = { kind: 'idle' } | { kind: 'searching' } | PostalLookupOutcome;

// Uma só mensagem atômica por resultado, em região de status, sem mover o foco (RF-008, RF-011, História 8).
const MESSAGES: Record<Exclude<PostalLookupOutcome['kind'], 'rate_limited'>, string> = {
  found: 'Endereço preenchido pelo CEP. Confira e informe o número.',
  not_found: 'CEP não encontrado. Digite o endereço.',
  unavailable: 'Não foi possível buscar o CEP agora. Digite o endereço.',
  offline: 'Sem conexão. Digite o endereço.',
  invalid: 'Informe um CEP com 8 dígitos.',
  denied: 'Você não tem permissão para buscar o CEP. Digite o endereço.',
};

function messageOf(status: Status): string {
  if (status.kind === 'idle') return '';
  if (status.kind === 'searching') return 'Buscando o endereço…';
  if (status.kind === 'rate_limited') return `Muitas buscas em pouco tempo. Tente de novo em ${status.retryAfterSeconds} segundos ou digite o endereço.`;
  return MESSAGES[status.kind];
}

// Campo de CEP com "Buscar CEP" (também ao sair do campo com 8 dígitos). A falha da busca nunca trava o cadastro: todos os
// campos do endereço continuam editáveis e o texto digitado é preservado.
export function PostalCodeField({ value, onChange, organizationId, service, online, onAddress, onFound, error }: PostalCodeFieldProps): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const lastSearched = useRef<string | null>(null);
  const searching = status.kind === 'searching';

  const search = async (): Promise<void> => {
    if (searching) return;
    const normalized = normalizePostalCode(value);
    if (normalized === null) {
      setStatus({ kind: 'invalid' });
      return;
    }
    if (!service || !online) {
      setStatus({ kind: 'offline' });
      return;
    }
    lastSearched.current = normalized;
    setStatus({ kind: 'searching' });
    const outcome = await service.lookup(organizationId, normalized);
    setStatus(outcome);
    if (outcome.kind === 'found') {
      onAddress(outcome.address);
      onFound?.();
    }
  };

  const onBlur = (): void => {
    const normalized = normalizePostalCode(value);
    if (normalized !== null && normalized !== lastSearched.current && online && service) void search();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label="CEP"
          name="postalCode"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={9}
          error={error}
          help="Digite o CEP: o endereço é preenchido sozinho. Se não der, você pode digitar tudo."
          wrapperClassName="min-w-0 flex-1"
        />
        <Button variant="secundario" disabled={!online} loading={searching} loadingLabel="Buscando…" onClick={() => void search()}>Buscar CEP</Button>
      </div>
      <p role="status" aria-atomic="true" className="min-h-6 text-legenda text-texto-secundario">{messageOf(status)}</p>
    </div>
  );
}
