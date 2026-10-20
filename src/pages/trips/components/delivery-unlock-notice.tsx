import React from 'react';

// Por que o lacre não destravou na entrega (Spec 012, RF-024; História 3, cenários 4 e 5). A entrega continua aceita; o destravamento
// excepcional, com justificativa e verificação em duas etapas, fica no bloco "Lacre" do cilindro.
export type UnlockNote = 'outside_geofence' | 'no_proof' | 'no_geofence';

const TEXT: Record<UnlockNote, string> = {
  outside_geofence: 'O lacre não destravou: a posição na entrega estava fora da geocerca da unidade.',
  no_proof: 'O lacre não destravou: nenhuma posição comprovou a entrega dentro da geocerca (a do lacre com GPS dos 2 minutos anteriores ou a do celular por GPS).',
  no_geofence: 'O lacre não destravou: a unidade não tem geocerca ativa.',
};

export function DeliveryUnlockNotice({ note, cylinderId }: { note: UnlockNote; cylinderId: string }): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-col gap-1 text-legenda text-grafite">
      <span>{TEXT[note]}</span>
      <span>
        <a className="font-semibold text-azul-profundo underline" href={`/cilindros/${cylinderId}`}>Destravar pelo cilindro (excepcional)</a>
        {' '}— exige justificativa.
      </span>
    </span>
  );
}
