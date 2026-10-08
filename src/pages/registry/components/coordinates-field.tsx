import React, { useRef, useState } from 'react';
import type { GeocodeAddressInput, GeocodedLocation, GeocodeOutcome, GeocodingService } from '@/application/registry/geocoding-service';
import { OsmMap } from '@/components/maps/osm-map';
import { Alert, Button, TextField } from '@/design-system';
import { normalizePostalCode } from '@/domain/registry/phone-and-postal-code';
import { addressKeyOf, type GeocodeSuggestion } from './geocode-suggestion';

export interface CoordinatesFieldProps {
  latitude: string;
  longitude: string;
  onCoordinates: (latitude: string, longitude: string) => void;
  address: GeocodeAddressInput;
  organizationId: string;
  // Cliente da unidade: o servidor confere nele o tipo de pessoa (cadastro de pessoa física não é geocodificado).
  customerId: string;
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

type Status = { kind: 'idle' } | { kind: 'searching' } | { kind: 'picked' } | Exclude<GeocodeOutcome, { kind: 'found' }> | { kind: 'found' };

// Aviso exibido antes de qualquer consulta ao serviço externo (integração temporária, exclusiva do protótipo).
export const GEOCODING_NOTICE = 'O endereço será enviado ao serviço externo OpenStreetMap/Nominatim para obtenção das coordenadas. Use esta função apenas com endereços fictícios ou de unidades comerciais.';

const MESSAGES: Record<Exclude<GeocodeOutcome['kind'], 'rate_limited'> | 'found' | 'picked', string> = {
  found: 'Coordenadas encontradas. Confira o endereço e o ponto abaixo e confirme.',
  not_found: 'Não encontramos este endereço. Confira os dados ou informe as coordenadas à mão.',
  unavailable: 'Não foi possível buscar as coordenadas agora. Informe-as à mão ou salve sem elas.',
  offline: 'Sem conexão. Informe as coordenadas à mão ou salve sem elas.',
  invalid: 'Preencha CEP, logradouro, número, cidade e UF para buscar as coordenadas.',
  denied: 'Você não tem permissão para buscar as coordenadas. Informe-as à mão.',
  disabled: 'A busca de coordenadas pelo endereço está desativada neste ambiente. Informe-as à mão.',
  personal_blocked: 'A busca de coordenadas não está disponível para cadastro de pessoa física. Informe-as à mão.',
  confirmation_required: 'Confirme o envio do endereço ao serviço externo para buscar as coordenadas.',
  blocked: 'A busca pelo serviço externo está bloqueada neste ambiente. Informe as coordenadas à mão.',
  picked: 'Ponto corrigido no mapa. As coordenadas serão salvas como informadas à mão.',
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

const addressComplete = (address: GeocodeAddressInput): boolean =>
  [address.street, address.number, address.city, address.state].every((part) => part.trim() !== '') && normalizePostalCode(address.postalCode) !== null;

// Coordenadas da unidade: digitadas à mão, buscadas pelo endereço no servidor ou corrigidas no mapa. A busca só acontece no
// clique em "Buscar coordenadas" e depois da confirmação explícita do envio do endereço (nada é consultado durante a digitação).
// O resultado é uma sugestão: nada vale até a pessoa marcar a confirmação, e a falha da busca nunca trava o cadastro (RF-067).
export function CoordinatesField({
  latitude, longitude, onCoordinates, address, organizationId, customerId, service, online, suggestion, onSuggestion, saved, latitudeError, longitudeError, confirmationError,
}: CoordinatesFieldProps): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [asking, setAsking] = useState(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  const searching = status.kind === 'searching';
  const current = addressKeyOf(address);
  const lat = toCoordinate(latitude);
  const lng = toCoordinate(longitude);
  const sameAddress = suggestion !== null && suggestion.addressKey === current;
  // A sugestão só vale enquanto o ponto é o encontrado: corrigido à mão (campos ou mapa), passa a ser informado à mão.
  const adjusted = sameAddress && (lat !== suggestion.location.latitude || lng !== suggestion.location.longitude);
  const active = sameAddress && !adjusted ? suggestion : null;
  const stale = suggestion !== null && suggestion.addressKey !== current;

  // 1º passo: o clique só abre o aviso. Nada sai do navegador antes da confirmação explícita.
  const requestSearch = (): void => {
    if (searching) return;
    if (!service || !online) return setStatus({ kind: 'offline' });
    if (!addressComplete(address)) return setStatus({ kind: 'invalid' });
    setStatus({ kind: 'idle' });
    setAsking(true);
  };

  const cancelSearch = (): void => {
    setAsking(false);
    searchButton.current?.focus();
  };

  const search = async (): Promise<void> => {
    if (searching || !service || !online) return;
    setAsking(false);
    setStatus({ kind: 'searching' });
    const outcome = await service.locate(organizationId, customerId, address, true);
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
        <Button ref={searchButton} variant="secundario" disabled={!online} loading={searching} loadingLabel="Buscando…" onClick={requestSearch}>Buscar coordenadas</Button>
      </div>

      {asking && (
        <div role="group" aria-labelledby="geocode-consent-title" className="flex flex-col gap-4 rounded-card border border-borda p-4">
          <h3 id="geocode-consent-title" className="text-corpo font-semibold text-navy">Enviar o endereço ao serviço externo?</h3>
          <p className="text-corpo text-grafite">{GEOCODING_NOTICE}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button autoFocus onClick={() => void search()}>Concordo e buscar coordenadas</Button>
            <Button variant="secundario" onClick={cancelSearch}>Cancelar</Button>
          </div>
        </div>
      )}
      <p role="status" aria-atomic="true" className="min-h-6 text-legenda text-texto-secundario">{messageOf(status)}</p>

      {lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (
        <OsmMap
          title="Mapa do ponto das coordenadas"
          latitude={lat}
          longitude={lng}
          caption="Confira se o marcador está na porta de entrega. Para corrigir, clique no ponto certo do mapa ou ajuste a latitude e a longitude."
          onPick={(pickedLat, pickedLng) => { onCoordinates(String(pickedLat), String(pickedLng)); setStatus({ kind: 'picked' }); }}
        />
      )}

      {stale && <Alert variant="alerta">O endereço mudou depois da busca. Busque as coordenadas de novo para confirmá-las.</Alert>}

      {adjusted && <Alert variant="informacao">O ponto foi corrigido à mão. Ao salvar, as coordenadas contam como informadas à mão, sem a confirmação da busca.</Alert>}

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
            Confirmo que o endereço e o ponto encontrados estão corretos.
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
