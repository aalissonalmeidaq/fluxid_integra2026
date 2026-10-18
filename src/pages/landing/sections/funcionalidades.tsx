import React from 'react';
import { Icon } from '@/design-system';
import { FUNCIONALIDADES, MATERIAIS, TELAS, TEXTOS, VIDEO_DA_SECAO } from '../landing-content';
import { PreviaDeFila } from '../previews/previa-de-fila';
import { Secao } from './secao';
import { TelaDoSistema } from './tela-do-sistema';
import { VideoDestaque } from './video-destaque';

// O que já funciona (Spec 011, RF-005 e RF-013): as telas e as garantias operacionais formam uma única narrativa. O visitante primeiro
// reconhece a entrega no computador e no celular e, no mesmo slide, entende como ela continua sem sinal e com dados protegidos.
export function Funcionalidades(): React.JSX.Element {
  const [computador, celular] = TELAS;
  const videoDoSistema = MATERIAIS.find((item) => item.id === VIDEO_DA_SECAO.funcionalidades);

  return (
    <Secao
      id="funcionalidades"
      titulo={TEXTOS.funcionalidades.titulo}
      introducao={TEXTOS.funcionalidades.introducao}
      // Dois slides: telas e garantias operacionais juntas; depois, o vídeo que comprova o sistema em uso.
      depois={videoDoSistema ? [<VideoDestaque key="video" material={videoDoSistema} escuro lado />] : []}
    >
      <div className="grid gap-6 desktop:grid-cols-2 desktop:items-start desktop:gap-8">
        {/* Mockup: notebook com tela do escritório e celular de campo sobreposto */}
        <div className="flex flex-col gap-6">
          <div data-palco-telas data-mockup className="landing-mockup landing-mockup-compacto">
            {computador ? <div className="landing-mockup-notebook"><TelaDoSistema tela={computador} /></div> : null}
            {celular ? <div className="landing-mockup-celular"><TelaDoSistema tela={celular} /></div> : null}
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="m-0 text-balance text-h3 font-extrabold leading-tight text-branco tablet:text-h2 tablet:leading-tight desktop:text-h3">
              {TEXTOS.funcionalidades.telasTitulo}
            </h3>

            {/* Legenda estruturada em cartões interativos */}
            <ul
              aria-label={TEXTOS.funcionalidades.telasRotulo}
              className="landing-mockup-legenda m-0 grid list-none gap-4 p-0 desktop:grid-cols-2"
            >
              {[computador, celular].map((tela) =>
                tela ? (
                  <li
                    key={tela.id}
                    data-legenda={tela.dispositivo}
                    className="flex items-center gap-4 rounded-card border border-branco/15 bg-navy/60 p-4 shadow-card"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex size-12 shrink-0 items-center justify-center rounded-controle border border-azul-royal/40 bg-azul-royal text-branco shadow-card"
                    >
                      <Icon name={tela.dispositivo === 'celular' ? 'entrega' : 'dashboard'} size={24} variant="negativa" />
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="text-legenda font-bold uppercase tracking-wider text-cinza-gelo">
                        {tela.dispositivo === 'celular' ? 'Em campo' : 'No escritório'}
                      </span>
                      <strong className="text-corpo font-bold leading-snug text-branco tablet:text-h3">
                        {tela.titulo}
                      </strong>
                    </span>
                  </li>
                ) : null,
              )}
            </ul>

            {/* CTA interativo para assistir ao protótipo */}
            <a
              href="#assistir-video-prototipo-sistema"
              className="group inline-flex min-h-alvo w-fit items-center gap-2 rounded-controle border border-branco bg-branco px-4 py-2 text-corpo font-bold text-navy no-underline shadow-dialogo transition-all duration-200 hover:bg-info-fundo hover:shadow-card motion-reduce:transition-none"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-azul-royal text-branco transition-transform duration-200 group-hover:scale-105">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span>{TEXTOS.funcionalidades.acaoVideo}</span>
            </a>
          </div>
        </div>

        {/* Garantias operacionais e sincronização */}
        <div
          data-resumo-operacional
          className="grid items-stretch gap-4 border-t border-branco/15 pt-6 desktop:grid-cols-2 desktop:border-t-0 desktop:pt-0"
        >
          <ul className="contents">
            {FUNCIONALIDADES.map((item) => (
              <li
                key={item.id}
                data-capacidade={item.id}
                className="flex flex-col justify-between gap-4 rounded-card border border-branco/15 bg-navy/80 p-6 shadow-card"
                data-revelar
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-2">
                    <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-controle border border-azul-royal/40 bg-azul-royal text-branco shadow-card">
                      <Icon name={item.icone} size={24} variant="negativa" />
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-branco/15 bg-branco/10 px-2 py-1 text-legenda font-bold uppercase tracking-wider text-cinza-gelo">
                      <span className="inline-block size-2 rounded-full bg-azul-ciano" aria-hidden="true" />
                      {item.id === 'offline' ? 'Operação local PWA' : 'Multi-tenant RLS'}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-col gap-2">
                    <h3 className="m-0 text-corpo font-bold leading-tight text-branco tablet:text-h3">{item.titulo}</h3>
                    <span className="landing-medida text-corpo leading-relaxed text-cinza-gelo">{item.texto}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Cartão de Sincronização em Segundo Plano com Prévia da Fila */}
          <div
            data-capacidade="sincronizacao"
            className="flex flex-col gap-4 rounded-card border border-branco/15 bg-navy/80 p-6 text-branco shadow-dialogo backdrop-blur-xs desktop:col-span-2"
            data-revelar
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-4">
                <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-controle border border-azul-royal/40 bg-azul-royal text-branco shadow-card">
                  <Icon name="sincronizar" size={24} variant="negativa" />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-legenda font-bold uppercase tracking-wider text-cinza-gelo">Guardado no aparelho</span>
                  <h3 className="m-0 text-corpo font-bold leading-tight text-branco tablet:text-h3">Sincronização em segundo plano</h3>
                </span>
              </div>
            </div>

            <PreviaDeFila compacto />

            <div className="flex items-center gap-2 rounded-controle border border-branco/10 bg-branco/5 p-4 text-corpo leading-relaxed text-cinza-gelo">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sucesso-fundo text-legenda font-bold text-verde-acessivel" aria-hidden="true">
                ✓
              </span>
              <span>
                A fila retoma o envio em ordem, sem duplicar registros, quando o sinal volta.
              </span>
            </div>
          </div>
        </div>
      </div>
    </Secao>
  );
}
