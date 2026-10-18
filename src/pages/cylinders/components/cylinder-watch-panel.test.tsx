import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CylinderWatchPanel } from './cylinder-watch-panel';

// Spec 012 (T086; RF-020, RF-022, RF-030; História 4): vigilância da geocerca do cliente e violação no bloco "Lacre" do cilindro, em texto
// e ícone; o retorno à área não destrava nem encerra o alerta.
const NOW = new Date('2026-10-17T14:10:00Z');
const WATCH = { siteId: 's1', siteName: 'Unidade Alfa', startedAt: '2026-10-17T10:00:00Z', suspended: false };

describe('CylinderWatchPanel', () => {
  it('vigilância ativa com a unidade e desde quando', () => {
    render(<CylinderWatchPanel watch={WATCH} violation={null} now={() => NOW} />);
    expect(screen.getByText(/Sob vigilância da geocerca de Unidade Alfa/)).toBeInTheDocument();
    expect(screen.getByText(/desde há 4 horas/)).toBeInTheDocument();
  });

  it('violação aberta com a distância', () => {
    render(<CylinderWatchPanel watch={WATCH} violation={{ id: 'v1', status: 'open', firstOutsideAt: '2026-10-17T14:05:00Z', distanceM: 182.4, returnedAt: null }} now={() => NOW} />);
    expect(screen.getByText('Violação de geocerca')).toBeInTheDocument();
    expect(screen.getByText(/182 m fora da geocerca, há 5 minutos/)).toBeInTheDocument();
  });

  it('retornou à área: o lacre continua travado até alguém destravar', () => {
    render(<CylinderWatchPanel watch={WATCH} violation={{ id: 'v1', status: 'returned', firstOutsideAt: '2026-10-17T14:05:00Z', distanceM: 60, returnedAt: '2026-10-17T14:08:00Z' }} now={() => NOW} />);
    expect(screen.getByText(/Retornou à área há 2 minutos/)).toBeInTheDocument();
    expect(screen.getByText(/não destrava sozinho/)).toBeInTheDocument();
  });

  it('vigilância suspensa: unidade sem geocerca ativa', () => {
    render(<CylinderWatchPanel watch={{ ...WATCH, suspended: true }} violation={null} now={() => NOW} />);
    expect(screen.getByText(/Vigilância suspensa: a unidade ficou sem geocerca ativa/)).toBeInTheDocument();
  });

  it('sem vigilância, não mostra nada', () => {
    const { container } = render(<CylinderWatchPanel watch={null} violation={null} now={() => NOW} />);
    expect(container).toBeEmptyDOMElement();
  });
});
