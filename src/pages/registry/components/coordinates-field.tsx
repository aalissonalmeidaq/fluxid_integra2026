import React, { useState } from 'react';
import type { GeocodeAddressInput, GeocodedLocation, GeocodeOutcome, GeocodingService } from '@/application/registry/geocoding-service';
import { OsmMap } from '@/components/maps/osm-map';
import { Alert, Button, TextField } from '@/design-system';
import { addressKeyOf, type GeocodeSuggestion } from './geocode-suggestion';

export interface CoordinatesFieldProps {
  latitude: string;
  longitude: string;
  onCoordinates: (latitude: string, longitude: string) => void;
  address: GeocodeAddressInput;
  organizationId: string;
  service: GeocodingService | null;
  online: boolean;
  suggestion: GeocodeSuggestion | null;
  onSuggestion: (suggestion: GeocodeSuggestion | null) => void;
  // Origem e instante da confirmação já gravados na unidade (edição).
  saved?: { source: 'manual' | 'geocoded' | null; confirmedAt: string | null } | undefined;
  latitudeError?: string | undefined;
  longitudeError?: string | undefined;
  confirmationError?: string | undefined;
}

type Status = { kind: 'idle' } | { kind: 'searching' } | Exclude<GeocodeOutcome, { kind: 'found' }> | { kind: 'found' };

const MESSAGES: Record<Exclude<GeocodeOutcome['kind'], 'rate_limited'> | 'found', string> = {
  found: 'Coordenadas encontradas. Confira o endereço e o ponto abaixo e confirme.',
  not_found: 'Não encontramos este endereço. Confira os dados ou informe as coordenadas à mão.',
  unavailable: 'Não foi possível buscar as coordenadas agora. Informe-as à mão ou salve sem elas.',
  offline: 'Sem conexão. Informe as coordenadas à mão ou salve sem elas.',
  invalid: 'Preencha logradouro, cidade e UF para buscar as coordenadas.',
  denied: 'Você não tem permissão para buscar as coordenadas. Informe-as à mão.',
};

const PRECISION_TEXT: Record<GeocodedLocation['precision'], string> = {
  address: 'Número exato',
  street: 'Só a rua (o número não foi localizado)',
  locality: 'Aproximada (bairro ou cidade)',
};

function messageOf(status: Status): string {
  if (status.kind === 'idle') return '';
  if (status.kind === 'searching') return 'Buscando as coordenadas…';
  if (status.kind === 'rate_limited') return `Muitas buscas em pouco tempo. Tente de novo em ${status.retryAfterSeconds} segundos ou informe as coordenadas à mão.`;
  return MESSAGES[status.kind];
}

const toCoordinate = (value: string): number | null => {
  const text = value.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
};

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
};

// Coordenadas da unidade: digitadas à mão ou buscadas pelo endereço no servidor. A busca é uma sugestão: nada vale até a pessoa
// marcar a confirmação, e a falha da busca nunca trava o cadastro (RF-067).
export function CoordinatesField({
  latitude, longitude, onCoordinates, address, organizationId, service, online, suggestion, onSuggestion, saved, latitudeError, longitudeError, confirmationError,
}: CoordinatesFieldProps): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const searching = status.kind === 'searching';
  const current = addressKeyOf(address);
  const active = suggestion !== null && suggestion.addressKey === current ? suggestion : null;
  const stale = suggestion !== null && suggestion.addressKey !== current;
  const lat = toCoordinate(latitude);
  const lng = toCoordinate(longitude);

  const search = async (): Promise<void> => {
    if (searching) return;
    if (!service || !online) {
      setStatus({ kind: 'offline' });
      return;
    }
    setStatus({ kind: 'searching' });
    const outcome = await service.locate(organizationId, address);
    if (outcome.kind === 'found') {
      onSuggestion({ location: outcome.location, addressKey: current, confirmed: false });
      onCoordinates(String(outcome.location.latitude), String(outcome.location.longitude));
      setStatus({ kind: 'found' });
    } else {
      setStatus(outcome);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 tablet:grid-cols-2">
        <TextField label="Latitude" name="latitude" inputMode="decimal" value={latitude} onChange={(event) => onCoordinates(event.target.value, longitude)} error={latitudeError} />
        <TextField label="Longitude" name="longitude" inputMode="decimal" value={longitude} onChange={(event) => onCoordinates(latitude, event.target.value)} error={longitudeError} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secundario" disabled={!online} loading={searching} loadingLabel="Buscando…" onClick={() => void search()}>Buscar coordenadas pelo endereço</Button>
      </div>
      <p role="status" aria-atomic="true" className="min-h-6 text-legenda text-texto-secundario">{messageOf(status)}</p>

      {lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (
        <OsmMap title="Mapa do ponto das coordenadas" latitude={lat} longitude={lng} caption="Confira no mapa se o marcador está na porta de entrega." />
      )}

      {stale && <Alert variant="alerta">O endereço mudou depois da busca. Busque as coordenadas de novo para confirmá-las.</Alert>}

      {active && (
        <div role="group" aria-labelledby="geocode-review-title" className="flex flex-col gap-4 rounded-card border border-borda p-4">
          <h3 id="geocode-review-title" className="text-corpo font-semibold text-navy">Confira o endereço e o ponto</h3>
          <dl className="grid gap-1 text-corpo text-grafite">
            <div><dt className="inline font-semibold">Endereço encontrado: </dt><dd className="inline">{active.location.displayName || 'não informado pelo serviço'}</dd></div>
            <div><dt className="inline font-semibold">Ponto: </dt><dd className="inline">{active.location.latitude}, {active.location.longitude}</dd></div>
            <div><dt className="inline font-semibold">Precisão: </dt><dd className="inline">{PRECISION_TEXT[active.location.precision]}</dd></div>
          </dl>
          {active.location.precision !== 'address' && (
            <Alert variant="alerta">O ponto pode estar longe da porta de entrega. Confira o endereço e, se preciso, corrija as coordenadas à mão.</Alert>
          )}
          <label className="flex min-h-alvo items-center gap-2 text-corpo text-grafite">
            <input
              type="checkbox"
              className="size-6"
              checked={active.confirmed}
              aria-invalid={confirmationError ? true : undefined}
              aria-describedby={confirmationError ? 'geocode-confirm-error' : undefined}
              onChange={(event) => onSuggestion({ ...active, confirmed: event.target.checked })}
            />
            Confirmo que o endereço e o ponto estão corretos
          </label>
          {confirmationError && <p id="geocode-confirm-error" className="text-legenda text-erro">{confirmationError}</p>}
        </div>
      )}

      {!active && saved?.source === 'geocoded' && saved.confirmedAt && (
        <p className="text-legenda text-texto-secundario">Coordenadas confirmadas pela busca do endereço em {formatDate(saved.confirmedAt)}.</p>
      )}
      {!active && saved?.source === 'manual' && <p className="text-legenda text-texto-secundario">Coordenadas informadas à mão.</p>}
    </div>
  );
}
