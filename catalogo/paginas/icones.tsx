import React from 'react';
import { Card, Icon } from '@/design-system';
import { ESTADOS, NOMES_POR_GRUPO, TAMANHOS, VARIANTES, type IconName } from '@/design-system/icons/tipos';

const ROTULO_DO_GRUPO: Record<keyof typeof NOMES_POR_GRUPO, string> = {
  rastreabilidade: 'Rastreabilidade',
  seguranca: 'Segurança',
  conectividade: 'Conectividade',
  'ativos-logistica': 'Ativos e logística',
  sistema: 'Sistema',
};

const ROTULO_DO_ESTADO = { padrao: 'Padrão', ativo: 'Ativo', desabilitado: 'Desabilitado', erro: 'Erro' } as const;
const ROTULO_DA_VARIANTE = { contorno: 'Contorno', duotone: 'Duotone', monocromatica: 'Monocromática', negativa: 'Negativa' } as const;

function Amostra({ legenda, children, escuro = false }: { legenda: string; children: React.ReactNode; escuro?: boolean }): React.JSX.Element {
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className={`flex min-h-12 items-center justify-center rounded-controle px-2 ${escuro ? 'bg-navy' : ''}`}>{children}</div>
      <figcaption className="text-legenda text-texto-secundario">{legenda}</figcaption>
    </figure>
  );
}

export function PaginaIcones(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h2 font-extrabold text-navy tablet:text-h1">Ícones</h1>
        <p className="max-w-padrao text-corpo text-grafite">
          Trinta ícones em cinco grupos, na grade de 24 por 24 px, com traço de 2 px, terminais arredondados e área segura de 2 px.
          Cada ícone aparece nos tamanhos 16, 24, 32 e 48 px, nos estados padrão, ativo, desabilitado e erro, e nas variantes
          contorno, duotone, monocromática e negativa. O estado ativo usa o verde escuro, com contraste de 3:1 sobre fundo claro.
        </p>
      </header>

      {(Object.entries(NOMES_POR_GRUPO) as Array<[keyof typeof NOMES_POR_GRUPO, readonly IconName[]]>).map(([grupo, nomes]) => (
        <section key={grupo} aria-labelledby={`grupo-${grupo}`} className="flex flex-col gap-4">
          <h2 id={`grupo-${grupo}`} className="text-h3 font-semibold text-navy">
            {ROTULO_DO_GRUPO[grupo]}
          </h2>
          <ul role="list" className="flex flex-col gap-4">
            {nomes.map((nome) => (
              <li key={nome}>
                <Card as="article" aria-labelledby={`icone-${nome}`} className="flex flex-col gap-4 p-4">
                  <h3 id={`icone-${nome}`} className="text-corpo font-semibold text-navy">
                    {nome}
                  </h3>
                  <div className="flex flex-wrap items-end gap-6">
                    <div className="flex flex-wrap items-end gap-4">
                      {TAMANHOS.map((tamanho) => (
                        <Amostra key={tamanho} legenda={`${tamanho} px`}>
                          <Icon name={nome} size={tamanho} />
                        </Amostra>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-end gap-4">
                      {ESTADOS.map((estado) => (
                        <Amostra key={estado} legenda={ROTULO_DO_ESTADO[estado]}>
                          <Icon name={nome} state={estado} />
                        </Amostra>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-end gap-4">
                      {VARIANTES.map((variante) => (
                        <Amostra key={variante} legenda={ROTULO_DA_VARIANTE[variante]} escuro={variante === 'negativa'}>
                          <Icon name={nome} variant={variante} />
                        </Amostra>
                      ))}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
