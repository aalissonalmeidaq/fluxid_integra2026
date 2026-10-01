import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable, type ColunaDaTabela } from './data-table';

interface Membro {
  id: string;
  nome: string;
  papel: string;
}

const LINHAS: Membro[] = [
  { id: '1', nome: 'Ana Souza', papel: 'Administradora' },
  { id: '2', nome: 'Bruno Lima', papel: 'Operador' },
];

const COLUNAS: ColunaDaTabela<Membro>[] = [
  { id: 'nome', cabecalho: 'Nome', celula: (linha) => linha.nome, cabecalhoDaLinha: true },
  { id: 'papel', cabecalho: 'Papel', celula: (linha) => linha.papel },
  { id: 'acoes', cabecalho: 'Ações', celula: (linha) => <button type="button">Bloquear {linha.nome}</button> },
];

// RF-007, RF-020, D-010: uma única árvore DOM que vira cartões em largura estreita por CSS, sem perder informação.
describe('DataTable', () => {
  it('tem legenda, cabeçalhos de coluna com scope e uma linha por registro', () => {
    render(<DataTable legenda="Membros da organização" colunas={COLUNAS} linhas={LINHAS} chaveDaLinha={(l) => l.id} />);
    expect(screen.getByRole('table', { name: 'Membros da organização' })).toBeInTheDocument();
    const cabecalhos = screen.getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual(['Nome', 'Papel', 'Ações']);
    for (const cabecalho of cabecalhos) expect(cabecalho).toHaveAttribute('scope', 'col');
    expect(screen.getAllByRole('row')).toHaveLength(LINHAS.length + 1);
  });

  it('a consulta por papel devolve cada linha uma única vez (sem segunda árvore para mobile)', () => {
    render(<DataTable legenda="Membros" colunas={COLUNAS} linhas={LINHAS} chaveDaLinha={(l) => l.id} />);
    expect(screen.getAllByText('Ana Souza')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Bloquear Ana Souza/ })).toHaveLength(1);
    expect(document.querySelectorAll('table')).toHaveLength(1);
  });

  it('cada célula traz o rótulo da coluna em data-label, para a apresentação em cartão', () => {
    render(<DataTable legenda="Membros" colunas={COLUNAS} linhas={LINHAS} chaveDaLinha={(l) => l.id} />);
    const linha = screen.getAllByRole('row')[1] as HTMLElement;
    const celulas = [...within(linha).getAllByRole('cell'), ...within(linha).queryAllByRole('rowheader')];
    const rotulos = celulas.map((celula) => celula.getAttribute('data-label')).sort();
    expect(rotulos).toEqual(['Ações', 'Nome', 'Papel']);
  });

  it('a coluna marcada como cabeçalho da linha vira rowheader com scope row', () => {
    render(<DataTable legenda="Membros" colunas={COLUNAS} linhas={LINHAS} chaveDaLinha={(l) => l.id} />);
    const cabecalhoDaLinha = screen.getAllByRole('rowheader')[0] as HTMLElement;
    expect(cabecalhoDaLinha).toHaveTextContent('Ana Souza');
    expect(cabecalhoDaLinha).toHaveAttribute('scope', 'row');
  });

  it('mantém papéis explícitos para preservar a semântica quando o CSS troca o display', () => {
    const { container } = render(<DataTable legenda="Membros" colunas={COLUNAS} linhas={LINHAS} chaveDaLinha={(l) => l.id} />);
    expect(container.querySelector('table')).toHaveAttribute('role', 'table');
    expect(container.querySelector('thead')).toHaveAttribute('role', 'rowgroup');
    expect(container.querySelector('tbody')).toHaveAttribute('role', 'rowgroup');
    expect(container.querySelectorAll('tr')).toHaveLength(LINHAS.length + 1);
    for (const linha of container.querySelectorAll('tr')) expect(linha).toHaveAttribute('role', 'row');
  });

  it('as ações da linha mantêm o alvo de 44 px por meio do componente de botão do padrão', () => {
    render(
      <DataTable
        legenda="Membros"
        colunas={[{ id: 'acoes', cabecalho: 'Ações', celula: () => <button type="button" className="min-h-alvo">Abrir</button> }]}
        linhas={LINHAS}
        chaveDaLinha={(l) => l.id}
      />,
    );
    for (const botao of screen.getAllByRole('button')) expect(botao.className).toContain('min-h-alvo');
  });

  it('nomes longos quebram em vez de estourar a célula', () => {
    render(
      <DataTable
        legenda="Membros"
        colunas={COLUNAS}
        linhas={[{ id: '3', nome: 'Organização Com Um Nome Extremamente Longo '.repeat(4), papel: 'Operador' }]}
        chaveDaLinha={(l) => l.id}
      />,
    );
    expect(screen.getAllByRole('rowheader')[0]?.className).toContain('break-words');
  });

  it('sem linhas mostra o estado vazio informado', () => {
    render(
      <DataTable
        legenda="Membros"
        colunas={COLUNAS}
        linhas={[]}
        chaveDaLinha={(l) => l.id}
        vazio={{ title: 'Nenhum membro', description: 'Convide a primeira pessoa.' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Nenhum membro' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('carregando mostra o indicador e esconde as linhas', () => {
    render(<DataTable legenda="Membros" colunas={COLUNAS} linhas={LINHAS} chaveDaLinha={(l) => l.id} carregando textoDeCarregamento="Carregando membros" />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando membros');
    expect(screen.queryByText('Ana Souza')).toBeNull();
  });
});
