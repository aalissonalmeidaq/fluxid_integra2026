import React, { useEffect } from 'react';
import { SkipLink } from '@/design-system/components/skip-link';
import { ConnectionBar } from './connection-bar';
import { Footer } from './footer';
import { Header } from './header';

export interface AppShellProps {
  children: React.ReactNode;
}

// Shell único de toda tela, autenticada ou não: link de pular, cabeçalho, barra de conexão, conteúdo principal e rodapé.
// Não conhece rotas nem permissões; recebe a rota já decidida como filho (RF-012, RN-001).
export function AppShell({ children }: AppShellProps): React.JSX.Element {
  // O idioma já vem do index.html; garantir aqui evita leitores de tela com a pronúncia errada se o HTML mudar.
  useEffect(() => {
    document.documentElement.lang = 'pt-BR';
  }, []);
  return (
    <div className="flex min-h-screen w-full flex-col bg-cinza-gelo text-grafite">
      <SkipLink targetId="main-content">Pular para o conteúdo principal</SkipLink>
      <Header />
      <ConnectionBar />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-largo flex-1 px-4 py-6 tablet:px-6 desktop:px-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}
