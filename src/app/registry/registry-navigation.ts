import { useSyncExternalStore } from 'react';

// Navegação dentro do app para os formulários em modal dos cadastros (Spec 007): abrir e fechar o modal troca só o endereço
// (`history`), sem recarregar a página; a lista ou o detalhe por trás continuam montados. O resto do app segue navegando por
// âncoras. O endereço continua valendo como link direto, e o botão Voltar do navegador fecha o modal.
const EVENT = 'fluxid:navigate';
const MODAL_MARK = 'fluxidModal';

export interface InAppNavigation {
  // Substitui a entrada atual do histórico em vez de acrescentar outra.
  replace?: boolean;
  // Marca a entrada como aberta de dentro do app: fechar o modal volta uma entrada em vez de ir para o endereço pai.
  modal?: boolean;
}

export function navigateInApp(path: string, options: InAppNavigation = {}): void {
  const state = options.modal ? { [MODAL_MARK]: true } : null;
  if (options.replace) window.history.replaceState(state, '', path);
  else window.history.pushState(state, '', path);
  window.dispatchEvent(new Event(EVENT));
}

// Fecha o modal: volta ao ponto de onde ele foi aberto; se foi aberto por link direto, vai ao endereço pai.
export function closeModal(parentPath: string): void {
  const state = window.history.state as Record<string, unknown> | null;
  if (state?.[MODAL_MARK] === true) window.history.back();
  else navigateInApp(parentPath, { replace: true });
}

const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener('popstate', notify);
  window.addEventListener(EVENT, notify);
  return () => {
    window.removeEventListener('popstate', notify);
    window.removeEventListener(EVENT, notify);
  };
};

// Endereço atual (caminho e consulta), atualizado a cada navegação interna ou do histórico.
export function useLocationKey(): string {
  return useSyncExternalStore(subscribe, () => `${window.location.pathname}${window.location.search}`, () => '/');
}

// O clique em âncora comum, sem teclas modificadoras e sem alvo externo, que o app pode tratar sem recarregar.
export function isPlainClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && (anchor.target === '' || anchor.target === '_self') && !anchor.hasAttribute('download') && anchor.origin === window.location.origin;
}
