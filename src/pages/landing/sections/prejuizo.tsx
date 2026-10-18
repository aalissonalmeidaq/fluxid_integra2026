import React from 'react';
import { Icon } from '@/design-system';
import type { IconName } from '@/design-system';
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
      {/* A fonte fica próxima dos dados, mas com peso de nota metodológica — não de ação. */}
      <p className="landing-medida m-0 flex items-start gap-2 text-legenda leading-relaxed text-cinza-gelo" data-revelar data-fonte>
          <Icon name="relatorios" size={16} variant="negativa" />
          <span>
            <strong className="font-bold text-branco">{textos.rotuloFonte}:</strong> {PREJUIZO.fonte}
          </span>
      </p>

      {/* Resumo em ordem de causa e consequência: primeiro o volume, depois o impacto. */}
      <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-12 desktop:gap-6" data-resumo-prejuizo>
        <div
          className="flex flex-col justify-between gap-4 rounded-card bg-erro-fundo p-6 text-erro shadow-card desktop:col-span-4"
          data-revelar
          data-perda
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-legenda font-bold uppercase tracking-wider text-erro">
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

          <div className="border-t border-erro/20 pt-4">
            <p className="m-0 text-corpo font-semibold leading-relaxed text-erro">
              {textos.ritmo}
            </p>
          </div>
        </div>

        <div
          className="flex flex-col justify-between gap-4 rounded-card bg-erro p-6 text-branco shadow-dialogo desktop:col-span-8"
          data-revelar
          data-destaque
          data-perda
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-legenda font-bold uppercase tracking-wider text-branco">
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

          <div className="flex items-center gap-2 border-t border-branco/25 pt-4 text-corpo font-medium text-branco">
            <Icon name="historico" size={16} variant="negativa" />
            <span>
              <Contador valor={calculo.porMes} formatar={formatarReais} className="font-extrabold text-branco" /> {textos.rotuloMes}
            </span>
          </div>
        </div>
      </div>

      {/* Detalhamento: composição do patrimônio e custos omitidos na estimativa. */}
      <div className="grid items-stretch gap-6 desktop:grid-cols-12 desktop:gap-8" data-detalhes-prejuizo>
        {/* Gráfico de barras de patrimônio por capacidade */}
        <figure
          className="m-0 flex flex-col justify-between gap-6 border-t border-branco/15 pt-6 desktop:col-span-7"
          data-revelar
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-azul-ciano" aria-hidden="true" />
              <figcaption><h3 className="m-0 text-corpo font-bold text-branco">{textos.rotuloCustos}</h3></figcaption>
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
          className="flex flex-col justify-between gap-6 border-t border-branco/15 pt-6 desktop:col-span-5"
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
              <h3 className="m-0 text-legenda font-bold uppercase tracking-wider text-cinza-gelo">
                Custos indiretos não contabilizados
              </h3>
            </div>

            <p className="landing-medida m-0 text-h3 font-semibold leading-snug text-branco">
              {textos.ressalva}
            </p>
          </div>

          {/* Fatores que ilustram a ressalva de forma visual e escaneável */}
          <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2 border-t border-branco/15 p-0 pt-4" aria-label="Custos indiretos não contabilizados">
            {([
              { rotulo: 'Gás residual', icone: 'sensor' },
              { rotulo: 'Transporte', icone: 'caminhao' },
              { rotulo: 'Mão de obra', icone: 'usuario' },
              { rotulo: 'Tempo de busca', icone: 'historico' },
              { rotulo: 'Reposição', icone: 'cilindro' },
              { rotulo: 'Perda de aluguel', icone: 'relatorios' },
            ] satisfies Array<{ rotulo: string; icone: IconName }>).map((fator) => (
              <li
                key={fator.rotulo}
                className="flex items-center gap-2 text-legenda text-cinza-gelo"
              >
                <Icon name={fator.icone} size={16} variant="negativa" />
                <span className="font-semibold text-branco">{fator.rotulo}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Secao>
  );
}
