import React from 'react';

// Texto disponível só para tecnologia assistiva.
export function VisuallyHidden({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="sr-only">{children}</span>;
}
