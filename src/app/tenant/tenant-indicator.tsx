import React from 'react';
import { useTenant } from './tenant-context';
import { Button } from '@/design-system/components/button';

// Mostra a organização ativa em texto (nunca só por cor) e, havendo mais de um vínculo, a troca explícita.
export function TenantIndicator(): React.JSX.Element | null {
  const { selection, options, beginSwitch } = useTenant();
  if (selection.kind !== 'selected') return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-legenda">
      <span>
        <span className="text-grafite">Organização ativa: </span>
        <span className="font-semibold text-navy">{selection.option.displayName}</span>
      </span>
      {options.length > 1 && (
        <Button variant="secundario" onClick={beginSwitch}>
          Trocar organização
        </Button>
      )}
    </div>
  );
}
