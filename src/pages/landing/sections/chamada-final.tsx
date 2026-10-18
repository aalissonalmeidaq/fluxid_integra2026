import React from 'react';
import { LandingCta } from '../landing-cta';
import { Mascote } from '../mascote';
import { TEXTOS } from '../landing-content';
import { CartaoC262 } from './cartao-c262';
import { ContatoPiloto } from './contato-piloto';
import { Secao } from './secao';

// Chamada final (Spec 011, RF-005; adaptação ao pitch, 9:05 a 10:00): a pergunta que fecha o pitch (o título da seção, o maior texto daqui),
// a frase final e as saídas. Depois da crítica de 15/10/2026 a primeira é o contato para começar um piloto (o próximo passo de quem decide);
// assistir ao pitch fica em segundo, e entrar no sistema, para quem já tem conta, vira link discreto.
export function ChamadaFinal(): React.JSX.Element {
  return (
    <Secao id="chamada-final" titulo={TEXTOS.chamadaFinal.titulo} introducao={TEXTOS.chamadaFinal.texto} destaque>
      <div className="grid items-start gap-8 desktop:grid-cols-12 desktop:gap-12" data-grade-fecho>
        <div className="flex flex-col gap-8 desktop:col-span-5" data-revelar>
          <div className="flex flex-col items-start gap-4 tablet:flex-row tablet:items-center tablet:gap-6">
            <Mascote uso="final" className="landing-mascote-final shrink-0" />
            <div className="flex flex-col gap-4">
              <h3 className="landing-medida m-0 text-h3 font-extrabold leading-snug text-branco desktop:text-h2">
                {TEXTOS.chamadaFinal.frase}
              </h3>
              <span className="block h-1 w-16 rounded-full bg-azul-ciano" aria-hidden="true" />
            </div>
          </div>

          <div className="flex flex-col gap-6 border-t border-branco/15 pt-6" data-acoes-fecho>
            <div className="flex flex-col gap-4">
              <ContatoPiloto tema="escuro" />
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <a
                href="#assistir-video-pitch"
                className="inline-flex min-h-alvo items-center justify-center gap-2 text-corpo font-semibold text-branco underline decoration-branco/40 underline-offset-4 transition-colors hover:text-cinza-gelo motion-reduce:transition-none"
              >
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {TEXTOS.chamadaFinal.acaoPrincipal}
              </a>
              <LandingCta variante="rodape" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 desktop:col-span-7" data-revelar>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-verde-vivo" aria-hidden="true" />
              <p className="m-0 text-corpo font-bold text-branco">{TEXTOS.chamadaFinal.respostaTitulo}</p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-legenda font-semibold text-cinza-gelo">
              Ciclo Completo
            </span>
          </div>

          <CartaoC262
            titulo={TEXTOS.jornada.c262.titulo}
            detalhe={TEXTOS.jornada.c262.detalhe}
            estados={TEXTOS.jornada.c262.estados}
            atual={TEXTOS.jornada.c262.estados.length - 1}
            className="w-full"
          >
            <dl className="m-0 mt-4 flex flex-col gap-2 border-t border-azul-ciano pt-4 text-legenda">
              {TEXTOS.chamadaFinal.resposta.map((linha) => (
                <div key={linha.rotulo} className="flex flex-wrap items-center justify-between gap-x-4 border-b border-branco/10 pb-2">
                  <dt className="font-medium text-cinza-gelo">{linha.rotulo}</dt>
                  <dd className="m-0 font-semibold text-branco">{linha.valor}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex items-center gap-2 pt-2 text-legenda font-semibold text-verde-vivo">
              <span className="inline-block size-2 rounded-full bg-verde-vivo" aria-hidden="true" />
              <span>Trajetória verificada e registrada sem lacunas</span>
            </div>
          </CartaoC262>
        </div>
      </div>
    </Secao>
  );
}
