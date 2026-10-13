import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldService, ResolveOutcome } from '@/application/field/field-service';
import type { BarcodeFrame } from '@/infrastructure/field/barcode-reader';

// Spec 009, US3 (RF-006, RN-005): o "Ler cilindro" ligado ao serviço de campo, à organização ativa e à conexão. Sem serviço ou sem
// organização ativa não aparece; a sessão expirada devolve a pessoa à entrada; achar o cilindro abre o detalhe dentro do app.
const state = { field: null as FieldService | null, org: null as string | null, online: true, logout: vi.fn(async () => undefined) };
vi.mock('./use-field-service', () => ({ useFieldService: () => state.field }));
vi.mock('@/app/tenant/tenant-context', () => ({ useTenant: () => ({ activeOrganizationId: state.org }) }));
vi.mock('@/app/use-online-status', () => ({ useOnlineStatus: () => state.online }));
vi.mock('@/app/auth/auth-context', () => ({ useAuth: () => ({ logout: state.logout }) }));

let frame: (value: BarcodeFrame) => void = () => undefined;
let started = false;
vi.mock('@/infrastructure/field/barcode-reader', () => ({
  createBarcodeReader: () => ({
    supportedFormats: async () => ['qr_code'],
    start: async (_video: HTMLVideoElement, onFrame: (value: BarcodeFrame) => void) => { frame = onFrame; started = true; return () => undefined; },
  }),
}));

const { ReadCylinderControl } = await import('./read-cylinder-control');
const fieldService = (outcome: ResolveOutcome) => ({ resolveIdentifier: vi.fn(async () => outcome) }) as unknown as FieldService & { resolveIdentifier: ReturnType<typeof vi.fn> };
const found: ResolveOutcome = {
  kind: 'found',
  value: { cylinder: { id: 'c1', serialNumber: 'FLD-001', status: 'active', stockStatus: 'in_stock', hydroStatus: 'em_dia' }, identifier: { id: 'i1', kind: 'qr_code' }, matchedIndex: 0, trip: null },
};
const open = async (): Promise<void> => {
  (await screen.findByRole('button', { name: 'Ler cilindro' })).click();
  await screen.findByRole('dialog', { name: 'Ler cilindro' });
  await waitFor(() => expect(started).toBe(true));
};
const scan = async (value: string): Promise<void> => { await act(async () => { frame({ kind: 'read', value }); await Promise.resolve(); }); };

beforeEach(() => { state.field = null; state.org = null; state.online = true; state.logout.mockClear(); started = false; window.history.replaceState(null, '', '/cilindros'); });
afterEach(() => window.history.replaceState(null, '', '/'));

describe('ReadCylinderControl', () => {
  it('sem o serviço de campo, não aparece', async () => {
    state.org = 'org-a';
    const { container } = render(<ReadCylinderControl />);
    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
  });

  it('sem organização ativa, não aparece', async () => {
    state.field = fieldService(found);
    const { container } = render(<ReadCylinderControl />);
    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
  });

  it('achar o cilindro abre o detalhe dentro do app, procurando só na organização ativa, sem restringir o tipo na câmera', async () => {
    state.org = 'org-a';
    state.field = fieldService(found);
    render(<ReadCylinderControl />);
    await open();
    await scan('QR-1');
    await waitFor(() => expect(window.location.pathname).toBe('/cilindros/c1'));
    expect((state.field as unknown as { resolveIdentifier: ReturnType<typeof vi.fn> }).resolveIdentifier)
      .toHaveBeenCalledWith('org-a', [{ value: 'QR-1', origin: 'scanned' }], undefined);
  });

  it('não encontrado (inclui o de outra organização): diz a frase e não navega', async () => {
    state.org = 'org-a';
    state.field = fieldService({ kind: 'not_found' });
    render(<ReadCylinderControl />);
    await open();
    await scan('QR-X');
    expect(await screen.findByText('Cilindro não encontrado.')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/cilindros');
  });

  it('sessão expirada devolve a pessoa à entrada', async () => {
    state.org = 'org-a';
    state.field = fieldService({ kind: 'session_expired' });
    render(<ReadCylinderControl />);
    await open();
    await scan('QR-1');
    await waitFor(() => expect(state.logout).toHaveBeenCalledTimes(1));
  });
});
