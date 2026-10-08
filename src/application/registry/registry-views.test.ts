import { describe, expect, it } from 'vitest';
import {
  toCustomerDetail, toCustomerListItem, toCustomerView, toDriverDetail, toDriverView, toGeofenceDetail, toGeofenceListItem, toLinkableUsers, toOverlaps,
  toPage, toRegistryHistory, toSiteDetail, toSiteListItem, toSitePoints, toSiteView, toVehicleDetail, toVehicleView,
} from './registry-views';

// Visões de leitura dos cadastros: o servidor devolve snake_case; aqui vira camelCase e valor desconhecido é recusado, nunca presumido.

const customer = { id: 'c1', person_type: 'legal', document_display: '11.222.333/0001-81', legal_name: 'Hospital Alfa', trade_name: 'Alfa', segment: 'hospital', status: 'active', cities: ['Recife', 7], site_count: 2, anonymized_at: null };
const site = { id: 's1', customer_id: 'c1', customer_name: 'Hospital Alfa', customer_status: 'inactive', name: 'Matriz', postal_code: '01001000', street: 'Praça da Sé', number: '1', city: 'São Paulo', state: 'SP', status: 'active', version: 3, latitude: -23.5, longitude: -46.6, receiving_days: [1, 'x', 3], coordinates_source: 'geocoded', first_delivery_confirmed: true };
const geofence = { id: 'g1', name: 'Portão', status: 'active', shape: 'circle', site_id: 's1', site_name: 'Matriz', customer_id: 'c1', customer_name: 'Alfa', version: 2, center: { lat: 1, lng: 2 }, radius_m: 100, area_m2: 31415, vertices: [] };
const vehicle = { id: 'v1', plate: 'ABC1D23', vehicle_type: 'truck', status: 'available', licensing_status: 'em_dia', capacity_cylinders: 10, version: 1, brand: 'Volvo' };
const driver = { id: 'd1', full_name: 'Maria', status: 'active', cnh_status: 'a_vencer', version: 4, cnh_valid_until: '2027-01-01', cpf_display: '***.123.456-**', linked: true };

describe('toPage', () => {
  it('lista os itens mapeados, com o total e a próxima página', () => {
    const page = toPage({ code: 'LISTED', customers: [customer], total: 40, next: 'abc' }, 'customers', toCustomerListItem);
    expect(page?.items).toHaveLength(1);
    expect(page).toMatchObject({ total: 40, next: 'abc' });
  });

  it('sem total usa a quantidade de itens e sem próxima página devolve nulo', () => {
    expect(toPage({ code: 'LISTED', customers: [customer] }, 'customers', toCustomerListItem)).toMatchObject({ total: 1, next: null });
  });

  it('código diferente de LISTED, lista ausente ou item inválido recusam a página inteira', () => {
    expect(toPage({ code: 'DENIED', customers: [] }, 'customers', toCustomerListItem)).toBeNull();
    expect(toPage({ code: 'LISTED' }, 'customers', toCustomerListItem)).toBeNull();
    expect(toPage({ code: 'LISTED', customers: [{ id: 'x' }] }, 'customers', toCustomerListItem)).toBeNull();
  });
});

describe('clientes', () => {
  it('converte o item da lista e descarta cidades que não são texto', () => {
    expect(toCustomerListItem(customer)).toMatchObject({ id: 'c1', personType: 'legal', legalName: 'Hospital Alfa', tradeName: 'Alfa', cities: ['Recife'], siteCount: 2, anonymizedAt: null });
  });

  it('campos opcionais ausentes viram valores neutros', () => {
    expect(toCustomerListItem({ id: 'c2', person_type: 'individual', legal_name: 'Ana', segment: 'other', status: 'inactive' }))
      .toMatchObject({ documentDisplay: '', tradeName: null, cities: [], siteCount: 0 });
  });

  it.each([
    ['não é objeto', 'texto'], ['sem id', { ...customer, id: undefined }], ['tipo de pessoa desconhecido', { ...customer, person_type: 'x' }],
    ['situação desconhecida', { ...customer, status: 'x' }], ['segmento desconhecido', { ...customer, segment: 'x' }], ['sem nome', { ...customer, legal_name: null }],
  ])('recusa cliente que %s', (_name, raw) => {
    expect(toCustomerListItem(raw)).toBeNull();
  });

  it('a visão completa exige versão e não carrega cidades nem contagem', () => {
    const view = toCustomerView({ ...customer, version: 5, notes: 'n', segment_detail: 'd', created_at: '2026-01-01' });
    expect(view).toMatchObject({ version: 5, notes: 'n', segmentDetail: 'd', createdAt: '2026-01-01' });
    expect(view).not.toHaveProperty('cities');
    expect(view).not.toHaveProperty('siteCount');
    expect(toCustomerView(customer)).toBeNull();
    expect(toCustomerView('x')).toBeNull();
  });

  it('o detalhe junta cliente, contatos e unidades', () => {
    const detail = toCustomerDetail({
      code: 'FOUND', customer: { ...customer, version: 1 },
      contacts: [{ id: 'k1', name: 'Joana', role: 'Compras', is_primary: true }, { id: 'k2', name: 'Pedro', phone: '1', email: 'a@b.c', anonymized_at: 'x' }],
      sites: [{ id: 's1', name: 'Matriz', city: 'Recife', state: 'PE', status: 'active', active_geofences: 2 }, { id: 's2', name: 'Filial', status: 'inactive', anonymized_at: 'x' }],
    });
    expect(detail?.contacts[0]).toMatchObject({ name: 'Joana', role: 'Compras', phone: null, isPrimary: true });
    expect(detail?.contacts[1]).toMatchObject({ phone: '1', email: 'a@b.c', isPrimary: false, anonymizedAt: 'x' });
    expect(detail?.sites[0]).toMatchObject({ activeGeofences: 2, anonymizedName: false });
    expect(detail?.sites[1]).toMatchObject({ city: '', state: '', activeGeofences: 0, anonymizedName: true });
  });

  it('o detalhe sem contatos nem unidades aceita listas ausentes e recusa o que é inválido', () => {
    expect(toCustomerDetail({ code: 'FOUND', customer: { ...customer, version: 1 } })).toMatchObject({ contacts: [], sites: [] });
    expect(toCustomerDetail({ code: 'NOT_FOUND' })).toBeNull();
    expect(toCustomerDetail({ code: 'FOUND', customer: null })).toBeNull();
    expect(toCustomerDetail({ code: 'FOUND', customer: { ...customer, version: 1 }, contacts: [{ id: 'k' }] })).toBeNull();
    expect(toCustomerDetail({ code: 'FOUND', customer: { ...customer, version: 1 }, contacts: 'x' })).toBeNull();
    expect(toCustomerDetail({ code: 'FOUND', customer: { ...customer, version: 1 }, sites: [{ id: 's', name: 'n', status: 'x' }] })).toBeNull();
    expect(toCustomerDetail({ code: 'FOUND', customer: { ...customer, version: 1 }, contacts: ['x'] })).toBeNull();
    expect(toCustomerDetail({ code: 'FOUND', customer: { ...customer, version: 1 }, sites: ['x'] })).toBeNull();
  });
});

describe('unidades', () => {
  it('converte a unidade, filtra dias inválidos e reconhece a origem das coordenadas', () => {
    expect(toSiteView(site)).toMatchObject({
      id: 's1', customerStatus: 'inactive', receivingDays: [1, 3], coordinatesSource: 'geocoded', firstDeliveryConfirmed: true, latitude: -23.5, complement: null, version: 3,
    });
  });

  it('valores ausentes viram padrões e origem desconhecida vira nula', () => {
    const view = toSiteView({ id: 's', customer_id: 'c', name: 'n', status: 'active', version: 1, coordinates_source: 'x', customer_status: 'x', receiving_days: 'x' });
    expect(view).toMatchObject({ customerName: '', customerStatus: 'active', receivingDays: [], coordinatesSource: null, latitude: null, firstDeliveryConfirmed: false, street: '' });
    expect(toSiteView({ id: 's', customer_id: 'c', name: 'n', status: 'active', version: 1, coordinates_source: 'manual' })?.coordinatesSource).toBe('manual');
  });

  it.each([['não é objeto', null], ['sem versão', { ...site, version: 'x' }], ['sem cliente', { ...site, customer_id: null }], ['sem nome', { ...site, name: 3 }], ['situação inválida', { ...site, status: 'x' }]])('recusa unidade que %s', (_name, raw) => {
    expect(toSiteView(raw)).toBeNull();
  });

  it('o item da lista informa se há geocerca', () => {
    expect(toSiteListItem({ id: 's', customer_id: 'c', name: 'n', status: 'active', has_geofence: true })).toMatchObject({ hasGeofence: true, city: '', customerName: '' });
    expect(toSiteListItem({ id: 's', customer_id: 'c', name: 'n', status: 'active' })?.hasGeofence).toBe(false);
    expect(toSiteListItem({ id: 's', name: 'n', status: 'active' })).toBeNull();
    expect(toSiteListItem(undefined)).toBeNull();
  });

  it('o detalhe junta unidade e geocercas e recusa geocerca inválida', () => {
    const detail = toSiteDetail({ code: 'FOUND', site, geofences: [{ id: 'g', name: 'P', shape: 'polygon', status: 'active' }] });
    expect(detail?.geofences[0]).toMatchObject({ shape: 'polygon' });
    expect(toSiteDetail({ code: 'FOUND', site })?.geofences).toEqual([]);
    expect(toSiteDetail({ code: 'FOUND', site, geofences: [{ id: 'g', name: 'P', shape: 'cone', status: 'active' }] })).toBeNull();
    expect(toSiteDetail({ code: 'FOUND', site, geofences: [null] })).toBeNull();
    expect(toSiteDetail({ code: 'X', site })).toBeNull();
    expect(toSiteDetail({ code: 'FOUND', site: { id: 1 } })).toBeNull();
  });

  it('os pontos do mapa descartam coordenadas fora do intervalo recusando a lista toda', () => {
    const point = { id: 's', customer_id: 'c', name: 'n', latitude: -8, longitude: -35, confirmed: true, city: 'Recife', state: 'PE', customer_name: 'Alfa' };
    expect(toSitePoints({ code: 'FOUND', items: [point], total: 9 })).toMatchObject({ total: 9, items: [{ confirmed: true, city: 'Recife' }] });
    expect(toSitePoints({ code: 'FOUND', items: [{ ...point, confirmed: undefined, city: undefined, state: undefined, customer_name: undefined }] })?.items[0])
      .toMatchObject({ confirmed: false, city: '', state: '', customerName: '' });
    expect(toSitePoints({ code: 'FOUND', items: [point] })?.total).toBe(1);
    expect(toSitePoints({ code: 'FOUND', items: [{ ...point, latitude: 91 }] })).toBeNull();
    expect(toSitePoints({ code: 'FOUND', items: [{ ...point, longitude: -181 }] })).toBeNull();
    expect(toSitePoints({ code: 'FOUND', items: [{ ...point, latitude: null }] })).toBeNull();
    expect(toSitePoints({ code: 'FOUND', items: [null] })).toBeNull();
    expect(toSitePoints({ code: 'FOUND' })).toBeNull();
    expect(toSitePoints({ code: 'DENIED' })).toBeNull();
  });
});

describe('geocercas', () => {
  it('converte o item da lista', () => {
    expect(toGeofenceListItem(geofence)).toMatchObject({ siteId: 's1', siteName: 'Matriz', shape: 'circle' });
    expect(toGeofenceListItem({ id: 'g', name: 'n', status: 'active', shape: 'circle', site_id: 's' })).toMatchObject({ siteName: '', customerId: '', customerName: '' });
  });

  it.each([['não é objeto', 1], ['sem unidade', { ...geofence, site_id: null }], ['forma inválida', { ...geofence, shape: 'x' }], ['situação inválida', { ...geofence, status: 'x' }]])('recusa geocerca que %s', (_name, raw) => {
    expect(toGeofenceListItem(raw)).toBeNull();
  });

  it('o detalhe traz centro, raio, área e vértices', () => {
    expect(toGeofenceDetail({ code: 'FOUND', geofence })).toMatchObject({ center: { lat: 1, lng: 2 }, radiusM: 100, areaM2: 31415, vertices: [], siteStatus: 'active' });
    const polygon = toGeofenceDetail({ code: 'FOUND', geofence: { ...geofence, shape: 'polygon', center: null, radius_m: null, vertices: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, { lat: 5, lng: 6 }], site_status: 'inactive' } });
    expect(polygon).toMatchObject({ center: null, radiusM: null, siteStatus: 'inactive' });
    expect(polygon?.vertices).toHaveLength(3);
  });

  it('o detalhe sem vértices informados aceita lista ausente e recusa o inválido', () => {
    expect(toGeofenceDetail({ code: 'FOUND', geofence: { ...geofence, vertices: undefined } })?.vertices).toEqual([]);
    expect(toGeofenceDetail({ code: 'FOUND', geofence: { ...geofence, vertices: [{ lat: 'x', lng: 1 }] } })).toBeNull();
    expect(toGeofenceDetail({ code: 'FOUND', geofence: { ...geofence, version: null } })).toBeNull();
    expect(toGeofenceDetail({ code: 'FOUND', geofence: { ...geofence, shape: 'x' } })).toBeNull();
    expect(toGeofenceDetail({ code: 'FOUND', geofence: null })).toBeNull();
    expect(toGeofenceDetail({ code: 'NOT_FOUND' })).toBeNull();
    expect(toGeofenceDetail({ code: 'FOUND', geofence: { ...geofence, vertices: [null] } })).toBeNull();
  });

  it('as sobreposições ignoram o que não tem id e nome', () => {
    expect(toOverlaps([{ id: 'a', name: 'A' }, { id: 'b' }, 'x', null])).toEqual([{ id: 'a', name: 'A' }]);
    expect(toOverlaps('x')).toEqual([]);
    expect(toOverlaps(undefined)).toEqual([]);
  });
});

describe('veículos', () => {
  it('converte o veículo e o detalhe', () => {
    expect(toVehicleView(vehicle)).toMatchObject({ plate: 'ABC1D23', vehicleType: 'truck', licensingStatus: 'em_dia', brand: 'Volvo', model: null, maxLoadKg: null });
    expect(toVehicleDetail({ code: 'FOUND', vehicle })).toMatchObject({ id: 'v1' });
    expect(toVehicleDetail({ code: 'NOT_FOUND', vehicle })).toBeNull();
  });

  it.each([
    ['não é objeto', 'x'], ['sem placa', { ...vehicle, plate: null }], ['tipo desconhecido', { ...vehicle, vehicle_type: 'x' }], ['sem tipo', { ...vehicle, vehicle_type: null }],
    ['situação desconhecida', { ...vehicle, status: 'x' }], ['sem situação', { ...vehicle, status: null }], ['licenciamento desconhecido', { ...vehicle, licensing_status: 'x' }],
    ['sem licenciamento', { ...vehicle, licensing_status: null }], ['sem capacidade', { ...vehicle, capacity_cylinders: null }], ['sem versão', { ...vehicle, version: null }],
  ])('recusa veículo que %s', (_name, raw) => {
    expect(toVehicleView(raw)).toBeNull();
  });
});

describe('motoristas', () => {
  it('converte o motorista com documentos sempre mascarados', () => {
    expect(toDriverView(driver)).toMatchObject({ fullName: 'Maria', cpfDisplay: '***.123.456-**', cnhDisplay: '', cnhStatus: 'a_vencer', linked: true, phone: null });
    expect(toDriverView({ ...driver, linked: undefined })?.linked).toBe(false);
  });

  it.each([
    ['não é objeto', 5], ['sem nome', { ...driver, full_name: null }], ['situação inválida', { ...driver, status: 'x' }], ['sem situação da CNH', { ...driver, cnh_status: null }],
    ['situação da CNH inválida', { ...driver, cnh_status: 'x' }], ['sem versão', { ...driver, version: null }], ['sem validade', { ...driver, cnh_valid_until: null }],
  ])('recusa motorista que %s', (_name, raw) => {
    expect(toDriverView(raw)).toBeNull();
  });

  it('o detalhe traz o usuário vinculado, com nome padrão quando falta', () => {
    expect(toDriverDetail({ code: 'FOUND', driver })).toMatchObject({ linkedUser: null });
    expect(toDriverDetail({ code: 'FOUND', driver, linked_user: { id: 'u1', display_name: 'Maria U', active: true } })?.linkedUser).toEqual({ id: 'u1', displayName: 'Maria U', active: true });
    expect(toDriverDetail({ code: 'FOUND', driver, linked_user: { id: 'u1' } })?.linkedUser).toEqual({ id: 'u1', displayName: 'Usuário', active: false });
    expect(toDriverDetail({ code: 'FOUND', driver, linked_user: { display_name: 'sem id' } })).toBeNull();
    expect(toDriverDetail({ code: 'FOUND', driver: { id: 'x' } })).toBeNull();
    expect(toDriverDetail({ code: 'DENIED' })).toBeNull();
  });

  it('os usuários vinculáveis exigem id e usam nome padrão', () => {
    expect(toLinkableUsers({ code: 'LISTED', users: [{ id: 'u1', display_name: 'Ana' }, { id: 'u2' }] })).toEqual([{ id: 'u1', displayName: 'Ana' }, { id: 'u2', displayName: 'Usuário' }]);
    expect(toLinkableUsers({ code: 'LISTED' })).toEqual([]);
    expect(toLinkableUsers({ code: 'LISTED', users: [{ display_name: 'x' }] })).toBeNull();
    expect(toLinkableUsers({ code: 'LISTED', users: ['x'] })).toBeNull();
    expect(toLinkableUsers({ code: 'DENIED' })).toBeNull();
  });
});

describe('histórico', () => {
  const event = { id: 'e1', sequence: 3, event_type: 'site_updated', occurred_at: '2026-10-07T10:00:00Z', actor_name: 'Ana', justification: 'j', data: { changes: [] } };

  it('converte os eventos e a próxima página', () => {
    expect(toRegistryHistory({ code: 'LISTED', events: [event], next: 'p2' })).toEqual({
      events: [{ id: 'e1', sequence: 3, eventType: 'site_updated', actorName: 'Ana', occurredAt: '2026-10-07T10:00:00Z', justification: 'j', data: { changes: [] } }], next: 'p2',
    });
  });

  it('dados que não são objeto viram objeto vazio e a lista ausente vira vazia', () => {
    expect(toRegistryHistory({ code: 'LISTED', events: [{ ...event, data: 'x', actor_name: null, justification: null }] })?.events[0]).toMatchObject({ data: {}, actorName: null, justification: null });
    expect(toRegistryHistory({ code: 'LISTED' })).toEqual({ events: [], next: null });
  });

  it.each([['sem id', { ...event, id: null }], ['sem sequência', { ...event, sequence: null }], ['sem tipo', { ...event, event_type: null }], ['sem data', { ...event, occurred_at: null }], ['não é objeto', 'x']])('recusa o histórico quando um evento está %s', (_name, bad) => {
    expect(toRegistryHistory({ code: 'LISTED', events: [bad] })).toBeNull();
  });

  it('outro código não é histórico', () => {
    expect(toRegistryHistory({ code: 'DENIED' })).toBeNull();
  });
});
