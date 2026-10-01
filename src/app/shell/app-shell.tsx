import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SkipLink } from '@/design-system/components/skip-link';
import { useAuth } from '../auth/auth-context';
import { ConnectionBar } from './connection-bar';
import { Footer } from './footer';
import { Header } from './header';
import { MenuToggle } from './menu-toggle';
import { useFocusTitleAfterMenuNavigation } from './menu-navigation-focus';
import { MENU_ID, NavigationMenu } from './navigation-menu';

export interface AppShellProps {
  children: React.ReactNode;
}

// Shell único de toda tela, autenticada ou não: link de pular, cabeçalho, barra de conexão, menu, conteúdo principal e rodapé.
// O menu só existe para sessão autenticada: coluna fixa a partir de 768 px e painel recolhido abaixo disso. A navegação é por
// carga de página, então o painel começa fechado a cada tela. Não conhece rotas nem permissões (RF-011, RF-012, RN-001).
export function AppShell({ children }: AppShellProps): React.JSX.Element {
  // O idioma já vem do index.html; garantir aqui evita leitores de tela com a pronúncia errada se o HTML mudar.
  useEffect(() => {
    document.documentElement.lang = 'pt-BR';
  }, []);
  const authenticated = useAuth().state.status === 'authenticated';
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  useFocusTitleAfterMenuNavigation(mainRef);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  return (
    <div className="flex min-h-screen w-full flex-col bg-cinza-gelo text-grafite">
      <SkipLink targetId="main-content">Pular para o conteúdo principal</SkipLink>
      <Header menuToggle={authenticated ? <MenuToggle ref={toggleRef} expanded={menuOpen} controls={MENU_ID} onToggle={() => setMenuOpen((open) => !open)} /> : null} />
      <ConnectionBar />
      <div className="mx-auto flex w-full max-w-largo flex-1 flex-col tablet:flex-row">
        <NavigationMenu open={menuOpen} onClose={closeMenu} toggleRef={toggleRef} />
        <main ref={mainRef} id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 tablet:px-6 desktop:px-8">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
