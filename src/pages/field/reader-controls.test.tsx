import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BarcodeReader } from '@/infrastructure/field/barcode-reader';
import type { NfcReader } from '@/infrastructure/field/nfc-reader';
import type { ReadFeedback } from './identifier-reader-dialog';
import { ReaderControls, type ReaderControlsProps } from './reader-controls';

// RF-001, RF-008, RF-020, RF-022, CA-003: o botão "Ler cilindro" só aparece onde há câmera ou NFC; o campo de código (digitado ou de
// leitor-teclado) existe sempre, e o resultado é dito em texto. Offline, nada é registrado.
const camera = (formats: readonly ('qr_code' | 'data_matrix')[]): BarcodeReader => ({
  supportedFormats: async () => formats,
  start: async () => () => undefined,
});
const nfc = (supported: boolean): NfcReader => ({ isSupported: () => supported, start: async () => () => undefined });
const ok: ReadFeedback = { tone: 'success', message: 'Cilindro FLD-001 conferido.' };

function renderControls(over: Partial<ReaderControlsProps> = {}) {
  const onRead = over.onRead ?? vi.fn(async () => ok);
  const view = render(<ReaderControls onRead={onRead} online summary="0 de 4 conferidos" submitLabel="Conferir código" barcodeReader={camera(['qr_code'])} nfcReader={nfc(false)} {...over} />);
  return { onRead, ...view };
}
const settle = async (): Promise<void> => { await act(async () => { await Promise.resolve(); }); };

describe('o botão "Ler cilindro"', () => {
  it('aparece quando a câmera lê QR Code ou Data Matrix', async () => {
    renderControls();
    expect(await screen.findByRole('button', { name: 'Ler cilindro' })).toBeInTheDocument();
    expect(screen.queryByText(/indisponível neste aparelho/)).toBeNull();
  });

  it('aparece quando só o NFC é suportado', async () => {
    renderControls({ barcodeReader: camera([]), nfcReader: nfc(true) });
    expect(await screen.findByRole('button', { name: 'Ler cilindro' })).toBeInTheDocument();
  });

  it('sem câmera nem NFC, não aparece e o texto explica o caminho do código', async () => {
    renderControls({ barcodeReader: camera([]), nfcReader: nfc(false) });
    await settle();
    expect(screen.queryByRole('button', { name: 'Ler cilindro' })).toBeNull();
    expect(screen.getByText('Leitura por câmera ou NFC indisponível neste aparelho. Digite o código ou use um leitor.')).toBeInTheDocument();
  });

  it('enquanto consulta o suporte, não mostra o aviso de indisponível', () => {
    renderControls({ barcodeReader: { supportedFormats: () => new Promise(() => undefined), start: async () => () => undefined } });
    expect(screen.queryByText(/indisponível neste aparelho/)).toBeNull();
  });

  it('abre o leitor em diálogo e o fecha devolvendo o foco ao botão', async () => {
    renderControls();
    const button = await screen.findByRole('button', { name: 'Ler cilindro' });
    fireEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Ler cilindro' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(button).toHaveFocus();
  });
});

describe('o campo de código (digitado, colado ou de leitor-teclado)', () => {
  it('existe mesmo sem câmera nem NFC', async () => {
    renderControls({ barcodeReader: camera([]), nfcReader: nfc(false) });
    await settle();
    expect(screen.getByLabelText('Código do cilindro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conferir código' })).toBeInTheDocument();
  });

  it('envia o código digitado como candidato, com o método "typed", e mostra o resultado em texto', async () => {
    const { onRead } = renderControls();
    await settle();
    fireEvent.change(screen.getByLabelText('Código do cilindro'), { target: { value: '  QR-009-0001 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir código' }));
    await screen.findByText('Cilindro FLD-001 conferido.');
    expect(onRead).toHaveBeenCalledWith({ candidates: [{ value: 'QR-009-0001', origin: 'scanned' }], source: 'typed' });
  });

  it('o Enter do leitor-teclado envia o código', async () => {
    const { onRead } = renderControls();
    await settle();
    const input = screen.getByLabelText('Código do cilindro');
    fireEvent.change(input, { target: { value: 'QR-1' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));
  });

  it('limpa o campo depois de um resultado aceito, para ler o próximo', async () => {
    renderControls();
    await settle();
    const input = screen.getByLabelText('Código do cilindro') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'QR-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir código' }));
    await screen.findByText('Cilindro FLD-001 conferido.');
    expect(input.value).toBe('');
  });

  it('mantém o código no campo quando foi recusado, para a pessoa corrigir', async () => {
    renderControls({ onRead: vi.fn(async () => ({ tone: 'error', message: 'Cilindro não encontrado.' }) as ReadFeedback) });
    await settle();
    const input = screen.getByLabelText('Código do cilindro') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'QR-X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir código' }));
    await screen.findByText('Cilindro não encontrado.');
    expect(input.value).toBe('QR-X');
  });

  it('código vazio não chama o servidor e pede o código', async () => {
    const { onRead } = renderControls();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Conferir código' }));
    expect(await screen.findByText('Informe o código do cilindro.')).toBeInTheDocument();
    expect(onRead).not.toHaveBeenCalled();
  });

  it('código com quebra de linha ou grande demais é recusado antes de chamar o servidor', async () => {
    const { onRead } = renderControls();
    await settle();
    fireEvent.change(screen.getByLabelText('Código do cilindro'), { target: { value: 'x'.repeat(201) } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir código' }));
    expect(await screen.findByText('Informe o código do cilindro.')).toBeInTheDocument();
    expect(onRead).not.toHaveBeenCalled();
  });

  it('falha de quem trata a leitura vira aviso, sem derrubar a tela', async () => {
    renderControls({ onRead: vi.fn(async () => { throw new Error('x'); }) });
    await settle();
    fireEvent.change(screen.getByLabelText('Código do cilindro'), { target: { value: 'QR-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir código' }));
    expect(await screen.findByText('Não foi possível conferir agora. Tente de novo.')).toBeInTheDocument();
  });

  it('offline: o envio fica desabilitado e o motivo aparece', async () => {
    const { onRead } = renderControls({ online: false });
    await settle();
    expect(screen.getByRole('button', { name: 'Conferir código' })).toBeDisabled();
    expect(screen.getByText('Sem conexão. Registrar exige conexão.')).toBeInTheDocument();
    expect(onRead).not.toHaveBeenCalled();
  });

  it('desabilitado por outra ação em andamento', async () => {
    renderControls({ disabled: true });
    await settle();
    expect(screen.getByRole('button', { name: 'Conferir código' })).toBeDisabled();
  });

  it('passa o andamento ao leitor, sem repeti-lo na tela de origem', async () => {
    renderControls({ summary: '2 de 4 conferidos' });
    await settle();
    expect(screen.queryByText('2 de 4 conferidos')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Ler cilindro' }));
    expect(await screen.findByText('2 de 4 conferidos')).toBeInTheDocument();
  });
});
