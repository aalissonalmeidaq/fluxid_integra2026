import React, { useId } from 'react';

export interface FormSectionProps {
  legend: string;
  description?: string;
  children: React.ReactNode;
}

// Seção de formulário longo na mesma página, com um único envio (RF-020): fieldset com legend, sem etapas.
export function FormSection({ legend, description, children }: FormSectionProps): React.JSX.Element {
  const descriptionId = useId();
  return (
    <fieldset {...(description ? { 'aria-describedby': descriptionId } : {})} className="flex min-w-0 flex-col gap-4">
      <legend className="mb-2 text-h3 font-semibold text-navy">{legend}</legend>
      {description && (
        <p id={descriptionId} className="text-corpo text-texto-secundario">
          {description}
        </p>
      )}
      {children}
    </fieldset>
  );
}
