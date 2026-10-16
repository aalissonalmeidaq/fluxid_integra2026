import React from 'react';
import { useAuth } from '@/app/auth/auth-context';
import { VISAO_GERAL } from '@/domain/navigation/screens';

export interface LandingCtaProps {
  // "principal": botão verde (gaveta do menu no celular); "cabecalho": link discreto com contorno, sempre visível no topo (no celular só
  // "Entrar"/"Abrir", com o nome acessível completo); "contorno": botão com contorno branco (chamada final); "rodape": link de texto.
  variante?: 'principal' | 'cabecalho' | 'contorno' | 'rodape';
}

const ENTRAR = 'Entrar no sistema';
const ABRIR = 'Abrir o sistema';

const CLASSES: Record<NonNullable<LandingCtaProps['variante']>, string> = {
  principal:
    'inline-flex min-h-alvo items-center justify-center rounded-controle border border-verde-vivo bg-verde-vivo px-6 text-corpo font-bold text-navy no-underline cursor-pointer transition-colors hover:border-branco hover:bg-branco motion-reduce:transition-none',
  cabecalho:
    'inline-flex min-h-alvo items-center justify-center rounded-controle border border-branco px-4 text-corpo font-semibold text-branco no-underline transition-colors hover:bg-azul-profundo motion-reduce:transition-none',
  contorno:
    'inline-flex min-h-alvo items-center justify-center rounded-controle border border-branco px-6 text-corpo font-semibold text-branco no-underline transition-colors hover:bg-azul-profundo motion-reduce:transition-none',
  rodape: 'inline-flex min-h-alvo items-center rounded-controle px-2 text-corpo font-semibold text-branco underline-offset-4 hover:underline',
};

// Botão de entrada da landing (Spec 011, RF-003): lê só o estado da sessão, sem chamada ao servidor. Quem tem sessão abre a Visão geral em
// um toque; os demais (inclusive enquanto a sessão é verificada) vão ao login. Depois da crítica de 14/10/2026 ele deixou de ser a ação
// principal da página (o público é quem ainda não tem conta) e fica sempre visível no cabeçalho, discreto. O rótulo mais longo fica
// reservado (invisível), para a troca "Entrar" e "Abrir" não deslocar o layout.
export function LandingCta({ variante = 'principal' }: LandingCtaProps): React.JSX.Element {
  const authenticated = useAuth().state.status === 'authenticated';
  const rotulo = authenticated ? ABRIR : ENTRAR;
  if (variante === 'cabecalho') {
    return (
      <a href={authenticated ? VISAO_GERAL : '/login'} aria-label={rotulo} className={CLASSES.cabecalho} data-variante={variante}>
        <span className="tablet:hidden">{authenticated ? 'Abrir' : 'Entrar'}</span>
        <span className="hidden tablet:inline">{rotulo}</span>
      </a>
    );
  }
  return (
    <a href={authenticated ? VISAO_GERAL : '/login'} className={CLASSES[variante]} data-variante={variante}>
      <span className="grid">
        <span className="col-start-1 row-start-1 text-center">{rotulo}</span>
        <span data-reserva aria-hidden="true" className="invisible col-start-1 row-start-1 h-0 overflow-hidden text-center">{ENTRAR}</span>
      </span>
    </a>
  );
}
