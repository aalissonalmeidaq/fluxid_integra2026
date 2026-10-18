import React from 'react';
import { Icon } from '@/design-system';
import { hrefDoPlano } from '../contato';
import { PLANOS, TEXTOS, type PlanoDeAssinatura } from '../landing-content';
import { formatarReais } from '../prejuizo';
import { ContatoPiloto } from './contato-piloto';
import { Secao } from './secao';

// Planos e investimento (pedido de 16/10/2026): as três faixas de investimento pelo tamanho da operação.
// O modelo geral de contratação (implantação única + assinatura recorrente) subiu para o slide 13 (fases do piloto),
// permitindo que este slide 14 dedique a tela inteira aos planos, seus valores de referência e ao contato comercial.
export function Planos(): React.JSX.Element {
  const { planos } = TEXTOS;
  return (
    <Secao id="planos" titulo={planos.titulo} introducao={planos.introducao} fundo="branco">
      <div className="flex flex-col gap-6 desktop:gap-8">
        <section aria-labelledby="landing-planos-faixas" className="flex flex-col gap-4 desktop:gap-6" data-revelar>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-azul-royal" aria-hidden="true" />
              <span className="text-legenda font-bold uppercase tracking-wider text-azul-profundo">
                Investimento por porte
              </span>
            </div>
            <h3 id="landing-planos-faixas" className="m-0 text-h3 font-bold leading-tight text-grafite tablet:text-h2 tablet:leading-tight">
              {planos.faixasRotulo}
            </h3>
          </div>

          <ul className="m-0 grid list-none gap-4 p-0 tablet:grid-cols-3 desktop:gap-6">
            {PLANOS.map((plano) => <CartaoDoPlano key={plano.id} plano={plano} />)}
          </ul>
          <p className="landing-medida m-0 text-legenda leading-relaxed text-texto-secundario">{planos.referencia}</p>
        </section>

        <div className="flex flex-col gap-4 rounded-card bg-cinza-gelo p-6 desktop:flex-row desktop:items-center" data-revelar>
          <ContatoPiloto tema="claro" />
        </div>
      </div>
    </Secao>
  );
}

function CartaoDoPlano({ plano }: { plano: PlanoDeAssinatura }): React.JSX.Element {
  const { planos } = TEXTOS;
  const sobMedida = plano.mensalidade === null || plano.implantacao === null;
  return (
    <li
      data-plano={plano.id}
      className={[
        'flex flex-col gap-4 rounded-card border p-6 shadow-card',
        sobMedida ? 'landing-escuro border-navy bg-navy text-branco' : 'border-borda-suave bg-branco text-grafite',
      ].join(' ')}
    >
      <div className="flex flex-col gap-2">
        <span className={['flex w-fit items-center gap-2 rounded-controle px-2 py-1 text-legenda font-bold', sobMedida ? 'bg-branco/10 text-cinza-gelo' : 'bg-info-fundo text-azul-profundo'].join(' ')}>
          <Icon name="cilindro" size={16} variant={sobMedida ? 'negativa' : 'monocromatica'} />
          {plano.faixa}
        </span>
        <h3 className="m-0 text-h3 font-bold leading-tight">{plano.nome}</h3>
      </div>
      {sobMedida ? (
        <div className="flex flex-1 flex-col gap-2 border-t border-branco/15 pt-4">
          <span className="text-h2 font-extrabold leading-tight">{planos.personalizado}</span>
          <p className="m-0 text-corpo leading-relaxed text-cinza-gelo">{planos.personalizadoTexto}</p>
        </div>
      ) : (
        <dl className="m-0 flex flex-1 flex-col gap-4 border-t border-borda-suave pt-4">
          <div className="flex flex-col gap-1">
            <dt className="text-legenda font-semibold uppercase tracking-wider text-texto-secundario">{planos.assinatura}</dt>
            <dd className="m-0 flex items-baseline gap-1">
              <span className="text-h2 font-extrabold leading-none tabular-nums text-azul-profundo">{formatarReais(plano.mensalidade!)}</span>
              <span className="text-corpo font-semibold text-texto-secundario">{planos.porMes}</span>
            </dd>
          </div>
          <div className="flex flex-col gap-1 rounded-controle bg-cinza-gelo p-4">
            <dt className="text-legenda font-semibold uppercase tracking-wider text-texto-secundario">{planos.implantacao}</dt>
            <dd className="m-0 flex flex-wrap items-baseline gap-2">
              <span className="text-h3 font-bold tabular-nums text-grafite">{formatarReais(plano.implantacao!)}</span>
              <span className="text-legenda text-texto-secundario">{planos.unico}</span>
            </dd>
          </div>
        </dl>
      )}
      <a
        href={hrefDoPlano(plano)}
        aria-label={`${planos.cta}: ${plano.nome}, ${plano.faixa.toLowerCase()}`}
        className={[
          'inline-flex min-h-alvo items-center justify-center rounded-controle border px-4 text-corpo font-bold no-underline transition-colors motion-reduce:transition-none',
          sobMedida ? 'border-verde-vivo bg-verde-vivo text-navy hover:bg-verde-escuro hover:text-branco' : 'border-azul-royal bg-branco text-azul-profundo hover:bg-info-fundo',
        ].join(' ')}
      >
        {planos.cta}
      </a>
    </li>
  );
}
