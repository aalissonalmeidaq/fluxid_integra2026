import { useCallback, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
}

// O navegador dispara `beforeinstallprompt` uma única vez, logo no carregamento. Cada tela (entrada, barra superior) monta o seu
// próprio hook em momentos diferentes; se o convite fosse guardado por componente, ele se perderia ao sair da entrada e o botão
// "Instalar App" nunca apareceria depois do login. Por isso o convite fica num armazenamento do módulo, ouvido desde o início.
let state: InstallState = { deferredPrompt: null, isInstalled: false };
const listeners = new Set<() => void>();

function update(next: Partial<InstallState>): void {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function handleBeforeInstall(event: Event): void {
  event.preventDefault();
  update({ deferredPrompt: event as BeforeInstallPromptEvent });
}

function handleAppInstalled(): void {
  update({ isInstalled: true, deferredPrompt: null });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', handleBeforeInstall);
  window.addEventListener('appinstalled', handleAppInstalled);
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSnapshot = (): InstallState => state;

// Só para os testes: volta ao estado inicial entre um caso e outro.
export function resetPwaInstallForTests(): void {
  update({ deferredPrompt: null, isInstalled: false });
}

export function usePwaInstall(): {
  isInstallable: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<void>;
} {
  const { deferredPrompt, isInstalled } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const promptInstall = useCallback(async () => {
    const pending = state.deferredPrompt;
    if (!pending) return;
    await pending.prompt();
    const choice = await pending.userChoice;
    // O convite só vale uma vez, aceito ou não.
    update(choice.outcome === 'accepted' ? { isInstalled: true, deferredPrompt: null } : { deferredPrompt: null });
  }, []);

  return {
    isInstallable: !!deferredPrompt && !isInstalled,
    isInstalled,
    promptInstall,
  };
}
