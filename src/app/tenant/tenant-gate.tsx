import React from 'react';
import { useTenant } from './tenant-context';
import { TenantSelectionPage } from '@/pages/auth/tenant-selection-page';
import { primaryButtonClass } from '@/components/identity/confirmation-dialog';

// Áreas específicas de uma organização só abrem depois de o tenant ser escolhido e confirmado no servidor.
// Trocar de tenant remonta a área (chave por organização): estado, consultas e ações pendentes do anterior somem (RF-027).
export function TenantGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status, selection, activeOrganizationId, switching, reload } = useTenant();

  if (status === 'idle' || status === 'loading') {
    return <p role="status" aria-live="polite">Verificando seus acessos…</p>;
  }
  if (status === 'error') {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950">
        <p>Não foi possível confirmar seus acessos agora.</p>
        <button type="button" onClick={() => void reload()} className={primaryButtonClass}>Tentar novamente</button>
      </div>
    );
  }
  if (selection.kind === 'none') {
    return (
      <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        Você não tem nenhum acesso ativo a uma organização. Fale com o administrador.
      </div>
    );
  }
  if (selection.kind === 'choose' || switching) return <TenantSelectionPage />;
  return <React.Fragment key={activeOrganizationId}>{children}</React.Fragment>;
}
