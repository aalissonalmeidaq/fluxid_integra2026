import React, { useEffect, useRef, useState } from 'react';
import { Button, Icon, TextField } from '@/design-system';
import {
  applyReading, draftOrigin, editCoordinate, replacingNeedsConfirmation, toggleSiteAddress, type PositionDraft,
} from '@/domain/field/position-draft';
import { accuracyBand, formatAccuracy, type PositionOrigin } from '@/domain/field/position-quality';
import type { PositionReaderState } from './use-position-reader';

// Posição da chegada e da entrega (Spec 009, RF-009 a RF-014): "Usar minha posição" lê o aparelho uma vez por toque; as coordenadas
// continuam editáveis à mão e a origem registrada (GPS, informada ou endereço da unidade) sempre bate com o dado. Precisão ruim só avisa;
// permissão negada e falhas explicam o motivo e mantêm tudo o que a pessoa já escreveu. A posição é sempre opcional.
export interface PositionFieldErrors {
  latitude?: string | undefined;
  longitude?: string | undefined;
  atSiteAddress?: string | undefined;
  position?: string | undefined;
}

export interface PositionFieldProps {
  draft: PositionDraft;
  onChange: (draft: PositionDraft) => void;
  position: PositionReaderState;
  // "No endereço da unidade" só existe na entrega; a chegada não o oferece.
  allowSiteAddress: boolean;
  errors?: PositionFieldErrors;
  disabled?: boolean;
}

const ORIGIN_LABEL: Record<PositionOrigin, string> = { gps: 'GPS', typed: 'informada', site_address: 'endereço da unidade' };
const FAILURE: Record<'denied' | 'unavailable' | 'timeout', string> = {
  denied: 'A permissão de localização foi negada. Libere a localização nas configurações do navegador ou digite as coordenadas.',
  unavailable: 'Não foi possível obter a posição agora. Tente de novo ou digite as coordenadas.',
  timeout: 'A leitura da posição demorou demais. Tente de novo ou digite as coordenadas.',
};

export function PositionField({ draft, onChange, position, allowSiteAddress, errors = {}, disabled = false }: PositionFieldProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  // O rascunho mais recente, para a leitura (assíncrona) não sobrescrever o que a pessoa escreveu enquanto esperava.
  const latest = useRef(draft);
  useEffect(() => { latest.current = draft; });

  const readNow = async (): Promise<void> => {
    setConfirming(false);
    const reading = await position.read();
    if (reading) onChange(applyReading(latest.current, reading));
  };
  const start = (): void => {
    if (replacingNeedsConfirmation(draft)) setConfirming(true);
    else void readNow();
  };

  const origin = draftOrigin(draft);
  const failed = position.status === 'denied' || position.status === 'unavailable' || position.status === 'timeout';
  const low = draft.gps !== null && accuracyBand(draft.gps.accuracyM) === 'low';

  return (
    <div className="flex flex-col gap-4">
      {position.supported ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secundario" disabled={disabled} loading={position.status === 'reading'} loadingLabel="Lendo a posição…" onClick={start}>
            {failed ? 'Tentar de novo' : 'Usar minha posição'}
          </Button>
        </div>
      ) : (
        <p className="m-0 text-corpo text-grafite">Localização indisponível neste aparelho. Digite as coordenadas.</p>
      )}

      {confirming && (
        <div role="group" aria-label="Confirmar a substituição das coordenadas" className="flex flex-col gap-2 rounded-controle border border-alerta-faixa bg-alerta-fundo p-4">
          <p className="m-0 text-corpo font-semibold text-alerta-texto">Substituir as coordenadas digitadas pela posição lida pelo aparelho?</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primario" onClick={() => void readNow()}>Substituir</Button>
            <Button variant="secundario" onClick={() => setConfirming(false)}>Manter as digitadas</Button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="flex flex-col gap-2">
        {failed && (
          <p className="m-0 flex items-start gap-2 text-corpo font-semibold text-erro">
            <Icon name="alerta" variant="monocromatica" />
            <span className="min-w-0 break-words">{FAILURE[position.status as 'denied' | 'unavailable' | 'timeout']}</span>
          </p>
        )}
        {draft.gps !== null && (
          <p className="m-0 text-corpo text-grafite">
            {`Posição lida às ${new Date(draft.gps.readAt).toLocaleTimeString('pt-BR')} · precisão ${formatAccuracy(draft.gps.accuracyM)}.`}
          </p>
        )}
        {low && draft.gps && (
          <p className="m-0 flex items-start gap-2 text-corpo font-semibold text-alerta-texto">
            <Icon name="alerta" variant="monocromatica" />
            <span className="min-w-0 break-words">{`Precisão baixa (${formatAccuracy(draft.gps.accuracyM)}). Você pode salvar mesmo assim.`}</span>
          </p>
        )}
        {origin !== null && <p className="m-0 text-legenda text-texto-secundario">{`Origem: ${ORIGIN_LABEL[origin]}`}</p>}
      </div>

      <div className="grid gap-4 tablet:grid-cols-2">
        <TextField label="Latitude" name="latitude" inputMode="decimal" value={draft.latitude} onChange={(event) => onChange(editCoordinate(draft, 'latitude', event.target.value))}
          error={errors.latitude} disabled={draft.atSiteAddress || disabled} help="Exemplo: -23,5505" />
        <TextField label="Longitude" name="longitude" inputMode="decimal" value={draft.longitude} onChange={(event) => onChange(editCoordinate(draft, 'longitude', event.target.value))}
          error={errors.longitude} disabled={draft.atSiteAddress || disabled} help="Exemplo: -46,6333" />
      </div>

      {allowSiteAddress && (
        <label className="inline-flex min-h-alvo items-center gap-2 text-corpo">
          <input type="checkbox" name="atSiteAddress" checked={draft.atSiteAddress} disabled={disabled} onChange={(event) => onChange(toggleSiteAddress(draft, event.target.checked))} className="size-6" />
          Entrega no endereço da unidade
        </label>
      )}
      {errors.atSiteAddress && <p role="alert" className="m-0 text-corpo font-semibold text-erro">{errors.atSiteAddress}</p>}
      {errors.position && <p role="alert" className="m-0 text-corpo font-semibold text-erro">{errors.position}</p>}
    </div>
  );
}
