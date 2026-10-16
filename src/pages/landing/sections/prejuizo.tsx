import React from 'react';
import { Icon } from '@/design-system';
import { PREJUIZO, TEXTOS } from '../landing-content';
import { calcularPrejuizo, formatarInteiro, formatarReais } from '../prejuizo';
import { Contador } from './contador';
import { Secao } from './secao';

// O tamanho do prejuízo (Spec 011, adaptação ao pitch, 1:00 a 2:00). Os totais são calculados da fonte (PREJUIZO): patrimônio médio, perda
// por mês e por ano. A perda fica em vermelho (pedido de 14/10/2026): os cilindros perdidos em vermelho sobre vermelho-claro e o prejuízo
// anual, o pico da história e o maior número da página, em cartão vermelho com texto branco (pares da tabela oficial). A fonte dos números
// fica logo abaixo da introdução, em selo institucional. As barras comparam o patrimônio de cada capacidade em tom neutro e o bloco
// ao lado contextualiza os custos indiretos não contabilizados.
export function Prejuizo(): React.JSX.Element {
  const { prejuizo: textos } = TEXTOS;
  const calculo = calcularPrejuizo(PREJUIZO.custos, PREJUIZO.perdidosNoAno);
  const maior = Math.max(...PREJUIZO.custos.map((custo) => custo.valor));

  return (
    <Secao id="prejuizo" titulo={textos.titulo} introducao={textos.introducao}>
      {/* Selo com a fonte dos dados */}
      <p className="m-0 flex items-center" data-revelar data-fonte>
        <span className="inline-flex items-center gap-2 rounded-full border border-branco/15 bg-branco/10 px-4 py-1 text-legenda font-medium text-cinza-gelo shadow-card backdrop-blur-xs">
          <Icon name="relatorios" size={16} variant="negativa" />
          <span>
            <strong className="font-bold text-branco">{textos.rotuloFonte}:</strong> {PREJUIZO.fonte}
          </span>
        </span>
      </p>

      {/* Cartões de métricas principais */}
      <div className="grid gap-6 tablet:grid-cols-2 desktop:grid-cols-5">
        <div
          className="flex flex-col justify-between gap-4 rounded-card border-2 border-erro bg-erro-fundo p-6 text-erro shadow-card transition-all duration-200 hover:shadow-dialogo desktop:col-span-2"
          data-revelar
          data-perda
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-erro/30 bg-branco/80 px-4 py-1 text-legenda font-bold uppercase tracking-wider text-erro shadow-card">
                <span className="inline-block size-2 rounded-full bg-erro motion-safe:animate-pulse" aria-hidden="true" />
                Volume Crítico
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <Contador
                valor={PREJUIZO.perdidosNoAno}
                formatar={formatarInteiro}
                tabular={false}
                className="text-display font-extrabold leading-none tracking-tight text-erro"
              />
              <span className="text-h3 font-bold text-erro">
                {textos.rotuloPerdidos} em {PREJUIZO.ano}
              </span>
            </div>
          </div>

          <div className="rounded-controle border border-erro/20 bg-branco/70 p-4 shadow-card">
            <p className="m-0 text-corpo font-semibold leading-relaxed text-erro">
              {textos.ritmo}
            </p>
          </div>
        </div>

        <div
          className="flex flex-col justify-between gap-4 rounded-card bg-erro p-6 text-branco shadow-dialogo transition-all duration-200 hover:shadow-dialogo desktop:col-span-3"
          data-revelar
          data-destaque
          data-perda
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-branco/30 bg-branco/20 px-4 py-1 text-legenda font-bold uppercase tracking-wider text-branco backdrop-blur-xs">
                <Icon name="alerta" size={16} variant="negativa" />
                Impacto Financeiro Direto
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <Contador
                valor={calculo.porAno}
                formatar={formatarReais}
                className="text-h1 font-extrabold leading-tight tracking-tight text-branco desktop:text-display desktop:leading-none"
              />
              <span className="text-h3 font-bold text-branco">
                {textos.rotuloAno}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-controle border border-branco/25 bg-branco/15 px-4 py-2 text-corpo font-medium text-branco backdrop-blur-xs shadow-card">
            <Icon name="historico" size={16} variant="negativa" />
            <span>
              <Contador valor={calculo.porMes} formatar={formatarReais} className="font-extrabold text-branco" /> {textos.rotuloMes}
            </span>
          </div>
        </div>
      </div>

      {/* Grid comparativo e de custos ocultos */}
      <div className="grid items-stretch gap-6 tablet:grid-cols-2 tablet:gap-8">
        {/* Gráfico de barras de patrimônio por capacidade */}
        <figure
          className="m-0 flex flex-col justify-between gap-6 rounded-card border border-branco/15 bg-navy/80 p-6 shadow-dialogo backdrop-blur-xs"
          data-revelar
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-azul-ciano" aria-hidden="true" />
              <figcaption className="text-corpo font-bold text-branco">{textos.rotuloCustos}</figcaption>
            </div>
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {PREJUIZO.custos.map((custo) => (
                <li key={custo.capacidade} className="flex flex-col gap-2">
                  <span className="flex items-baseline justify-between gap-4 text-corpo font-semibold text-branco">
                    <span className="flex items-center gap-2">
                      <span className="inline-block size-2 rounded-full bg-cinza-gelo/60" aria-hidden="true" />
                      <span>Cilindro de {custo.capacidade}</span>
                    </span>
                    <span className="tabular-nums font-bold text-cinza-gelo">{formatarReais(custo.valor)}</span>
                  </span>
                  <span aria-hidden="true" className="landing-barra-trilho">
                    <span className="landing-barra" style={{ '--proporcao': custo.valor / maior } as React.CSSProperties} />
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-t border-branco/15 pt-4 text-corpo font-bold text-branco">
            <span className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-verde-vivo" aria-hidden="true" />
              <span>{textos.rotuloMedio}</span>
            </span>
            <span className="tabular-nums text-h3 font-extrabold text-branco">
              {formatarReais(calculo.patrimonioMedio)}
            </span>
          </div>
        </figure>

        {/* Card de contextualização: Custos Ocultos e Ressalva */}
        <div
          className="flex flex-col justify-between gap-6 rounded-card border border-branco/15 bg-navy/80 p-6 shadow-dialogo backdrop-blur-xs"
          data-revelar
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span
                className="flex size-6 items-center justify-center rounded-full bg-alerta-fundo text-legenda font-bold text-alerta-texto"
                aria-hidden="true"
              >
                !
              </span>
              <span className="text-legenda font-bold uppercase tracking-wider text-cinza-gelo">
                Custos Indiretos Não Contabilizados
              </span>
            </div>

            <p className="landing-medida m-0 text-h3 font-semibold leading-snug text-branco">
              {textos.ressalva}
            </p>
          </div>

          {/* Fatores que ilustram a ressalva de forma visual e escaneável */}
          <div className="grid grid-cols-2 gap-2 border-t border-branco/15 pt-4 tablet:grid-cols-3">
            {[
              { rotulo: 'Gás residual', icone: 'sensor' },
              { rotulo: 'Transporte', icone: 'caminhao' },
              { rotulo: 'Mão de obra', icone: 'usuario' },
              { rotulo: 'Tempo de busca', icone: 'historico' },
              { rotulo: 'Reposição', icone: 'cilindro' },
              { rotulo: 'Perda de aluguel', icone: 'relatorios' },
            ].map((fator) => (
              <div
                key={fator.rotulo}
                className="flex items-center gap-2 rounded-controle border border-branco/10 bg-branco/5 px-2 py-2 text-legenda text-cinza-gelo transition-colors hover:bg-branco/10"
              >
                <Icon name={fator.icone as any} size={16} variant="negativa" />
                <span className="font-semibold text-branco">{fator.rotulo}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Secao>
  );
}
