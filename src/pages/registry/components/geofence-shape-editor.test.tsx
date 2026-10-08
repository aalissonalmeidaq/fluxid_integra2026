import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { GeofenceShapeEditor, type GeofenceShapeDraft } from './geofence-shape-editor';

const EMPTY: GeofenceShapeDraft = { shape: '', centerLat: '', centerLng: '', radiusM: '', vertices: [] };

function Harness({ initial = EMPTY, errors = {}, site = null }: { initial?: GeofenceShapeDraft; errors?: Record<string, string>; site?: { lat: number; lng: number } | null }) {
  const [value, setValue] = useState(initial);
  return <GeofenceShapeEditor value={value} onChange={setValue} errors={errors} siteCoordinates={site} />;
}

describe('GeofenceShapeEditor (RF-017)', () => {
  it('escolher círculo mostra centro e raio com os limites; escolher polígono mostra a lista de vértices', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Forma'), { target: { value: 'circle' } });
    expect(screen.getByLabelText('Latitude do centro')).toBeInTheDocument();
    expect(screen.getByLabelText('Raio (metros)')).toBeInTheDocument();
    expect(screen.getByText('Inteiro de 25 a 5000.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Forma'), { target: { value: 'polygon' } });
    expect(screen.queryByLabelText('Raio (metros)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar vértice' })).toBeInTheDocument();
  });

  it('"Usar as coordenadas da unidade" preenche o centro; sem coordenadas o atalho não existe', () => {
    const { unmount } = render(<Harness initial={{ ...EMPTY, shape: 'circle' }} site={{ lat: -23.55052, lng: -46.633308 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar as coordenadas da unidade' }));
    expect(screen.getByLabelText('Latitude do centro')).toHaveValue('-23,55052');
    expect(screen.getByLabelText('Longitude do centro')).toHaveValue('-46,633308');
    unmount();
    render(<Harness initial={{ ...EMPTY, shape: 'circle' }} />);
    expect(screen.queryByRole('button', { name: 'Usar as coordenadas da unidade' })).not.toBeInTheDocument();
  });

  it('vértices são acrescentados e removidos só com botões (teclado), cada um com rótulo próprio', () => {
    render(<Harness initial={{ ...EMPTY, shape: 'polygon' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar vértice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar vértice' }));
    expect(screen.getByLabelText('Latitude do vértice 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Longitude do vértice 2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Latitude do vértice 2'), { target: { value: '-23,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover vértice 1' }));
    expect(screen.getByLabelText('Latitude do vértice 1')).toHaveValue('-23,5');
    expect(screen.queryByLabelText('Latitude do vértice 2')).not.toBeInTheDocument();
  });

  it('o limite de 100 vértices desabilita o botão e explica', () => {
    const vertices = Array.from({ length: 100 }, () => ({ lat: '1', lng: '1' }));
    render(<Harness initial={{ ...EMPTY, shape: 'polygon', vertices }} />);
    expect(screen.getByRole('button', { name: 'Adicionar vértice' })).toBeDisabled();
    expect(screen.getByText('Limite de 100 vértices atingido.')).toBeInTheDocument();
  });

  it('erros aparecem junto dos campos: do raio, do vértice e geral dos vértices', () => {
    const { unmount } = render(<Harness initial={{ ...EMPTY, shape: 'circle' }} errors={{ radiusM: 'Raio inválido.', centerLat: 'Latitude inválida.' }} />);
    expect(screen.getByText('Raio inválido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Raio (metros)')).toHaveAttribute('aria-invalid', 'true');
    unmount();
    render(<Harness initial={{ ...EMPTY, shape: 'polygon', vertices: [{ lat: '', lng: '' }] }} errors={{ 'vertices.0': 'Vértice inválido.', vertices: 'As arestas se cruzam.' }} />);
    expect(screen.getByText('Vértice inválido.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('As arestas se cruzam.');
  });
});
