import type React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CapturedPhoto, ImagePipeline } from '@/infrastructure/attachments/photo-capture';
import { DeliveryPhotos, type DraftPhoto } from './delivery-photos';

// Spec 010, T054 (RF-018, RF-024; contracts/telas-e-fluxos.md §5): até 3 fotos, contador, miniaturas com texto alternativo, refazer e remover antes de salvar,
// e os estados de erro em texto. A entrega vale sem foto.
const jpeg = (marker: number): ArrayBuffer => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda, 0, 4, 0, 0, marker, 0xff, 0xd9]).buffer;
const pipeline = (over: Partial<ImagePipeline> = {}): ImagePipeline => ({
  decode: vi.fn(async () => ({ width: 800, height: 600 })), encode: vi.fn(async () => jpeg(1)), ...over,
});
const image = (): File => new File([new Uint8Array(20)], 'camera.jpg', { type: 'image/jpeg' });
const draft = (n: number): DraftPhoto => ({
  photo: { id: `a0000000-0000-4000-8000-00000000000${n}`, bytes: jpeg(n), sizeBytes: 17, sha256: 'a'.repeat(64), contentType: 'image/jpeg', width: 800, height: 600, capturedAt: '2026-10-13T12:00:00Z' } satisfies CapturedPhoto,
  previewUrl: `blob:foto-${n}`,
});

function setup(over: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const props = { photos: [] as DraftPhoto[], onChange, pipeline: pipeline(), preview: (photo: CapturedPhoto) => ({ url: `blob:${photo.id}`, revoke: vi.fn() }), usedBytes: 0, ...over };
  const view = render(<DeliveryPhotos {...(props as unknown as React.ComponentProps<typeof DeliveryPhotos>)} />);
  return { onChange, view, props };
}
const pick = (file: File): void => { fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } }); };

describe('bloco de fotos da entrega', () => {
  it('diz que é opcional, mostra o contador e o botão para tirar a foto', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Fotos da entrega (opcional)' })).toBeInTheDocument();
    expect(screen.getByText('0 de 3')).toBeInTheDocument();
    expect(screen.getByText(/A entrega vale sem foto/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeEnabled();
  });

  it('o campo de arquivo abre a câmera traseira e só aceita imagem', () => {
    setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('capture', 'environment');
  });

  it('a foto tirada entra como rascunho, já reduzida e sem metadados', async () => {
    const { onChange } = setup();
    pick(image());
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls[0]![0] as DraftPhoto[];
    expect(next).toHaveLength(1);
    expect(next[0]!.photo.contentType).toBe('image/jpeg');
    expect(next[0]!.previewUrl).toMatch(/^blob:/);
  });

  it('miniaturas com texto alternativo, "Refazer" e "Remover"', () => {
    setup({ photos: [draft(1), draft(2)] });
    expect(screen.getByText('2 de 3')).toBeInTheDocument();
    expect(screen.getByAltText('Foto 1 da entrega')).toBeInTheDocument();
    expect(screen.getByAltText('Foto 2 da entrega')).toBeInTheDocument();
    const second = screen.getByRole('listitem', { name: 'Foto 2' });
    expect(within(second).getByRole('button', { name: 'Refazer a foto 2' })).toBeInTheDocument();
    expect(within(second).getByRole('button', { name: 'Remover a foto 2' })).toBeInTheDocument();
  });

  it('remover tira só aquela foto', () => {
    const { onChange } = setup({ photos: [draft(1), draft(2)] });
    fireEvent.click(screen.getByRole('button', { name: 'Remover a foto 1' }));
    expect((onChange.mock.calls[0]![0] as DraftPhoto[]).map((entry) => entry.photo.id)).toEqual([draft(2).photo.id]);
  });

  it('refazer troca a foto no mesmo lugar', async () => {
    const { onChange } = setup({ photos: [draft(1), draft(2)] });
    fireEvent.click(screen.getByRole('button', { name: 'Refazer a foto 2' }));
    pick(image());
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls[0]![0] as DraftPhoto[];
    expect(next).toHaveLength(2);
    expect(next[1]!.photo.id).not.toBe(draft(2).photo.id);
    expect(next[0]!.photo.id).toBe(draft(1).photo.id);
  });

  it('com 3 fotos o botão fica desabilitado, com o motivo à vista', () => {
    setup({ photos: [draft(1), draft(2), draft(3)] });
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeDisabled();
    expect(screen.getByText('Limite de 3 fotos por entrega.')).toBeInTheDocument();
  });

  it('sem espaço para novas fotos: o motivo, e a entrega segue sem elas', () => {
    setup({ usedBytes: 60 * 1024 * 1024 });
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeDisabled();
    expect(screen.getByText('Sem espaço para novas fotos. A entrega será registrada sem elas.')).toBeInTheDocument();
  });

  it('o que já tem no servidor (anexo posterior) entra na conta do limite', () => {
    setup({ existingPhotos: 3 });
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeDisabled();
  });

  it('sem câmera: avisa em texto e a entrega segue', () => {
    setup({ cameraAvailable: false });
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeDisabled();
    expect(screen.getByText('Câmera indisponível neste aparelho. A entrega pode ser registrada sem foto.')).toBeInTheDocument();
  });

  it('imagem inválida ou grande demais: texto do erro, sem foto nova', async () => {
    const { onChange } = setup({ pipeline: pipeline({ decode: vi.fn(async () => { throw new Error('x'); }) }) });
    pick(image());
    expect(await screen.findByText('Não foi possível usar esta imagem. Tire a foto de novo.')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a mudança é anunciada na região de status', async () => {
    setup();
    pick(image());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Foto 1 adicionada.'));
  });
});
