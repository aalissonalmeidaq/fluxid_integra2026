import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryOutcome } from '@/application/registry/registry-service';
import { PointTester } from './point-tester';

const setup = (outcome: RegistryOutcome<boolean>) => {
  const test = vi.fn(async () => outcome);
  render(<PointTester test={test} />);
  return test;
};
const fill = (lat: string, lng: string): void => {
  fireEvent.change(screen.getByLabelText('Latitude do ponto'), { target: { value: lat } });
  fireEvent.change(screen.getByLabelText('Longitude do ponto'), { target: { value: lng } });
  fireEvent.click(screen.getByRole('button', { name: 'Testar ponto' }));
};

describe('PointTester', () => {
  it('mostra "dentro" em texto e envia números com vírgula normalizada', async () => {
    const test = setup({ kind: 'success', value: true });
    fill('-23,55', '-46,633');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('O ponto está dentro da geocerca.'));
    expect(test).toHaveBeenCalledWith(-23.55, -46.633);
  });

  it('mostra "fora" em texto', async () => {
    setup({ kind: 'success', value: false });
    fill('0', '0');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('O ponto está fora da geocerca.'));
  });

  it('coordenadas inválidas mostram erro junto dos campos e não consultam', () => {
    const test = setup({ kind: 'success', value: true });
    fill('91', 'abc');
    expect(screen.getByText('Informe a latitude, de -90 a 90.')).toBeInTheDocument();
    expect(screen.getByText('Informe a longitude, de -180 a 180.')).toBeInTheDocument();
    expect(test).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'offline' } as const, /Sem conexão/],
    [{ kind: 'inactive_record' } as const, /inativa/],
    [{ kind: 'unavailable' } as const, /Não foi possível testar/],
  ])('falha %j vira mensagem em texto', async (outcome, texto) => {
    setup(outcome);
    fill('1', '1');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(texto));
  });
});
