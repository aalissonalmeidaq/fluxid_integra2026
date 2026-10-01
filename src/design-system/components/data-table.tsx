import React from 'react';
import { EmptyState, type EmptyStateProps } from './empty-state';
import { Loading } from './loading';
import './data-table.css';

export interface ColunaDaTabela<T> {
  id: string;
  cabecalho: string;
  celula: (linha: T) => React.ReactNode;
  // Marca a coluna que identifica a linha (por exemplo, o nome): vira rowheader com scope="row".
  cabecalhoDaLinha?: boolean;
}

export interface DataTableProps<T> {
  legenda: string;
  colunas: readonly ColunaDaTabela<T>[];
  linhas: readonly T[];
  chaveDaLinha: (linha: T) => string;
  vazio?: Pick<EmptyStateProps, 'title' | 'description' | 'action'>;
  carregando?: boolean;
  textoDeCarregamento?: string;
}

// Tabela de dados que se adapta a cartões abaixo de 768 px por CSS, na mesma árvore DOM (RF-007, RF-020, D-010).
// Papéis explícitos preservam a semântica de tabela quando o CSS troca o display dos elementos.
export function DataTable<T>({ legenda, colunas, linhas, chaveDaLinha, vazio, carregando = false, textoDeCarregamento = 'Carregando…' }: DataTableProps<T>): React.JSX.Element {
  if (carregando) return <Loading label={textoDeCarregamento} />;
  if (linhas.length === 0 && vazio) return <EmptyState {...vazio} />;

  return (
    <table role="table" className="tabela-de-dados w-full border-collapse text-left text-corpo text-grafite">
      <caption className="sr-only">{legenda}</caption>
      <thead role="rowgroup">
        <tr role="row" className="border-b border-borda-suave">
          {colunas.map((coluna) => (
            <th key={coluna.id} role="columnheader" scope="col" className="px-2 py-2 text-legenda font-semibold text-texto-secundario">
              {coluna.cabecalho}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {linhas.map((linha) => (
          <tr key={chaveDaLinha(linha)} role="row" className="border-b border-borda-suave">
            {colunas.map((coluna) =>
              coluna.cabecalhoDaLinha ? (
                <th key={coluna.id} role="rowheader" scope="row" data-label={coluna.cabecalho} className="min-w-0 break-words px-2 py-2 font-semibold text-navy">
                  {coluna.celula(linha)}
                </th>
              ) : (
                <td key={coluna.id} role="cell" data-label={coluna.cabecalho} className="min-w-0 break-words px-2 py-2">
                  {coluna.celula(linha)}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
