import React, { useEffect, useState } from 'react';
import { Logo, SkipLink } from '@/design-system';
import { SECOES, type SecaoDoCatalogo } from './secoes';

function secaoDaUrl(): SecaoDoCatalogo {
  const id = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return SECOES.find((secao) => secao.id === id) ?? (SECOES[0] as SecaoDoCatalogo);
}

// Catálogo do design system: documentação navegável e testável de tokens, componentes, ícones e logotipo (RF-011).
export function Catalogo(): React.JSX.Element {
  const [secao, setSecao] = useState<SecaoDoCatalogo>(secaoDaUrl);

  useEffect(() => {
    const aoMudar = (): void => setSecao(secaoDaUrl());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);

  useEffect(() => {
    document.title = `${secao.titulo} | Catálogo do design system FluxID`;
  }, [secao]);

  const { Pagina } = secao;

  return (
    <div className="flex min-h-screen w-full flex-col">
      <SkipLink targetId="main-content">Pular para o conteúdo principal</SkipLink>
      <header className="border-b border-borda-suave bg-branco px-4 py-4 tablet:px-6">
        <div className="mx-auto flex w-full max-w-largo flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo variant="horizontal" width={160} decorative />
            <p className="text-corpo font-semibold text-navy">Catálogo do design system</p>
          </div>
          <nav aria-label="Seções do catálogo">
            <ul className="flex flex-wrap gap-2">
              {SECOES.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#/${item.id}`}
                    {...(item.id === secao.id ? { 'aria-current': 'page' as const } : {})}
                    className={`inline-flex min-h-alvo items-center rounded-controle px-4 text-corpo font-semibold ${
                      item.id === secao.id ? 'bg-azul-profundo text-branco' : 'text-azul-profundo'
                    }`}
                  >
                    {item.titulo}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-largo flex-1 px-4 py-8 tablet:px-6">
        <Pagina />
      </main>

      <footer className="border-t border-borda-suave bg-branco px-4 py-4 text-center text-legenda text-texto-secundario tablet:px-6">
        Catálogo de desenvolvimento do FluxID. Não faz parte do aplicativo publicado.
      </footer>
    </div>
  );
}
