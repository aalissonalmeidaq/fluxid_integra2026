import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GeocodeOutcome, GeocodingService } from '@/application/registry/geocoding-service';
import type { PostalCodeService, PostalLookupOutcome } from '@/application/registry/postal-code-service';
import type { RegistryService } from '@/application/registry/registry-service';
import type { SiteDetail } from '@/application/registry/registry-views';
import { SiteFormView } from './site-form-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const CUSTOMER = '81000000-0000-4000-8000-0000000000a1';
const SITE = '82000000-0000-4000-8000-0000000000a1';

const detail = (): SiteDetail => ({
  site: {
    id: SITE, customerId: CUSTOMER, customerName: 'Hospital Teste', customerStatus: 'active', name: 'Matriz', postalCode: '01001000', street: 'Praça da Sé', number: '10',
    complement: null, district: 'Sé', city: 'São Paulo', state: 'SP', ibgeCode: '3550308', latitude: null, longitude: null, receivingContactName: null,
    receivingContactPhone: null, receivingDays: [1, 2], receivingFrom: '08:00:00', receivingTo: '17:00:00', accessInstructions: null, status: 'active', version: 2, anonymizedAt: null,
    coordinatesSource: null, coordinatesConfirmedAt: null, firstDeliveryConfirmed: false,
  },
  geofences: [],
});

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    createSite: vi.fn(async () => ({ kind: 'success' as const, value: { id: SITE, version: 1 } })),
    updateSite: vi.fn(async () => ({ kind: 'success' as const, value: { version: 3 } })),
    getSite: vi.fn(async () => ({ kind: 'success' as const, value: detail() })),
    ...overrides,
  } as unknown as RegistryService & Record<'createSite' | 'updateSite' | 'getSite', ReturnType<typeof vi.fn>>;
}
const fakePostal = (outcome: PostalLookupOutcome) => ({ lookup: vi.fn(async () => outcome) }) as unknown as PostalCodeService & { lookup: ReturnType<typeof vi.fn> };

const FOUND: PostalLookupOutcome = { kind: 'found', address: { postalCode: '01001000', street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP', ibgeCode: '3550308' } };

const renderForm = (service: ReturnType<typeof fakeService> | null, postal: ReturnType<typeof fakePostal> | null, extra: Record<string, unknown> = {}) => {
  const onNavigate = vi.fn();
  render(<SiteFormView organizationId={ORG} service={service} postal={postal} online customerId={CUSTOMER} onNavigate={onNavigate} {...extra} />);
  return { onNavigate };
};

const typeAddress = (): void => {
  fireEvent.change(screen.getByLabelText('Nome da unidade'), { target: { value: 'Matriz' } });
  fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001-000' } });
  fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'Rua Digitada' } });
  fireEvent.change(screen.getByLabelText('Número'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'São Paulo' } });
  fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'SP' } });
};

describe('cadastro de unidade (história 1)', () => {
  it('busca o CEP, preenche o endereço, leva o foco ao número e preserva o que foi digitado', async () => {
    const postal = fakePostal(FOUND);
    renderForm(fakeService(), postal);
    fireEvent.change(screen.getByLabelText('Complemento'), { target: { value: 'Bloco B' } });
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001-000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar CEP' }));
    await waitFor(() => expect(screen.getByLabelText('Logradouro')).toHaveValue('Praça da Sé'));
    expect(postal.lookup).toHaveBeenCalledWith(ORG, '01001000');
    expect(screen.getByLabelText('Bairro')).toHaveValue('Sé');
    expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo');
    expect(screen.getByLabelText('UF')).toHaveValue('SP');
    expect(screen.getByLabelText('Complemento')).toHaveValue('Bloco B');
    expect(screen.getByLabelText('Número')).toHaveValue('123');
    expect(screen.getByLabelText('Número')).toHaveFocus();
  });

  it('CEP genérico (sem logradouro): preenche o que veio e deixa o resto para digitação', async () => {
    const postal = fakePostal({ kind: 'found', address: { postalCode: '01001000', street: '', district: '', city: 'Cidade Genérica', state: 'SP', ibgeCode: null } });
    renderForm(fakeService(), postal);
    fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'Rua Que Eu Digitei' } });
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001-000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar CEP' }));
    await waitFor(() => expect(screen.getByLabelText('Cidade')).toHaveValue('Cidade Genérica'));
    expect(screen.getByLabelText('Logradouro')).toHaveValue('Rua Que Eu Digitei');
  });

  it.each([
    [{ kind: 'not_found' } as const],
    [{ kind: 'unavailable' } as const],
    [{ kind: 'rate_limited', retryAfterSeconds: 20 } as const],
  ])('CEP %j: o endereço é digitado inteiro e a unidade é salva', async (outcome) => {
    const service = fakeService();
    const { onNavigate } = renderForm(service, fakePostal(outcome));
    typeAddress();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar CEP' }));
    await waitFor(() => expect(screen.getAllByRole('status')[0]).not.toHaveTextContent(/Buscando/));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar unidade' }));
    await waitFor(() => expect(service.createSite).toHaveBeenCalledTimes(1));
    expect(service.createSite).toHaveBeenCalledWith(ORG, CUSTOMER, expect.objectContaining({ name: 'Matriz', postalCode: '01001000', street: 'Rua Digitada', state: 'SP' }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/clientes/${CUSTOMER}/unidades/${SITE}`));
  });

  it('erros junto dos campos e foco no primeiro erro, sem enviar', async () => {
    const service = fakeService();
    renderForm(service, fakePostal(FOUND));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar unidade' }));
    expect(await screen.findByText('Informe o nome da unidade com 2 a 120 caracteres.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Nome da unidade')).toHaveFocus());
    expect(service.createSite).not.toHaveBeenCalled();
  });

  it('nome repetido no cliente aparece junto do campo', async () => {
    renderForm(fakeService({ createSite: vi.fn(async () => ({ kind: 'name_conflict' })) }), fakePostal(FOUND));
    typeAddress();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar unidade' }));
    expect(await screen.findByText('Já existe uma unidade com este nome neste cliente.')).toBeInTheDocument();
  });

  it('cliente inativo: avisa em vez de salvar', async () => {
    renderForm(fakeService({ createSite: vi.fn(async () => ({ kind: 'parent_inactive' })) }), fakePostal(FOUND));
    typeAddress();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar unidade' }));
    expect(await screen.findByText(/cliente está inativo/)).toBeInTheDocument();
  });

  it('sem conexão a escrita e a busca ficam desabilitadas e o formulário continua preenchível', () => {
    renderForm(fakeService(), fakePostal(FOUND), { online: false });
    expect(screen.getByRole('button', { name: 'Cadastrar unidade' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Buscar CEP' })).toBeDisabled();
    expect(screen.getByLabelText('Logradouro')).toBeEnabled();
  });

  it('janela de recebimento com horário e sem dia é recusada junto do campo', async () => {
    const service = fakeService();
    renderForm(service, fakePostal(FOUND));
    typeAddress();
    fireEvent.change(screen.getByLabelText('Das'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText('Às'), { target: { value: '17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar unidade' }));
    expect(await screen.findByText('Marque ao menos um dia de recebimento.')).toBeInTheDocument();
    expect(service.createSite).not.toHaveBeenCalled();
  });
});

const fakeGeocoder = (outcome: GeocodeOutcome) => ({ locate: vi.fn(async () => outcome) }) as unknown as GeocodingService & { locate: ReturnType<typeof vi.fn> };
const LOCATED: GeocodeOutcome = { kind: 'found', location: { latitude: -23.550453, longitude: -46.633911, displayName: 'Rua Digitada, São Paulo', precision: 'address' } };
const search = async (): Promise<void> => {
  fireEvent.click(screen.getByRole('button', { name: 'Buscar coordenadas pelo endereço' }));
  await screen.findByRole('checkbox', { name: 'Confirmo que o endereço e o ponto estão corretos' });
};

describe('coordenadas pelo endereço (RF-065 a RF-067)', () => {
  it('busca, a pessoa confirma e a unidade é salva como geocodificada', async () => {
    const service = fakeService();
    const geocoder = fakeGeocoder(LOCATED);
    renderForm(service, fakePostal(FOUND), { geocoder });
    typeAddress();
    await search();
    expect(geocoder.locate).toHaveBeenCalledWith(ORG, expect.objectContaining({ street: 'Rua Digitada', number: '10', city: 'São Paulo', state: 'SP' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmo que o endereço e o ponto estão corretos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar unidade' }));
    await waitFor(() => expect(service.createSite).toHaveBeenCalledTimes(1));
    expect(service.createSite).toHaveBeenCalledWith(ORG, CUSTOMER, expect.objectContaining({ latitude: -23.550453, longitude: -46.633911, coordinatesSource: 'geocoded' }));
  });

  it('sem confirmar não salva: o erro aparece em texto junto da caixa e o foco vai a ela', async () => {
    const service = fakeService();
    renderForm(service, fakePostal(FOUND), { geocoder: fakeGeocoder(LOCATED) });
    typeAddress();
    await search();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar unidade' }));
    expect(await screen.findByText('Confirme o endereço e o ponto, ou apague as coordenadas.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Confirmo que o endereço e o ponto estão corretos' })).toHaveFocus());
    expect(service.createSite).not.toHaveBeenCalled();
  });

  it('coordenadas editadas à mão depois da busca não são enviadas como geocodificadas', async () => {
    const service = fakeService();
    renderForm(service, fakePostal(FOUND), { geocoder: fakeGeocoder(LOCATED) });
    typeAddress();
    await search();
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar unidade' }));
    await waitFor(() => expect(service.createSite).toHaveBeenCalledTimes(1));
    const sent = service.createSite.mock.calls[0]?.[2] as { coordinatesSource?: string };
    expect(sent.coordinatesSource).toBeUndefined();
  });

  it('endereço alterado depois da busca invalida a confirmação e as coordenadas seguem como manuais', async () => {
    const service = fakeService();
    renderForm(service, fakePostal(FOUND), { geocoder: fakeGeocoder(LOCATED) });
    typeAddress();
    await search();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmo que o endereço e o ponto estão corretos' }));
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '99' } });
    expect(screen.queryByRole('checkbox', { name: 'Confirmo que o endereço e o ponto estão corretos' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar unidade' }));
    await waitFor(() => expect(service.createSite).toHaveBeenCalledTimes(1));
    expect((service.createSite.mock.calls[0]?.[2] as { coordinatesSource?: string }).coordinatesSource).toBeUndefined();
  });

  it('falha da busca não trava o cadastro: salva sem coordenadas', async () => {
    const service = fakeService();
    renderForm(service, fakePostal(FOUND), { geocoder: fakeGeocoder({ kind: 'unavailable' }) });
    typeAddress();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar coordenadas pelo endereço' }));
    await waitFor(() => expect(screen.getAllByRole('status').some((node) => /Não foi possível buscar as coordenadas/.test(node.textContent ?? ''))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar unidade' }));
    await waitFor(() => expect(service.createSite).toHaveBeenCalledWith(ORG, CUSTOMER, expect.objectContaining({ latitude: null, longitude: null })));
  });
});

describe('edição de unidade', () => {
  it('abre com os dados e salva com a versão carregada', async () => {
    const service = fakeService();
    const { onNavigate } = renderForm(service, fakePostal(FOUND), { siteId: SITE });
    expect(await screen.findByRole('heading', { name: 'Editar unidade' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome da unidade')).toHaveValue('Matriz');
    expect(screen.getByLabelText('Das')).toHaveValue('08:00');
    fireEvent.change(screen.getByLabelText('Nome da unidade'), { target: { value: 'Matriz Nova' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(service.updateSite).toHaveBeenCalledTimes(1));
    expect(service.updateSite).toHaveBeenCalledWith(ORG, SITE, 2, expect.objectContaining({ name: 'Matriz Nova', receivingFrom: '08:00', receivingTo: '17:00', receivingDays: [1, 2] }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/clientes/${CUSTOMER}/unidades/${SITE}`));
  });

  it('unidade inexistente mostra "não encontrada"', async () => {
    renderForm(fakeService({ getSite: vi.fn(async () => ({ kind: 'not_found' })) }), fakePostal(FOUND), { siteId: SITE });
    expect(await screen.findByText('Unidade não encontrada')).toBeInTheDocument();
  });
});
