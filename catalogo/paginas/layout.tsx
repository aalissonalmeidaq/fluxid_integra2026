import React from 'react';
import { Card, DataTable, type ColunaDaTabela } from '@/design-system';
import { ALVO_MINIMO, containers, espacamento, grade, pontosDeQuebra, raios } from '@/design-system/tokens';

interface FaixaDaGrade {
  faixa: string;
  larguras: string;
  colunas: number;
  margem: number;
  calha: number;
}

const FAIXAS: FaixaDaGrade[] = [
  { faixa: 'Desktop', larguras: `${pontosDeQuebra.desktop} px ou mais`, ...grade.desktop },
  { faixa: 'Tablet', larguras: `${pontosDeQuebra.tablet} a ${pontosDeQuebra.desktop - 1} px`, ...grade.tablet },
  { faixa: 'Mobile', larguras: `até ${pontosDeQuebra.tablet - 1} px`, ...grade.mobile },
];

const COLUNAS: ColunaDaTabela<FaixaDaGrade>[] = [
  { id: 'faixa', cabecalho: 'Faixa', cabecalhoDaLinha: true, celula: (linha) => linha.faixa },
  { id: 'larguras', cabecalho: 'Largura da tela', celula: (linha) => linha.larguras },
  { id: 'colunas', cabecalho: 'Colunas', celula: (linha) => linha.colunas },
  { id: 'margem', cabecalho: 'Margem', celula: (linha) => `${linha.margem} px` },
  { id: 'calha', cabecalho: 'Calha', celula: (linha) => `${linha.calha} px` },
];

export function PaginaLayout(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h2 font-extrabold text-navy tablet:text-h1">Layout</h1>
        <p className="max-w-padrao text-corpo text-grafite">
          Nenhuma tela usa medida fora da escala. Os alvos de toque têm {ALVO_MINIMO} px no mínimo.
        </p>
      </header>

      <section aria-labelledby="espacamento" className="flex flex-col gap-4">
        <h2 id="espacamento" className="text-h3 font-semibold text-navy">
          Espaçamento
        </h2>
        <ul role="list" className="flex flex-col gap-2">
          {Object.entries(espacamento)
            .filter(([, valor]) => valor > 0)
            .map(([nome, valor]) => (
              <li key={nome} className="flex items-center gap-4 text-corpo text-grafite">
                <span className="w-16 shrink-0 font-semibold text-navy">{valor} px</span>
                <span aria-hidden="true" className="h-4 rounded-controle bg-azul-royal" style={{ width: valor }} />
                <span className="text-legenda text-texto-secundario">p-{nome}</span>
              </li>
            ))}
        </ul>
      </section>

      <section aria-labelledby="grade" className="flex flex-col gap-4">
        <h2 id="grade" className="text-h3 font-semibold text-navy">
          Grade
        </h2>
        <DataTable legenda="Grade por faixa de largura" colunas={COLUNAS} linhas={FAIXAS} chaveDaLinha={(linha) => linha.faixa} />
      </section>

      <section aria-labelledby="containers" className="flex flex-col gap-4">
        <h2 id="containers" className="text-h3 font-semibold text-navy">
          Containers
        </h2>
        <ul role="list" className="flex flex-col gap-2">
          {Object.entries(containers).map(([nome, largura]) => (
            <li key={nome} className="flex flex-col gap-1">
              <p className="text-corpo text-grafite">
                <span className="font-semibold text-navy">{nome}</span>: {largura} px
              </p>
              <div aria-hidden="true" className="h-4 max-w-full rounded-controle bg-info-fundo" style={{ width: largura }} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="raios" className="flex flex-col gap-4">
        <h2 id="raios" className="text-h3 font-semibold text-navy">
          Raios e sombras
        </h2>
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
          <div className="rounded-controle border border-borda-controle bg-branco p-4 text-corpo text-grafite">Controle: raio de {raios.controle} px</div>
          <Card>Cartão: raio de {raios.card} px, padding de 24 px, borda de 1 px e sombra suave</Card>
          <div className="rounded-card bg-branco p-6 text-corpo text-grafite shadow-dialogo">Diálogo: sombra de diálogo</div>
        </div>
      </section>
    </div>
  );
}
