import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NO_ABILITIES } from './trip-abilities';
import { DRIVER, fakeTripService, ORG, SITE_1, TRIP, VEHICLE } from './trip-test-support';
import { TripDetailView } from './trip-detail-page';
import { TripFormView } from './trip-form-page';

// Spec 008, história 7: sessão expirada no meio de uma operação não grava nada e leva a pessoa a entrar de novo.
const MENSAGEM = 'Sua sessão expirou e nada foi gravado. Entre de novo para continuar.';

describe('sessão expirada no detalhe da viagem', () => {
  it('uma ação recusada por sessão expirada avisa em texto e chama a saída', async () => {
    const onSessionExpired = vi.fn();
    const service = fakeTripService({ startLoading: vi.fn(async () => ({ kind: 'session_expired' })) });
    render(<TripDetailView organizationId={ORG} tripId={TRIP} service={service} online abilities={{ ...NO_ABILITIES, operate: true }} onSessionExpired={onSessionExpired} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar carregamento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAGEM);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    // Nada foi gravado: a tela não recarregou nem anunciou sucesso.
    expect(service.getTrip).toHaveBeenCalledTimes(1);
  });

  it('a consulta da viagem com sessão expirada também chama a saída', async () => {
    const onSessionExpired = vi.fn();
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'session_expired' })) });
    render(<TripDetailView organizationId={ORG} tripId={TRIP} service={service} online abilities={NO_ABILITIES} onSessionExpired={onSessionExpired} />);
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });
});

describe('sessão expirada no formulário de planejamento', () => {
  it('o envio recusado avisa em texto, chama a saída e não navega', async () => {
    const onSessionExpired = vi.fn();
    const onNavigate = vi.fn();
    const service = fakeTripService({ createTrip: vi.fn(async () => ({ kind: 'session_expired' })) });
    render(<TripFormView organizationId={ORG} service={service} online onNavigate={onNavigate} onSessionExpired={onSessionExpired} />);
    await screen.findByLabelText('Veículo');
    fireEvent.change(screen.getByLabelText('Veículo'), { target: { value: VEHICLE } });
    fireEvent.change(screen.getByLabelText('Motorista'), { target: { value: DRIVER } });
    fireEvent.change(screen.getByLabelText('Unidade da parada 1'), { target: { value: SITE_1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar cilindros à parada 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar CIL-001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
    expect((await screen.findAllByText(MENSAGEM)).length).toBeGreaterThan(0);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
