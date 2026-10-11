import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TripDeliveryView } from '@/application/trips/trip-views';
import { detail } from '../trip-test-support';
import { DeliveryDialog, type DeliveryDialogProps } from './delivery-dialog';

const base = detail();
const items = base.items.map((item) => ({ ...item, itemStatus: 'in_transit' as const, lockStatus: 'locked' as const }));
const previous: TripDeliveryView = {
  id: 'd1', stopId: base.stops[0]!.id, deliveredAt: '2026-10-09T15:00:00Z', recipientName: 'Recebedor Anterior', recipientRole: 'Enfermeira', latitude: null, longitude: null,
  atSiteAddress: false, outsideGeofence: null, results: [], supersedesId: null, recordedByName: 'Ana', recordedAt: '2026-10-09T15:01:00Z',
};

const setup = (over: Partial<DeliveryDialogProps> = {}) => {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  const handlers = { onCancel: vi.fn(), onSubmit: vi.fn() };
  const view = render(<DeliveryDialog stop={base.stops[0]!} items={items} previous={null} busy={false} error={null} serverErrors={{}} returnFocusTo={trigger} {...handlers} {...over} />);
  return { ...handlers, trigger, unmount: view.unmount };
};
const submit = (): void => { fireEvent.click(screen.getByRole('button', { name: /Registrar (entrega|correção)/ })); };
const name = (value: string): void => { fireEvent.change(screen.getByLabelText('Nome de quem recebeu'), { target: { value } }); };

describe('diálogo de entrega', () => {
  it('abre com o título da parada e o foco no nome do recebedor', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Registrar entrega · Parada 1' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome de quem recebeu')).toHaveFocus();
  });

  it('mostra o resultado de cada cilindro, começando por "Entregue"', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: 'Resultado de CIL-001' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: 'Entregue', checked: true })).toHaveLength(2);
  });

  it('envia o recebimento completo com os dados limpos', () => {
    const { onSubmit } = setup();
    name('  Recebedor Fictício  ');
    fireEvent.change(screen.getByLabelText('Função (opcional)'), { target: { value: 'Enfermeira' } });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23,5505' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-46,6333' } });
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      recipientName: 'Recebedor Fictício', recipientRole: 'Enfermeira', latitude: -23.5505, longitude: -46.6333, atSiteAddress: false,
      results: [{ itemId: 'i1', delivered: true }, { itemId: 'i2', delivered: true }],
    });
  });

  it('nome obrigatório: erro junto do campo, foco nele e nada enviado', () => {
    const { onSubmit } = setup();
    submit();
    expect(screen.getByText(/Informe o nome de quem recebeu/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nome de quem recebeu')).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cilindro não entregue pede o motivo, junto do próprio cilindro', () => {
    const { onSubmit } = setup();
    name('Recebedor Fictício');
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Resultado de CIL-002' })).getByRole('radio', { name: 'Não entregue' }));
    submit();
    expect(screen.getByText(/Explique por que não foi entregue/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Por que CIL-002 não foi entregue'), { target: { value: 'Cliente sem espaço' } });
    submit();
    expect(onSubmit.mock.calls[0]![0].results[1]).toEqual({ itemId: 'i2', delivered: false, reason: 'Cliente sem espaço' });
  });

  it('latitude sem longitude é recusada e o endereço da unidade vai marcado', () => {
    const { onSubmit } = setup();
    name('Recebedor Fictício');
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23,55' } });
    submit();
    expect(screen.getByText(/latitude e a longitude juntas/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Entrega no endereço da unidade' }));
    submit();
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ atSiteAddress: true, latitude: null, longitude: null });
  });

  it('o horário não pode estar no futuro', () => {
    const { onSubmit } = setup();
    name('Recebedor Fictício');
    fireEvent.change(screen.getByLabelText('Data e hora da entrega'), { target: { value: '2099-01-01T10:00' } });
    submit();
    expect(screen.getByText('O horário da entrega não pode estar no futuro.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('mostra o erro do servidor, por campo, dentro do diálogo', () => {
    setup({ error: 'Revise os campos indicados.', serverErrors: { recipientName: 'Informe o nome de quem recebeu.', 'results.i1': 'Explique por que não foi entregue.' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Revise os campos indicados.');
    expect(screen.getByText('Informe o nome de quem recebeu.')).toBeInTheDocument();
  });

  it('Escape e Cancelar fecham sem enviar; o foco volta ao acionador', () => {
    const { onCancel, onSubmit, trigger, unmount } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
    expect(trigger).toHaveFocus();
  });

  it('envio em andamento deixa o botão ocupado', () => {
    setup({ busy: true });
    expect(screen.getByRole('button', { name: 'Registrando…' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('diálogo de correção', () => {
  it('mostra o registro anterior à vista e só os cilindros que faltaram', () => {
    setup({ previous, items: [items[1]!] });
    expect(screen.getByRole('dialog', { name: 'Corrigir entrega · Parada 1' })).toBeInTheDocument();
    expect(screen.getByText(/recebido por Recebedor Anterior \(Enfermeira\)/)).toBeInTheDocument();
    expect(screen.getByText(/o anterior é mantido no histórico/)).toBeInTheDocument();
    expect(screen.getByText('Cilindros que faltaram')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Resultado de CIL-001' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nome de quem recebeu')).toHaveValue('Recebedor Anterior');
  });

  it('com o nome restrito o campo começa vazio e a pessoa informa de novo', () => {
    setup({ previous: { ...previous, recipientName: '(restrito)', recipientRole: '(restrito)' }, items: [items[1]!] });
    expect(screen.getByLabelText('Nome de quem recebeu')).toHaveValue('');
    expect(screen.getByLabelText('Função (opcional)')).toHaveValue('');
  });

  it('sem cilindros pendentes a correção só atualiza os dados do recebedor', () => {
    const { onSubmit } = setup({ previous, items: [] });
    expect(screen.getByText(/só atualiza os dados do recebedor/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Justificativa da correção'), { target: { value: 'Nome digitado errado' } });
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('diálogo de correção: justificativa obrigatória (RF-015)', () => {
  const reason = (): HTMLElement => screen.getByLabelText('Justificativa da correção');

  it('a correção mostra o campo da justificativa e a entrega original não', () => {
    setup({ previous, items: [items[1]!] });
    expect(reason()).toBeInTheDocument();
    expect(screen.getByText(/de 5 a 500 caracteres/)).toBeInTheDocument();
  });

  it('a entrega original não tem o campo da justificativa', () => {
    setup();
    expect(screen.queryByLabelText('Justificativa da correção')).not.toBeInTheDocument();
  });

  it.each([['vazia', ''], ['só espaços', '     '], ['com 4 caracteres', 'Erro'], ['com 501 caracteres', 'x'.repeat(501)]])(
    'justificativa %s: erro junto do campo, foco nele e nada enviado',
    (_nome, text) => {
      const { onSubmit } = setup({ previous, items: [items[1]!] });
      fireEvent.change(reason(), { target: { value: text } });
      submit();
      expect(screen.getByText(/Explique por que corrige a entrega/)).toBeInTheDocument();
      expect(reason()).toHaveFocus();
      expect(reason()).toHaveAttribute('aria-invalid', 'true');
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('envia a justificativa com os espaços normalizados', () => {
    const { onSubmit } = setup({ previous, items: [items[1]!] });
    fireEvent.change(reason(), { target: { value: '  Nome   digitado\n errado  ' } });
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ correctionReason: 'Nome digitado errado' });
  });

  it('mostra o erro de justificativa devolvido pelo servidor junto do campo', () => {
    setup({ previous, items: [items[1]!], serverErrors: { correctionReason: 'Explique por que corrige a entrega, em 5 a 500 caracteres.' } });
    expect(screen.getByText(/Explique por que corrige a entrega/)).toBeInTheDocument();
  });
});

describe('diálogo de entrega: posição por coordenadas ou no endereço da unidade (RF-013)', () => {
  const lat = (): HTMLInputElement => screen.getByLabelText('Latitude') as HTMLInputElement;
  const lon = (): HTMLInputElement => screen.getByLabelText('Longitude') as HTMLInputElement;
  const site = (): HTMLInputElement => screen.getByLabelText('Entrega no endereço da unidade') as HTMLInputElement;

  it('marcar o endereço da unidade limpa e desabilita as coordenadas', () => {
    setup();
    fireEvent.change(lat(), { target: { value: '-23,55' } });
    fireEvent.change(lon(), { target: { value: '-46,63' } });
    fireEvent.click(site());
    expect(site()).toBeChecked();
    expect(lat()).toHaveValue('');
    expect(lon()).toHaveValue('');
    expect(lat()).toBeDisabled();
    expect(lon()).toBeDisabled();
  });

  it('desmarcar o endereço da unidade devolve os campos de coordenadas', () => {
    setup();
    fireEvent.click(site());
    fireEvent.click(site());
    expect(site()).not.toBeChecked();
    expect(lat()).toBeEnabled();
    expect(lon()).toBeEnabled();
  });

  it('informar uma coordenada desmarca o endereço da unidade', () => {
    setup();
    fireEvent.click(site());
    expect(lat()).toBeDisabled();
    fireEvent.click(site());
    fireEvent.change(lat(), { target: { value: '-23,55' } });
    expect(site()).not.toBeChecked();
  });

  it('a seleção do endereço da unidade nunca envia coordenadas', () => {
    const { onSubmit } = setup();
    name('Recebedor Fictício');
    fireEvent.change(lat(), { target: { value: '-23,55' } });
    fireEvent.change(lon(), { target: { value: '-46,63' } });
    fireEvent.click(site());
    submit();
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ atSiteAddress: true, latitude: null, longitude: null });
  });

  it('só coordenadas enviam as coordenadas e o endereço fica desmarcado', () => {
    const { onSubmit } = setup();
    name('Recebedor Fictício');
    fireEvent.change(lat(), { target: { value: '-23,55' } });
    fireEvent.change(lon(), { target: { value: '-46,63' } });
    submit();
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ atSiteAddress: false, latitude: -23.55, longitude: -46.63 });
  });

  it('explica a regra ao lado das opções', () => {
    setup();
    expect(screen.getByText(/ou marque que a entrega foi no endereço da unidade/)).toBeInTheDocument();
  });
});
