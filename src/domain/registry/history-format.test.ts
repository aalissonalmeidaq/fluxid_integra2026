import { describe, expect, it } from 'vitest';
import { describeRegistryEvent } from './history-format';

describe('describeRegistryEvent (RF-036, RF-037)', () => {
  it('mostra campo, valor antigo e novo para campos não sensíveis', () => {
    expect(describeRegistryEvent('vehicle_updated', { changes: [{ field: 'capacity_cylinders', old: 30, new: 40 }, { field: 'licensing_due_on', old: null, new: '2027-01-31' }] }))
      .toEqual(['Capacidade em cilindros: 30 → 40', 'Vencimento do licenciamento: (vazio) → 31/01/2027']);
  });

  it('traduz tipo de veículo e segmento', () => {
    expect(describeRegistryEvent('vehicle_updated', { changes: [{ field: 'vehicle_type', old: 'truck', new: 'van' }] })).toEqual(['Tipo: Caminhão → Van']);
    expect(describeRegistryEvent('customer_updated', { changes: [{ field: 'segment', old: 'hospital', new: 'clinic' }] })).toEqual(['Segmento: Hospital → Clínica']);
  });

  it('campos pessoais aparecem só pelo nome, sem valor', () => {
    expect(describeRegistryEvent('driver_updated', { changed_sensitive: ['full_name', 'phone'] })).toEqual(['Campos pessoais alterados (valores não exibidos): Nome, Telefone']);
  });

  it('situação do veículo, documento alterado e revelado nunca mostram o valor', () => {
    expect(describeRegistryEvent('vehicle_status_changed', { from: 'available', to: 'inactive' })).toEqual(['Situação: Disponível → Inativo']);
    expect(describeRegistryEvent('document_changed', { kind: 'cpf' })).toEqual(['Documento alterado: CPF (valor não exibido)']);
    expect(describeRegistryEvent('document_revealed', { document: 'cnh' })).toEqual(['Documento revelado: CNH (valor não exibido)']);
  });

  it('cascata e contagens', () => {
    expect(describeRegistryEvent('customer_inactivated', { sites: 2, geofences: 3 })).toEqual(['Inativadas junto: 2 unidade(s) e 3 geocerca(s)']);
    expect(describeRegistryEvent('site_inactivated', { cascade_of: '81000000-0000-4000-8000-000000000001' })).toEqual(['Inativado junto com o cadastro de origem']);
    expect(describeRegistryEvent('contacts_changed', { count: 2 })).toEqual(['Contatos informados: 2']);
  });

  it('geocerca: forma anterior e nova, nome alterado e raio', () => {
    expect(describeRegistryEvent('geofence_updated', { name_from: 'A', name_to: 'B', from: { shape: 'circle', radius_m: 100 }, to: { shape: 'polygon' } })).toEqual(['Nome: A → B', 'Forma: círculo → polígono']);
    expect(describeRegistryEvent('geofence_updated', { name_from: 'A', name_to: 'A', from: { shape: 'circle', radius_m: 100 }, to: { shape: 'circle', radius_m: 250 } })).toEqual(['Raio: 100 m → 250 m']);
  });

  it('anonimização lista os campos afetados e o motivo, nunca valores', () => {
    expect(describeRegistryEvent('person_anonymized', { fields: ['full_name', 'phone'], reason: 'data_subject_request' }))
      .toEqual(['Campos anonimizados: Nome, Telefone', 'Motivo: data_subject_request']);
  });

  it('evento sem detalhe não gera linhas e dado inesperado é ignorado', () => {
    expect(describeRegistryEvent('vehicle_created', {})).toEqual([]);
    expect(describeRegistryEvent('vehicle_updated', { changes: [null, 5, {}] })).toEqual([]);
  });
});
