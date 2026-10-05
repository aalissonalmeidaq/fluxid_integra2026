import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ProfileService } from '@/application/identity/profile-service';
import { Button, Icon } from '@/design-system';
import { createProfilePorts } from '@/infrastructure/supabase/profile-adapter';
import { useAuth } from '../auth/auth-context';
import { useConnectivity } from '../connectivity-context';
import { useTenant } from '../tenant/tenant-context';
import { markMenuNavigation } from './menu-navigation-focus';

const FALLBACK_NAME = 'Minha conta';

export interface UserMenuProps {
  // Serviço de perfil. Sem a propriedade, vale o serviço da conexão ativa; `null` indica que não há como ler o perfil.
  service?: ProfileService | null;
}

// Menu da pessoa na barra superior (RF-022): botão de divulgação (aria-expanded e aria-controls), não role="menu", para o
// Tab natural percorrer os itens. O nome de exibição é lido só ao abrir; falha ou demora mostram "Minha conta" e nunca
// bloqueiam "Meu perfil" nem "Sair". Escape e clique fora fecham e devolvem o foco ao botão.
export function UserMenu({ service: provided }: UserMenuProps): React.JSX.Element {
  const { logout } = useAuth();
  const { selection } = useTenant();
  const { client, config, result } = useConnectivity();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const built = useMemo(() => (endpoint && client ? new ProfileService(createProfilePorts(endpoint, client)) : null), [client, endpoint]);
  const service = provided === undefined ? built : provided;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !service) return;
    let current = true;
    void service.load().then((outcome) => {
      if (current) setName(outcome.kind === 'success' ? outcome.value.displayName : null);
    });
    return () => { current = false; };
  }, [open, service]);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); buttonRef.current?.focus(); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const onOutsideClick = (event: Event) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onOutsideClick, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onOutsideClick, true);
    };
  }, [open]);

  const organization = selection.kind === 'selected' ? selection.option.displayName : null;
  const displayName = name ?? FALLBACK_NAME;

  return (
    <div ref={rootRef} className="relative">
      <Button ref={buttonRef} variant="secundario" aria-expanded={open} aria-controls={panelId} aria-label={FALLBACK_NAME} onClick={() => setOpen((value) => !value)}>
        <Icon name="usuario" size={24} variant="monocromatica" />
        <span className="hidden tablet:inline">{FALLBACK_NAME}</span>
      </Button>
      {open && (
        <div
          id={panelId}
          // 256 px, ou a largura da janela menos as margens em telas estreitas; sem token de largura para painéis.
          style={{ width: 'min(256px, calc(100vw - 32px))' }}
          className="absolute end-0 top-full z-10 mt-2 flex flex-col gap-2 rounded-card border border-borda-suave bg-branco p-4 shadow-dialogo"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span title={displayName} className="truncate text-corpo font-semibold text-navy">{displayName}</span>
            {organization && <span className="break-words text-legenda text-grafite">{organization}</span>}
          </div>
          <a
            href="/perfil"
            onClick={markMenuNavigation}
            className="flex min-h-alvo items-center rounded-controle px-4 text-corpo font-medium text-azul-profundo hover:bg-info-fundo"
          >
            Meu perfil
          </a>
          <Button variant="secundario" onClick={() => void logout()} className="w-full">Sair</Button>
        </div>
      )}
    </div>
  );
}
