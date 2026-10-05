import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SkipLink } from '@/design-system/components/skip-link';
import { pontosDeQuebra } from '@/design-system/tokens';
import { useAuth } from '../auth/auth-context';
import { useMinWidth } from '../use-min-width';
import { ConnectionBar, OfflineNotice } from './connection-bar';
import { Footer } from './footer';
import { LogoLink } from './logo-link';
import { Header } from './header';
import { MenuToggle } from './menu-toggle';
import { useFocusTitleAfterMenuNavigation } from './menu-navigation-focus';
import { MENU_ID, NavigationMenu } from './navigation-menu';
import { TopBar } from './top-bar';

export interface AppShellProps {
  children: React.ReactNode;
}

// Shell único de toda tela: link de pular, estado de conexão, conteúdo principal e rodapé.
// - Público (signed_out e mfa_required): sem barra superior nem menu; a moldura de marca da tela leva o logotipo (RF-007).
// - Durante a checagem da sessão: cabeçalho simples com o logotipo, para a página nunca ficar sem h1.
// - Autenticado: a partir de 768 px, coluna lateral (logotipo e menu da Spec 004) e coluna principal (barra superior, barra
//   de conexão e conteúdo); abaixo disso, barra superior com o botão do menu e o painel do menu da Spec 004 (RF-021).
// O menu só existe para sessão autenticada. A navegação é por carga de página, então o painel começa fechado a cada tela.
// Não conhece rotas nem permissões (RF-011, RF-012, RN-001).
export function AppShell({ children }: AppShellProps): React.JSX.Element {
  // O idioma já vem do index.html; garantir aqui evita leitores de tela com a pronúncia errada se o HTML mudar.
  useEffect(() => {
    document.documentElement.lang = 'pt-BR';
  }, []);
  const status = useAuth().state.status;
  const authenticated = status === 'authenticated';
  const publicShell = status === 'signed_out' || status === 'mfa_required';
  const wide = useMinWidth(pontosDeQuebra.tablet);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  useFocusTitleAfterMenuNavigation(mainRef);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const menuToggle = <MenuToggle ref={toggleRef} expanded={menuOpen} controls={MENU_ID} onToggle={() => setMenuOpen((open) => !open)} />;
  const menu = <NavigationMenu open={menuOpen} onClose={closeMenu} toggleRef={toggleRef} />;
  const main = (
    <main
      ref={mainRef}
      id="main-content"
      tabIndex={-1}
      className={`flex w-full min-w-0 flex-1 flex-col px-4 py-6 tablet:px-6 desktop:px-8`}
    >
      {children}
    </main>
  );

  let body: React.ReactNode;
  if (authenticated && wide) {
    body = (
      <div className="flex w-full flex-1 flex-row">
        <div style={{ maxWidth: '256px' }} className="flex w-1/4 shrink-0 flex-col self-stretch border-r border-borda-suave bg-branco">
          <div className="px-4 py-4">
            <h1 className="m-0">
              <LogoLink width={192} />
            </h1>
          </div>
          {menu}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <OfflineNotice />
          {main}
        </div>
      </div>
    );
  } else if (authenticated) {
    body = (
      <>
        <TopBar menuToggle={menuToggle} />
        {menu}
        <OfflineNotice />
        {main}
      </>
    );
  } else if (publicShell && !wide) {
    // Telas públicas no celular: o estado de conexão desce para o fim da página, discreto; o aviso de offline fica no alto.
    body = (
      <>
        <OfflineNotice />
        {main}
        <div className="flex justify-center px-4 pb-2">
          <ConnectionBar inline />
        </div>
      </>
    );
  } else {
    body = (
      <>
        {!publicShell && <Header />}
        <ConnectionBar />
        {main}
      </>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-cinza-gelo text-grafite">
      <SkipLink targetId="main-content">Pular para o conteúdo principal</SkipLink>
      {body}
      <Footer />
    </div>
  );
}
