import React, { useState } from 'react';
import type { RegistryOutcome } from '@/application/registry/registry-service';
import { Button, TextField } from '@/design-system';

export interface PointTesterProps {
  // Pergunta ao servidor se o ponto está dentro; nada é gravado.
  test: (latitude: number, longitude: number) => Promise<RegistryOutcome<boolean>>;
  disabled?: boolean;
}

type Result = { kind: 'idle' } | { kind: 'inside' } | { kind: 'outside' } | { kind: 'error'; message: string };

const MESSAGES = {
  inside: 'O ponto está dentro da geocerca.',
  outside: 'O ponto está fora da geocerca.',
} as const;

const parse = (text: string): number | null => {
  const normalized = text.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null;
};

// "Testar um ponto": a pessoa informa latitude e longitude e vê "dentro" ou "fora", em texto, decidido pelo servidor (RF-016, RF-017).
export function PointTester({ test, disabled = false }: PointTesterProps): React.JSX.Element {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [errors, setErrors] = useState<{ latitude?: string; longitude?: string }>({});
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  const run = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    const lat = parse(latitude);
    const lng = parse(longitude);
    const found: { latitude?: string; longitude?: string } = {};
    if (lat === null || lat < -90 || lat > 90) found.latitude = 'Informe a latitude, de -90 a 90.';
    if (lng === null || lng < -180 || lng > 180) found.longitude = 'Informe a longitude, de -180 a 180.';
    setErrors(found);
    if (lat === null || lng === null || found.latitude || found.longitude) return;
    setBusy(true);
    const outcome = await test(lat, lng);
    setBusy(false);
    if (outcome.kind === 'success') setResult({ kind: outcome.value ? 'inside' : 'outside' });
    else if (outcome.kind === 'inactive_record') setResult({ kind: 'error', message: 'Esta geocerca está inativa e não pode ser testada.' });
    else if (outcome.kind === 'offline') setResult({ kind: 'error', message: 'Sem conexão. O teste exige conexão.' });
    else setResult({ kind: 'error', message: 'Não foi possível testar o ponto agora. Tente de novo.' });
  };

  return (
    <form noValidate onSubmit={(event) => void run(event)} className="flex flex-col gap-4">
      <div className="grid gap-4 tablet:grid-cols-2">
        <TextField label="Latitude do ponto" name="pointLat" inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} error={errors.latitude} disabled={disabled} />
        <TextField label="Longitude do ponto" name="pointLng" inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} error={errors.longitude} disabled={disabled} />
      </div>
      <Button type="submit" className="self-start" disabled={disabled} loading={busy} loadingLabel="Testando…">Testar ponto</Button>
      <p role="status" aria-atomic="true" className="min-h-6 text-corpo font-semibold text-grafite">
        {result.kind === 'inside' || result.kind === 'outside' ? MESSAGES[result.kind] : result.kind === 'error' ? result.message : ''}
      </p>
    </form>
  );
}
