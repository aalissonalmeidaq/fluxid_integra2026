import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { ResolutionResult } from '@/infrastructure/supabase/connection-state';
import { validateEnvironment, AppConfig } from '@/config/environment';
import { resolveCloudFirst } from '@/infrastructure/connectivity/cloud-first-connection-resolver';
import { createSelectedClient } from '@/infrastructure/supabase/client-factory';
import {
  classifyOperationalError,
  isFallbackAllowed,
  OperationalErrorMetadata,
} from '@/infrastructure/supabase/failure-classifier';
import {
  ConnectivityContext,
  initialResult,
} from './connectivity-context';

export interface ProvidersProps {
  children: React.ReactNode;
  customEnv?: Record<string, string | undefined>;
}

export function Providers({ children, customEnv }: ProvidersProps): React.JSX.Element {
  const [result, setResult] = useState<ResolutionResult>(initialResult);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const isMountedRef = useRef(true);
  const resolutionAbortRef = useRef<AbortController | null>(null);

  const initConnection = useCallback(async () => {
    const envSource = customEnv ?? (typeof import.meta !== 'undefined' ? import.meta.env : {});
    const validation = validateEnvironment(envSource as Record<string, string | undefined>);

    if (!isMountedRef.current) return;

    if (!validation.success) {
      setResult({
        state: 'blocked',
        attempts: [],
      });
      setClient(null);
      setConfig(null);
      return;
    }

    const appConfig = validation.config;
    setConfig(appConfig);
    setClient(null);
    setResult({ state: 'probing', attempts: [] });

    try {
      // Uma nova resolução cancela a anterior; o resolvedor garante exclusão mútua.
      resolutionAbortRef.current?.abort();
      const controller = new AbortController();
      resolutionAbortRef.current = controller;
      const resolved = await resolveCloudFirst({
        mode: appConfig.connectionMode,
        contractVersion: appConfig.contractVersion,
        probeTimeoutMs: appConfig.probeTimeoutMs,
        endpoints: appConfig.endpoints,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const timestamp = Date.now();
      const res: ResolutionResult = {
        // Em modo explícito o destino escolhido é o esperado; degradação só existe no automático.
        state: resolved.state === 'cancelled'
          ? 'offline'
          : resolved.state === 'degraded' && appConfig.connectionMode !== 'auto' ? 'connected' : resolved.state,
        ...('selectedEndpoint' in resolved ? { selectedEndpoint: resolved.selectedEndpoint } : {}),
        attempts: resolved.attempts.map((attempt) => ({
          endpoint: attempt.endpoint,
          startedAt: timestamp,
          durationMs: 0,
          outcome: attempt.outcome,
        })),
      };
      if (!isMountedRef.current) return;

      setResult(res);

      if (res.state === 'connected' || res.state === 'degraded') {
        const newClient = createSelectedClient(res, appConfig);
        setClient(newClient);
      } else {
        setClient(null);
      }
    } catch {
      if (!isMountedRef.current) return;
      setResult({ state: 'blocked', attempts: [] });
      setClient(null);
    }
  }, [customEnv]);

  const reportOperationalError = useCallback((metadata: OperationalErrorMetadata) => {
    const failure = classifyOperationalError(metadata);
    const nextState = isFallbackAllowed(failure) ? 'offline' : 'blocked';

    setClient(null);
    setResult((prev) => ({
      state: nextState,
      ...(nextState === 'blocked' && prev.selectedEndpoint
        ? { selectedEndpoint: prev.selectedEndpoint }
        : {}),
      attempts: [
        ...prev.attempts,
        ...(prev.selectedEndpoint
          ? [
              {
                endpoint: prev.selectedEndpoint,
                startedAt: Date.now(),
                durationMs: 0,
                outcome: failure,
                ...(metadata.statusCode !== undefined
                  ? { statusCode: metadata.statusCode }
                  : {}),
              },
            ]
          : []),
      ],
    }));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      void initConnection();
    }, 0);

    return () => {
      isMountedRef.current = false;
      resolutionAbortRef.current?.abort();
      clearTimeout(timer);
    };
  }, [initConnection]);

  return (
    <ConnectivityContext.Provider
      value={{
        result,
        client,
        config,
        reconnect: initConnection,
        reportOperationalError,
      }}
    >
      {children}
    </ConnectivityContext.Provider>
  );
}
