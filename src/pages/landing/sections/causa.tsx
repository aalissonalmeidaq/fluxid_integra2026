import React from 'react';
import { Icon } from '@/design-system';
import { TEXTOS } from '../landing-content';
import { Mascote } from '../mascote';
import { Secao } from './secao';

type IdDaEtapa = (typeof TEXTOS.causa.etapas)[number]['id'];

// Ilustrações da cadeia manual: prancheta, planilha e memória. Desenhadas em linha, na cor do texto; decorativas.
const DESENHOS: Record<IdDaEtapa, React.JSX.Element> = {
  prancheta: (
    <>
      <rect x="10" y="8" width="28" height="36" rx="3" />
      <rect x="17" y="4" width="14" height="8" rx="2" />
      <path d="M16 22h16M16 29h12M16 36h9" />
    </>
  ),
  planilha: (
    <>
      <rect x="6" y="8" width="36" height="32" rx="3" />
      <path d="M6 18h36M6 28h36M18 8v32M30 8v32" />
    </>
  ),
  memoria: (
    <>
      <path d="M14 34c-5 0-8-4-8-8 0-4 3-7 7-7 1-6 6-10 12-10 7 0 11 5 11 10 4 0 6 3 6 7s-3 8-8 8z" />
      <path d="M22 22c0-2 1.5-3.5 3.5-3.5S29 20 29 22c0 3-3.5 3-3.5 6M25.5 31v.5" />
    </>
  ),
};

// Por que isso acontece (Spec 011, adaptação ao pitch, 2:00 a 2:50): a cadeia manual prancheta, planilha e memória, os efeitos dela e a
// pergunta que leva à solução, dita pelo mascote. No celular cada elo é uma linha (desenho ao lado do texto), para a cadeia caber em pouco
// mais de uma tela; do tablet em diante, três colunas (layout de 15/10/2026).
export function Causa(): React.JSX.Element {
  const { causa } = TEXTOS;
  return (
    <Secao id="causa" titulo={causa.titulo} introducao={causa.introducao} fundo="branco">
      <ol className="m-0 grid list-none gap-8 p-0 tablet:grid-cols-3 tablet:gap-6">
        {causa.etapas.map((etapa, indice) => (
          <li
            key={etapa.id}
            className="landing-elo relative flex flex-col items-start gap-4 rounded-card border border-borda-suave bg-cinza-gelo p-4 shadow-card transition-all duration-200 hover:border-azul-royal/40 hover:bg-branco hover:shadow-dialogo tablet:p-6"
            data-revelar
            data-ultimo={indice === causa.etapas.length - 1 || undefined}
          >
            <div className="flex w-full items-center justify-between gap-4">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-card border border-borda-suave bg-branco text-azul-profundo shadow-card transition-transform duration-200 group-hover:scale-105">
                <svg
                  aria-hidden="true"
                  focusable="false"
                  viewBox="0 0 48 48"
                  width={32}
                  height={32}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-azul-profundo"
                >
                  {DESENHOS[etapa.id]}
                </svg>
              </span>
              <span className="inline-flex items-center rounded-full border border-borda-suave bg-branco px-2 py-1 text-legenda font-bold text-azul-profundo tabular-nums shadow-card">
                Etapa 0{indice + 1}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-2 tablet:gap-4">
              <h3 className="m-0 text-h3 font-bold leading-tight text-grafite">{etapa.titulo}</h3>
              <p className="m-0 text-corpo leading-relaxed text-texto-secundario">{etapa.texto}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-4 rounded-card border border-borda-suave bg-cinza-gelo p-4 shadow-card tablet:p-6" data-revelar>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borda-suave pb-2">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full bg-alerta-faixa" aria-hidden="true" />
            <p className="m-0 text-legenda font-bold uppercase tracking-wider text-texto-secundario">
              Consequências do processo fragmentado
            </p>
          </div>
          <span className="text-legenda font-bold text-alerta-texto">4 gargalos operacionais</span>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0 tablet:gap-4">
          {causa.efeitos.map((efeito) => (
            <li
              key={efeito}
              className="inline-flex items-center gap-2 rounded-full border border-alerta-faixa/40 bg-alerta-fundo px-4 py-2 text-legenda font-semibold text-alerta-texto shadow-card transition-all duration-200 hover:border-alerta-faixa hover:shadow-dialogo tablet:text-corpo"
            >
              <Icon name="alerta" size={16} variant="monocromatica" />
              {efeito}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="relative flex flex-col items-center gap-6 rounded-card border border-azul-royal/40 bg-navy p-6 shadow-dialogo tablet:flex-row tablet:p-8"
        data-revelar
      >
        <div aria-hidden="true" className="flex shrink-0 items-center justify-center">
          <Mascote uso="causa" className="landing-mascote-pensando" />
        </div>
        <div className="flex flex-1 flex-col items-center gap-2 text-center tablet:items-start tablet:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-branco/20 bg-branco/10 px-4 py-1 text-legenda font-semibold text-cinza-gelo">
            <span className="inline-block size-2 rounded-full bg-verde-vivo" aria-hidden="true" />
            O ponto de virada
          </span>
          <p className="m-0 text-h3 font-extrabold leading-snug text-branco tablet:text-h2 tablet:leading-snug">
            {causa.pergunta}
          </p>
          <p className="m-0 text-corpo leading-relaxed text-cinza-gelo">
            O FluxID substitui anotações manuais por uma trava física inteligente conectada e uma plataforma digital que acompanha o cilindro da saída ao retorno.
          </p>
        </div>
      </div>
    </Secao>
  );
}
