import React, { useId, useState } from 'react';
import { Icon, type IconName } from '@/design-system';
import { PREJUIZO, TEXTOS } from '../landing-content';
import { formatarInteiro, formatarReais, patrimonioMedio, patrimonioPreservado } from '../prejuizo';
import { Secao } from './secao';

const PERDAS_INICIAIS = 10;
const CENARIOS = [5, 10, 25, 50, PREJUIZO.perdidosNoAno] as const;

const perdasPorExtenso = (perdas: number): string => `${formatarInteiro(perdas)} ${perdas === 1 ? 'perda evitada' : 'perdas evitadas'}`;

const ICONES_VALOR: Record<string, IconName> = {
  'Reduzir perdas': 'escudo',
  'Eliminar a redigitação': 'sincronizar',
  'Diminuir erros': 'verificado',
  'Agilizar a conferência': 'entrega',
  'Evitar trocas indevidas': 'bloqueio',
  'Facilitar a auditoria': 'relatorios',
};

const ICONES_FASE: Record<string, IconName> = { lote: 'caminhao', medir: 'relatorios', ampliar: 'armazem' };

// Operação piloto e modelo de negócio (Spec 011, adaptação ao pitch, 8:15 a 9:05). Depois da crítica de 14/10/2026 o simulador é uma
// simulação declarada: selo "Estimativa", a base do cálculo à vista (o patrimônio médio do pitch, de prejuizo.ts), a frase diz quantas das
// perdas de 2025 seriam evitadas e a ressalva lembra que é hipótese para o piloto medir. No segundo slide, as três fases de como começamos;
// a contratação e o contato para começar ficam na seção seguinte, Planos e investimento (16/10/2026).
export function Piloto(): React.JSX.Element {
  const { piloto, planos } = TEXTOS;
  const campoId = useId();
  const [perdas, setPerdas] = useState<number>(PERDAS_INICIAIS);
  const medio = patrimonioMedio(PREJUIZO.custos);
  const componentesModelo = [
    { id: 'implantacao', icone: 'configuracoes' as const, rotulo: planos.implantacaoRotulo, nota: planos.implantacaoNota, texto: planos.implantacaoTexto },
    { id: 'assinatura', icone: 'sincronizar' as const, rotulo: planos.assinaturaRotulo, nota: planos.assinaturaNota, texto: planos.assinaturaTexto },
  ];

  return (
    <Secao
      id="piloto"
      titulo={piloto.titulo}
      introducao={piloto.introducao}
      fundo="gelo"
      // Dois slides: o valor e a simulação; no seguinte (slide 13), as fases de como começamos e o modelo de contratação.
      depois={[
        <div key="comeco" className="flex flex-col gap-6 desktop:gap-8">
          {/* Fases do piloto comercial */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1" data-revelar>
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-azul-royal" aria-hidden="true" />
                <span className="text-legenda font-bold uppercase tracking-wider text-azul-profundo">
                  {piloto.etapasRotulo}
                </span>
              </div>
              <h3 className="m-0 text-h3 font-bold leading-tight text-grafite tablet:text-h2 tablet:leading-tight">
                {piloto.etapasTitulo}
              </h3>
              <p className="landing-medida m-0 text-corpo leading-relaxed text-texto-secundario">
                {piloto.etapasIntroducao}
              </p>
            </div>

            <ol className="m-0 grid list-none gap-4 p-0 tablet:grid-cols-3 desktop:gap-6">
              {piloto.etapas.map((etapa, indice) => (
                <li
                  key={etapa.id}
                  className="relative flex flex-col justify-between gap-4 rounded-card border border-borda-suave bg-branco p-4 shadow-card transition-all duration-200 hover:border-azul-royal/40 hover:shadow-dialogo desktop:p-6"
                  data-revelar
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-2 border-b border-borda-suave pb-4">
                      <span className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-controle bg-info-fundo text-azul-profundo" aria-hidden="true">
                          <Icon name={ICONES_FASE[etapa.id] ?? 'verificado'} size={24} variant="duotone" />
                        </span>
                        <span className="rounded-controle bg-cinza-gelo px-2 py-1 text-legenda font-bold text-azul-profundo">
                          {etapa.fase}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-h2 font-extrabold leading-none tabular-nums text-azul-royal">
                        0{indice + 1}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <h4 className="m-0 text-corpo font-bold leading-tight text-grafite tablet:text-h3">
                        {etapa.titulo}
                      </h4>
                      <span className="text-corpo leading-relaxed text-texto-secundario">
                        {etapa.texto}
                      </span>
                    </div>
                  </div>
                  <span className="flex items-center gap-2 rounded-controle bg-cinza-gelo px-2 py-1 text-legenda font-semibold text-texto-secundario">
                    <span className="inline-block size-2 rounded-full bg-verde-vivo" aria-hidden="true" />
                    {piloto.foco}: {etapa.foco}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Modelo de contratação: subido para o slide 13 */}
          <section
            aria-labelledby="landing-piloto-modelo"
            className="flex flex-col gap-4 rounded-card border border-borda-suave bg-branco/80 p-4 shadow-card backdrop-blur-xs desktop:p-6"
            data-revelar
          >
            <div className="flex flex-col gap-1 desktop:flex-row desktop:items-baseline desktop:justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-azul-royal" aria-hidden="true" />
                <h3 id="landing-piloto-modelo" className="m-0 text-h3 font-bold leading-tight text-grafite">
                  {planos.modeloRotulo}
                </h3>
              </div>
              <p className="m-0 text-corpo leading-relaxed text-texto-secundario">
                Primeiro a implantação prepara a operação; depois, a assinatura mantém a plataforma ativa.
              </p>
            </div>

            <div className="grid gap-4 desktop:grid-cols-2 desktop:gap-6">
              {componentesModelo.map((parte) => (
                <article
                  key={parte.id}
                  data-componente={parte.id}
                  className="flex items-start gap-4 rounded-card border border-borda-suave bg-branco p-4 shadow-card transition-all duration-200 hover:border-azul-royal/40 hover:shadow-dialogo desktop:p-6"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-controle bg-info-fundo text-azul-profundo shadow-card" aria-hidden="true">
                    <Icon name={parte.icone} size={24} variant="duotone" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-fit rounded-full bg-cinza-gelo px-2 py-1 text-legenda font-bold leading-none text-azul-profundo">
                        {parte.nota}
                      </span>
                    </div>
                    <h3 className="m-0 text-h3 font-bold leading-tight text-grafite">
                      {parte.rotulo}
                    </h3>
                    <p className="m-0 text-corpo leading-relaxed text-texto-secundario">
                      {parte.texto}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>,
      ]}
    >
      <div className="grid items-stretch gap-6 tablet:grid-cols-2 desktop:gap-8">
        <article className="flex h-full min-w-0 flex-col justify-between gap-6 rounded-card border border-borda-suave bg-branco p-6 shadow-card desktop:p-8" data-revelar>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-azul-royal" aria-hidden="true" />
              <span className="text-legenda font-bold uppercase tracking-wider text-azul-profundo">Retorno Operacional</span>
            </div>
            <h3 className="m-0 text-h3 font-bold leading-tight text-grafite">{piloto.valorTitulo}</h3>
            <p className="m-0 text-corpo text-texto-secundario">
              Benefícios diretos validados na rotina operacional desde o primeiro lote monitorado.
            </p>
          </div>

          <ul className="m-0 grid list-none gap-2 p-0 tablet:grid-cols-2">
            {piloto.valor.map((item) => (
              <li
                key={item}
                className="flex items-center gap-4 rounded-controle border border-borda-suave bg-cinza-gelo p-4 text-corpo font-semibold text-grafite transition-all hover:border-azul-royal hover:bg-branco hover:shadow-card"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-controle bg-info-fundo text-azul-profundo">
                  <Icon name={ICONES_VALOR[item] ?? 'verificado'} size={24} variant="duotone" />
                </span>
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-4 rounded-controle border border-borda-suave bg-cinza-gelo p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-controle bg-branco text-azul-profundo shadow-card">
              <Icon name="geocerca" size={24} variant="duotone" />
            </span>
            <p className="m-0 text-corpo font-medium leading-relaxed text-texto-secundario">
              Medição contínua com indicadores de perdas evitadas, tempo de conferência e conformidade de rotas.
            </p>
          </div>
        </article>

        <div className="landing-escuro flex h-full min-w-0 flex-col justify-between gap-6 rounded-card border border-branco/15 bg-navy p-6 text-branco shadow-dialogo desktop:p-8" data-revelar data-simulador>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-verde-vivo" aria-hidden="true" />
                <span className="text-legenda font-bold uppercase tracking-wider text-cinza-gelo">Calculadora de Impacto</span>
              </div>
              <span className="rounded-controle bg-alerta-fundo px-2 py-1 text-legenda font-bold text-alerta-texto">
                {piloto.simuladorSelo}
              </span>
            </div>
            <h3 className="m-0 text-h3 font-bold leading-tight">{piloto.simuladorTitulo}</h3>
            <p className="m-0 text-corpo text-cinza-gelo">
              Simule o patrimônio protegido em função das perdas evitadas ao longo do ano.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor={campoId} className="text-corpo font-semibold text-branco">
                {piloto.simuladorRotulo}
              </label>
              <span className="text-h3 font-extrabold tabular-nums text-verde-vivo">
                {formatarInteiro(perdas)}{' '}
                <span className="text-corpo font-normal text-cinza-gelo">
                  de {formatarInteiro(PREJUIZO.perdidosNoAno)}
                </span>
              </span>
            </div>

            <input
              id={campoId}
              type="range"
              min={1}
              max={PREJUIZO.perdidosNoAno}
              step={1}
              value={perdas}
              onChange={(evento) => setPerdas(Number(evento.target.value))}
              aria-valuetext={`${perdasPorExtenso(perdas)} de ${formatarInteiro(PREJUIZO.perdidosNoAno)}`}
              className="landing-faixa min-h-alvo w-full cursor-pointer accent-verde-vivo"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 text-legenda text-cinza-gelo">
              <span className="tabular-nums">1 perda</span>
              <div className="flex items-center gap-1">
                {CENARIOS.map((cenario) => {
                  const ativo = perdas === cenario;
                  return (
                    <button
                      key={cenario}
                      type="button"
                      onClick={() => setPerdas(cenario)}
                      className={[
                        'cursor-pointer rounded-controle border px-2 py-1 text-legenda font-bold transition-all',
                        ativo
                          ? 'border-verde-vivo bg-verde-vivo text-navy shadow-card'
                          : 'border-branco/20 bg-branco/10 text-cinza-gelo hover:bg-branco/20 hover:text-branco',
                      ].join(' ')}
                      aria-label={`Definir para ${cenario} perdas`}
                    >
                      {cenario === PREJUIZO.perdidosNoAno ? `Total (${cenario})` : `${cenario}`}
                    </button>
                  );
                })}
              </div>
              <span className="tabular-nums">{formatarInteiro(PREJUIZO.perdidosNoAno)} total</span>
            </div>
          </div>

          <output htmlFor={campoId} aria-live="polite" className="flex flex-col gap-2 rounded-card border border-azul-ciano/30 bg-branco/5 p-4 shadow-card">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-legenda font-semibold uppercase tracking-wider text-cinza-gelo">
                {piloto.simuladorResultado}
              </span>
              <span className="rounded-controle border border-verde-vivo/40 bg-navy px-2 py-0 text-legenda font-bold text-branco tabular-nums">
                {((perdas / PREJUIZO.perdidosNoAno) * 100).toFixed(0)}% do prejuízo anual
              </span>
            </div>
            <span className="text-h1 font-extrabold leading-tight tabular-nums text-verde-vivo">
              {formatarReais(patrimonioPreservado(perdas, medio))}
            </span>
            <p className="m-0 flex items-center justify-between border-t border-branco/10 pt-2 text-legenda text-cinza-gelo">
              <span>{piloto.simuladorBase}</span>
              <span className="font-bold tabular-nums text-branco">{formatarReais(medio)}</span>
            </p>
          </output>

          <p className="m-0 text-legenda leading-relaxed text-cinza-gelo">
            {piloto.simuladorRessalva} {PREJUIZO.ano}.
          </p>
        </div>
      </div>
    </Secao>
  );
}
