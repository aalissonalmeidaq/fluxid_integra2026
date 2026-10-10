import React, { useEffect, useRef } from 'react';
import { Alert } from '@/design-system/components/alert';
import { Button } from '@/design-system/components/button';
import { Logo } from '@/design-system/brand/logo';
import { Loading } from '@/design-system/components/loading';
import { VisuallyHidden } from '@/design-system/components/visually-hidden';
import { Icon } from '@/design-system/icons/icon';
import type { IconName } from '@/design-system/icons/tipos';
import { pontosDeQuebra } from '@/design-system/tokens';
import { visibleScreens } from '@/domain/navigation/visible-screens';
import { useAuth } from '../auth/auth-context';
import { usePermissions } from '../navigation/permissions-context';
import { useMinWidth } from '../use-min-width';
import { markMenuNavigation } from './menu-navigation-focus';

export const MENU_ID = 'menu-principal';

// Ícones do catálogo da Spec 003; nenhum ícone novo (RF-010).
const ICONS: Record<string, IconName> = {
  inicio: 'dashboard',
  cilindros: 'cilindro',
  'entrada-estoque': 'inventario',
  clientes: 'entrega',
  geocercas: 'geocerca',
  veiculos: 'caminhao',
  motoristas: 'rota',
  viagens: 'localizacao',
  perfil: 'usuario',
  membros: 'rede',
  papeis: 'escudo',
  auditoria: 'historico',
  organizacoes: 'armazem',
  'auditoria-global': 'relatorios',
};

export interface NavigationMenuProps {
  // Abaixo de 768 px o painel abre e fecha; a partir de 768 px ele é sempre visível, e `open` não tem efeito visual.
  open: boolean;
  onClose: () => void;
  // Botão que abre o painel: recebe o foco quando o painel fecha por Escape ou por toque fora dele.
  toggleRef?: React.RefObject<HTMLButtonElement | null>;
}

const linkClass =
  'flex min-h-alvo min-w-0 items-center gap-2 break-words rounded-controle border-l-4 px-4 py-2 text-corpo text-azul-profundo hover:bg-info-fundo';
const currentClass = 'border-azul-profundo bg-info-fundo font-bold';

// Menu de navegação: mostra só as telas que as permissões confirmadas pelo servidor liberam. É conveniência de interface,
// nunca barreira: o servidor decide o acesso a cada tela (RN-001). Sem sessão, ou com a sessão limitada à verificação em
// duas etapas, não é renderizado (RF-005, RF-006, RF-007, RN-004).
export function NavigationMenu({ open, onClose, toggleRef }: NavigationMenuProps): React.JSX.Element | null {
  const { state } = useAuth();
  const { status, permissions, retry } = usePermissions();
  const navRef = useRef<HTMLElement>(null);
  const authenticated = state.status === 'authenticated';
  // A partir de 768 px o menu é uma coluna sempre visível; abaixo disso fica recolhido (`hidden`) até o botão abri-lo.
  const wasOpen = useRef(open);
  const wide = useMinWidth(pontosDeQuebra.tablet);

  // Abrir leva o foco ao primeiro item; iniciar já aberto não rouba o foco da página.
  useEffect(() => {
    if (open && !wasOpen.current) navRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
    wasOpen.current = open;
  }, [open]);

  // Escape e toque ou clique fora do painel aberto o fecham e devolvem o foco ao botão (RA-005, RA-006).
  useEffect(() => {
    if (!open || !authenticated) return;
    const close = () => { onClose(); toggleRef?.current?.focus(); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const onOutsideClick = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (navRef.current?.contains(target) || toggleRef?.current?.contains(target))) return;
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    // No clique (não no início do toque), para o foco devolvido ao botão não ser desfeito pelo foco do próprio navegador.
    document.addEventListener('click', onOutsideClick, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onOutsideClick, true);
    };
  }, [open, authenticated, onClose, toggleRef]);

  if (!authenticated) return null;

  // Fora de `ready` e `offline` nunca há item restrito, mesmo que o contexto traga permissões (RF-007).
  const screens = visibleScreens(status === 'ready' || status === 'offline' ? permissions : null);
  const currentPath = window.location.pathname;

  return (
    <>
    {/* Abaixo de 768 px o menu é uma gaveta sobre a página; o fundo escurecido a fecha (o clique fora já fecha). */}
    {open && !wide && <div aria-hidden="true" data-menu-backdrop className="fixed inset-0 z-10 bg-navy/50" />}
    <nav
      ref={navRef}
      id={MENU_ID}
      aria-label="Navegação principal"
      hidden={!open && !wide}
      className="fixed inset-y-0 end-0 z-20 w-4/5 max-w-compacto overflow-y-auto bg-branco p-2 shadow-dialogo tablet:static tablet:z-auto tablet:max-h-screen tablet:w-full tablet:shadow-none"
    >
      {!wide && (
        <div className="px-4 pb-4 pt-2">
          <Logo variant="horizontal" width={152} decorative />
        </div>
      )}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {screens.map((screen) => {
          const current = screen.path === currentPath;
          return (
            <li key={screen.id} className="min-w-0">
              <a href={screen.path} onClick={markMenuNavigation} {...(current ? { 'aria-current': 'page' as const } : {})} className={`${linkClass} ${current ? currentClass : 'border-transparent'}`}>
                <Icon name={ICONS[screen.id] ?? 'dashboard'} size={24} />
                <span className="min-w-0 break-words">{screen.label}{current && <>{' '}<VisuallyHidden>(página atual)</VisuallyHidden></>}</span>
              </a>
            </li>
          );
        })}
      </ul>
      {status === 'loading' && <Loading label="Carregando telas…" />}
      {status === 'error' && (
        <Alert variant="erro" className="mt-2">
          <p>Parte das telas não pôde ser listada.</p>
          <Button variant="secundario" className="mt-2" onClick={retry}>Tentar de novo</Button>
        </Alert>
      )}
      {status === 'offline' && <Alert variant="alerta" className="mt-2">Sem conexão. As telas podem estar desatualizadas.</Alert>}
    </nav>
    </>
  );
}
