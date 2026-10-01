import React, { useEffect, useRef, useState } from 'react';
import { useTenant } from '@/app/tenant/tenant-context';
import type { SelectResult } from '@/application/identity/tenant-context-service';
import type { TenantOption } from '@/domain/identity/tenant-selection';
import { Alert, Button, Card, List, ListItem, Loading } from '@/design-system';

const FAILURES: Record<Extract<SelectResult, { ok: false }>['reason'], string> = {
  not_eligible: 'Esta organização não está mais disponível para você. Escolha outra.',
  unavailable: 'Não foi possível confirmar seu acesso agora. Tente novamente.',
  switch_failed: 'Não foi possível trocar de organização com segurança. Tente novamente.',
};

export interface TenantSelectionViewProps {
  options: readonly TenantOption[];
  onSelect: (organizationId: string) => Promise<SelectResult>;
  // Presente quando já existe um tenant ativo a manter (troca voluntária).
  onCancel?: () => void;
  currentOrganizationId?: string | null;
}

export function TenantSelectionView({ options, onSelect, onCancel, currentOrganizationId = null }: TenantSelectionViewProps): React.JSX.Element {
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => { if (failure) alertRef.current?.focus(); }, [failure]);

  const choose = async (organizationId: string): Promise<void> => {
    if (pending || organizationId === currentOrganizationId) return;
    setPending(organizationId);
    setFailure(null);
    let outcome: SelectResult;
    try { outcome = await onSelect(organizationId); }
    catch { outcome = { ok: false, reason: 'unavailable' }; }
    setPending(null);
    if (!outcome.ok) setFailure(FAILURES[outcome.reason]);
  };

  return (
    <Card as="section" aria-labelledby="tenant-selection-title" className="mx-auto flex w-full max-w-compacto flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="tenant-selection-title" ref={headingRef} tabIndex={-1} className="text-h3 font-semibold text-navy">Escolha a organização</h2>
        <p className="text-corpo">Você tem acesso a mais de uma organização. Seus dados e permissões valem somente na organização escolhida.</p>
      </div>

      {failure && <Alert ref={alertRef} tabIndex={-1} variant="erro">{failure}</Alert>}
      {pending && <Loading variant="botao" label="Confirmando seu acesso…" />}

      <List variant="cartoes" aria-label="Organizações disponíveis">
        {options.map((option) => {
          const current = option.organizationId === currentOrganizationId;
          return (
            <ListItem key={option.organizationId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-navy">{option.displayName}</p>
                  <p className="text-corpo">{option.kind === 'owner' ? 'Administração da plataforma FluxID' : 'Organização contratante'}{current && ' — organização atual'}</p>
                </div>
                <Button disabled={Boolean(pending) || current} onClick={() => void choose(option.organizationId)}>
                  Entrar em {option.displayName}
                </Button>
              </div>
            </ListItem>
          );
        })}
      </List>

      {onCancel && <Button variant="secundario" onClick={onCancel} className="self-start">Cancelar</Button>}
    </Card>
  );
}

export function TenantSelectionPage(): React.JSX.Element {
  const { options, activeOrganizationId, switching, select, cancelSwitch } = useTenant();
  return (
    <TenantSelectionView
      options={options}
      currentOrganizationId={activeOrganizationId}
      onSelect={select}
      {...(switching && activeOrganizationId ? { onCancel: cancelSwitch } : {})}
    />
  );
}
