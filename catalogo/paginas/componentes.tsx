import React from 'react';
import { Card } from '@/design-system';
import { documentacao as documentacaoDosComponentes, documentacaoDoShell, documentacaoDosGraficos } from '@/design-system/docs';
import { EXEMPLOS } from './exemplos';

const documentacao = [...documentacaoDosComponentes, ...documentacaoDoShell, ...documentacaoDosGraficos];

const Lista = ({ titulo, itens }: { titulo: string; itens: readonly string[] }): React.JSX.Element => (
  <div className="flex flex-col gap-1">
    <h4 className="text-corpo font-semibold text-navy">{titulo}</h4>
    <ul className="flex list-disc flex-col gap-1 pl-6 text-corpo text-grafite">
      {itens.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </div>
);

export function PaginaComponentes(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h2 font-extrabold text-navy tablet:text-h1">Componentes</h1>
        <p className="max-w-padrao text-corpo text-grafite">
          Cada componente aparece com descrição, variantes, estados, orientação de uso e requisitos de acessibilidade, e com
          exemplos vivos. Toda tela usa só estes componentes.
        </p>
        <nav aria-label="Componentes">
          <ul role="list" className="flex flex-wrap gap-x-4">
            {documentacao.map((item) => (
              <li key={item.nome}>
                <a href={`#${item.nome}`} className="inline-flex min-h-alvo items-center text-corpo text-azul-profundo">
                  {item.nome}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {documentacao.map((item) => (
        <Card key={item.nome} as="section" aria-labelledby={`titulo-${item.nome}`} id={item.nome} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 id={`titulo-${item.nome}`} className="text-h3 font-semibold text-navy">
              {item.nome}
            </h2>
            <p className="max-w-padrao text-corpo text-grafite">{item.descricao}</p>
          </div>

          <div className="flex flex-col gap-4 rounded-card border border-borda-suave bg-cinza-gelo p-4">
            <h3 className="text-corpo font-semibold text-navy">Exemplos</h3>
            {EXEMPLOS[item.nome] ?? <p className="text-corpo text-grafite">Sem exemplo visual.</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
            <Lista titulo="Variantes" itens={item.variantes} />
            <Lista titulo="Estados" itens={item.estados} />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-corpo font-semibold text-navy">Orientação de uso</h3>
            <p className="max-w-padrao text-corpo text-grafite">{item.orientacaoDeUso}</p>
          </div>
          <Lista titulo="Acessibilidade" itens={item.acessibilidade} />
        </Card>
      ))}
    </div>
  );
}
