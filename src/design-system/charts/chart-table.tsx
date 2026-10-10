import React from 'react';

export interface ChartTableProps {
  caption: string;
  // Título da coluna de rótulos (primeira coluna).
  rowHeader: string;
  columns: readonly string[];
  rows: readonly { header: string; cells: readonly string[] }[];
}

// Tabela equivalente do gráfico, com os mesmos dados do desenho: a alternativa textual (RF-018, RA-003). Rola dentro do
// próprio bloco quando não cabe, sem criar rolagem horizontal na página; por isso o grupo recebe o foco do teclado.
export function ChartTable({ caption, rowHeader, columns, rows }: ChartTableProps): React.JSX.Element {
  return (
    <details className="text-corpo text-grafite">
      <summary className="min-h-alvo cursor-pointer py-2 font-semibold text-azul-profundo">Ver os dados do gráfico em tabela</summary>
    <div role="group" aria-label={`Tabela: ${caption}`} tabIndex={0} className="max-w-full overflow-x-auto">
      <table className="w-full border-collapse text-legenda text-grafite">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="border-b border-borda-controle px-2 py-1 text-left font-semibold">{rowHeader}</th>
            {columns.map((coluna) => (
              <th key={coluna} scope="col" className="border-b border-borda-controle px-2 py-1 text-right font-semibold">{coluna}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((linha) => (
            <tr key={linha.header}>
              <th scope="row" className="border-b border-borda-suave px-2 py-1 text-left font-normal">{linha.header}</th>
              {linha.cells.map((celula, indice) => (
                <td key={`${linha.header}-${indice}`} className="border-b border-borda-suave px-2 py-1 text-right">{celula}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </details>
  );
}
