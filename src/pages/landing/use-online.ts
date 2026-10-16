import { useSyncExternalStore } from 'react';

// Estado de conexão do aparelho (Spec 011, RNF-008): só para avisar, nos links externos, que eles precisam de conexão. Não faz chamada de
// rede, não tem fila e não decide nada além do aviso.
const assinar = (notificar: () => void): (() => void) => {
  window.addEventListener('online', notificar);
  window.addEventListener('offline', notificar);
  return () => {
    window.removeEventListener('online', notificar);
    window.removeEventListener('offline', notificar);
  };
};

export function useOnline(): boolean {
  return useSyncExternalStore(assinar, () => window.navigator.onLine, () => true);
}
