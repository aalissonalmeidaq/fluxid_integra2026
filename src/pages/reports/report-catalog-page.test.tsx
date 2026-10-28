import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportCatalogScreen } from './report-catalog-page';

// Spec 015 (US5; RF-024, RF-037): a lista mostra só os relatórios que a pessoa pode ler; ver a tela não concede exportação.
describe('catálogo de relatórios', () => {
  it('mostra só os tipos com a permissão de leitura, com descrição e link', () => {
    render(<ReportCatalogScreen permissions={['tracking.read', 'report.export']} />);
    const list = screen.getByRole('list', { name: 'Relatórios disponíveis' });
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(['Disponibilidade de telemetria', 'Ocorrências de proximidade']);
    expect(within(list).getByRole('link', { name: 'Ocorrências de proximidade' })).toHaveAttribute('href', '/relatorios/proximity');
    expect(screen.getByText('Você pode exportar em CSV os relatórios que consulta.')).toBeInTheDocument();
  });

  it('sem exportação, avisa que só consulta', () => {
    render(<ReportCatalogScreen permissions={['trip.read']} />);
    expect(screen.getByText('Sua conta consulta, mas não exporta relatórios.')).toBeInTheDocument();
  });

  it('sem nenhuma leitura: estado vazio', () => {
    render(<ReportCatalogScreen permissions={['report.export']} />);
    expect(screen.getByText('Nenhum relatório disponível')).toBeInTheDocument();
  });
});
