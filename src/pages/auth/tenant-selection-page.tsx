import React, { useEffect, useRef, useState } from 'react';
import { useTenant } from '@/app/tenant/tenant-context';
import type { SelectResult } from '@/application/identity/tenant-context-service';
import type { TenantOption } from '@/domain/identity/tenant-selection';
import { primaryButtonClass, secondaryButtonClass } from '@/components/identity/confirmation-dialog';

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
    <section aria-labelledby="tenant-selection-title" className="mx-auto w-full max-w-lg space-y-4 rounded-xl border border-[#D7E2EE] bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 id="tenant-selection-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-[#163B72] outline-none focus-visible:ring-2 focus-visible:ring-[#1766D9]">Escolha a organização</h2>
        <p className="mt-1 text-sm">Você tem acesso a mais de uma organização. Seus dados e permissões valem somente na organização escolhida.</p>
      </div>

      {failure && (
        <div ref={alertRef} role="alert" tabIndex={-1} className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950 outline-none focus-visible:ring-2 focus-visible:ring-rose-800">{failure}</div>
      )}
      {pending && <p role="status" aria-live="polite" className="text-sm">Confirmando seu acesso…</p>}

      <ul className="space-y-2" aria-label="Organizações disponíveis">
        {options.map((option) => {
          const current = option.organizationId === currentOrganizationId;
          return (
            <li key={option.organizationId} className="rounded-lg border border-[#D7E2EE] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-[#163B72]">{option.displayName}</p>
                  <p className="text-sm">{option.kind === 'owner' ? 'Administração da plataforma FluxID' : 'Organização contratante'}{current && ' — organização atual'}</p>
                </div>
                <button type="button" disabled={Boolean(pending) || current} onClick={() => void choose(option.organizationId)} className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}>
                  Entrar em {option.displayName}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {onCancel && <button type="button" onClick={onCancel} className={secondaryButtonClass}>Cancelar</button>}
    </section>
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
