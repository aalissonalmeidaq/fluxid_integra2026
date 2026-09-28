import React from 'react';
import { useConnectivity } from './connectivity-context';
import { usePwaInstall } from './use-pwa-install';
import { useOnlineStatus } from './use-online-status';
import { ConnectivityStatus } from '@/components/system/ConnectivityStatus';

export function App(): React.JSX.Element {
  const { result, reconnect } = useConnectivity();
  const { isInstallable, promptInstall } = usePwaInstall();
  const isOnline = useOnlineStatus();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col w-full selection:bg-emerald-500 selection:text-white">
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-600 text-slate-950 px-4 py-2 text-center text-xs font-semibold tracking-wide flex items-center justify-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" aria-hidden="true" />
          <span>Dispositivo sem conexão de rede. Modo offline em operação.</span>
        </div>
      )}

      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" width="28" height="28" className="rounded-lg shadow-sm" />
          <h1 className="text-xl font-bold tracking-tight text-white">FluxID</h1>
        </div>

        <div className="flex items-center gap-3">
          {isInstallable && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
            >
              <span>Instalar App</span>
            </button>
          )}

          <ConnectivityStatus result={result} onReconnect={reconnect} />
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full" id="main-content">
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-slate-100 mb-2">Fundação Técnica Ativa</h2>
          <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
            A infraestrutura base do FluxID está operando com resolução determinística de conectividade,
            proteção contra exposição de credenciais e conformidade PWA. Nenhuma regra de negócio ou cadastro
            de domínio foi carregado nesta etapa.
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-900 px-4 py-3 sm:px-6 text-center text-xs text-slate-600">
        FluxID &copy; 2026 &mdash; Plataforma de Identidade e Rastreabilidade
      </footer>
    </div>
  );
}

export default App;
