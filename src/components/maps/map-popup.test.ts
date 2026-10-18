import { fireEvent, waitFor, within } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';
import { ADDRESS_NOTICE, popupContent } from './map-popup';
import type { MapPoint } from './map-types';

// Balão do ponto do lacre com o endereço aproximado das coordenadas (pedido de 18/10/2026, Spec 012): o endereço já consultado aparece
// ao abrir; senão, "Mostrar endereço" traz o aviso de que as coordenadas vão ao Nominatim, e só o clique faz a consulta.
const POINT: MapPoint = { id: 'ponto', label: 'Lacre bancada ESP32-C3', latitude: -7.209194, longitude: -39.306367, details: ['DSP-1GQND06X', 'Posição informada pelo lacre'] };

describe('popupContent', () => {
  it('sem endereço: mostra nome e detalhes, sem botão nem status', () => {
    const { element } = popupContent(POINT);
    expect(element.textContent).toContain('Lacre bancada ESP32-C3');
    expect(element.textContent).toContain('DSP-1GQND06X');
    expect(within(element).queryByRole('button')).toBeNull();
    expect(within(element).queryByRole('status')).toBeNull();
  });

  it('endereço já consultado aparece ao abrir, sem nova consulta', () => {
    const resolve = vi.fn();
    const { element } = popupContent({ ...POINT, address: { known: () => 'Rua do Pátio, 10, Centro, Juazeiro do Norte, CE', resolve } });
    expect(within(element).getByRole('status')).toHaveTextContent('Endereço aproximado: Rua do Pátio, 10, Centro, Juazeiro do Norte, CE');
    expect(within(element).queryByRole('button')).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('sem endereço conhecido: avisa o envio das coordenadas e só consulta no clique', async () => {
    const resolve = vi.fn(async () => 'Rua do Pátio, 10, Centro, Juazeiro do Norte, CE');
    const { element } = popupContent({ ...POINT, address: { known: () => null, resolve } });
    expect(element.textContent).toContain(ADDRESS_NOTICE);
    expect(resolve).not.toHaveBeenCalled();
    fireEvent.click(within(element).getByRole('button', { name: 'Mostrar endereço' }));
    expect(within(element).getByRole('status')).toHaveTextContent('Buscando o endereço…');
    await waitFor(() => expect(within(element).getByRole('status')).toHaveTextContent('Endereço aproximado: Rua do Pátio, 10'));
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(within(element).queryByRole('button')).toBeNull();
    expect(element.textContent).not.toContain(ADDRESS_NOTICE);
  });

  it('endereço não encontrado ou falha: diz que não localizou, sem quebrar o balão', async () => {
    for (const resolve of [vi.fn(async () => null), vi.fn(async () => { throw new Error('rede'); })]) {
      const { element } = popupContent({ ...POINT, address: { known: () => null, resolve } });
      fireEvent.click(within(element).getByRole('button', { name: 'Mostrar endereço' }));
      await waitFor(() => expect(within(element).getByRole('status')).toHaveTextContent('Não foi possível localizar o endereço desta posição.'));
    }
  });

  it('ao reabrir, mostra o endereço consultado em outro lugar da página (Descobrir endereço)', () => {
    let known: string | null = null;
    const { element, refresh } = popupContent({ ...POINT, address: { known: () => known, resolve: vi.fn() } });
    expect(within(element).getByRole('button', { name: 'Mostrar endereço' })).toBeTruthy();
    known = 'Rua do Pátio, 10';
    refresh();
    expect(within(element).getByRole('status')).toHaveTextContent('Endereço aproximado: Rua do Pátio, 10');
    expect(within(element).queryByRole('button')).toBeNull();
  });

  it('o nome vem como texto, nunca como HTML', () => {
    const { element } = popupContent({ ...POINT, label: '<img src=x onerror=alert(1)>' });
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
