import React from 'react';
import { Button, Select, TextField } from '@/design-system';
import type { VertexInput } from '@/domain/registry/registry-validation';
import { GEOFENCE_LIMITS } from '@/domain/registry/geofence-limits';
import { GEOFENCE_SHAPE_LABELS, GEOFENCE_SHAPES } from '@/domain/registry/registry-vocabulary';

export interface GeofenceShapeDraft {
  shape: string;
  centerLat: string;
  centerLng: string;
  radiusM: string;
  vertices: VertexInput[];
}

export interface GeofenceShapeEditorProps {
  value: GeofenceShapeDraft;
  onChange: (value: GeofenceShapeDraft) => void;
  // Erros por campo: `shape`, `centerLat`, `centerLng`, `radiusM`, `vertices` (geral) e `vertices.<índice>`.
  errors: Readonly<Record<string, string>>;
  // Coordenadas da unidade, quando existem: habilita o atalho "Usar as coordenadas da unidade" (RF-017).
  siteCoordinates?: { lat: number; lng: number } | null;
  disabled?: boolean;
}

const EMPTY_VERTEX: VertexInput = { lat: '', lng: '' };
const decimal = (value: number): string => String(value).replace('.', ',');

// Editor da forma da geocerca: círculo (centro e raio) ou polígono (lista de vértices). Tudo se faz com o teclado: cada vértice tem
// rótulo e erro próprios, e acrescentar e remover são botões comuns (RF-017, História 9, cenário 3).
export function GeofenceShapeEditor({ value, onChange, errors, siteCoordinates = null, disabled = false }: GeofenceShapeEditorProps): React.JSX.Element {
  const patch = (next: Partial<GeofenceShapeDraft>): void => onChange({ ...value, ...next });
  const updateVertex = (index: number, change: Partial<VertexInput>): void => patch({ vertices: value.vertices.map((vertex, position) => (position === index ? { ...vertex, ...change } : vertex)) });
  const removeVertex = (index: number): void => patch({ vertices: value.vertices.filter((_, position) => position !== index) });
  const addVertex = (): void => patch({ vertices: [...value.vertices, { ...EMPTY_VERTEX }] });
  const canAdd = value.vertices.length < GEOFENCE_LIMITS.verticesMax;

  return (
    <div className="flex flex-col gap-4">
      <Select label="Forma" name="shape" value={value.shape} onChange={(event) => patch({ shape: event.target.value })} disabled={disabled} error={errors.shape}>
        <option value="" disabled>Escolha a forma</option>
        {GEOFENCE_SHAPES.map((shape) => <option key={shape} value={shape}>{GEOFENCE_SHAPE_LABELS[shape]}</option>)}
      </Select>

      {value.shape === 'circle' && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 tablet:grid-cols-3">
            <TextField label="Latitude do centro" name="centerLat" inputMode="decimal" value={value.centerLat} onChange={(event) => patch({ centerLat: event.target.value })} disabled={disabled} error={errors.centerLat} help="Graus decimais, por exemplo -23,550520." />
            <TextField label="Longitude do centro" name="centerLng" inputMode="decimal" value={value.centerLng} onChange={(event) => patch({ centerLng: event.target.value })} disabled={disabled} error={errors.centerLng} />
            <TextField label="Raio (metros)" name="radiusM" inputMode="numeric" value={value.radiusM} onChange={(event) => patch({ radiusM: event.target.value })} disabled={disabled} error={errors.radiusM}
              help={`Inteiro de ${GEOFENCE_LIMITS.radiusMinM} a ${GEOFENCE_LIMITS.radiusMaxM}.`} />
          </div>
          {siteCoordinates && (
            <Button variant="secundario" className="self-start" disabled={disabled} onClick={() => patch({ centerLat: decimal(siteCoordinates.lat), centerLng: decimal(siteCoordinates.lng) })}>
              Usar as coordenadas da unidade
            </Button>
          )}
        </div>
      )}

      {value.shape === 'polygon' && (
        <div className="flex flex-col gap-4">
          <p className="text-corpo text-texto-secundario">
            Informe de {GEOFENCE_LIMITS.verticesMin} a {GEOFENCE_LIMITS.verticesMax} vértices em ordem (horário ou anti-horário). O contorno fecha sozinho: não repita o primeiro vértice no fim.
          </p>
          <ul className="flex flex-col gap-4">
            {value.vertices.map((vertex, index) => (
              <li key={index} className="flex flex-col gap-2 rounded-card border border-borda-suave p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-corpo font-semibold text-navy">Vértice {index + 1}</h4>
                  <Button variant="secundario" disabled={disabled} aria-label={`Remover vértice ${index + 1}`} onClick={() => removeVertex(index)}>Remover</Button>
                </div>
                <div className="grid gap-4 tablet:grid-cols-2">
                  <TextField label={`Latitude do vértice ${index + 1}`} name={`vertices.${index}.lat`} inputMode="decimal" value={vertex.lat} onChange={(event) => updateVertex(index, { lat: event.target.value })} disabled={disabled} error={errors[`vertices.${index}`]} />
                  <TextField label={`Longitude do vértice ${index + 1}`} name={`vertices.${index}.lng`} inputMode="decimal" value={vertex.lng} onChange={(event) => updateVertex(index, { lng: event.target.value })} disabled={disabled} />
                </div>
              </li>
            ))}
          </ul>
          {errors.vertices && <p role="alert" className="text-legenda text-erro">{errors.vertices}</p>}
          <div>
            <Button variant="secundario" disabled={disabled || !canAdd} onClick={addVertex}>Adicionar vértice</Button>
            {!canAdd && <p className="mt-2 text-legenda text-texto-secundario">Limite de {GEOFENCE_LIMITS.verticesMax} vértices atingido.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
