import React from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  headingLevel?: 2 | 3 | 4;
}

// Estado vazio: título, orientação e, quando houver, a ação possível (RF-021).
export function EmptyState({ title, description, action, headingLevel = 2 }: EmptyStateProps): React.JSX.Element {
  const Titulo = `h${headingLevel}` as 'h2';
  return (
    <section className="flex flex-col items-center gap-4 rounded-card border border-borda-suave bg-branco p-6 text-center">
      <Titulo className="text-h3 font-semibold text-navy">{title}</Titulo>
      <p className="max-w-compacto text-corpo text-grafite">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex min-h-alvo items-center justify-center rounded-controle bg-azul-profundo px-4 text-corpo font-semibold text-branco"
        >
          {action.label}
        </button>
      )}
    </section>
  );
}
