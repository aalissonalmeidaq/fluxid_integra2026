import { useEffect, type RefObject } from 'react';

// A navegação do aplicativo é por carga de página, então o foco precisa sobreviver à troca de tela: ao ativar um item do menu
// a origem deixa um aviso curto na aba, e a tela de destino leva o foco ao título (RF-013, RA-006). Só o menu usa isso;
// carregar a página por outro caminho não move o foco.
const KEY = 'fluxid.menu-navegacao';
const VALID_MS = 10_000;
const WAIT_MS = 5_000;

export function markMenuNavigation(): void {
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* sem armazenamento: o foco simplesmente não é movido */ }
}

function pending(): boolean {
  try {
    const at = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < VALID_MS;
  } catch {
    return false;
  }
}

function clear(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignorado */ }
}

// Leva o foco ao primeiro título (`h2`) da área principal assim que ele existir, uma única vez por navegação pelo menu.
export function useFocusTitleAfterMenuNavigation(main: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const area = main.current;
    if (!area || !pending()) return;
    const focusTitle = (): boolean => {
      const title = area.querySelector<HTMLElement>('h2');
      if (!title) return false;
      title.tabIndex = -1;
      title.focus();
      clear();
      return true;
    };
    if (focusTitle()) return;
    const observer = new MutationObserver(() => { if (focusTitle()) observer.disconnect(); });
    observer.observe(area, { childList: true, subtree: true });
    const timer = setTimeout(() => { observer.disconnect(); clear(); }, WAIT_MS);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [main]);
}
