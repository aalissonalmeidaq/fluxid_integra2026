import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CylinderService } from '@/application/cylinders/cylinder-service';
import type { StockInResult } from '@/application/cylinders/cylinder-views';
import { StockInView } from './stock-in-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const stocked = (over: Partial<StockInResult> = {}): { kind: 'success'; value: StockInResult } => ({
  kind: 'success',
  value: { cylinder: { id: 'c1', serialNumber: 'X1', stockStatus: 'in_stock' }, replayed: false, eventSequence: 3, hydroStatus: 'em_dia', warning: null, ...over },
});

function fakeService(stockIn: ReturnType<typeof vi.fn> = vi.fn(async () => stocked())) {
  return { stockIn } as unknown as CylinderService & { stockIn: ReturnType<typeof vi.fn> };
}

const renderView = (service: ReturnType<typeof fakeService> | null, extra: Record<string, unknown> = {}) =>
  render(<StockInView organizationId={ORG} service={service} online canCreate {...extra} />);

const input = () => screen.getByLabelText('Identificador') as HTMLInputElement;
const read = (value: string) => {
  fireEvent.change(input(), { target: { value } });
  fireEvent.submit(input().closest('form') as HTMLFormElement);
};

describe('entrada no estoque (história 3)', () => {
  it('o campo "Identificador" tem o foco inicial e a tela tem um título de nível 2', () => {
    renderView(fakeService());
    expect(input()).toHaveFocus();
    expect(screen.getByRole('heading', { level: 2, name: 'Entrada no estoque' })).toBeInTheDocument();
  });

  it('Enter envia o valor sem quebras de linha e espaços, com uma chave de operação UUID', async () => {
    const service = fakeService();
    renderView(service);
    read('  QR-1\n');
    await waitFor(() => expect(service.stockIn).toHaveBeenCalledTimes(1));
    expect(service.stockIn).toHaveBeenCalledWith(ORG, 'QR-1', expect.stringMatching(UUID));
  });

  it('depois do resultado: anuncia uma vez, limpa o campo e devolve o foco a ele (RF-029)', async () => {
    renderView(fakeService());
    read('QR-1');
    expect(await screen.findByText(/X1/)).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(/entrada registrada/i);
    expect(input().value).toBe('');
    expect(input()).toHaveFocus();
  });

  it('valor vazio: erro junto do campo, nada é enviado e o foco fica no campo', async () => {
    const service = fakeService();
    renderView(service);
    read('   ');
    expect(await screen.findByText('Informe o valor do identificador.')).toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveFocus();
    expect(service.stockIn).not.toHaveBeenCalled();
  });

  it('duplo envio: enquanto a primeira chamada não termina, a segunda é ignorada', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const service = fakeService(vi.fn(() => new Promise((done) => { resolve = done; })));
    renderView(service);
    read('QR-1');
    fireEvent.submit(input().closest('form') as HTMLFormElement);
    expect(service.stockIn).toHaveBeenCalledTimes(1);
    resolve(stocked());
    await screen.findByText(/X1/);
  });

  it('repetição reconhecida: informa que nada foi duplicado', async () => {
    renderView(fakeService(vi.fn(async () => stocked({ replayed: true }))));
    read('QR-1');
    expect(await screen.findByRole('status')).toHaveTextContent(/já tinha sido registrada.*nada foi duplicado/i);
  });

  it('cilindro já em estoque e cilindro inativo são recusados com motivo claro', async () => {
    const stockIn = vi.fn().mockResolvedValueOnce({ kind: 'already_in_stock' }).mockResolvedValueOnce({ kind: 'cylinder_inactive' });
    renderView(fakeService(stockIn));
    read('QR-5');
    expect(await screen.findByRole('alert')).toHaveTextContent(/já está em estoque/i);
    expect(input()).toHaveFocus();
    read('QR-4');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/inativo e não pode entrar no estoque/i));
  });

  it('identificador não encontrado: oferece cadastrar o cilindro só a quem pode', async () => {
    const stockIn = vi.fn(async () => ({ kind: 'not_found' }));
    const { unmount } = renderView(fakeService(stockIn));
    read('QR-9');
    expect(await screen.findByRole('alert')).toHaveTextContent(/cilindro não encontrado/i);
    expect(screen.getByRole('link', { name: 'Cadastrar cilindro' })).toHaveAttribute('href', '/cilindros/novo');
    unmount();
    renderView(fakeService(stockIn), { canCreate: false });
    read('QR-9');
    await screen.findByRole('alert');
    expect(screen.queryByRole('link', { name: 'Cadastrar cilindro' })).not.toBeInTheDocument();
  });

  it('identificador desativado: informa a quem pertencia, sem tratá-lo como cilindro ativo', async () => {
    renderView(fakeService(vi.fn(async () => ({ kind: 'not_found', deactivatedOwner: { id: 'c9', serialNumber: 'X6' } }))));
    read('NFC-ANTIGA');
    expect(await screen.findByRole('alert')).toHaveTextContent(/foi desativado e pertencia ao cilindro X6/i);
  });

  it.each([
    ['hydro_expired', /teste hidrostático.*vencido/i],
    ['hydro_rejected', /teste hidrostático.*reprovado/i],
  ] as const)('aviso destacado para %s, sem impedir a entrada (RF-017)', async (warning, texto) => {
    renderView(fakeService(vi.fn(async () => stocked({ warning, hydroStatus: warning === 'hydro_expired' ? 'vencido' : 'reprovado' }))));
    read('QR-2');
    expect(await screen.findByRole('status')).toHaveTextContent(texto);
    expect(screen.getByRole('status')).toHaveTextContent(/entrada registrada/i);
  });

  it('resultado desconhecido: mantém o valor e oferece "Tentar de novo" com a MESMA chave; depois do sucesso a próxima chave é outra', async () => {
    const stockIn = vi.fn()
      .mockResolvedValueOnce({ kind: 'unknown' })
      .mockResolvedValueOnce(stocked())
      .mockResolvedValueOnce(stocked());
    renderView(fakeService(stockIn));
    read('QR-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível confirmar/i);
    expect(input().value).toBe('QR-1');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByText(/X1/);
    read('QR-2');
    await waitFor(() => expect(stockIn).toHaveBeenCalledTimes(3));
    const [first, second, third] = stockIn.mock.calls.map((call) => call[2]);
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it('se a pessoa troca o identificador depois de um resultado desconhecido, a chave também muda', async () => {
    const stockIn = vi.fn().mockResolvedValueOnce({ kind: 'unknown' }).mockResolvedValueOnce(stocked());
    renderView(fakeService(stockIn));
    read('QR-1');
    await screen.findByRole('alert');
    read('QR-OUTRO');
    await waitFor(() => expect(stockIn).toHaveBeenCalledTimes(2));
    expect(stockIn.mock.calls[1]?.[2]).not.toBe(stockIn.mock.calls[0]?.[2]);
  });

  it('sem conexão: informa que exige conexão, desabilita o envio e não registra nada (RF-035)', () => {
    const service = fakeService();
    render(<StockInView organizationId={ORG} service={service} online={false} canCreate />);
    expect(screen.getByText(/exige conexão/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar entrada' })).toBeDisabled();
    read('QR-1');
    expect(service.stockIn).not.toHaveBeenCalled();
  });

  it('sequência de 20 leituras só com o teclado: cada leitura devolve o foco ao campo e usa uma chave nova', async () => {
    const stockIn = vi.fn(async (_organization: string, _value: string, _key: string) => stocked());
    renderView(fakeService(stockIn));
    for (let n = 1; n <= 20; n += 1) {
      read(`QR-${n}\n`);
      await waitFor(() => expect(stockIn).toHaveBeenCalledTimes(n));
      await waitFor(() => expect(input().value).toBe(''));
      expect(input()).toHaveFocus();
    }
    const keys = stockIn.mock.calls.map((call) => call[2]);
    expect(new Set(keys).size).toBe(20);
  });

  it('mostra a última leitura registrada', async () => {
    renderView(fakeService());
    read('QR-1');
    expect(await screen.findByText(/última leitura/i)).toBeInTheDocument();
  });

  it('sem serviço: conexão indisponível', () => {
    renderView(null);
    expect(screen.getByRole('alert')).toHaveTextContent(/conexão indisponível/i);
  });
});

describe('entrada no estoque pela câmera', () => {
  it('um código lido pela câmera registra a entrada na hora, sem digitar', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) } });
    vi.stubGlobal('BarcodeDetector', class { detect = async () => [{ rawValue: 'DM-77' }]; });
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
    const service = fakeService();
    renderView(service);
    fireEvent.click(screen.getByRole('button', { name: 'Ler com a câmera' }));
    await waitFor(() => expect(service.stockIn).toHaveBeenCalledWith(ORG, 'DM-77', expect.stringMatching(UUID)), { timeout: 2000 });
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });
});
