import React from 'react';
import { Icon } from '@/design-system';

// Aviso de "sem conexão e nada carregado" das telas do rastreamento (Spec 015): o mesmo bloco tracejado do mapa indisponível, com o
// ícone de sem sinal e o texto. É informação, não erro: não usa vermelho nem pede nova tentativa, porque a tela volta sozinha.
export function OfflineNotice({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-start gap-2 rounded-card border border-dashed border-borda-controle bg-cinza-gelo p-4 text-corpo text-grafite">
      <span className="shrink-0 text-azul-profundo"><Icon name="sem-sinal" variant="monocromatica" /></span>
      <p className="m-0">{children}</p>
    </div>
  );
}
