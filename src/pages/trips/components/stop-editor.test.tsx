import { fireEvent, render, screen, within } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fakeTripService, options, ORG, SITE_1 } from '../trip-test-support';
import { StopEditor } from './stop-editor';
import { newStopKey, type StopDraft } from './stop-draft';

function Harness({ initial, onAnnounce = vi.fn(), remaining = 2, errors = {} }: { initial: StopDraft[]; onAnnounce?: (message: string) => void; remaining?: number | null; errors?: Record<string, string> }): React.JSX.Element {
  const [stops, setStops] = useState(initial);
  return (
    <>
      <output data-testid="state">{JSON.stringify(stops.map((stop) => [stop.siteId, stop.cylinders.map((cylinder) => cylinder.serialNumber)]))}</output>
      <StopEditor stops={stops} sites={options().sites} onChange={setStops} service={fakeTripService()} organizationId={ORG} remaining={remaining} errors={errors} onAnnounce={onAnnounce} />
    </>
  );
}
const stop = (siteId: string, ...serials: string[]): StopDraft => ({ key: newStopKey(), siteId, cylinders: serials.map((serial, index) => ({ id: `id-${serial}-${index}`, serialNumber: serial, gas: 'Oxigênio' })) });
const state = (): unknown => JSON.parse(screen.getByTestId('state').textContent ?? '[]');

describe('editor de paradas', () => {
  it('acrescenta uma parada e anuncia', () => {
    const onAnnounce = vi.fn();
    render(<Harness initial={[]} onAnnounce={onAnnounce} />);
    expect(screen.getByText(/Nenhuma parada ainda/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar parada' }));
    expect(screen.getByRole('heading', { name: 'Parada 1' })).toBeInTheDocument();
    expect(onAnnounce).toHaveBeenCalledWith('Parada 1 acrescentada.');
  });

  it('reordena com botões de subir e descer, sem depender de arrastar', () => {
    const onAnnounce = vi.fn();
    render(<Harness initial={[stop(SITE_1, 'CIL-001'), stop('92000000-0000-4000-8000-000000000002', 'CIL-002')]} onAnnounce={onAnnounce} />);
    expect(screen.getByRole('button', { name: 'Subir a parada 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer a parada 2' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Subir a parada 2' }));
    expect(state()).toEqual([['92000000-0000-4000-8000-000000000002', ['CIL-002']], [SITE_1, ['CIL-001']]]);
    expect(onAnnounce).toHaveBeenCalledWith('Parada movida para a posição 1.');
  });

  it('remove uma parada, anuncia e devolve o foco ao botão de acrescentar', () => {
    const onAnnounce = vi.fn();
    render(<Harness initial={[stop(SITE_1, 'CIL-001')]} onAnnounce={onAnnounce} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover a parada 1' }));
    expect(state()).toEqual([]);
    expect(onAnnounce).toHaveBeenCalledWith('Parada 1 removida.');
    expect(screen.getByRole('button', { name: 'Adicionar parada' })).toHaveFocus();
  });

  it('escolhe a unidade agrupada por cliente', () => {
    render(<Harness initial={[stop('')]} />);
    const select = screen.getByLabelText('Unidade da parada 1');
    expect(within(select).getByRole('group', { name: 'Alfa Saúde' })).toBeInTheDocument();
    expect(within(select).getByRole('group', { name: 'Beta Clínica' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: SITE_1 } });
    expect(state()).toEqual([[SITE_1, []]]);
  });

  it('tira um cilindro da parada e anuncia', () => {
    const onAnnounce = vi.fn();
    render(<Harness initial={[stop(SITE_1, 'CIL-001', 'CIL-002')]} onAnnounce={onAnnounce} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tirar CIL-001 da parada 1' }));
    expect(state()).toEqual([[SITE_1, ['CIL-002']]]);
    expect(onAnnounce).toHaveBeenCalledWith('Cilindro CIL-001 retirado da parada 1.');
  });

  it('abre a busca de cilindros da parada e adiciona um resultado', async () => {
    render(<Harness initial={[stop(SITE_1)]} />);
    const open = screen.getByRole('button', { name: 'Adicionar cilindros à parada 1' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(open);
    expect(screen.getByRole('button', { name: 'Fechar a busca de cilindros da parada 1' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar CIL-001' }));
    expect(state()).toEqual([[SITE_1, ['CIL-001']]]);
  });

  it('mostra os erros junto da parada e do campo', () => {
    render(<Harness initial={[stop('')]} errors={{ 'stops.0.siteId': 'Escolha a unidade da parada.', 'stops.0.cylinders': 'A parada 1 precisa de pelo menos um cilindro.', stops: 'Inclua pelo menos uma parada.' }} />);
    expect(screen.getByText('Escolha a unidade da parada.')).toBeInTheDocument();
    expect(screen.getByText('A parada 1 precisa de pelo menos um cilindro.')).toBeInTheDocument();
    expect(screen.getByText('Inclua pelo menos uma parada.')).toBeInTheDocument();
  });

  it('no máximo 30 paradas', () => {
    render(<Harness initial={Array.from({ length: 30 }, () => stop(SITE_1, 'CIL-001'))} />);
    expect(screen.getByRole('button', { name: 'Adicionar parada' })).toBeDisabled();
    expect(screen.getByText('Uma viagem tem no máximo 30 paradas.')).toBeInTheDocument();
  });
});
