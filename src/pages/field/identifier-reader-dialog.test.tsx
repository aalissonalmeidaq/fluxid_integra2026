import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { READER_IDLE_MS } from '@/domain/field/scan-debounce';
import type { BarcodeFrame, BarcodeReader } from '@/infrastructure/field/barcode-reader';
import type { NfcRead, NfcReader } from '@/infrastructure/field/nfc-reader';
import { ReaderError, type ReaderErrorKind } from '@/infrastructure/field/reader-error';
import { IdentifierReaderDialog, type IdentifierReaderDialogProps, type ReadFeedback } from './identifier-reader-dialog';

// RF-001, RF-004, RF-008, RF-018, RF-020, RNF-005: leitor contínuo de câmera e NFC, só onde há suporte, com o resultado anunciado em
// texto, anti-repetição, desligamento por inatividade e foco devolvido ao botão que abriu.
interface FakeCamera extends BarcodeReader {
  frame: (frame: BarcodeFrame) => void;
  stops: Mock<() => void>;
  failWith: ReaderErrorKind | null;
  started: number;
}
function fakeCamera(formats: readonly ('qr_code' | 'data_matrix')[] = ['qr_code', 'data_matrix']): FakeCamera {
  let handler: (frame: BarcodeFrame) => void = () => undefined;
  const camera: FakeCamera = {
    stops: vi.fn<() => void>(), failWith: null, started: 0,
    frame: (frame) => handler(frame),
    supportedFormats: async () => formats,
    start: async (_video, onFrame) => {
      camera.started += 1;
      if (camera.failWith) throw new ReaderError(camera.failWith);
      handler = onFrame;
      return camera.stops;
    },
  };
  return camera;
}

interface FakeNfc extends NfcReader {
  read: (read: NfcRead) => void;
  unreadable: () => void;
  stops: Mock<() => void>;
  failWith: ReaderErrorKind | null;
}
function fakeNfc(supported = true): FakeNfc {
  let onRead: (read: NfcRead) => void = () => undefined;
  let onUnreadable: () => void = () => undefined;
  const nfc: FakeNfc = {
    stops: vi.fn<() => void>(), failWith: null,
    read: (read) => onRead(read), unreadable: () => onUnreadable(),
    isSupported: () => supported,
    start: async (read, unreadable) => {
      if (nfc.failWith) throw new ReaderError(nfc.failWith);
      onRead = read; onUnreadable = unreadable;
      return nfc.stops;
    },
  };
  return nfc;
}

const accepted: ReadFeedback = { tone: 'success', message: 'Cilindro FLD-001 conferido.' };

function renderReader(over: Partial<IdentifierReaderDialogProps> & { camera?: FakeCamera; nfc?: FakeNfc } = {}) {
  const camera = over.camera ?? fakeCamera();
  const nfc = over.nfc ?? fakeNfc(false);
  const onRead = over.onRead ?? vi.fn(async () => accepted);
  const onClose = over.onClose ?? vi.fn();
  const view = render(<IdentifierReaderDialog onClose={onClose} onRead={onRead} barcodeReader={camera} nfcReader={nfc} {...over} />);
  return { camera, nfc, onRead, onClose, ...view };
}
const settle = async (): Promise<void> => { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('quando aparece e como abre', () => {
  it('abre como diálogo, com o vídeo da câmera e o texto de ajuda', async () => {
    renderReader();
    await settle();
    const dialog = screen.getByRole('dialog', { name: 'Ler cilindro' });
    expect(within(dialog).getByLabelText('Imagem da câmera')).toBeInTheDocument();
    expect(within(dialog).getByText(/Aponte a câmera/)).toBeInTheDocument();
  });

  it('só câmera suportada: não mostra o seletor de modo nem o NFC', async () => {
    renderReader();
    await settle();
    expect(screen.queryByRole('button', { name: 'NFC' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Modo de leitura' })).toBeNull();
  });

  it('câmera e NFC suportados: oferece os dois modos, com a câmera ativa', async () => {
    renderReader({ nfc: fakeNfc(true) });
    await settle();
    const group = screen.getByRole('group', { name: 'Modo de leitura' });
    expect(within(group).getByRole('button', { name: 'Câmera' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'NFC' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('só NFC suportado: começa direto no NFC, sem câmera', async () => {
    const camera = fakeCamera([]);
    renderReader({ camera, nfc: fakeNfc(true) });
    await settle();
    expect(camera.started).toBe(0);
    expect(screen.queryByLabelText('Imagem da câmera')).toBeNull();
    expect(screen.getByText(/Aproxime a etiqueta NFC/)).toBeInTheDocument();
  });

  it('sem câmera nem NFC: explica e mostra o caminho manual', async () => {
    renderReader({ camera: fakeCamera([]), nfc: fakeNfc(false) });
    await settle();
    expect(screen.getByText(/Leitura por câmera ou NFC indisponível neste aparelho/)).toBeInTheDocument();
  });
});

describe('leitura pela câmera', () => {
  it('entrega o código ao chamador como candidato lido, com o método "câmera", e anuncia o resultado', async () => {
    const { camera, onRead } = renderReader({ summary: '1 de 10 conferidos' });
    await settle();
    await act(async () => { camera.frame({ kind: 'read', value: 'FLD-001' }); await vi.advanceTimersByTimeAsync(0); });
    expect(onRead).toHaveBeenCalledWith({ candidates: [{ value: 'FLD-001', origin: 'scanned' }], source: 'camera' });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Cilindro FLD-001 conferido.');
    expect(status).toHaveTextContent('1 de 10 conferidos');
  });

  it('continua lendo depois de cada código (modo contínuo)', async () => {
    const { camera, onRead } = renderReader();
    await settle();
    await act(async () => { camera.frame({ kind: 'read', value: 'A' }); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { camera.frame({ kind: 'read', value: 'B' }); await vi.advanceTimersByTimeAsync(0); });
    expect(onRead).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('o mesmo código em sequência curta conta uma leitura só', async () => {
    const { camera, onRead } = renderReader();
    await settle();
    await act(async () => { camera.frame({ kind: 'read', value: 'A' }); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { camera.frame({ kind: 'read', value: 'A' }); await vi.advanceTimersByTimeAsync(300); });
    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it('mais de um código no quadro: avisa em texto, não confere nada e não fecha a janela', async () => {
    const { camera, onRead } = renderReader();
    await settle();
    await act(async () => { camera.frame({ kind: 'multiple' }); await vi.advanceTimersByTimeAsync(0); });
    expect(onRead).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Há mais de um código no quadro. Aponte para um só.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('mostra o resultado recusado em texto e com ícone, sem depender da cor', async () => {
    const refused: ReadFeedback = { tone: 'error', message: 'Cilindro FLD-002 não pertence a esta viagem.' };
    const { camera } = renderReader({ onRead: vi.fn(async () => refused) });
    await settle();
    await act(async () => { camera.frame({ kind: 'read', value: 'B' }); await vi.advanceTimersByTimeAsync(0); });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Cilindro FLD-002 não pertence a esta viagem.');
    expect(status.querySelector('svg')).not.toBeNull();
  });

  it('falha do chamador não derruba a tela: mostra aviso e segue lendo', async () => {
    const { camera } = renderReader({ onRead: vi.fn(async () => { throw new Error('x'); }) });
    await settle();
    await act(async () => { camera.frame({ kind: 'read', value: 'A' }); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível conferir agora. Tente de novo.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('só trata uma leitura por vez enquanto o chamador ainda responde', async () => {
    let finish: (feedback: ReadFeedback) => void = () => undefined;
    const onRead = vi.fn(() => new Promise<ReadFeedback>((resolve) => { finish = resolve; }));
    const { camera } = renderReader({ onRead });
    await settle();
    await act(async () => { camera.frame({ kind: 'read', value: 'A' }); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { camera.frame({ kind: 'read', value: 'B' }); await vi.advanceTimersByTimeAsync(0); });
    expect(onRead).toHaveBeenCalledTimes(1);
    await act(async () => { finish(accepted); await vi.advanceTimersByTimeAsync(0); });
  });
});

describe('leitura por NFC', () => {
  it('troca para o NFC, lê a etiqueta e entrega os candidatos com o método "NFC"', async () => {
    const nfc = fakeNfc(true);
    const { camera, onRead } = renderReader({ nfc });
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'NFC' })); await vi.advanceTimersByTimeAsync(0); });
    expect(camera.stops).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'NFC' })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => { nfc.read({ serialNumber: '04:a2:3b:1c', texts: ['CIL-0007'] }); await vi.advanceTimersByTimeAsync(0); });
    expect(onRead).toHaveBeenCalledWith({
      candidates: [{ value: '04A23B1C', origin: 'serial' }, { value: '04:A2:3B:1C', origin: 'serial_colon' }, { value: 'CIL-0007', origin: 'text' }],
      source: 'nfc',
    });
  });

  it('etiqueta ilegível mostra o aviso e não chama o chamador', async () => {
    const nfc = fakeNfc(true);
    const { onRead } = renderReader({ camera: fakeCamera([]), nfc });
    await settle();
    await act(async () => { nfc.unreadable(); await vi.advanceTimersByTimeAsync(0); });
    expect(onRead).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível ler a etiqueta. Digite o código ou tente outra.');
  });

  it('número de série inutilizável sem texto não chama o chamador', async () => {
    const nfc = fakeNfc(true);
    const { onRead } = renderReader({ camera: fakeCamera([]), nfc });
    await settle();
    await act(async () => { nfc.read({ serialNumber: '00:00:00', texts: [] }); await vi.advanceTimersByTimeAsync(0); });
    expect(onRead).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível ler a etiqueta.');
  });
});

describe('permissão e falhas', () => {
  it('permissão da câmera negada: explica e oferece "Tentar de novo"', async () => {
    const camera = fakeCamera();
    camera.failWith = 'denied';
    renderReader({ camera });
    await settle();
    expect(screen.getByText(/A permissão da câmera foi negada/)).toBeInTheDocument();
    camera.failWith = null;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' })); await vi.advanceTimersByTimeAsync(0); });
    expect(camera.started).toBe(2);
    expect(screen.queryByText(/A permissão da câmera foi negada/)).toBeNull();
  });

  it('câmera ocupada ou ausente: explica e oferece "Tentar de novo"', async () => {
    const camera = fakeCamera();
    camera.failWith = 'unavailable';
    renderReader({ camera });
    await settle();
    expect(screen.getByText(/Não foi possível abrir a câmera deste aparelho/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('NFC negado ou desligado: explica o motivo', async () => {
    const nfc = fakeNfc(true);
    nfc.failWith = 'denied';
    renderReader({ camera: fakeCamera([]), nfc });
    await settle();
    expect(screen.getByText(/A permissão do NFC foi negada/)).toBeInTheDocument();
  });
});

describe('offline', () => {
  it('avisa que registrar exige conexão e não processa a leitura', async () => {
    const { camera, onRead } = renderReader({ offline: true });
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão. Registrar exige conexão.');
    await act(async () => { camera.frame({ kind: 'read', value: 'A' }); await vi.advanceTimersByTimeAsync(0); });
    expect(onRead).not.toHaveBeenCalled();
  });
});

// RF-018: câmera e NFC desligam sozinhos depois de 2 minutos sem nenhuma leitura.
describe('inatividade', () => {
  it('desliga após 2 minutos sem leitura, avisa e oferece "Continuar lendo", mantendo a janela e o resultado', async () => {
    const { camera } = renderReader({ summary: '1 de 10 conferidos' });
    await settle();
    await act(async () => { camera.frame({ kind: 'read', value: 'A' }); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(READER_IDLE_MS); });
    expect(camera.stops).toHaveBeenCalled();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('A leitura foi pausada por inatividade.');
    expect(status).toHaveTextContent('1 de 10 conferidos');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar lendo' })).toBeInTheDocument();
  });

  it('"Continuar lendo" liga a leitura de novo', async () => {
    const { camera } = renderReader();
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(READER_IDLE_MS); });
    expect(camera.started).toBe(1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continuar lendo' })); await vi.advanceTimersByTimeAsync(0); });
    expect(camera.started).toBe(2);
    expect(screen.queryByRole('button', { name: 'Continuar lendo' })).toBeNull();
  });

  it('cada leitura reinicia a contagem dos 2 minutos', async () => {
    const { camera } = renderReader();
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(READER_IDLE_MS - 1000); });
    await act(async () => { camera.frame({ kind: 'read', value: 'A' }); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(READER_IDLE_MS - 1000); });
    expect(screen.queryByRole('button', { name: 'Continuar lendo' })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole('button', { name: 'Continuar lendo' })).toBeInTheDocument();
  });
});

describe('foco, teclado e limpeza', () => {
  it('Escape fecha o leitor', async () => {
    const { onClose } = renderReader();
    await settle();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o botão "Fechar" fecha o leitor', async () => {
    const { onClose } = renderReader();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('desmontar desliga a câmera e o NFC', async () => {
    const nfc = fakeNfc(true);
    const { camera, unmount } = renderReader({ nfc });
    await settle();
    unmount();
    expect(camera.stops).toHaveBeenCalled();
  });

  it('o andamento aparece à vista mesmo antes da primeira leitura', async () => {
    renderReader({ summary: '0 de 10 conferidos' });
    await settle();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('0 de 10 conferidos');
    expect(status).not.toHaveClass('sr-only');
  });

  it('há uma só região de status no leitor', async () => {
    renderReader({ nfc: fakeNfc(true) });
    await settle();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('devolve o foco ao botão que abriu', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const { unmount } = renderReader({ returnFocusTo: trigger });
    await settle();
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
