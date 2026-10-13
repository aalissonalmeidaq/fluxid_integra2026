import React, { useRef, useState } from 'react';
import { Button } from '@/design-system';
import { canvasSurface, SignaturePad, type CapturedSignature, type SignatureSurface } from '@/infrastructure/attachments/signature-canvas';

// Assinatura de quem recebeu (Spec 010, RF-020, RF-024; contracts/telas-e-fluxos.md §6): opcional, desenhada com o dedo, a caneta ou o mouse, com "Limpar". A entrega
// vale sem ela e o botão de salvar não depende dela; a alternativa de teclado e de tecnologia assistiva é **não** assinar. Assinatura em branco não é guardada.
export interface DeliverySignatureProps {
  value: CapturedSignature | null;
  onChange: (signature: CapturedSignature | null) => void;
  disabled?: boolean;
  // A entrega já tem assinatura no servidor (anexo acrescentado depois): não há o que assinar de novo.
  alreadyHasSignature?: boolean;
  // Trocável nos testes: a área de desenho.
  createSurface?: (canvas: HTMLCanvasElement) => SignatureSurface;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;

export function DeliverySignature({ value, onChange, disabled = false, alreadyHasSignature = false, createSurface = canvasSurface }: DeliverySignatureProps): React.JSX.Element | null {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad | null>(null);
  const [live, setLive] = useState('');
  const [inked, setInked] = useState(value !== null);
  const [unavailable, setUnavailable] = useState(false);

  // A área de desenho nasce no primeiro toque: sem canvas no navegador a assinatura (opcional) simplesmente não existe e a entrega segue.
  const ensurePad = (): SignaturePad | null => {
    if (pad.current) return pad.current;
    if (!canvas.current) return null;
    try {
      pad.current = new SignaturePad(createSurface(canvas.current));
    } catch {
      setUnavailable(true);
    }
    return pad.current;
  };

  if (alreadyHasSignature) return null;

  // Do ponto na tela para o ponto do desenho (a área se ajusta à largura, o desenho tem tamanho fixo).
  const point = (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / (box.width || 1)) * CANVAS_WIDTH, y: ((event.clientY - box.top) / (box.height || 1)) * CANVAS_HEIGHT };
  };
  const down = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (disabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    ensurePad()?.down(point(event));
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>): void => { pad.current?.move(point(event)); };
  const up = (): void => {
    const current = pad.current;
    if (!current) return;
    current.up();
    if (current.isBlank()) {
      setInked(false);
      onChange(null);
      setLive('Assinatura vazia: nada foi guardado.');
      return;
    }
    setInked(true);
    void current.export().then((result) => {
      if (result.ok) { onChange(result.signature); setLive('Assinatura registrada.'); return; }
      onChange(null);
      setLive(result.failure === 'too_large' ? 'A assinatura ficou grande demais. Limpe e assine de novo.' : 'Não foi possível guardar a assinatura. Limpe e assine de novo.');
    });
  };
  const clear = (): void => {
    pad.current?.clear();
    setInked(false);
    onChange(null);
    setLive('Assinatura apagada.');
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-4" disabled={disabled}>
      <legend className="mb-2 text-h3 font-semibold text-navy">Assinatura de quem recebeu (opcional)</legend>
      <p className="text-corpo">A entrega vale sem assinatura. Se quiser, peça para quem recebeu assinar na área abaixo.</p>
      <canvas
        ref={canvas}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        role="img"
        aria-label="Área de assinatura. Opcional; a entrega pode ser concluída sem assinatura."
        style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
        className="w-full touch-none rounded-controle border border-borda-controle bg-branco"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {unavailable && <p className="text-corpo text-grafite">Não foi possível abrir a área de assinatura neste aparelho. A entrega pode ser registrada sem assinatura.</p>}
      <p className="text-legenda text-texto-secundario">Assine dentro da área. Para não assinar, basta salvar a entrega.</p>
      <div>
        <Button variant="secundario" disabled={disabled || !inked} onClick={clear}>Limpar assinatura</Button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{live}</p>
    </fieldset>
  );
}
