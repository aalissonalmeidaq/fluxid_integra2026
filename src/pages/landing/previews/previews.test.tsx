import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PREVIAS } from '../landing-content';
import { PreviaDeFila } from './previa-de-fila';

// Spec 011, T025 (RF-013): a prévia ilustrada da fila é uma figura com dados fictícios, marcada "Exemplo", com descrição textual equivalente e
// alimentada pela fonte substituível (landing-content.ts). As telas de viagem e de campo são capturas reais (veja tela-do-sistema.test.tsx).
describe('Prévia da fila de envio', () => {
  it('é uma figura com o selo "Exemplo" visível como texto', () => {
    const { container } = render(<PreviaDeFila />);
    expect(container.querySelector('figure')).not.toBeNull();
    expect(screen.getByText('Exemplo')).toBeInTheDocument();
  });

  it('a ilustração é uma imagem com descrição textual equivalente, e a legenda traz o título', () => {
    render(<PreviaDeFila />);
    expect(screen.getByRole('img', { name: PREVIAS.fila.descricao })).toBeInTheDocument();
    expect(screen.getByText(PREVIAS.fila.titulo)).toBeInTheDocument();
  });

  it('mostra o estado de cada operação em texto, não só em cor', () => {
    const { container } = render(<PreviaDeFila />);
    for (const item of PREVIAS.fila.itens) {
      expect(container).toHaveTextContent(item.texto);
      expect(screen.getAllByText(item.estado).length).toBeGreaterThan(0);
    }
  });

  it('nenhum dado lembra cliente real (sem "Ltda", CNPJ, e-mail ou telefone)', () => {
    expect(JSON.stringify(PREVIAS)).not.toMatch(/ltda|s\.a\.|cnpj|@|\(\d{2}\)\s?\d{4,5}-?\d{4}/i);
  });

  it('os códigos fictícios usam o prefixo EX-', () => {
    for (const item of PREVIAS.fila.itens) {
      const codigo = /EX-\d+/.exec(item.texto)?.[0];
      if (codigo) expect(codigo).toMatch(/^EX-\d{6}$/);
    }
  });
});
