import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GeocodedLocation, GeocodeOutcome, GeocodingService } from '@/application/registry/geocoding-service';
import { CoordinatesField, GEOCODING_NOTICE, type CoordinatesFieldProps } from './coordinates-field';
import type { GeocodeSuggestion } from './geocode-suggestion';

// O mapa é carregado sob demanda e usa o Leaflet: aqui ele é trocado por um botão que simula o clique no mapa.
vi.mock('@/components/maps/osm-map', () => ({
  OsmMap: ({ latitude, longitude, onPick }: { latitude: number; longitude: number; onPick?: (lat: number, lng: number) => void }) => (
    <div data-testid="mapa" data-point={`${latitude},${longitude}`}>
      {onPick && <button type="button" onClick={() => onPick(-23.5, -46.6)}>clique no mapa</button>}
    </div>
  ),
}));

const ADDRESS = { street: 'Praça da Sé', number: '100', district: 'Sé', city: 'São Paulo', state: 'SP', postalCode: '01001000' };
const LOCATION: GeocodedLocation = { latitude: -23.550453, longitude: -46.633911, displayName: 'Praça da Sé, São Paulo, SP', precision: 'address' };
const BUSCAR = { name: 'Buscar coordenadas' };
const CONCORDO = { name: 'Concordo e buscar coordenadas' };

function Harness({ outcome, online = true, address = ADDRESS, saved, onSuggestionChange, locate }: {
  outcome: GeocodeOutcome; online?: boolean; address?: typeof ADDRESS; saved?: CoordinatesFieldProps['saved']; onSuggestionChange?: (s: GeocodeSuggestion | null) => void;
  locate?: ReturnType<typeof vi.fn>;
}) {
  const [coords, setCoords] = useState({ lat: '', lng: '' });
  const [suggestion, setSuggestion] = useState<GeocodeSuggestion | null>(null);
  const service = { locate: locate ?? vi.fn().mockResolvedValue(outcome) } as unknown as GeocodingService;
  return (
    <CoordinatesField
      latitude={coords.lat} longitude={coords.lng} onCoordinates={(lat, lng) => setCoords({ lat, lng })} address={address}
      organizationId="org" customerId="cliente" service={service} online={online} suggestion={suggestion}
      onSuggestion={(next) => { setSuggestion(next); onSuggestionChange?.(next); }} saved={saved}
    />
  );
}

// A busca tem dois passos: o clique abre o aviso e só a concordância explícita consulta o serviço externo.
const search = async (): Promise<void> => {
  fireEvent.click(screen.getByRole('button', BUSCAR));
  fireEvent.click(await screen.findByRole('button', CONCORDO));
};

describe('CoordinatesField (RF-065 a RF-067)', () => {
  it('busca pelo endereço, preenche latitude e longitude e pede a confirmação', async () => {
    const seen = vi.fn();
    render(<Harness outcome={{ kind: 'found', location: LOCATION }} onSuggestionChange={seen} />);
    await search();
    await waitFor(() => expect(screen.getByLabelText('Latitude')).toHaveValue('-23.550453'));
    expect(screen.getByLabelText('Longitude')).toHaveValue('-46.633911');
    expect(screen.getByText('Praça da Sé, São Paulo, SP')).toBeInTheDocument();
    expect(screen.getByText('Número exato')).toBeInTheDocument();
    const confirm = screen.getByRole('checkbox', { name: 'Confirmo que o endereço e o ponto encontrados estão corretos.' });
    expect(confirm).not.toBeChecked();
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ confirmed: false }));
    fireEvent.click(confirm);
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ confirmed: true }));
  });

  it('precisão baixa avisa que o ponto pode estar longe da porta', async () => {
    render(<Harness outcome={{ kind: 'found', location: { ...LOCATION, precision: 'locality' } }} />);
    await search();
    await screen.findByText('Aproximada (bairro ou cidade)');
    expect(screen.getByText(/pode estar longe da porta/)).toBeInTheDocument();
  });

  it.each([
    [{ kind: 'not_found' } as const, 'Não encontramos este endereço'],
    [{ kind: 'unavailable' } as const, 'Não foi possível buscar as coordenadas agora'],
    [{ kind: 'rate_limited', retryAfterSeconds: 9 } as const, 'Tente de novo em 9 segundos'],
    [{ kind: 'invalid' } as const, 'Preencha CEP, logradouro, número, cidade e UF'],
    [{ kind: 'denied' } as const, 'Você não tem permissão'],
    [{ kind: 'disabled' } as const, 'desativada neste ambiente'],
    [{ kind: 'personal_blocked' } as const, 'não está disponível para cadastro de pessoa física'],
    [{ kind: 'blocked' } as const, 'bloqueada neste ambiente'],
    [{ kind: 'confirmation_required' } as const, 'Confirme o envio do endereço'],
  ])('falha %j: informa o motivo e mantém a digitação manual', async (outcome, text) => {
    render(<Harness outcome={outcome} />);
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-1' } });
    await search();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(text));
    expect(screen.getByLabelText('Latitude')).toHaveValue('-1');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('sem conexão o botão fica desabilitado', () => {
    render(<Harness outcome={{ kind: 'unavailable' }} online={false} />);
    expect(screen.getByRole('button', BUSCAR)).toBeDisabled();
  });

  it('mudar o endereço depois da busca invalida a sugestão e pede nova busca', async () => {
    const { rerender } = render(<Harness outcome={{ kind: 'found', location: LOCATION }} />);
    await search();
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
        <CoordinatesField latitude="-23.550453" longitude="-46.633911" onCoordinates={() => undefined} address={ADDRESS} organizationId="o" customerId="c" service={null} online
          suggestion={suggestion} onSuggestion={setSuggestion} confirmationError="Confirme o endereço e o ponto." />
      );
    }
    render(<WithError />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Confirme o endereço e o ponto.')).toBeInTheDocument();
  });
});

describe('CoordinatesField: aviso e confirmação explícita antes de consultar o serviço externo', () => {
  it('o clique só abre o aviso com o texto exigido; nada é consultado até concordar', async () => {
    const locate = vi.fn().mockResolvedValue({ kind: 'found', location: LOCATION });
    render(<Harness outcome={{ kind: 'unavailable' }} locate={locate} />);
    fireEvent.click(screen.getByRole('button', BUSCAR));
    const group = await screen.findByRole('group', { name: 'Enviar o endereço ao serviço externo?' });
    expect(group).toHaveTextContent('O endereço será enviado ao serviço externo OpenStreetMap/Nominatim para obtenção das coordenadas. Use esta função apenas com endereços fictícios ou de unidades comerciais.');
    expect(GEOCODING_NOTICE).toBe('O endereço será enviado ao serviço externo OpenStreetMap/Nominatim para obtenção das coordenadas. Use esta função apenas com endereços fictícios ou de unidades comerciais.');
    expect(screen.getByRole('button', CONCORDO)).toHaveFocus();
    expect(locate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', CONCORDO));
    await waitFor(() => expect(locate).toHaveBeenCalledTimes(1));
    expect(locate).toHaveBeenCalledWith('org', 'cliente', ADDRESS, true);
    expect(screen.queryByRole('group', { name: 'Enviar o endereço ao serviço externo?' })).not.toBeInTheDocument();
  });

  it('cancelar fecha o aviso, devolve o foco ao botão e não consulta nada', async () => {
    const locate = vi.fn();
    render(<Harness outcome={{ kind: 'unavailable' }} locate={locate} />);
    fireEvent.click(screen.getByRole('button', BUSCAR));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('group', { name: 'Enviar o endereço ao serviço externo?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', BUSCAR)).toHaveFocus();
    expect(locate).not.toHaveBeenCalled();
  });

  it('não consulta durante a digitação nem ao mudar o endereço: só o clique abre o aviso', () => {
    const locate = vi.fn();
    const { rerender } = render(<Harness outcome={{ kind: 'unavailable' }} locate={locate} />);
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-2' } });
    rerender(<Harness outcome={{ kind: 'unavailable' }} locate={locate} address={{ ...ADDRESS, street: 'Rua Nova' }} />);
    expect(screen.queryByRole('group', { name: 'Enviar o endereço ao serviço externo?' })).not.toBeInTheDocument();
    expect(locate).not.toHaveBeenCalled();
  });

  it.each([
    ['logradouro', { street: '' }], ['número', { number: ' ' }], ['cidade', { city: '' }], ['UF', { state: '' }], ['CEP', { postalCode: '' }], ['CEP incompleto', { postalCode: '0100' }],
  ])('endereço sem %s: avisa o que falta e nem abre o aviso de envio', async (_name, patch) => {
    const locate = vi.fn();
    render(<Harness outcome={{ kind: 'unavailable' }} locate={locate} address={{ ...ADDRESS, ...patch }} />);
    fireEvent.click(screen.getByRole('button', BUSCAR));
    expect(screen.getByRole('status')).toHaveTextContent('Preencha CEP, logradouro, número, cidade e UF');
    expect(screen.queryByRole('group', { name: 'Enviar o endereço ao serviço externo?' })).not.toBeInTheDocument();
    expect(locate).not.toHaveBeenCalled();
  });
});

describe('CoordinatesField: correção manual do ponto no mapa antes de salvar', () => {
  it('o clique no mapa move o ponto, desfaz a confirmação da busca e avisa que será salvo como informado à mão', async () => {
    render(<Harness outcome={{ kind: 'found', location: LOCATION }} />);
    await search();
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('button', { name: 'clique no mapa' }));
    expect(screen.getByLabelText('Latitude')).toHaveValue('-23.5');
    expect(screen.getByLabelText('Longitude')).toHaveValue('-46.6');
    expect(screen.getAllByRole('status').some((node) => /Ponto corrigido no mapa/.test(node.textContent ?? ''))).toBe(true);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/O ponto foi corrigido à mão/)).toBeInTheDocument();
  });

  it('o mapa mostra o ponto digitado e aceita correção mesmo sem busca', () => {
    render(<Harness outcome={{ kind: 'unavailable' }} />);
    expect(screen.queryByTestId('mapa')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23,55' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-46,63' } });
    expect(screen.getByTestId('mapa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'clique no mapa' }));
    expect(screen.getByLabelText('Latitude')).toHaveValue('-23.5');
  });
});
