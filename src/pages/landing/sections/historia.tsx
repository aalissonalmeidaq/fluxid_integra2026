import React from 'react';
import { Icon } from '@/design-system';
import { TEXTOS } from '../landing-content';
import { Mascote } from '../mascote';
import { Secao } from './secao';

// Rota ilustrada do C-262: da distribuidora ao hospital, o caminhão percorre a rota e, no meio dela, o rastro se perde em uma interrogação.
// Só geometria nas cores dos tokens; decorativa (a história está no texto ao lado). Com movimento, o caminhão percorre a rota (pontos da
// curva em landing.css) e some perto da interrogação; sem movimento, fica parado no meio da rota.
const ROTA = 'M70 196 C 150 196, 170 120, 250 120 S 360 60, 410 70';

function RotaDoC262(): React.JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" data-decorativo viewBox="0 0 480 260" className="block h-auto w-full" fill="none">
      {/* Grade de coordenadas da rota logística */}
      <g stroke="var(--color-branco)" strokeWidth="1" strokeDasharray="3 6" opacity="0.08">
        <line x1="20" y1="65" x2="460" y2="65" />
        <line x1="20" y1="130" x2="460" y2="130" />
        <line x1="20" y1="195" x2="460" y2="195" />
        <line x1="120" y1="20" x2="120" y2="240" />
        <line x1="240" y1="20" x2="240" y2="240" />
        <line x1="360" y1="20" x2="360" y2="240" />
      </g>
      <path d={ROTA} className="landing-rota" stroke="var(--color-azul-ciano)" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 12" />
      {/* Distribuidora */}
      <g fill="var(--color-branco)">
        <path d="M30 230 V 186 L 70 162 L 110 186 V 230 Z" opacity="0.9" />
        <rect x="56" y="200" width="28" height="30" rx="2" fill="var(--color-navy)" />
        <text x="70" y="246" textAnchor="middle" fill="var(--color-cinza-gelo)" fontSize="10" fontWeight="700">DISTRIBUIDORA</text>
      </g>
      {/* Hospital */}
      <g fill="var(--color-branco)">
        <rect x="380" y="34" width="70" height="66" rx="6" opacity="0.9" />
        <rect x="408" y="46" width="14" height="40" rx="2" fill="var(--color-verde-vivo)" />
        <rect x="395" y="59" width="40" height="14" rx="2" fill="var(--color-verde-vivo)" />
        <text x="415" y="114" textAnchor="middle" fill="var(--color-cinza-gelo)" fontSize="10" fontWeight="700">HOSPITAL</text>
      </g>
      {/* A interrogação no ponto em que o rastro some */}
      <g className="landing-interrogacao" fill="var(--color-alerta-faixa)">
        <circle cx="300" cy="150" r="34" stroke="var(--color-alerta-faixa)" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" fill="none" />
        <circle cx="300" cy="150" r="24" />
        <text x="300" y="160" textAnchor="middle" fill="var(--color-navy)" fontSize="28" fontWeight="800">?</text>
        <text x="300" y="196" textAnchor="middle" fill="var(--color-alerta-faixa)" fontSize="10" fontWeight="800">PERDIDO</text>
      </g>
      {/* O caminhão com o C-262 */}
      <g className="landing-caminhao">
        <g transform="translate(-22 -26)">
          <rect x="0" y="6" width="30" height="20" rx="3" fill="var(--color-azul-royal)" />
          <path d="M30 12 H 40 L 46 19 V 26 H 30 Z" fill="var(--color-branco)" />
          <circle cx="10" cy="28" r="4" fill="var(--color-branco)" />
          <circle cx="38" cy="28" r="4" fill="var(--color-branco)" />
          <rect x="4" y="-14" width="34" height="16" rx="8" fill="var(--color-branco)" />
          <text x="21" y="-2" textAnchor="middle" fill="var(--color-navy)" fontSize="10" fontWeight="800">C-262</text>
        </g>
      </g>
    </svg>
  );
}

// O cilindro que desapareceu (Spec 011, adaptação ao pitch, 0:00 a 1:00): a história do C-262, contada em cenas com horário, a rota
// ilustrada e a pergunta que abre o pitch. O mascote, de binóculos, procura o cilindro na cena. Dois slides: a história e a pergunta.
export function Historia(): React.JSX.Element {
  const { historia } = TEXTOS;
  return (
    <Secao
      id="historia"
      titulo={historia.titulo}
      introducao={historia.introducao}
      fundo="gelo"
      depois={[
        // A pergunta que abre o pitch ganha destaque editorial: grade equilibrada com cards de investigação, badge de momento crítico, conclusão destacada e dossiê do ativo não localizado.
        <div key="pergunta" className="flex flex-col gap-8" data-revelar data-pergunta>
          <div className="grid items-start gap-8 desktop:grid-cols-5 desktop:gap-12">
            <div className="flex flex-col gap-6 desktop:col-span-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-alerta-faixa/30 bg-alerta-fundo px-4 py-1 text-legenda font-bold uppercase tracking-wider text-alerta-texto shadow-card">
                  <span className="inline-block size-2 rounded-full bg-alerta-faixa motion-safe:animate-pulse" aria-hidden="true" />
                  Pergunta crítica
                </span>
              </div>
              <p className="m-0 text-balance text-h2 font-extrabold leading-tight text-navy tablet:text-h1 tablet:leading-tight desktop:text-display desktop:leading-none">
                {historia.pergunta}
              </p>
              <ul className="m-0 grid list-none gap-4 p-0 tablet:grid-cols-2">
                {historia.duvidas.map((duvida) => (
                  <li
                    key={duvida}
                    className="flex items-start gap-4 rounded-card border border-borda-suave bg-branco p-4 shadow-card"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-erro-fundo text-legenda font-extrabold text-erro"
                    >
                      ?
                    </span>
                    <span className="text-corpo font-bold leading-snug text-grafite tablet:text-h3 tablet:font-bold">
                      {duvida}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-start gap-4 rounded-card border border-borda-suave border-l-4 border-l-erro bg-branco p-4 shadow-card">
                <span aria-hidden="true" className="mt-1 inline-flex shrink-0 text-erro">
                  <Icon name="alerta" size={24} variant="monocromatica" />
                </span>
                <p className="landing-medida m-0 text-corpo leading-relaxed text-grafite tablet:text-h3 tablet:leading-snug">
                  {historia.conclusao}
                </p>
              </div>
            </div>
            <div className="relative isolate flex flex-col justify-between overflow-hidden rounded-card border border-branco/15 bg-linear-to-br from-navy to-azul-profundo p-6 pb-16 text-branco shadow-dialogo desktop:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-branco/15 pb-4">
                <div className="flex items-center gap-2">
                  <Icon name="cilindro" size={24} variant="negativa" />
                  <span className="text-h3 font-extrabold leading-tight">Cilindro C-262</span>
                </div>
                <span className="rounded-full border border-alerta-faixa/40 bg-alerta-fundo px-4 py-1 text-legenda font-bold text-alerta-texto">
                  Sem Rastro Digital
                </span>
              </div>
              <div className="my-6 flex flex-col gap-4">
                <div className="flex flex-col gap-1 rounded-card border border-branco/10 bg-navy/80 p-4">
                  <span className="text-legenda font-bold uppercase tracking-wider text-cinza-gelo">Último Registro Físico</span>
                  <span className="text-corpo font-semibold text-branco">06:45 • Anotação em prancheta</span>
                </div>
                <div className="flex flex-col gap-1 rounded-card border border-erro/40 bg-erro/20 p-4">
                  <span className="text-legenda font-bold uppercase tracking-wider text-cinza-gelo">Situação na Entrega</span>
                  <span className="text-corpo font-semibold text-branco">Sem comprovante ou evidência digital</span>
                </div>
                <div className="flex flex-col gap-1 rounded-card border border-branco/10 bg-navy/80 p-4">
                  <span className="text-legenda font-bold uppercase tracking-wider text-cinza-gelo">Impacto Imediato</span>
                  <span className="text-corpo font-semibold text-branco">Risco de perda patrimonial e desabastecimento</span>
                </div>
              </div>
              <Mascote uso="historia" className="landing-mascote-busca" />
            </div>
          </div>
        </div>,
      ]}
    >
      <div className="grid items-center gap-8 tablet:grid-cols-2 tablet:gap-12">
        <ol className="landing-linha-do-tempo m-0 flex list-none flex-col gap-4 p-0">
          {historia.cenas.map((cena) => {
            const eAlerta = cena.icone === 'alerta';
            return (
              <li key={cena.hora} className="relative flex items-start gap-4" data-revelar>
                <span
                  aria-hidden="true"
                  className={[
                    'relative z-10 inline-flex size-12 shrink-0 items-center justify-center rounded-full shadow-card',
                    eAlerta ? 'border-2 border-alerta-faixa bg-alerta-fundo text-alerta-texto' : 'bg-azul-profundo text-branco',
                  ].join(' ')}
                >
                  <Icon name={cena.icone} size={24} variant={eAlerta ? 'monocromatica' : 'negativa'} />
                </span>
                <div
                  className={[
                    'flex flex-1 flex-col gap-2 rounded-card border p-4 shadow-card',
                    eAlerta ? 'border-alerta-faixa/50 bg-alerta-fundo/40' : 'border-borda-suave bg-branco',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'inline-flex w-fit items-center gap-2 rounded-full px-4 py-1 text-legenda font-bold',
                      eAlerta ? 'bg-alerta-fundo text-alerta-texto' : 'bg-info-fundo text-azul-profundo',
                    ].join(' ')}
                  >
                    <span
                      className={['inline-block size-2 rounded-full', eAlerta ? 'bg-alerta-faixa motion-safe:animate-pulse' : 'bg-azul-royal'].join(' ')}
                      aria-hidden="true"
                    />
                    {cena.hora}
                  </span>
                  <p className={['m-0 text-corpo leading-relaxed', eAlerta ? 'font-bold text-grafite' : 'text-grafite'].join(' ')}>
                    {cena.texto}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="relative isolate flex flex-col justify-between overflow-hidden rounded-card bg-linear-to-br from-navy to-azul-profundo p-6 pb-16 shadow-dialogo" data-revelar>
          {/* Header operacional do monitoramento */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-branco/15 pb-4 text-branco">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-alerta-faixa motion-safe:animate-pulse" aria-hidden="true" />
              <span className="text-legenda font-extrabold uppercase tracking-wider text-cinza-gelo">
                Trajeto sem rastreamento digital
              </span>
            </div>
            <span className="rounded-full border border-branco/20 bg-navy/80 px-4 py-1 text-legenda font-bold text-cinza-gelo">
              Ativo: C-262 • Oxigênio
            </span>
          </div>

          <RotaDoC262 />

          {/* Minipainel de status da ocorrência */}
          <div className="relative z-10 mt-2 flex w-fit flex-col gap-2 rounded-card border border-branco/15 bg-navy/90 p-4 text-legenda text-branco shadow-card backdrop-blur-xs">
            <div className="flex items-center justify-between gap-2 border-b border-branco/10 pb-2">
              <span className="text-cinza-gelo opacity-80">Última anotação manual:</span>
              <span className="font-bold text-branco">06:45 (Prancheta)</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-alerta-faixa font-semibold">Situação na entrega:</span>
              <span className="font-extrabold text-branco">Cilindro não localizado</span>
            </div>
          </div>

          {/* O mascote procura o C-262 no canto livre da rota (pose da apresentação do FluxID). */}
          <Mascote uso="historia" className="landing-mascote-busca" />
        </div>
      </div>
    </Secao>
  );
}
