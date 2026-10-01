import React from 'react';
import { EmptyState } from '@/design-system';

// Toda tela nova ou refeita usa somente componentes e tokens do padrão; exceção precisa ser registrada aqui (RN-003).
export function PaginaExcecoes(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h2 font-extrabold text-navy tablet:text-h1">Exceções</h1>
        <p className="max-w-padrao text-corpo text-grafite">
          Uma exceção é qualquer cor, medida, componente ou ícone fora do padrão usado em uma tela. Cada uma exige motivo,
          responsável e data, e deve ser revista quando o padrão evoluir.
        </p>
      </header>

      <EmptyState
        title="Nenhuma exceção registrada"
        description="Todas as telas atuais usam apenas os tokens e os componentes do design system."
      />

      <section aria-labelledby="como" className="flex flex-col gap-2">
        <h2 id="como" className="text-h3 font-semibold text-navy">
          Como registrar uma exceção
        </h2>
        <ol className="flex max-w-padrao list-decimal flex-col gap-2 pl-6 text-corpo text-grafite">
          <li>Confirme que nenhum componente ou token existente atende à necessidade.</li>
          <li>Adicione uma entrada em <code>catalogo/paginas/excecoes.tsx</code> com a tela, o motivo, a pessoa responsável e a data.</li>
          <li>Peça a aprovação da pessoa responsável pela marca e pelo design na revisão do pull request.</li>
        </ol>
      </section>
    </div>
  );
}
