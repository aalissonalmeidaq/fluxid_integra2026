import React from 'react';
import { useTenant } from './tenant-context';
import { TenantSelectionPage } from '@/pages/auth/tenant-selection-page';
import { ErrorState, Loading } from '@/design-system';

// Áreas específicas de uma organização só abrem depois de o tenant ser escolhido e confirmado no servidor.
// Trocar de tenant remonta a área (chave por organização): estado, consultas e ações pendentes do anterior somem (RF-027).
export function TenantGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status, selection, activeOrganizationId, switching, reload } = useTenant();

  if (status === 'idle' || status === 'loading') {
    return <Loading label="Verificando seus acessos…" />;
  }
  if (status === 'error') {
    return (
      <ErrorState
        title="Acessos não confirmados"
        message="Não foi possível confirmar seus acessos agora."
        onRetry={() => void reload()}
      />
    );
  }
  if (selection.kind === 'none') {
    return (
      <ErrorState
        variant="sem-permissao"
        title="Nenhum acesso ativo"
        message="Você não tem nenhum acesso ativo a uma organização. Fale com o administrador."
      />
    );
  }
  if (selection.kind === 'choose' || switching) return <TenantSelectionPage />;
  return <React.Fragment key={activeOrganizationId}>{children}</React.Fragment>;
}
