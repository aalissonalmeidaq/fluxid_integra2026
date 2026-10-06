import React from 'react';
import { usePermissions } from '@/app/navigation/permissions-context';
import { ErrorState, Loading } from '@/design-system';

export interface AccessGateProps {
  // Código de permissão do tenant exigido pela tela (RF-039). A decisão final de cada ação continua sendo do servidor.
  permission: string;
  children: React.ReactNode;
}

// Portão de acesso de tela: só renderiza o conteúdo depois que a consulta de permissões ao servidor (Spec 004) confirma o código.
// Sem confirmação, sem permissão ou com falha, o conteúdo protegido não é montado (spec, história 1, cenário 5).
export function AccessGate({ permission, children }: AccessGateProps): React.JSX.Element {
  const { status, permissions, retry } = usePermissions();

  if (status === 'loading') return <Loading variant="pagina" busy label="Verificando permissões…" />;
  if (status === 'error') {
    return <ErrorState title="Não foi possível verificar suas permissões" message="Tente novamente em instantes." onRetry={retry} />;
  }
  if (permissions === null) {
    return <ErrorState variant="sem-permissao" title="Sem conexão" message="Sem conexão, não foi possível confirmar suas permissões. Conecte-se e abra a tela de novo." />;
  }
  if (!permissions.tenant.includes(permission)) {
    return <ErrorState variant="sem-permissao" title="Acesso negado" message="Você não tem permissão para usar esta tela. Fale com a pessoa que administra a sua organização." />;
  }
  return <>{children}</>;
}
