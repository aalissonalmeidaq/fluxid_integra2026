import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraScanButton } from './camera-scan-button';

const stop = vi.fn();
const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }, { stop }] }));
const constructed = vi.fn();

interface Suporte {
  formatos?: string[] | Error;
  detect?: () => Promise<{ rawValue: string }[]>;
  semGetUserMedia?: boolean;
}

// Simula o navegador: BarcodeDetector com `getSupportedFormats` e a câmera de `getUserMedia`.
function navegador({ formatos = ['qr_code', 'data_matrix'], detect = async () => [], semGetUserMedia = false }: Suporte = {}): void {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: semGetUserMedia ? {} : { getUserMedia } });
  vi.stubGlobal('BarcodeDetector', class {
    static getSupportedFormats = async (): Promise<string[]> => { if (formatos instanceof Error) throw formatos; return formatos; };
    constructor(options: { formats: string[] }) { constructed(options); }
    detect = detect;
  });
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
}

const botao = () => screen.findByRole('button', { name: 'Ler com a câmera' });

afterEach(() => {
  vi.unstubAllGlobals();
  stop.mockClear();
  getUserMedia.mockClear();
  constructed.mockClear();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('leitura pela câmera: quando aparece', () => {
  it('não aparece sem BarcodeDetector', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const { container } = render(<CameraScanButton onRead={vi.fn()} />);
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('não aparece sem getUserMedia', async () => {
    navegador({ semGetUserMedia: true });
    const { container } = render(<CameraScanButton onRead={vi.fn()} />);
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('não aparece quando nenhum formato compatível é suportado', async () => {
    navegador({ formatos: ['ean_13', 'code_128'] });
    const { container } = render(<CameraScanButton onRead={vi.fn()} />);
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('não quebra a tela quando a consulta dos formatos falha: o botão some e a digitação segue', async () => {
    navegador({ formatos: new Error('indisponível') });
    const { container } = render(<CameraScanButton onRead={vi.fn()} />);
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['só QR Code', ['qr_code', 'ean_13'], ['qr_code']],
    ['só Data Matrix', ['data_matrix', 'code_39'], ['data_matrix']],
    ['QR Code e Data Matrix', ['qr_code', 'data_matrix', 'aztec'], ['qr_code', 'data_matrix']],
  ])('aparece com %s e o detector recebe só a interseção dos formatos', async (_nome, suportados, esperados) => {
    navegador({ formatos: suportados });
    render(<CameraScanButton onRead={vi.fn()} />);
    fireEvent.click(await botao());
    await screen.findByRole('dialog', { name: 'Ler com a câmera' });
    await waitFor(() => expect(constructed).toHaveBeenCalledWith({ formats: esperados }));
  });
});

describe('leitura pela câmera: uso', () => {
  it('lê o código, entrega o valor, desliga todas as faixas e devolve o foco ao botão', async () => {
    navegador({ detect: async () => [{ rawValue: 'DM-123' }] });
    const onRead = vi.fn();
    render(<CameraScanButton onRead={onRead} />);
    const button = await botao();
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Ler com a câmera' });
    expect(within(dialog).getByText(/Aponte a câmera/)).toBeInTheDocument();
    await waitFor(() => expect(onRead).toHaveBeenCalledWith('DM-123'), { timeout: 2000 });
    expect(stop).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(button).toHaveFocus();
  });

  it('cancelar fecha o diálogo e desliga a câmera sem entregar valor', async () => {
    navegador();
    const onRead = vi.fn();
    render(<CameraScanButton onRead={onRead} />);
    fireEvent.click(await botao());
    await screen.findByRole('dialog');
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stop).toHaveBeenCalled();
    expect(onRead).not.toHaveBeenCalled();
  });

  it('desmontar a tela com a câmera aberta desliga as faixas', async () => {
    navegador();
    const { unmount } = render(<CameraScanButton onRead={vi.fn()} />);
    fireEvent.click(await botao());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it('explica quando a permissão da câmera é negada', async () => {
    navegador();
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('negado'), { name: 'NotAllowedError' }));
    render(<CameraScanButton onRead={vi.fn()} />);
    fireEvent.click(await botao());
    expect(await screen.findByText(/Permita o uso da câmera/)).toBeInTheDocument();
  });

  it('desliga a câmera e avisa quando o vídeo não consegue iniciar', async () => {
    navegador();
    HTMLMediaElement.prototype.play = vi.fn(async () => { throw new Error('falhou'); });
    render(<CameraScanButton onRead={vi.fn()} />);
    fireEvent.click(await botao());
    expect(await screen.findByText(/Não foi possível abrir a câmera/)).toBeInTheDocument();
    expect(stop).toHaveBeenCalled();
  });
});
