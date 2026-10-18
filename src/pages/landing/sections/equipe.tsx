import React from 'react';
import { Icon, type IconName } from '@/design-system';
import { EQUIPE, INSTITUICOES, MARCOS, TEXTOS } from '../landing-content';
import { Secao } from './secao';

const DOMINIOS: Record<string, { dominio: string; icone: IconName }> = {
  'nata-baracho': { dominio: 'Backend & Cloud', icone: 'nuvem' },
  'carlos-augusto': { dominio: 'Gestão de Produto', icone: 'dashboard' },
  'john-walter': { dominio: 'Frontend & PWA', icone: 'rede' },
  'simao-bastos': { dominio: 'IoT & Prototipagem', icone: 'sensor' },
  'kauan-evangelista': { dominio: 'Design & UX', icone: 'usuario' },
};

// Quem faz o FluxID (Spec 011; apresentação do projeto, 14/10/2026; polimento de 16/10/2026): os cinco integrantes e os marcos do projeto,
// e a faixa das instituições. Os cinco cabem na tela, então não há carrossel: no computador ficam lado a lado, no tablet em grade e no
// celular cada um vira uma linha (foto à esquerda), sem rolagem lateral. A formação fica à vista, sem cartão que vira (o que exige clique
// esconde o que a banca quer ler). Os marcos formam uma linha do tempo: horizontal do tablet em diante, vertical no celular.
export function Equipe(): React.JSX.Element {
  const { equipe } = TEXTOS;
  return (
    <Secao id="equipe" titulo={equipe.titulo} introducao={equipe.introducao} fundo="branco">
      <div className="flex flex-col gap-4" data-revelar>
        <h3 className="m-0 flex items-center gap-2 text-legenda font-bold uppercase tracking-wider text-texto-secundario">
          <span className="inline-block size-2 rounded-full bg-azul-royal" aria-hidden="true" />
          {equipe.integrantesTitulo}
        </h3>
        <ul className="m-0 grid list-none gap-4 p-0 tablet:grid-cols-3 desktop:grid-cols-5">
          {EQUIPE.map((pessoa) => {
            const dominio = DOMINIOS[pessoa.id];
            return (
              <li
                key={pessoa.id}
                data-integrante={pessoa.id}
                className="flex gap-4 rounded-card border border-borda-suave bg-branco p-4 shadow-card tablet:flex-col tablet:items-center tablet:p-6 tablet:text-center"
              >
                <div className="relative shrink-0 self-start tablet:self-center">
                  {/* Fotos padronizadas (mesmo fundo e enquadramento) em 192 e 384 px: nítidas em tela comum e de alta densidade. */}
                  <img
                    src={pessoa.foto}
                    srcSet={`${pessoa.foto.replace(/\.webp$/, '-192.webp')} 192w, ${pessoa.foto} 384w`}
                    sizes="(min-width: 768px) 7rem, 4.5rem"
                    alt={`Foto de ${pessoa.nome}`}
                    width={384}
                    height={384}
                    loading="lazy"
                    decoding="async"
                    className="landing-foto-equipe rounded-full bg-cinza-gelo ring-2 ring-azul-royal ring-offset-2 ring-offset-branco"
                  />
                  {dominio ? (
                    <span className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border-2 border-branco bg-azul-profundo" aria-hidden="true">
                      <Icon name={dominio.icone} size={16} variant="negativa" />
                    </span>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 tablet:items-center">
                  {dominio ? (
                    <span className="w-fit rounded-controle bg-info-fundo px-2 py-1 text-legenda font-bold text-azul-profundo">{dominio.dominio}</span>
                  ) : null}
                  <div className="flex flex-col gap-1">
                    <h3 className="m-0 text-corpo font-bold leading-tight text-grafite tablet:text-h3">{pessoa.nome}</h3>
                    <p className="m-0 text-corpo font-semibold leading-snug text-azul-profundo">{pessoa.funcao}</p>
                  </div>
                  <div className="mt-auto flex w-full flex-col gap-2 border-t border-borda-suave pt-2 text-start">
                    <span className="text-legenda font-bold uppercase tracking-wider text-texto-secundario">{equipe.formacao}</span>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {pessoa.formacao.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-legenda leading-snug text-grafite">
                          <span className="mt-1 inline-block size-2 shrink-0 rounded-full bg-azul-royal" aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-4" data-revelar>
        <h3 className="m-0 flex items-center gap-2 text-legenda font-bold uppercase tracking-wider text-texto-secundario">
          <span className="inline-block size-2 rounded-full bg-azul-royal" aria-hidden="true" />
          {equipe.marcosTitulo}
        </h3>
        <ol className="landing-marcos m-0 grid list-none gap-6 p-0 tablet:grid-cols-3 tablet:gap-4">
          {MARCOS.map((marco) => {
            const agendado = marco.situacao === 'agendado';
            return (
              <li key={marco.data} data-marco={marco.data} data-situacao={marco.situacao} className="landing-marco relative flex gap-4 tablet:flex-col tablet:gap-4">
                <span
                  className={[
                    'landing-marco-ponto relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2',
                    agendado ? 'border-azul-royal bg-branco' : 'border-verde-acessivel bg-verde-acessivel',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  <Icon name={agendado ? 'historico' : 'verificado'} size={16} variant={agendado ? 'contorno' : 'negativa'} />
                </span>
                <div
                  className={[
                    'flex flex-1 flex-col gap-2 rounded-card p-4',
                    agendado ? 'border-2 border-azul-royal bg-info-fundo' : 'border border-borda-suave bg-cinza-gelo',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <time dateTime={marco.data} className="text-legenda font-bold uppercase text-azul-profundo">{marco.rotulo}</time>
                    <span
                      className={[
                        'rounded-controle px-2 py-1 text-legenda font-bold leading-none',
                        agendado ? 'bg-azul-royal text-branco' : 'bg-sucesso-fundo text-verde-acessivel',
                      ].join(' ')}
                    >
                      {agendado ? equipe.agendado : equipe.cumprido}
                    </span>
                  </div>
                  <span className="text-corpo font-bold text-grafite">{marco.texto}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Instituições em uma faixa estática: leitura imediata, sem movimento contínuo ou conteúdo duplicado. */}
      <div className="flex flex-col gap-4 border-t border-borda-suave pt-6" data-revelar>
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-azul-royal" aria-hidden="true" />
          <span className="text-legenda font-bold uppercase tracking-wider text-texto-secundario">{equipe.instituicoes}</span>
        </div>

        <ul
          aria-label={equipe.instituicoes}
          data-lista-instituicoes
          className="m-0 grid list-none grid-cols-2 items-center gap-6 p-0 tablet:grid-cols-4 tablet:gap-8"
        >
          {INSTITUICOES.map((item) => (
            <li key={item.id} className="flex h-12 items-center justify-center tablet:h-16">
              <img
                src={item.arquivo}
                alt={item.nome}
                width={item.largura}
                height={item.altura}
                loading="lazy"
                decoding="async"
                className="landing-logo-instituicao"
              />
            </li>
          ))}
        </ul>
      </div>
    </Secao>
  );
}

