import React from 'react';
import { hrefDoContato } from '../contato';
import { TEXTOS } from '../landing-content';

const BOTAO = {
  // Sobre navy, a ação principal da landing é verde (exceção registrada no DESIGN.md); sobre fundo claro, o primário do sistema.
  escuro: 'border-verde-vivo bg-verde-vivo text-navy hover:border-branco hover:bg-branco',
  claro: 'border-azul-profundo bg-azul-profundo text-branco hover:border-navy hover:bg-navy',
} as const;

// Contato para começar um piloto (crítica de 15/10/2026): o próximo passo de quem decide. Abre o e-mail da equipe com o assunto pronto, e o
// endereço fica escrito ao lado, para quem não tem um programa de e-mail configurado poder copiar.
export function ContatoPiloto({ tema }: { tema: 'escuro' | 'claro' }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <a
        href={hrefDoContato()}
        className={['inline-flex min-h-alvo items-center justify-center rounded-controle border px-6 text-corpo font-bold no-underline transition-colors motion-reduce:transition-none', BOTAO[tema]].join(' ')}
      >
        {TEXTOS.contato.acao}
      </a>
      <p className={['m-0 text-corpo', tema === 'escuro' ? 'text-cinza-gelo' : 'text-texto-secundario'].join(' ')}>
        {TEXTOS.contato.alternativa}{' '}
        <span className={['select-all font-semibold', tema === 'escuro' ? 'text-branco' : 'text-grafite'].join(' ')}>{TEXTOS.contato.email}</span>
      </p>
    </div>
  );
}
