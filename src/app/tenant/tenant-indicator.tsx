import React from 'react';
import { useTenant } from './tenant-context';
import { secondaryButtonClass } from '@/components/identity/confirmation-dialog';

// Mostra a organização ativa em texto (nunca só por cor) e, havendo mais de um vínculo, a troca explícita.
export function TenantIndicator(): React.JSX.Element | null {
  const { selection, options, beginSwitch } = useTenant();
  if (selection.kind !== 'selected') return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span>
        <span className="text-[#26384A]">Organização ativa: </span>
        <span className="font-semibold text-[#163B72]">{selection.option.displayName}</span>
      </span>
      {options.length > 1 && (
        <button type="button" onClick={beginSwitch} className={secondaryButtonClass}>Trocar organização</button>
      )}
    </div>
  );
}
