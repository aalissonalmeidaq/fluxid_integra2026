import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GeofencePreview } from './geofence-preview';

describe('GeofencePreview', () => {
  it('círculo: desenho com alternativa em texto de forma, tamanho e centro', () => {
    render(<GeofencePreview value={{ shape: 'circle', center: { lat: -23.55, lng: -46.633 }, radiusM: 200 }} />);
    const image = screen.getByRole('img');
    expect(image.getAttribute('aria-label')).toBe('Círculo de 200 metros de raio, com centro em -23.55 e -46.633.');
    expect(image.querySelector('circle')).not.toBeNull();
    expect(screen.getByText(/Desenho esquemático, sem mapa/)).toBeInTheDocument();
  });

  it('círculo incompleto não desenha e avisa em texto', () => {
    render(<GeofencePreview value={{ shape: 'circle', center: null, radiusM: 100 }} />);
    expect(screen.getByRole('img').querySelector('circle')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/incompleto/);
  });

  it('polígono: desenha os vértices e lista cada um no texto', () => {
    render(<GeofencePreview value={{ shape: 'polygon', vertices: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }] }} />);
    const image = screen.getByRole('img');
    expect(image.querySelector('polygon')?.getAttribute('points')?.split(' ')).toHaveLength(3);
    expect(image.getAttribute('aria-label')).toBe('Polígono com 3 vértices (1: 0, 0; 2: 0, 1; 3: 1, 1).');
  });

  it('polígono sem vértices não desenha', () => {
    render(<GeofencePreview value={{ shape: 'polygon', vertices: [] }} />);
    expect(screen.getByRole('img').querySelector('polygon')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Polígono ainda sem vértices.');
  });
});
