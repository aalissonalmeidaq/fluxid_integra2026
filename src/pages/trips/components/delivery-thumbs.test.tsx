import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeliveryAttachmentView } from '@/application/trips/trip-views';
import { DeliveryThumbs } from './delivery-thumbs';

// Spec 010, T056 (RF-022, RF-023): miniaturas por URL assinada de vida curta, com texto alternativo. Sem URL, o texto explica.
const photo = (position: number, over: Partial<DeliveryAttachmentView> = {}): DeliveryAttachmentView => ({ id: `a${position}`, kind: 'photo', position, capturedAt: null, addedLater: false, ...over });

describe('miniaturas da entrega', () => {
  it('mostra cada anexo com texto alternativo e pede uma URL por anexo', async () => {
    const loadUrl = vi.fn(async (id: string) => `https://storage.example.invalid/${id}?token=t`);
    render(<DeliveryThumbs attachments={[photo(1), photo(2), { ...photo(0), id: 's1', kind: 'signature', position: 0 }]} loadUrl={loadUrl} />);
    expect(await screen.findByAltText('Foto 1 da entrega')).toHaveAttribute('src', 'https://storage.example.invalid/a1?token=t');
    expect(await screen.findByAltText('Foto 2 da entrega')).toBeInTheDocument();
    expect(await screen.findByAltText('Assinatura de quem recebeu')).toBeInTheDocument();
    expect(loadUrl).toHaveBeenCalledTimes(3);
  });

  it('marca o que foi acrescentado depois', async () => {
    render(<DeliveryThumbs attachments={[photo(1, { addedLater: true })]} loadUrl={async () => 'https://x.example.invalid/a'} />);
    expect(await screen.findByText('Acrescentado depois')).toBeInTheDocument();
  });

  it('sem URL (sem permissão, expirou, sem conexão): o texto diz que não foi possível carregar', async () => {
    render(<DeliveryThumbs attachments={[photo(1)]} loadUrl={async () => null} />);
    await waitFor(() => expect(screen.getByText('Foto 1 da entrega: não foi possível carregar a imagem.')).toBeInTheDocument());
  });

  it('falha ao pedir a URL não derruba a tela', async () => {
    render(<DeliveryThumbs attachments={[photo(1)]} loadUrl={async () => { throw new Error('x'); }} />);
    await waitFor(() => expect(screen.getByText(/não foi possível carregar a imagem/)).toBeInTheDocument());
  });

  it('sem anexos não mostra nada', () => {
    const { container } = render(<DeliveryThumbs attachments={[]} loadUrl={async () => null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
