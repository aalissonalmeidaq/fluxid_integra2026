import React from 'react';
import type { IdentifierKind } from '@/domain/cylinders/cylinder-types';
import { symbologyFor } from '@/domain/cylinders/identifier-symbology';
import { Alert, Button, Dialog } from '@/design-system';

export interface IdentifierSymbolProps { kind: IdentifierKind; value: string }

// Símbolo do identificador ativo para conferência com leitor (RF-044), em um diálogo modal para ficar grande e legível. A
// biblioteca só é carregada ao abrir, em chunk próprio, e o símbolo é gerado no navegador: o valor não sai do aparelho.
export function IdentifierSymbol({ kind, value }: IdentifierSymbolProps): React.JSX.Element | null {
  const symbology = symbologyFor(kind);
  const [trigger, setTrigger] = React.useState<HTMLElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [source, setSource] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!open || !symbology || source) return undefined;
    let current = true;
    import('bwip-js/browser')
      .then(({ toSVG }) => {
        const svg = toSVG({ bcid: symbology.bcid, text: value, scale: 8, padding: 6 });
        if (current) setSource(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [open, symbology, source, value]);

  if (!symbology) return null;
  const close = (): void => { setOpen(false); setFailed(false); };
  return (
    <>
      <Button variant="secundario" aria-haspopup="dialog" onClick={(event) => { setTrigger(event.currentTarget); setFailed(false); setOpen(true); }}>
        Mostrar código
      </Button>
      {open && (
        <Dialog title={`${symbology.label} do identificador`} onClose={close} returnFocusTo={trigger} footer={<Button onClick={close}>Fechar</Button>}>
          <div className="flex flex-col items-center gap-4">
            {failed && <Alert variant="erro">Não foi possível gerar o código. Feche e tente de novo.</Alert>}
            {!failed && !source && <p role="status" className="text-corpo text-texto-secundario">Gerando o código…</p>}
            {source && (
              <img src={source} alt={`${symbology.label} do valor ${value}`} className="w-full rounded-card border border-borda-suave bg-branco" />
            )}
            <code className="break-all text-center text-corpo font-semibold text-navy">{value}</code>
          </div>
        </Dialog>
      )}
    </>
  );
}
