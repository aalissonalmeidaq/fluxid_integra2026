import { useSyncExternalStore } from 'react';

// Acompanha uma largura mínima de janela (por exemplo, o ponto de quebra do tablet). Sem `matchMedia` (testes em jsdom),
// assume a largura estreita.
export function useMinWidth(pixels: number): boolean {
  const query = `(min-width: ${pixels}px)`;
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      // Alguns navegadores (WebKit) atrasam ou omitem o `change` ao redimensionar a janela; o `resize` reavalia a consulta.
      window.addEventListener('resize', notify);
      return () => {
        list.removeEventListener('change', notify);
        window.removeEventListener('resize', notify);
      };
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}
