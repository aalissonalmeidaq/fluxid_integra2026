import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TELAS } from '../landing-content';
import { TelaDoSistema } from './tela-do-sistema';

// Spec 011 (pedido de 14/10/2026): telas reais do sistema no lugar de ilustrações. Cada tela é uma imagem local descrita em texto, com o selo
// "Exemplo" visível, dimensões fixas (sem deslocar o layout) e carregamento sob demanda.
describe.each(TELAS)('Tela $id', (tela) => {
  it('é uma figura com a imagem local descrita e a legenda', () => {
    const { container } = render(<TelaDoSistema tela={tela} />);
    expect(container.querySelector('figure')).not.toBeNull();
    const imagem = screen.getByRole('img', { name: tela.alt });
    expect(imagem.tagName).toBe('IMG');
    expect(imagem).toHaveAttribute('src', tela.arquivo);
    expect(screen.getByText(tela.titulo)).toBeInTheDocument();
  });

  it('tem dimensões fixas e carrega sob demanda, sem prioridade', () => {
    render(<TelaDoSistema tela={tela} />);
    const imagem = screen.getByRole('img', { name: tela.alt });
    expect(imagem).toHaveAttribute('width', String(tela.largura));
    expect(imagem).toHaveAttribute('height', String(tela.altura));
    expect(imagem).toHaveAttribute('loading', 'lazy');
    expect(imagem).toHaveAttribute('decoding', 'async');
    expect(imagem).not.toHaveAttribute('fetchpriority', 'high');
  });

  it('marca a tela como "Exemplo" em texto', () => {
    render(<TelaDoSistema tela={tela} />);
    expect(screen.getByText('Exemplo')).toBeInTheDocument();
  });

  it('identifica o tipo de aparelho para o estilo (computador ou celular)', () => {
    const { container } = render(<TelaDoSistema tela={tela} />);
    expect(container.querySelector('figure')).toHaveAttribute('data-dispositivo', tela.dispositivo);
    // A moldura é a do aparelho: notebook com barra do navegador ou celular com entalhe (decorativa, fora da leitura de tela).
    const moldura = container.querySelector(`[data-moldura="${tela.dispositivo === 'celular' ? 'celular' : 'notebook'}"]`);
    expect(moldura).not.toBeNull();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('se a imagem falhar, mostra a legenda e a descrição em texto, sem quebrar o layout', () => {
    const { container } = render(<TelaDoSistema tela={tela} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(tela.titulo)).toBeInTheDocument();
    expect(container).toHaveTextContent(tela.alt);
  });
});

it('mostra o domínio oficial do FluxID na barra do navegador do notebook', () => {
  const computador = TELAS.find((tela) => tela.dispositivo === 'computador')!;
  render(<TelaDoSistema tela={computador} />);
  expect(screen.getByText('fluxid.tec.br/viagens')).toBeInTheDocument();
});
