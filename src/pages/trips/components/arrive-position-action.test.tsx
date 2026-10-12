import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PositionReading } from '@/domain/field/position-quality';
import type { GeolocationReader } from '@/infrastructure/field/geolocation-reader';
import { ReaderError, type ReaderErrorKind } from '@/infrastructure/field/reader-error';
import { ArrivePositionAction } from './arrive-position-action';

// Spec 009, US2 (RF-009 a RF-015, RN-004): a chegada com a posição lida pelo aparelho ou com coordenadas digitadas; a chegada sem posição
// (ArriveStopAction) continua à parte. "No endereço da unidade" não existe na chegada.
const READING: PositionReading = { latitude: -23.55052, longitude: -46.633309, accuracyM: 12.4, readAt: Date.now() };
const reader = (over: { supported?: boolean; reading?: PositionReading; fail?: ReaderErrorKind } = {}): GeolocationReader & { read: ReturnType<typeof vi.fn> } => ({
  isSupported: () => over.supported ?? true,
  read: vi.fn(async () => { if (over.fail) throw new ReaderError(over.fail); return over.reading ?? READING; }),
}) as never;

const setup = (over: Partial<React.ComponentProps<typeof ArrivePositionAction>> = {}) => {
  const onArrive = vi.fn();
  render(<ArrivePositionAction position={2} siteName="Unidade Norte" online busy={false} loading={false} onArrive={onArrive} geolocation={reader()} {...over} />);
  return onArrive;
};
const open = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Chegada com a posição da parada 2 (Unidade Norte)' })); };
const confirm = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Registrar chegada com a posição' })); };

describe('chegada com a posição', () => {
  it('começa recolhida: o campo de posição só aparece depois de tocar no botão, que informa o estado', () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'Chegada com a posição da parada 2 (Unidade Norte)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Latitude')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Latitude')).toBeInTheDocument();
  });

  it('lê o GPS, e registra a chegada com a posição, a precisão, a origem e o horário da leitura', async () => {
    const onArrive = setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha posição' }));
    await screen.findByText('Origem: GPS');
    confirm();
    await waitFor(() => expect(onArrive).toHaveBeenCalledTimes(1));
    expect(onArrive).toHaveBeenCalledWith({ latitude: -23.55052, longitude: -46.633309, accuracyM: 12.4, source: 'gps', readAt: new Date(READING.readAt).toISOString() });
  });

  it('coordenadas digitadas seguem como "informada", sem precisão nem horário', async () => {
    const onArrive = setup();
    open();
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23,5505' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-46,6333' } });
    confirm();
    await waitFor(() => expect(onArrive).toHaveBeenCalledWith({ latitude: -23.5505, longitude: -46.6333, accuracyM: null, source: 'typed', readAt: null }));
  });

  it('a chegada não oferece "no endereço da unidade"', () => {
    setup();
    open();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('sem posição nenhuma, pede para ler ou digitar e não registra', async () => {
    const onArrive = setup();
    open();
    confirm();
    expect(await screen.findByText('Leia a posição ou digite a latitude e a longitude.')).toBeInTheDocument();
    expect(onArrive).not.toHaveBeenCalled();
  });

  it('coordenada pela metade ou fora do intervalo é recusada com o texto no campo', async () => {
    const onArrive = setup();
    open();
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23.5' } });
    confirm();
    expect(await screen.findByText('Informe a latitude e a longitude juntas.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-200' } });
    confirm();
    expect(await screen.findByText('A longitude vai de −180 a 180.')).toBeInTheDocument();
    expect(onArrive).not.toHaveBeenCalled();
  });

  it('leitura do GPS com mais de 2 minutos é lida de novo antes de registrar', async () => {
    let clock = READING.readAt;
    const geolocation = reader();
    const onArrive = setup({ geolocation, now: () => clock });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha posição' }));
    await screen.findByText('Origem: GPS');
    clock = READING.readAt + 121_000;
    geolocation.read.mockResolvedValueOnce({ ...READING, accuracyM: 5, readAt: clock });
    confirm();
    await waitFor(() => expect(onArrive).toHaveBeenCalledTimes(1));
    expect(geolocation.read).toHaveBeenCalledTimes(2);
    expect(onArrive).toHaveBeenCalledWith(expect.objectContaining({ source: 'gps', accuracyM: 5 }));
  });

  it('se a nova leitura falha, não registra e explica', async () => {
    let clock = READING.readAt;
    const geolocation = reader();
    const onArrive = setup({ geolocation, now: () => clock });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha posição' }));
    await screen.findByText('Origem: GPS');
    clock = READING.readAt + 121_000;
    geolocation.read.mockRejectedValueOnce(new ReaderError('timeout'));
    confirm();
    expect(await screen.findByText('Não foi possível atualizar a posição. Leia de novo ou digite as coordenadas.')).toBeInTheDocument();
    expect(onArrive).not.toHaveBeenCalled();
  });

  it('sem conexão ou com outra ação em andamento, fica desabilitado', () => {
    setup({ online: false });
    expect(screen.getByRole('button', { name: 'Chegada com a posição da parada 2 (Unidade Norte)' })).toBeDisabled();
  });

  it('enquanto registra, mostra o carregando e não aceita novo clique', () => {
    const onArrive = setup({ loading: true });
    open();
    const button = screen.getByRole('button', { name: 'Registrando…' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onArrive).not.toHaveBeenCalled();
  });
});
