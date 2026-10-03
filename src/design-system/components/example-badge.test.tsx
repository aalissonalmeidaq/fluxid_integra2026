import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExampleBadge } from './example-badge';

// RF-016, RA-002: a marca "Exemplo" é sempre texto visível, nunca só cor ou ícone.
describe('ExampleBadge', () => {
  it('mostra o texto "Exemplo"', () => {
    render(<ExampleBadge />);
    expect(screen.getByText('Exemplo')).toBeVisible();
  });
});
