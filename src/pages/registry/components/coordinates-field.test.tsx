import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GeocodedLocation, GeocodeOutcome, GeocodingService } from '@/application/registry/geocoding-service';
import { CoordinatesField, type CoordinatesFieldProps } from './coordinates-field';
import type { GeocodeSuggestion } from './geocode-suggestion';

const ADDRESS = { street: 'Praça da Sé', number: '100', district: 'Sé', city: 'São Paulo', state: 'SP', postalCode: '01001000' };
const LOCATION: GeocodedLocation = { latitude: -23.550453, longitude: -46.633911, displayName: 'Praça da Sé, São Paulo, SP', precision: 'address' };

function Harness({ outcome, online = true, address = ADDRESS, saved, onSuggestionChange }: {
  outcome: GeocodeOutcome; online?: boolean; address?: typeof ADDRESS; saved?: CoordinatesFieldProps['saved']; onSuggestionChange?: (s: GeocodeSuggestion | null) => void;
}) {
  const [coords, setCoords] = useState({ lat: '', lng: '' });
  const [suggestion, setSuggestion] = useState<GeocodeSuggestion | null>(null);
  const service = { locate: vi.fn().mockResolvedValue(outcome) } as unknown as GeocodingService;
  return (
    <CoordinatesField
      latitude={coords.lat} longitude={coords.lng} onCoordinates={(lat, lng) => setCoords({ lat, lng })} address={address}
      organizationId="org" service={service} online={online} suggestion={suggestion}
      onSuggestion={(next) => { setSuggestion(next); onSuggestionChange?.(next); }} saved={saved}
    />
  );
}

describe('CoordinatesField (RF-065 a RF-067)', () => {
  it('busca pelo endereço, preenche latitude e longitude e pede a confirmação', async () => {
    const seen = vi.fn();
    render(<Harness outcome={{ kind: 'found', location: LOCATION }} onSuggestionChange={seen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar coordenadas pelo endereço' }));
    await waitFor(() => expect(screen.getByLabelText('Latitude')).toHaveValue('-23.550453'));
    expect(screen.getByLabelText('Longitude')).toHaveValue('-46.633911');
    expect(screen.getByText('Praça da Sé, São Paulo, SP')).toBeInTheDocument();
    expect(screen.getByText('Número exato')).toBeInTheDocument();
    const confirm = screen.getByRole('checkbox', { name: 'Confirmo que o endereço e o ponto estão corretos' });
    expect(confirm).not.toBeChecked();
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ confirmed: false }));
    fireEvent.click(confirm);
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ confirmed: true }));
  });

  it('precisão baixa avisa que o ponto pode estar longe da porta', async () => {
    render(<Harness outcome={{ kind: 'found', location: { ...LOCATION, precision: 'locality' } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar coordenadas pelo endereço' }));
    await screen.findByText('Aproximada (bairro ou cidade)');
    expect(screen.getByText(/pode estar longe da porta/)).toBeInTheDocument();
  });

  it.each([
    [{ kind: 'not_found' } as const, 'Não encontramos este endereço'],
    [{ kind: 'unavailable' } as const, 'Não foi possível buscar as coordenadas agora'],
    [{ kind: 'rate_limited', retryAfterSeconds: 9 } as const, 'Tente de novo em 9 segundos'],
    [{ kind: 'invalid' } as const, 'Preencha logradouro, cidade e UF'],
    [{ kind: 'denied' } as const, 'Você não tem permissão'],
  ])('falha %j: informa o motivo e mantém a digitação manual', async (outcome, text) => {
    render(<Harness outcome={outcome} />);
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar coordenadas pelo endereço' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(text));
    expect(screen.getByLabelText('Latitude')).toHaveValue('-1');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('sem conexão o botão fica desabilitado', () => {
    render(<Harness outcome={{ kind: 'unavailable' }} online={false} />);
    expect(screen.getByRole('button', { name: 'Buscar coordenadas pelo endereço' })).toBeDisabled();
  });

  it('mudar o endereço depois da busca invalida a sugestão e pede nova busca', async () => {
    const { rerender } = render(<Harness outcome={{ kind: 'found', location: LOCATION }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar coordenadas pelo endereço' }));
    await screen.findByRole('checkbox');
    rerender(<Harness outcome={{ kind: 'found', location: LOCATION }} address={{ ...ADDRESS, number: '200' }} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('mostra a origem e a data da confirmação já gravadas', () => {
    render(<Harness outcome={{ kind: 'unavailable' }} saved={{ source: 'geocoded', confirmedAt: '2026-10-07T15:00:00Z' }} />);
    expect(screen.getByText(/confirmadas pela busca do endereço em/)).toBeInTheDocument();
  });

  it('o erro de confirmação aparece em texto junto da caixa', async () => {
    function WithError() {
      const [suggestion, setSuggestion] = useState<GeocodeSuggestion | null>({ location: LOCATION, addressKey: 'praça da sé|100|sé|são paulo|sp|01001000', confirmed: false });
      return (
        <CoordinatesField latitude="1" longitude="2" onCoordinates={() => undefined} address={ADDRESS} organizationId="o" service={null} online suggestion={suggestion}
          onSuggestion={setSuggestion} confirmationError="Confirme o endereço e o ponto." />
      );
    }
    render(<WithError />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Confirme o endereço e o ponto.')).toBeInTheDocument();
  });
});
