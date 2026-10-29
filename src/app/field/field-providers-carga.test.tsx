import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spec 015 (T130): a fila de campo e o envio só servem a quem entrou na conta. Na landing e na entrada, sem sessão, os dois módulos não são
// baixados: disputariam a rede com a página pública e atrasariam o LCP da landing (orçamento da Spec 011).
const carga = vi.hoisted(() => ({ sync: vi.fn(), offline: vi.fn(), auth: { status: 'anonymous' } as { status: string; offline?: boolean } }));

vi.mock('./field-sync-factory', () => { carga.sync(); return { createFieldSync: () => null }; });
vi.mock('./offline-field-factory', () => { carga.offline(); return { createOfflineField: () => null }; });
vi.mock('@/app/auth/auth-context', () => ({
  useAuth: () => ({ state: carga.auth, verifySession: vi.fn(), offlineAccess: null, offlineAccessStore: null }),
}));
vi.mock('@/app/connectivity-context', () => ({ useConnectivity: () => ({ client: null, config: null, result: { selectedEndpoint: null } }) }));
vi.mock('@/app/tenant/tenant-context', () => ({ useTenant: () => ({ database: null, activeOrganizationId: null }) }));
vi.mock('@/app/navigation/permissions-context', () => ({ usePermissions: () => ({ permissions: null }) }));

const { OfflineFieldProvider } = await import('./offline-field-provider');
const { FieldSyncProvider } = await import('./field-sync-provider');

const arvore = (): React.JSX.Element => (
  <OfflineFieldProvider>
    <FieldSyncProvider>
      <p>conteúdo</p>
    </FieldSyncProvider>
  </OfflineFieldProvider>
);

describe('carga dos módulos de campo', () => {
  beforeEach(() => { carga.auth = { status: 'anonymous' }; });

  it('sem sessão, não baixa a fila nem o envio; depois da entrada, baixa os dois', async () => {
    const { rerender } = render(arvore());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(carga.offline).not.toHaveBeenCalled();
    expect(carga.sync).not.toHaveBeenCalled();

    carga.auth = { status: 'authenticated', offline: false };
    rerender(arvore());
    await waitFor(() => {
      expect(carga.offline).toHaveBeenCalled();
      expect(carga.sync).toHaveBeenCalled();
    });
  });
});
