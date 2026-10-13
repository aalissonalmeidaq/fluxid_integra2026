import type React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddEvidenceAction, AddEvidenceDialog } from './add-evidence-action';
import { canAddEvidence } from './delivery-evidence';

// Spec 010, T055 (RF-021a; contracts/telas-e-fluxos.md §5): acrescentar foto ou assinatura a uma entrega já registrada, só enquanto a viagem estiver em andamento ou
// concluída há até 7 dias e houver vaga (3 fotos e 1 assinatura).
const NOW = new Date('2026-10-13T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const when = (days: number): string => new Date(NOW.getTime() - days * DAY).toISOString();

describe('quando o botão aparece', () => {
  it('viagem em andamento com vaga', () => {
    expect(canAddEvidence({ tripStatus: 'in_progress', completedAt: null, photos: 1, hasSignature: false, now: NOW })).toBe(true);
  });

  it('concluída há até 7 dias aceita; há mais de 7 dias não', () => {
    expect(canAddEvidence({ tripStatus: 'completed', completedAt: when(6), photos: 0, hasSignature: false, now: NOW })).toBe(true);
    expect(canAddEvidence({ tripStatus: 'completed', completedAt: when(7), photos: 0, hasSignature: false, now: NOW })).toBe(true);
    expect(canAddEvidence({ tripStatus: 'completed', completedAt: when(8), photos: 0, hasSignature: false, now: NOW })).toBe(false);
    expect(canAddEvidence({ tripStatus: 'completed', completedAt: null, photos: 0, hasSignature: false, now: NOW })).toBe(false);
  });

  it('cancelada, planejada e carregando nunca', () => {
    for (const tripStatus of ['cancelled', 'planned', 'loading']) expect(canAddEvidence({ tripStatus, completedAt: null, photos: 0, hasSignature: false, now: NOW })).toBe(false);
  });

  it('sem vaga (3 fotos e assinatura) o botão não aparece; com vaga em um dos dois, aparece', () => {
    expect(canAddEvidence({ tripStatus: 'in_progress', completedAt: null, photos: 3, hasSignature: true, now: NOW })).toBe(false);
    expect(canAddEvidence({ tripStatus: 'in_progress', completedAt: null, photos: 3, hasSignature: false, now: NOW })).toBe(true);
    expect(canAddEvidence({ tripStatus: 'in_progress', completedAt: null, photos: 2, hasSignature: true, now: NOW })).toBe(true);
  });
});

describe('botão e diálogo', () => {
  it('o botão tem nome completo e abre o diálogo com o acionador', () => {
    const onOpen = vi.fn();
    render(<AddEvidenceAction stopLabel="parada 2" onOpen={onOpen} />);
    const button = screen.getByRole('button', { name: 'Acrescentar foto ou assinatura à entrega da parada 2' });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(button);
  });

  const dialog = (over: Record<string, unknown> = {}) => {
    const props = { stopLabel: 'parada 2', existingPhotos: 1, hasSignature: false, usedBytes: 0, returnFocusTo: null, onCancel: vi.fn(), onSave: vi.fn(async () => null), ...over };
    render(<AddEvidenceDialog {...(props as unknown as React.ComponentProps<typeof AddEvidenceDialog>)} />);
    return props;
  };

  it('explica que o registro não muda, conta o que a entrega já tem e só guarda com algo escolhido', () => {
    dialog();
    expect(screen.getByRole('dialog', { name: 'Acrescentar à entrega da parada 2' })).toBeInTheDocument();
    expect(screen.getByText(/O registro da entrega não muda/)).toBeInTheDocument();
    expect(screen.getByText('1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar anexos' })).toBeDisabled();
  });

  it('se a entrega já tem assinatura, não oferece assinar de novo', () => {
    dialog({ hasSignature: true });
    expect(screen.queryByRole('group', { name: 'Assinatura de quem recebeu (opcional)' })).toBeNull();
  });

  it('cancelar fecha sem guardar nada', async () => {
    const props = dialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(props.onCancel).toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
    await waitFor(() => undefined);
  });
});
