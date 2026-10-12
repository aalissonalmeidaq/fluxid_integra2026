import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TripDeliveryView } from '@/application/trips/trip-views';
import type { PositionReading } from '@/domain/field/position-quality';
import type { DeliveryFormValue } from '@/domain/trips/trip-validation';
import type { GeolocationReader } from '@/infrastructure/field/geolocation-reader';
import { ReaderError, type ReaderErrorKind } from '@/infrastructure/field/reader-error';
import type { ResolutionLike } from '@/domain/field/reading-result';
import { cylinder, detail } from '../trip-test-support';
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

// Spec 009 (RF-001a, RF-005): a leitura confirma o cilindro previsto na parada como "entregue", com o método por cilindro; "não entregue"
// e a justificativa seguem manuais, e a entrega só vale ao salvar.
const found = (n: number): ResolutionLike => ({
  kind: 'found', value: { cylinder: { id: cylinder(n).id, serialNumber: `CIL-00${n}`, status: 'active' }, trip: null },
});
const typeCode = async (value: string): Promise<void> => {
  fireEvent.change(await screen.findByLabelText('Código do cilindro'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Marcar como entregue' }));
};

// Spec 009, US2 (RF-009 a RF-014): a posição da entrega pelo GPS do aparelho, por coordenadas digitadas ou no endereço da unidade, sempre
// opcional; a origem, a precisão e o horário da leitura seguem no envio; leitura com mais de 2 minutos é lida de novo antes de enviar.
describe('diálogo de entrega: posição (Spec 009)', () => {
  const READING: PositionReading = { latitude: -23.55052, longitude: -46.633309, accuracyM: 12.4, readAt: Date.UTC(2026, 9, 13, 15, 29, 30) };
  const geolocation = (fail?: ReaderErrorKind): GeolocationReader & { read: ReturnType<typeof vi.fn> } => ({
    isSupported: () => true, read: vi.fn(async () => { if (fail) throw new ReaderError(fail); return READING; }),
  }) as never;
  const sent = (onSubmit: ReturnType<typeof vi.fn>) => (onSubmit.mock.calls[0] as unknown as [DeliveryFormValue])[0];

  it('sem posição nenhuma, a entrega segue (a posição é opcional) e o valor não tem "position"', () => {
    const { onSubmit } = setup({ geolocation: geolocation() });
    name('Recebedor Fictício');
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect('position' in sent(onSubmit)).toBe(false);
  });

  it('a posição lida pelo GPS segue com a origem "gps", a precisão e o horário da leitura', async () => {
    const { onSubmit } = setup({ geolocation: geolocation(), now: () => READING.readAt + 10_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha posição' }));
    await screen.findByText('Origem: GPS');
    name('Recebedor Fictício');
    submit();
    expect(sent(onSubmit)).toMatchObject({ latitude: -23.55052, longitude: -46.633309, atSiteAddress: false, position: { source: 'gps', accuracyM: 12.4, readAt: new Date(READING.readAt).toISOString() } });
  });

  it('coordenadas digitadas seguem como "informada"', () => {
    const { onSubmit } = setup({ geolocation: geolocation() });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23,5505' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-46,6333' } });
    name('Recebedor Fictício');
    submit();
    expect(sent(onSubmit)).toMatchObject({ latitude: -23.5505, longitude: -46.6333, position: { source: 'typed', accuracyM: null, readAt: null } });
  });

  it('"Entrega no endereço da unidade" segue como "site_address", sem coordenadas', () => {
    const { onSubmit } = setup({ geolocation: geolocation() });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Entrega no endereço da unidade' }));
    name('Recebedor Fictício');
    submit();
    expect(sent(onSubmit)).toMatchObject({ latitude: null, longitude: null, atSiteAddress: true, position: { source: 'site_address' } });
  });

  it('editar o número depois da leitura troca a origem para "informada" no envio', async () => {
    const { onSubmit } = setup({ geolocation: geolocation(), now: () => READING.readAt });
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha posição' }));
    await screen.findByText('Origem: GPS');
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23.55' } });
    name('Recebedor Fictício');
    submit();
    expect(sent(onSubmit)).toMatchObject({ position: { source: 'typed', accuracyM: null } });
  });

  it('leitura do GPS com mais de 2 minutos é lida de novo antes de enviar', async () => {
    let clock = READING.readAt;
    const reader = geolocation();
    const { onSubmit } = setup({ geolocation: reader, now: () => clock });
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha posição' }));
    await screen.findByText('Origem: GPS');
    clock = READING.readAt + 121_000;
    reader.read.mockResolvedValueOnce({ ...READING, accuracyM: 4, readAt: clock });
    name('Recebedor Fictício');
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(sent(onSubmit)).toMatchObject({ position: { source: 'gps', accuracyM: 4, readAt: new Date(clock).toISOString() } });
  });

  it('se a nova leitura falha, nada é enviado e o texto explica', async () => {
    let clock = READING.readAt;
    const reader = geolocation();
    const { onSubmit } = setup({ geolocation: reader, now: () => clock });
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha posição' }));
    await screen.findByText('Origem: GPS');
    clock = READING.readAt + 121_000;
    reader.read.mockRejectedValueOnce(new ReaderError('denied'));
    name('Recebedor Fictício');
    submit();
    expect(await screen.findByText('Não foi possível atualizar a posição. Leia de novo ou digite as coordenadas.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('precisão ruim avisa mas não impede o envio', async () => {
    const reader = geolocation();
    reader.read.mockResolvedValueOnce({ ...READING, accuracyM: 450 });
    const { onSubmit } = setup({ geolocation: reader, now: () => READING.readAt });
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha posição' }));
    await screen.findByText('Precisão baixa (cerca de 450 m). Você pode salvar mesmo assim.');
    name('Recebedor Fictício');
    submit();
    expect(sent(onSubmit)).toMatchObject({ position: { source: 'gps', accuracyM: 450 } });
  });

  it('permissão negada: explica, mantém o formulário e a entrega segue por coordenadas ou endereço da unidade', async () => {
    const { onSubmit } = setup({ geolocation: geolocation('denied') });
    name('Recebedor Fictício');
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha posição' }));
    expect(await screen.findByText(/A permissão de localização foi negada/)).toBeInTheDocument();
    expect((screen.getByLabelText('Nome de quem recebeu') as HTMLInputElement).value).toBe('Recebedor Fictício');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Entrega no endereço da unidade' }));
    submit();
    expect(sent(onSubmit)).toMatchObject({ position: { source: 'site_address' } });
  });
});

describe('diálogo de entrega: leitura (Spec 009)', () => {
  it('sem o resolvedor, não oferece leitura', () => {
    setup();
    expect(screen.queryByLabelText('Código do cilindro')).toBeNull();
  });

  it('o código de um cilindro da parada o marca "Entregue" com o método e diz em texto', async () => {
    const resolve = vi.fn(async () => found(1));
    setup({ resolve });
    await typeCode('QR-1');
    expect((await screen.findAllByText('Cilindro CIL-001 marcado como entregue.')).length).toBeGreaterThan(0);
    expect(resolve).toHaveBeenCalledWith({ candidates: [{ value: 'QR-1', origin: 'scanned' }], source: 'typed' });
    expect(screen.getByText('Entregue por código digitado ou leitor')).toBeInTheDocument();
  });

  it('o método do cilindro segue para o envio da entrega', async () => {
    const { onSubmit } = setup({ resolve: vi.fn(async () => found(1)) });
    await typeCode('QR-1');
    await screen.findAllByText('Cilindro CIL-001 marcado como entregue.');
    name('Recebedor Fictício');
    submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      results: [{ itemId: 'i1', delivered: true, source: 'typed' }, { itemId: 'i2', delivered: true }],
    }));
  });

  it('cilindro que não é da parada é recusado e não entra na entrega', async () => {
    setup({ resolve: vi.fn(async () => found(9)) });
    await typeCode('QR-9');
    expect((await screen.findAllByText('Cilindro CIL-009 não está previsto nesta parada.')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('radio', { name: 'Entregue', checked: true })).toHaveLength(2);
    expect(screen.queryByText(/Entregue por/)).toBeNull();
  });

  it('o mesmo cilindro lido de novo avisa que já está marcado', async () => {
    setup({ resolve: vi.fn(async () => found(1)) });
    await typeCode('QR-1');
    await screen.findAllByText('Cilindro CIL-001 marcado como entregue.');
    await typeCode('QR-1');
    expect((await screen.findAllByText('Cilindro CIL-001 já está marcado como entregue.')).length).toBeGreaterThan(0);
  });

  it('o código não encontrado diz "Cilindro não encontrado."', async () => {
    setup({ resolve: vi.fn(async () => ({ kind: 'not_found' }) as ResolutionLike) });
    await typeCode('NAO-EXISTE');
    expect((await screen.findAllByText('Cilindro não encontrado.')).length).toBeGreaterThan(0);
  });

  it('a leitura reverte um "Não entregue" marcado antes, sem manter a justificativa', async () => {
    setup({ resolve: vi.fn(async () => found(1)) });
    fireEvent.click(screen.getAllByRole('radio', { name: 'Não entregue' })[0]!);
    expect(screen.getByLabelText('Por que CIL-001 não foi entregue')).toBeInTheDocument();
    await typeCode('QR-1');
    await screen.findAllByText('Cilindro CIL-001 marcado como entregue.');
    expect(screen.queryByLabelText('Por que CIL-001 não foi entregue')).toBeNull();
    expect(screen.getAllByRole('radio', { name: 'Entregue', checked: true })).toHaveLength(2);
  });

  it('marcar "Não entregue" à mão tira o método e a justificativa continua manual', async () => {
    const { onSubmit } = setup({ resolve: vi.fn(async () => found(1)) });
    await typeCode('QR-1');
    await screen.findAllByText('Cilindro CIL-001 marcado como entregue.');
    fireEvent.click(screen.getAllByRole('radio', { name: 'Não entregue' })[0]!);
    expect(screen.queryByText(/Entregue por/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Por que CIL-001 não foi entregue'), { target: { value: 'Cilindro não estava no endereço' } });
    name('Recebedor Fictício');
    submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ results: [{ itemId: 'i1', delivered: false, reason: 'Cilindro não estava no endereço' }, { itemId: 'i2', delivered: true }] }));
  });

  it('o envio do código fica desabilitado sem conexão', () => {
    setup({ resolve: vi.fn(async () => found(1)), online: false });
    expect(screen.getByRole('button', { name: 'Marcar como entregue' })).toBeDisabled();
  });

  it('o leitor não fica dentro do formulário da entrega (sem formulário aninhado)', async () => {
    setup({ resolve: vi.fn(async () => found(1)) });
    const field = await screen.findByLabelText('Código do cilindro');
    expect(field.closest('form')?.parentElement?.closest('form')).toBeNull();
    expect(screen.getByLabelText('Nome de quem recebeu').closest('form')).not.toBe(field.closest('form'));
  });
});

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
