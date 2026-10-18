import React from 'react';
import { Icon } from '@/design-system';
import { FRENTES, JORNADA, TEXTOS, TRECHOS_DA_JORNADA } from '../landing-content';
import { Secao } from './secao';
import { SeloSituacao } from './selo-situacao';

// A solução (Spec 011, adaptação ao pitch, 2:50 a 4:45): as quatro frentes do FluxID e, logo abaixo, a jornada do C-262 da saída ao retorno.
// Na segunda crítica de 14/10/2026 a jornada deixou de ser uma seção à parte: as duas contavam a mesma coisa em níveis diferentes (o que o
// FluxID faz e como isso acontece com um cilindro), e juntas ocupam menos da metade da rolagem de antes. As frentes ficam em cards
// individuais na grade da solução; a jornada, em três trechos lado a lado no computador, cada um dizendo onde está o C-262. As regras que
// protegem o registro ficam abertas para visualização imediata da governança, com layout compacto em quatro colunas no desktop.
export function Solucao(): React.JSX.Element {
  const { jornada } = TEXTOS;
  return (
    <Secao
      id="solucao"
      titulo={TEXTOS.solucao.titulo}
      introducao={TEXTOS.solucao.introducao}
      fundo="gelo"
      // Dois slides: as quatro frentes e, no seguinte, a jornada do C-262 com as regras abertas.
      depois={[
          <div key="jornada" id="jornada" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2" data-revelar>
              <h3 className="m-0 text-h3 font-bold leading-tight text-grafite tablet:text-h2 tablet:leading-tight">{jornada.titulo}</h3>
              <p className="landing-medida m-0 text-corpo leading-relaxed text-texto-secundario">{jornada.introducao}</p>
            </div>
            <div className="grid gap-6 desktop:grid-cols-3">
              {TRECHOS_DA_JORNADA.map((trecho) => (
                <section
                  key={trecho.id}
                  aria-labelledby={`landing-trecho-${trecho.id}`}
                  data-trecho={trecho.id}
                  className="flex flex-col justify-between gap-6 rounded-card border border-borda-suave bg-branco p-6 shadow-card"
                  data-revelar
                >
                  <div className="flex flex-col gap-2 border-b border-borda-suave pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 id={`landing-trecho-${trecho.id}`} className="m-0 text-h3 font-bold leading-tight text-grafite">
                        {trecho.titulo}
                      </h4>
                      <span className="inline-flex items-center gap-1 rounded-full border border-borda-suave bg-cinza-gelo px-2 py-1 text-legenda font-bold text-azul-profundo tabular-nums shadow-card">
                        <span className="inline-block size-2 rounded-full bg-azul-royal" aria-hidden="true" />
                        C-262: {jornada.c262.estados[trecho.estado]}
                      </span>
                    </div>
                    <p className="m-0 text-corpo leading-relaxed text-texto-secundario">
                      {trecho.resumo}
                    </p>
                  </div>
                  <ol className="landing-jornada m-0 flex flex-1 list-none flex-col gap-6 p-0">
                    {JORNADA.filter((etapa) => etapa.grupo === trecho.id).map((etapa) => (
                      <li key={etapa.ordem} className="relative flex items-start gap-4">
                        <span className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-azul-royal bg-cinza-gelo text-corpo font-extrabold text-azul-profundo shadow-card">
                          {etapa.ordem}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                              <Icon name={etapa.icone} size={24} variant="duotone" className="text-azul-profundo" />
                              <span className="text-corpo font-bold leading-tight text-grafite">{etapa.titulo}</span>
                            </span>
                            <SeloSituacao situacao={etapa.situacao} />
                          </div>
                          <span className="landing-medida text-corpo leading-relaxed text-texto-secundario">{etapa.texto}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
            <details open className="landing-escuro landing-detalhes rounded-card border border-branco/15 bg-navy text-branco shadow-dialogo transition-all duration-200" data-revelar>
              <summary className="flex min-h-alvo cursor-pointer items-center justify-between gap-2 px-4 py-2 text-corpo font-bold leading-tight tablet:px-8 tablet:text-h3">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-flex shrink-0"><Icon name="escudo" size={24} variant="negativa" /></span>
                  <span>{jornada.regrasTitulo}</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-branco/20 bg-branco/10 px-2 py-1 text-legenda font-semibold text-cinza-gelo">
                  <span className="inline-block size-2 rounded-full bg-verde-vivo" aria-hidden="true" />
                  4 regras ativas
                </span>
              </summary>
              <ul className="m-0 grid list-none gap-2 px-4 pb-4 tablet:grid-cols-2 tablet:gap-4 tablet:px-8 tablet:pb-6 desktop:grid-cols-4">
                {jornada.regras.map((regra) => (
                  <li key={regra} className="flex items-start gap-2 rounded-controle border border-branco/10 bg-azul-profundo/40 p-4 text-corpo leading-relaxed text-branco">
                    <span aria-hidden="true" className="mt-1 shrink-0"><Icon name="verificado" size={16} variant="negativa" /></span>
                    <span>{regra}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>,
      ]}
    >
      <ul className="m-0 grid list-none gap-4 p-0 tablet:grid-cols-2 desktop:grid-cols-4">
        {FRENTES.map((frente) => (
          <li
            key={frente.id}
            className="flex flex-col justify-between gap-4 rounded-card border border-borda-suave bg-branco p-6 shadow-card"
            data-revelar
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <span
                  aria-hidden="true"
                  className="inline-flex size-16 shrink-0 items-center justify-center rounded-card border border-borda-suave bg-info-fundo text-azul-profundo"
                >
                  <Icon name={frente.icone} size={32} variant="duotone" />
                </span>
                <span className="text-legenda font-bold uppercase tracking-wider text-texto-secundario">
                  {frente.situacao === 'plataforma' ? 'Plataforma' : 'Trava & Campo'}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-h3 font-bold leading-tight text-grafite">{frente.titulo}</h3>
                <p className="m-0 text-corpo leading-relaxed text-texto-secundario">{frente.texto}</p>
              </div>
            </div>
            <div className="mt-auto border-t border-borda-suave pt-4">
              <SeloSituacao situacao={frente.situacao} />
            </div>
          </li>
        ))}
      </ul>
    </Secao>
  );
}
