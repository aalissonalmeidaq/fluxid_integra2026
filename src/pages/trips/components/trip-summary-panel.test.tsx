import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { summarizeTripPlan } from '@/domain/trips/trip-summary';
import { TripSummaryPanel } from './trip-summary-panel';

describe('resumo da viagem', () => {
  it('mostra paradas, cilindros com a capacidade e quanto ainda cabe', () => {
    render(<TripSummaryPanel summary={summarizeTripPlan([{ siteId: 's', cylinderIds: ['a', 'b'] }], 5)} vehicleCapacity={5} warnings={[]} />);
    expect(screen.getByText('2 de 5')).toBeInTheDocument();
    expect(screen.getByText('Ainda cabem 3 no veículo.')).toBeInTheDocument();
    expect(screen.queryByLabelText('O que falta para salvar')).not.toBeInTheDocument();
  });

  it('sem veículo pede que se escolha um', () => {
    render(<TripSummaryPanel summary={summarizeTripPlan([{ siteId: 's', cylinderIds: ['a'] }], null)} vehicleCapacity={null} warnings={[]} />);
    expect(screen.getByText('Escolha o veículo para ver a capacidade.')).toBeInTheDocument();
  });

  it('acima da capacidade mostra quanto passa e o impedimento em texto', () => {
    render(<TripSummaryPanel summary={summarizeTripPlan([{ siteId: 's', cylinderIds: ['a', 'b', 'c'] }], 2)} vehicleCapacity={2} warnings={[]} />);
    expect(screen.getByText('Passa 1 da capacidade do veículo.')).toBeInTheDocument();
    expect(screen.getByLabelText('O que falta para salvar')).toHaveTextContent('O veículo comporta 2 cilindros e a viagem tem 3.');
  });

  it('lista os avisos de CNH e licenciamento', () => {
    render(<TripSummaryPanel summary={summarizeTripPlan([{ siteId: 's', cylinderIds: ['a'] }], 5)} vehicleCapacity={5} warnings={['A CNH do motorista está vencida.', 'O licenciamento do veículo vence em breve.']} />);
    expect(screen.getByLabelText('Avisos')).toHaveTextContent('A CNH do motorista está vencida.');
    expect(screen.getByLabelText('Avisos')).toHaveTextContent('licenciamento');
  });

  it('não é região viva: o anúncio da tela é um só', () => {
    render(<TripSummaryPanel summary={summarizeTripPlan([], null)} vehicleCapacity={null} warnings={['x']} />);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });
});
