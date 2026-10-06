import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraScanButton } from './camera-scan-button';

const stop = vi.fn();
const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }));

function suporte(detect: () => Promise<{ rawValue: string }[]>): void {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('BarcodeDetector', class { detect = detect; });
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  stop.mockClear();
  getUserMedia.mockClear();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('leitura pela câmera (identificadores)', () => {
  it('não aparece quando o aparelho não lê código pela câmera', () => {
    const { container } = render(<CameraScanButton onRead={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('abre o diálogo, lê o código, entrega o valor, desliga a câmera e devolve o foco', async () => {
    suporte(async () => [{ rawValue: 'DM-123' }]);
    const onRead = vi.fn();
    render(<CameraScanButton onRead={onRead} />);
    const button = screen.getByRole('button', { name: 'Ler com a câmera' });
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Ler com a câmera' });
    expect(within(dialog).getByText(/Aponte a câmera/)).toBeInTheDocument();
    await waitFor(() => expect(onRead).toHaveBeenCalledWith('DM-123'), { timeout: 2000 });
    expect(stop).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(button).toHaveFocus();
  });

  it('cancelar fecha o diálogo e desliga a câmera sem entregar valor', async () => {
    suporte(async () => []);
    const onRead = vi.fn();
    render(<CameraScanButton onRead={onRead} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ler com a câmera' }));
    await screen.findByRole('dialog');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stop).toHaveBeenCalled();
    expect(onRead).not.toHaveBeenCalled();
  });

  it('explica quando a permissão da câmera é negada', async () => {
    suporte(async () => []);
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('negado'), { name: 'NotAllowedError' }));
    render(<CameraScanButton onRead={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ler com a câmera' }));
    expect(await screen.findByText(/Permita o uso da câmera/)).toBeInTheDocument();
  });
});
