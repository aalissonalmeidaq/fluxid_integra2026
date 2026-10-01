import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/app/auth/auth-context';
import { isProtectedAccessAllowed } from '@/domain/identity/session';
import { LoginPage } from '@/pages/auth/login-page';
import { MfaPage } from '@/pages/auth/mfa-page';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  // Resultado da autorização atual (RBAC); negado por padrão quando não comprovado.
  allowed?: boolean;
  // Rotas globais ou críticas exigem AAL2 comprovado pela sessão.
  requireAal2?: boolean;
}

function AccessDenied(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-rose-400 bg-rose-50 p-4 text-rose-950 outline-none focus-visible:ring-2 focus-visible:ring-rose-800"
    >
      <h2 className="text-lg font-semibold">Acesso negado</h2>
      <p className="mt-1 text-sm">Você não tem autorização para ver esta área. Se precisar de acesso, fale com o administrador da sua organização.</p>
    </div>
  );
}

// A interface só decide a experiência: nenhum dado protegido é entregue sem a sessão e a autorização
// confirmadas na fronteira confiável, e a decisão definitiva continua sendo do servidor (RS-003).
export function ProtectedRoute({ children, allowed = true, requireAal2 = false }: ProtectedRouteProps): React.JSX.Element {
  const { state } = useAuth();

  if (state.status === 'checking') {
    return <p role="status" aria-busy="true" aria-live="polite" className="p-4 text-sm">Verificando sua sessão…</p>;
  }
  if (state.status === 'signed_out') return <LoginPage />;
  if (state.status === 'mfa_required') return <MfaPage />;
  if (requireAal2 && !isProtectedAccessAllowed(state, { requireAal2: true })) return <MfaPage />;
  if (!allowed) return <AccessDenied />;
  return <>{children}</>;
}
