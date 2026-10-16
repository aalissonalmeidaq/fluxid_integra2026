import React from 'react';
import { Logo } from '@/design-system';
import { LandingCta } from './landing-cta';
import { TEXTOS } from './landing-content';

// Rodapé da landing (Spec 011): identificação do projeto e links internos. Sem formulário, sem rastreador e sem recurso de terceiros.
export function LandingFooter(): React.JSX.Element {
  return (
    <footer data-fundo="escuro" className="landing-escuro flex flex-col gap-6 bg-navy px-4 py-12 text-branco tablet:px-6 desktop:px-8">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <Logo variant="negativa-branca" width={160} className="h-auto" />
        <ul className="m-0 flex list-none flex-wrap items-center gap-4 p-0">
          <li>
            <a href="#inicio" className="inline-flex min-h-alvo items-center rounded-controle px-2 text-corpo font-semibold text-branco underline-offset-4 hover:underline">Voltar ao topo</a>
          </li>
          <li>
            <LandingCta variante="rodape" />
          </li>
        </ul>
      </div>
      <p className="m-0 text-corpo text-branco">{TEXTOS.rodape.identificacao}</p>
      <p className="m-0 text-legenda text-branco">{TEXTOS.rodape.nota}</p>
    </footer>
  );
}
