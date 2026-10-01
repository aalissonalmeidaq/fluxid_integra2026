import React from 'react';
import ReactDOM from 'react-dom/client';
import { Providers } from './app/providers';
import { App } from './app/App';
import { InitializationGate } from './app/initialization-gate';
import { AuthProvider } from './app/auth/auth-provider';
import { SyncGate } from './app/sync-gate';
import { TenantProvider } from './app/tenant/tenant-provider';
import { PermissionsProvider } from './app/navigation/permissions-provider';
import './styles/globals.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Providers>
        <InitializationGate>
          <AuthProvider>
            <TenantProvider>
              <PermissionsProvider>
                <SyncGate>
                  <App />
                </SyncGate>
              </PermissionsProvider>
            </TenantProvider>
          </AuthProvider>
        </InitializationGate>
      </Providers>
    </React.StrictMode>
  );
}
