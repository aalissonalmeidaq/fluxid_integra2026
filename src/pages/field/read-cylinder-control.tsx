import React from 'react';
import { useAuth } from '@/app/auth/auth-context';
import { navigateInApp } from '@/app/registry/registry-navigation';
import { useTenant } from '@/app/tenant/tenant-context';
import { useOnlineStatus } from '@/app/use-online-status';
import type { ResolutionLike } from '@/domain/field/reading-result';
import type { ReadEvent } from './identifier-reader-dialog';
import { ReadCylinderButton } from './read-cylinder-button';
import { useFieldService } from './use-field-service';

// "Ler cilindro" ligado ao serviço de campo, à organização ativa e à conexão (Spec 009, US3). As telas de cilindros e de viagens o recebem
// como ação do cabeçalho. Sem serviço ou sem organização ativa, não aparece. Sessão expirada devolve a pessoa à entrada.
export function ReadCylinderControl(): React.JSX.Element | null {
  const fieldService = useFieldService();
  const { activeOrganizationId } = useTenant();
  const online = useOnlineStatus();
  const { logout } = useAuth();
  if (!fieldService || !activeOrganizationId) return null;
  const resolve = async (event: ReadEvent): Promise<ResolutionLike> => {
    const outcome = await fieldService.resolveIdentifier(activeOrganizationId, event.candidates, event.source === 'nfc' ? 'nfc_tag' : undefined);
    if (outcome.kind === 'session_expired') void logout();
    return outcome;
  };
  return <ReadCylinderButton resolve={resolve} onOpen={(cylinderId) => navigateInApp(`/cilindros/${cylinderId}`)} online={online} />;
}
