import React from 'react';
import { Card, Icon, Simbolo } from '@/design-system';
import { LARGURA_MINIMA_DIGITAL, TAMANHOS_DO_SIMBOLO } from '@/design-system/brand/constantes';
import { LOGO_NEGATIVA_NAVY, VARIACOES_DO_CATALOGO } from '@/design-system/brand/logo-variacoes';
import horizontal from '@/design-system/brand/oficial/logo-horizontal.svg';
import negativaBranca from '@/design-system/brand/oficial/logo-negativa-branca.svg';
import principal from '@/design-system/brand/oficial/logo-principal.svg';

const FUNDOS_APROVADOS: ReadonlyArray<{ nome: string; classe: string; arquivo: string }> = [
  { nome: 'Fundo branco', classe: 'bg-branco', arquivo: principal },
  { nome: 'Fundo azul', classe: 'bg-azul-royal', arquivo: negativaBranca },
  { nome: 'Fundo navy', classe: 'bg-navy', arquivo: LOGO_NEGATIVA_NAVY },
  { nome: 'Fundo cinza-gelo', classe: 'bg-cinza-gelo', arquivo: principal },
];

const ORIGEM: Record<'oficial' | 'derivada', string> = {
  oficial: 'Arquivo oficial da marca.',
  derivada: 'Derivada do arquivo oficial, sem redesenho.',
};

// Imagem decorativa dos usos incorretos: o texto "Não ..." ao lado explica o que está errado.
function Amostra({ arquivo, largura, alt = '' }: { arquivo: string; largura: number; alt?: string }): React.JSX.Element {
  return <img src={arquivo} alt={alt} width={largura} />;
}

function UsoIncorreto({ titulo, children }: { titulo: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <li>
      <Card className="flex h-full flex-col gap-4 p-4">
        <div className="flex min-h-16 items-center justify-center overflow-hidden rounded-controle bg-cinza-gelo p-2">{children}</div>
        <p className="flex items-center gap-2 text-corpo font-semibold text-erro">
          <Icon name="alerta" variant="monocromatica" />
          <span>{titulo}</span>
        </p>
      </Card>
    </li>
  );
}

export function PaginaLogotipo(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h2 font-extrabold text-navy tablet:text-h1">Logotipo</h1>
        <p className="max-w-padrao text-corpo text-grafite">
          Arquivos oficiais da equipe de marca, hospedados no aplicativo. As versões que a marca não enviou como arquivo próprio
          (horizontal sem slogan, wordmark, monocromática azul e escala de cinza) são derivadas dos oficiais
          apenas removendo elementos ou trocando a cor, nunca redesenhando. O símbolo e o favicon são exatamente o icone.svg oficial, em todos os tamanhos. O logotipo é isento da exigência de contraste de
          texto da WCAG.
        </p>
      </header>

      <section aria-labelledby="versoes" className="flex flex-col gap-4">
        <h2 id="versoes" className="text-h3 font-semibold text-navy">
          Versões
        </h2>
        <ul role="list" className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          {VARIACOES_DO_CATALOGO.map((variacao) => (
            <li key={variacao.nome}>
              <Card as="article" aria-labelledby={`versao-${variacao.nome}`} className="flex h-full flex-col gap-4 p-4">
                <div className="flex flex-col gap-1">
                  <h3 id={`versao-${variacao.nome}`} className="text-corpo font-semibold text-navy">
                    {variacao.nome}
                  </h3>
                  <p className="text-legenda text-texto-secundario">
                    {variacao.descricao} {variacao.usadaNoApp ? 'Usada no aplicativo.' : 'Só no catálogo.'} {ORIGEM[variacao.origem]}
                  </p>
                </div>
                <div className={`flex min-h-16 items-center justify-center rounded-controle p-4 ${variacao.fundo === 'navy' ? 'bg-navy' : 'border border-borda-suave bg-branco'}`}>
                  {variacao.larguraNoCatalogo > 0 ? (
                    <Amostra arquivo={variacao.arquivo} largura={variacao.larguraNoCatalogo} alt="FluxID" />
                  ) : (
                    <div className="flex flex-wrap items-end justify-center gap-4">
                      {TAMANHOS_DO_SIMBOLO.map((tamanho) => (
                        <figure key={tamanho} className="flex flex-col items-center gap-1">
                          <Simbolo size={tamanho} />
                          <figcaption className="text-legenda text-texto-secundario">{tamanho} px</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="fundos" className="flex flex-col gap-4">
        <h2 id="fundos" className="text-h3 font-semibold text-navy">
          Fundos aprovados
        </h2>
        <ul role="list" className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          {FUNDOS_APROVADOS.map((fundo) => (
            <li key={fundo.nome} className="flex flex-col gap-2">
              <div className={`flex min-h-16 items-center justify-center rounded-card border border-borda-suave p-4 ${fundo.classe}`}>
                <Amostra arquivo={fundo.arquivo} largura={200} />
              </div>
              <p className="text-corpo text-grafite">{fundo.nome}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="protecao" className="flex flex-col gap-4">
        <h2 id="protecao" className="text-h3 font-semibold text-navy">
          Área de proteção e redução mínima
        </h2>
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <p className="text-corpo font-semibold text-navy">Área de proteção</p>
            <div className="self-start border border-dashed border-azul-royal p-8">
              <Amostra arquivo={principal} largura={240} />
            </div>
            <p className="text-legenda text-texto-secundario">Mantenha livre ao redor do logotipo uma margem equivalente à altura da letra "I" do lettering.</p>
          </Card>
          <Card className="flex flex-col gap-4">
            <p className="text-corpo font-semibold text-navy">Redução mínima digital: {LARGURA_MINIMA_DIGITAL} px de largura</p>
            <div className="self-start">
              <Amostra arquivo={horizontal} largura={LARGURA_MINIMA_DIGITAL} />
            </div>
            <p className="text-legenda text-texto-secundario">O componente recusa larguras menores. Impresso: 30 mm.</p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="incorretos" className="flex flex-col gap-4">
        <h2 id="incorretos" className="text-h3 font-semibold text-navy">
          Usos incorretos
        </h2>
        <ul role="list" className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
          <UsoIncorreto titulo="Não distorcer">
            <div style={{ transform: 'scale(1.25, 0.7)' }}>
              <Amostra arquivo={horizontal} largura={180} />
            </div>
          </UsoIncorreto>
          <UsoIncorreto titulo="Não alterar as cores">
            <div style={{ filter: 'hue-rotate(150deg)' }}>
              <Amostra arquivo={horizontal} largura={180} />
            </div>
          </UsoIncorreto>
          <UsoIncorreto titulo="Não girar">
            <div style={{ transform: 'rotate(-14deg)' }}>
              <Amostra arquivo={horizontal} largura={180} />
            </div>
          </UsoIncorreto>
          <UsoIncorreto titulo="Não aplicar sombras">
            <div style={{ filter: 'drop-shadow(4px 6px 3px var(--color-navy))' }}>
              <Amostra arquivo={horizontal} largura={180} />
            </div>
          </UsoIncorreto>
          <UsoIncorreto titulo="Não trocar a tipografia">
            <div className="flex items-center gap-2">
              <Simbolo size={48} decorative />
              <span style={{ fontFamily: 'serif', fontStyle: 'italic', fontWeight: 700, fontSize: 32 }} className="text-azul-profundo">
                FluxID
              </span>
            </div>
          </UsoIncorreto>
        </ul>
      </section>
    </div>
  );
}
