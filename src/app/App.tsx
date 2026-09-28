import React from 'react';
import { useConnectivity } from './connectivity-context';
import { usePwaInstall } from './use-pwa-install';
import { useOnlineStatus } from './use-online-status';
import { ConnectivityStatus } from '@/components/system/ConnectivityStatus';

export function App(): React.JSX.Element {
  const { result, reconnect } = useConnectivity();
  const { isInstallable, promptInstall } = usePwaInstall();
  const isOnline = useOnlineStatus();

  const focusMainContent = (): void => {
    document.getElementById('main-content')?.focus();
  };

  return (
    <div className="min-h-screen bg-[#F3F7FA] text-[#26384A] flex flex-col w-full selection:bg-[#1766D9] selection:text-white">
      <a
        href="#main-content"
        tabIndex={0}
        onClick={focusMainContent}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-[#163B72] focus:outline-none focus:ring-2 focus:ring-[#1766D9]"
      >
        Pular para o conteúdo principal
      </a>
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-300 text-[#26384A] px-4 py-2 text-center text-xs font-semibold tracking-wide flex items-center justify-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-[#26384A] animate-ping motion-reduce:animate-none" aria-hidden="true" />
          <span>Dispositivo sem conexão de rede. Modo offline em operação.</span>
        </div>
      )}

      <header className="border-b border-[#D7E2EE] bg-white px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" width="28" height="28" className="rounded-lg shadow-sm" />
          <h1 className="text-xl font-bold tracking-tight text-[#163B72]">FluxID</h1>
        </div>

        <div className="flex items-center gap-3">
          {isInstallable && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#159B19] hover:bg-[#37D20A] text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#1766D9] focus-visible:outline-none"
            >
              <span>Instalar App</span>
            </button>
          )}

          <ConnectivityStatus result={result} onReconnect={reconnect} />
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full" id="main-content" tabIndex={-1}>
        <div className="rounded-xl border border-[#D7E2EE] bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-[#163B72] mb-2">Fundação Técnica Ativa</h2>
          <p className="text-sm text-[#26384A] leading-relaxed max-w-2xl">
            A infraestrutura base do FluxID está operando com resolução determinística de conectividade,
            proteção contra exposição de credenciais e conformidade PWA. Nenhuma regra de negócio ou cadastro
            de domínio foi carregado nesta etapa.
          </p>
        </div>
      </main>

      <footer className="border-t border-[#D7E2EE] px-4 py-3 sm:px-6 text-center text-xs text-[#26384A]">
        FluxID &copy; 2026 &mdash; Plataforma de Identidade e Rastreabilidade de Cilindros
      </footer>
    </div>
  );
}

export default App;
