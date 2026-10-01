import React, { useState } from 'react';
import { Button, Dialog } from '@/design-system';

export const Grupo = ({ titulo, children }: { titulo: string; children: React.ReactNode }): React.JSX.Element => (
  <div className="flex flex-col gap-2">
    <p className="text-legenda font-semibold text-texto-secundario">{titulo}</p>
    <div className="flex flex-wrap items-start gap-4">{children}</div>
  </div>
);

export function ExemploDeDialog(): React.JSX.Element {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="secundario" onClick={() => setAberto(true)}>
        Abrir o diálogo de exemplo
      </Button>
      {aberto && (
        <Dialog
          title="Encerrar a sessão mais antiga"
          onClose={() => setAberto(false)}
          footer={
            <>
              <Button variant="secundario" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button variant="perigoso" onClick={() => setAberto(false)}>
                Encerrar sessão
              </Button>
            </>
          }
        >
          <p className="text-corpo">Esta ação encerra a sessão selecionada e fica registrada na auditoria.</p>
        </Dialog>
      )}
    </>
  );
}
