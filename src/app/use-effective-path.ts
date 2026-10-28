import { useEffect } from 'react';
import { VISAO_GERAL } from '@/domain/navigation/screens';
import { useAuth } from './auth/auth-context';

// Endereço que a tela realmente representa (Spec 011). Dois casos levam a Visão geral para o seu endereço próprio:
// - quem autentica em "/login" continua vendo a Visão geral (o app só troca o conteúdo), então a URL passa a "/visao-geral", para o
//   menu marcar a tela atual e o recarregamento voltar para ela;
// - o aplicativo instalado (display-mode: standalone) nunca abre a landing: instalações feitas antes da Spec 011 ainda iniciam em "/".
//   A casca Android (Spec 015) também é app instalado: abre direto na entrada.
export function resolveEffectivePath(pathname: string, authenticated: boolean, installed: boolean): string {
  if (pathname === '/' && installed) return VISAO_GERAL;
  if (pathname === '/login' && authenticated) return VISAO_GERAL;
  return pathname;
}

// A casca nativa publica `window.Capacitor` antes do aplicativo carregar. Lê-se o global para não levar o pacote do Capacitor ao
// carregamento inicial da landing e da entrada (orçamento do pacote de entrada da Spec 011).
const nativeShell = (): boolean =>
  (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;

export function isInstalledApp(
  env?: { matchMedia: ((query: string) => MediaQueryList) | undefined; native: boolean },
): boolean {
  const { matchMedia, native } = env ?? {
    matchMedia: typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined, native: nativeShell(),
  };
  return native || (matchMedia?.('(display-mode: standalone)').matches ?? false);
}

// Devolve o caminho efetivo e, quando ele difere da barra de endereço, troca a URL sem recarregar nem criar entrada de histórico.
export function useEffectivePath(): string {
  const authenticated = useAuth().state.status === 'authenticated';
  const current = window.location.pathname;
  const effective = resolveEffectivePath(current, authenticated, isInstalledApp());
  useEffect(() => {
    if (effective !== window.location.pathname) window.history.replaceState(window.history.state, '', effective + window.location.search + window.location.hash);
  }, [effective]);
  return effective;
}
