import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SignatureSurface } from '@/infrastructure/attachments/signature-canvas';
import { DeliverySignature } from './delivery-signature';

// Spec 010, T061 (RF-020, RF-024; contracts/telas-e-fluxos.md §6): assinatura opcional, com Limpar e sem nenhuma dependência para salvar. A área de desenho entra por uma
// superfície simulável (o canvas real não existe no jsdom).
const png = (): ArrayBuffer => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).buffer;
function surface(): SignatureSurface {
  let ink = 0;
  return {
    width: 600, height: 200,
    clear: vi.fn(() => { ink = 0; }),
    drawSegment: vi.fn(() => { ink += 400; }),
    countInkedPixels: vi.fn(() => ink),
    toPng: vi.fn(async () => png()),
  };
}
const setup = (over: Record<string, unknown> = {}) => {
  const onChange = vi.fn();
  render(<DeliverySignature value={null} onChange={onChange} createSurface={() => surface()} {...over} />);
  return { onChange, canvas: screen.getByLabelText('Área de assinatura. Opcional; a entrega pode ser concluída sem assinatura.') as HTMLCanvasElement };
};
const stroke = (canvas: HTMLCanvasElement): void => {
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerMove(canvas, { clientX: 60, clientY: 40, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 120, clientY: 50, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
};

describe('bloco da assinatura', () => {
  it('é opcional, explica que a entrega vale sem assinatura e tem o texto alternativo do contrato', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Assinatura de quem recebeu (opcional)' })).toBeInTheDocument();
    expect(screen.getByText(/A entrega vale sem assinatura/)).toBeInTheDocument();
    expect(screen.getByText('Assine dentro da área. Para não assinar, basta salvar a entrega.')).toBeInTheDocument();
  });

  it('o traço (toque, caneta ou mouse) devolve a assinatura em PNG', async () => {
    const { onChange, canvas } = setup();
    stroke(canvas);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const signature = onChange.mock.calls.at(-1)![0];
    expect(signature).toMatchObject({ contentType: 'image/png' });
    expect(screen.getByRole('status')).toHaveTextContent('Assinatura registrada.');
  });

  it('um toque sem querer não vira assinatura', async () => {
    const { onChange, canvas } = setup({ createSurface: () => ({ ...surface(), countInkedPixels: () => 5 }) });
    stroke(canvas);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Assinatura vazia: nada foi guardado.'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('Limpar apaga o traço e devolve nulo', async () => {
    const { onChange, canvas } = setup();
    stroke(canvas);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Limpar assinatura' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('status')).toHaveTextContent('Assinatura apagada.');
  });

  it('Limpar fica desabilitado enquanto não há traço', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Limpar assinatura' })).toBeDisabled();
  });

  it('já existe assinatura no servidor (anexo posterior): o bloco não aparece', () => {
    render(<DeliverySignature value={null} onChange={vi.fn()} alreadyHasSignature createSurface={() => surface()} />);
    expect(screen.queryByRole('group', { name: 'Assinatura de quem recebeu (opcional)' })).toBeNull();
  });

  it('o canvas não captura a rolagem da página fora da área e é grande o bastante para o dedo', () => {
    const { canvas } = setup();
    expect(canvas).toHaveClass('touch-none');
    expect(canvas).toHaveClass('w-full');
  });
});
