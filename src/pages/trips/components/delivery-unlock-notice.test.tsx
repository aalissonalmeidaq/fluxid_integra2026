import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeliveryUnlockNotice } from './delivery-unlock-notice';

// Spec 012 (T079; RF-024; História 3, cenários 4 e 5): depois da entrega, explica por que o destravamento não foi automático e leva ao
// destravamento excepcional, que pede justificativa e o segundo fator no bloco "Lacre" do cilindro.
describe('DeliveryUnlockNotice', () => {
  it.each([
    ['outside_geofence', /fora da geocerca da unidade/],
    ['no_proof', /nenhuma posição comprovou/],
    ['no_geofence', /não tem geocerca ativa/],
  ] as const)('motivo %s', (note, text) => {
    render(<DeliveryUnlockNotice note={note} cylinderId="c1" />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Destravar pelo cilindro (excepcional)' })).toHaveAttribute('href', '/cilindros/c1');
    expect(screen.getByText(/verificação em duas etapas/)).toBeInTheDocument();
  });
});
