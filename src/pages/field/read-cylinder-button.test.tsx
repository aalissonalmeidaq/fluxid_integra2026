import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResolutionLike } from '@/domain/field/reading-result';
import type { BarcodeFrame, BarcodeReader } from '@/infrastructure/field/barcode-reader';
import type { NfcReader } from '@/infrastructure/field/nfc-reader';
import { ReadCylinderButton, type ReadCylinderButtonProps } from './read-cylinder-button';

// Spec 009, US3 (RF-002, RF-006, RN-005): "Ler cilindro" abre o detalhe do cilindro certo; identificador desativado e código que não existe
// (inclusive o de outra organização) só dizem a frase em texto, sem abrir nada.
function fakeCamera(supported = true): BarcodeReader & { frame: (frame: BarcodeFrame) => void; started: boolean } {
  let handler: (frame: BarcodeFrame) => void = () => undefined;
  const camera = {
    started: false,
    frame: (frame: BarcodeFrame) => handler(frame),
    supportedFormats: async (): Promise<readonly ('qr_code' | 'data_matrix')[]> => (supported ? ['qr_code'] : []),
    start: async (_video: HTMLVideoElement, onFrame: (frame: BarcodeFrame) => void) => { handler = onFrame; camera.started = true; return () => undefined; },
  };
  return camera;
}
const nfc: NfcReader = { isSupported: () => false, start: async () => () => undefined };
const found = (over: { status?: string; serial?: string } = {}): ResolutionLike => ({
  kind: 'found', value: { cylinder: { id: 'c1', serialNumber: over.serial ?? 'FLD-001', status: over.status ?? 'active' }, trip: null },
});

function setup(over: Partial<ReadCylinderButtonProps> & { camera?: ReturnType<typeof fakeCamera> } = {}) {
  const camera = over.camera ?? fakeCamera();
  const onOpen = vi.fn();
  const resolve = over.resolve ?? vi.fn(async () => found());
  render(<ReadCylinderButton resolve={resolve} onOpen={onOpen} online barcodeReader={camera} nfcReader={nfc} {...over} />);
  return { camera, onOpen, resolve };
}
// O leitor é carregado sob demanda e liga a câmera depois de aparecer: a leitura só vale com a câmera pronta.
const scan = async (camera: ReturnType<typeof fakeCamera>, value: string): Promise<void> => {
  await waitFor(() => expect(camera.started).toBe(true));
  await act(async () => { camera.frame({ kind: 'read', value }); await Promise.resolve(); });
};

describe('o botão "Ler cilindro"', () => {
  it('aparece onde o aparelho lê código, com o nome acessível', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Ler cilindro' })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('sem câmera nem NFC não aparece, e nada é mostrado no lugar (a busca por texto segue na tela)', async () => {
    const { camera } = setup({ camera: fakeCamera(false) });
    await act(async () => { await Promise.resolve(); });
    expect(camera).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Ler cilindro' })).toBeNull();
    expect(screen.queryByText(/indisponível/)).toBeNull();
  });
});

describe('ler um identificador', () => {
  it('abre o detalhe do cilindro certo e fecha o leitor', async () => {
    const { camera, onOpen, resolve } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Ler cilindro' }));
    await screen.findByRole('dialog', { name: 'Ler cilindro' });
    await scan(camera, 'QR-1');
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('c1'));
    expect(resolve).toHaveBeenCalledWith({ candidates: [{ value: 'QR-1', origin: 'scanned' }], source: 'camera' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('cilindro inativo também abre o detalhe, que informa a situação (Spec 006)', async () => {
    const { camera, onOpen } = setup({ resolve: vi.fn(async () => found({ status: 'inactive' })) });
    fireEvent.click(await screen.findByRole('button', { name: 'Ler cilindro' }));
    await screen.findByRole('dialog');
    await scan(camera, 'QR-OLD');
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('c1'));
  });

  it('identificador desativado: diz a quem valia, sem abrir nada', async () => {
    const { camera, onOpen } = setup({ resolve: vi.fn(async () => ({ kind: 'deactivated', cylinder: { serialNumber: 'FLD-004' } }) as ResolutionLike) });
    fireEvent.click(await screen.findByRole('button', { name: 'Ler cilindro' }));
    await screen.findByRole('dialog');
    await scan(camera, 'QR-OLD');
    expect(await screen.findByText('Este identificador foi desativado. Valia para o cilindro FLD-004.')).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('código que não existe ou é de outra organização: a mesma frase, sem abrir nada', async () => {
    const { camera, onOpen } = setup({ resolve: vi.fn(async () => ({ kind: 'not_found' }) as ResolutionLike) });
    fireEvent.click(await screen.findByRole('button', { name: 'Ler cilindro' }));
    await screen.findByRole('dialog');
    await scan(camera, 'QR-X');
    expect(await screen.findByText('Cilindro não encontrado.')).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('sem permissão, sessão expirada e falhas viram texto', async () => {
    const outcomes: [ResolutionLike, string][] = [
      [{ kind: 'access_denied' }, 'Você não tem permissão para esta leitura.'],
      [{ kind: 'unavailable' }, 'Não foi possível consultar agora. Tente de novo.'],
    ];
    for (const [outcome, text] of outcomes) {
      const camera = fakeCamera();
      const { unmount } = render(<ReadCylinderButton resolve={vi.fn(async () => outcome)} onOpen={vi.fn()} online barcodeReader={camera} nfcReader={nfc} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Ler cilindro' }));
      await screen.findByRole('dialog');
      await scan(camera, 'QR-Z');
      expect(await screen.findByText(text)).toBeInTheDocument();
      unmount();
    }
  });

  it('sem conexão, o leitor avisa que a consulta exige conexão e não consulta nada', async () => {
    const { camera, resolve } = setup({ online: false });
    fireEvent.click(await screen.findByRole('button', { name: 'Ler cilindro' }));
    await screen.findByRole('dialog');
    await scan(camera, 'QR-1');
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão. A consulta do cilindro exige conexão.');
    expect(resolve).not.toHaveBeenCalled();
  });
});
