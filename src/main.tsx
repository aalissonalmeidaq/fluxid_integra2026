import React from 'react';
import ReactDOM from 'react-dom/client';
import { Providers } from './app/providers';
import { App } from './app/App';
import { InitializationGate } from './app/initialization-gate';
import { AuthProvider } from './app/auth/auth-provider';
import { SyncGate } from './app/sync-gate';
import { TenantProvider } from './app/tenant/tenant-provider';
import { PermissionsProvider } from './app/navigation/permissions-provider';
import { OfflineFieldProvider } from './app/field/offline-field-provider';
import { FieldSyncProvider } from './app/field/field-sync-provider';
import { OfflineAccessRecorder } from './app/auth/offline-access-recorder';
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
                <OfflineAccessRecorder />
                <OfflineFieldProvider>
                  <FieldSyncProvider>
                    <SyncGate>
                      <App />
                    </SyncGate>
                  </FieldSyncProvider>
                </OfflineFieldProvider>
              </PermissionsProvider>
            </TenantProvider>
          </AuthProvider>
        </InitializationGate>
      </Providers>
    </React.StrictMode>
  );
}
