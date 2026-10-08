import { describe, expect, it } from 'vitest';
import { describeRegistryEvent } from './history-format';

// Texto do histórico: ramos alternativos de cada tipo de evento. Valores pessoais nunca aparecem.

describe('describeRegistryEvent: ramos alternativos', () => {
  it('campo sem rótulo conhecido aparece pelo nome, valor numérico e data viram texto legível e mudanças sem campo são ignoradas', () => {
    expect(describeRegistryEvent('x', { changes: [{ field: 'campo_novo', old: 1, new: 2 }, { field: 'licensing_due_on', old: '2026-01-02', new: '' }, { old: 1 }, 'x', null] }))
      .toEqual(['campo_novo: 1 → 2', 'Vencimento do licenciamento: 02/01/2026 → (vazio)']);
  });

  it('tipo e segmento desconhecidos aparecem como vieram', () => {
    expect(describeRegistryEvent('x', { changes: [{ field: 'vehicle_type', old: 'zeppelin', new: 'truck' }, { field: 'segment', old: 'outro', new: 'hospital' }] }))
      .toEqual(['Tipo: zeppelin → Caminhão', 'Segmento: outro → Hospital']);
  });

  it('lista de campos pessoais vazia não gera linha, e nomes que não são texto são ignorados', () => {
    expect(describeRegistryEvent('x', { changed_sensitive: [] })).toEqual([]);
    expect(describeRegistryEvent('x', { changed_sensitive: ['phone', 3, null, 'campo_novo'] })).toEqual(['Campos pessoais alterados (valores não exibidos): Telefone, campo_novo']);
  });

  it('situação do veículo desconhecida aparece como veio e só vale no evento certo', () => {
    expect(describeRegistryEvent('vehicle_status_changed', { from: 'available', to: 'sumiu' })).toEqual(['Situação: Disponível → sumiu']);
    expect(describeRegistryEvent('vehicle_status_changed', { from: 'x', to: 'inactive' })).toEqual(['Situação: x → Inativo']);
    expect(describeRegistryEvent('site_updated', { from: 'available', to: 'inactive' })).toEqual([]);
    expect(describeRegistryEvent('vehicle_status_changed', { from: 'available' })).toEqual([]);
  });

  it('geocerca: nome, forma, raio e alteração genérica', () => {
    expect(describeRegistryEvent('geofence_updated', { name_from: 'A', name_to: 'B', from: { shape: 'circle', radius_m: 100 }, to: { shape: 'circle', radius_m: 100 } }))
      .toEqual(['Nome: A → B', 'Forma ou posição alterada']);
    expect(describeRegistryEvent('geofence_updated', { name_from: 'A', name_to: 'A', from: { shape: 'circle' }, to: { shape: 'polygon' } })).toEqual(['Forma: círculo → polígono']);
    expect(describeRegistryEvent('geofence_updated', { from: { shape: 'polygon' }, to: { shape: 'circle' } })).toEqual(['Forma: polígono → círculo']);
    expect(describeRegistryEvent('geofence_updated', { from: { shape: 'circle', radius_m: 100 }, to: { shape: 'circle', radius_m: 150 } })).toEqual(['Raio: 100 m → 150 m']);
    expect(describeRegistryEvent('geofence_updated', {})).toEqual(['Forma ou posição alterada']);
    expect(describeRegistryEvent('geofence_created', { shape: 'circle', radius_m: 100 })).toEqual([]);
    expect(describeRegistryEvent('geofence_updated', { name_from: 3, name_to: 4 })).toEqual(['Forma ou posição alterada']);
  });

  it('cascata de cliente e de unidade, com contagens ausentes tratadas como zero', () => {
    expect(describeRegistryEvent('customer_inactivated', { sites: 1 })).toEqual(['Inativadas junto: 1 unidade(s) e 0 geocerca(s)']);
    expect(describeRegistryEvent('customer_inactivated', { geofences: 2 })).toEqual(['Inativadas junto: 0 unidade(s) e 2 geocerca(s)']);
    expect(describeRegistryEvent('customer_inactivated', {})).toEqual([]);
    expect(describeRegistryEvent('site_inactivated', { geofences: 4 })).toEqual(['Inativadas junto: 4 geocerca(s)']);
    expect(describeRegistryEvent('site_inactivated', {})).toEqual([]);
    expect(describeRegistryEvent('site_inactivated', { cascade_of: 3 })).toEqual([]);
  });

  it('contatos, documento e anonimização só descrevem quando os dados têm o tipo certo', () => {
    expect(describeRegistryEvent('contacts_changed', { count: 'dois' })).toEqual([]);
    expect(describeRegistryEvent('document_changed', { kind: 3 })).toEqual([]);
    expect(describeRegistryEvent('document_revealed', {})).toEqual([]);
    expect(describeRegistryEvent('person_anonymized', { fields: ['full_name', 7, 'phone'], reason: 'data_subject_request' }))
      .toEqual(['Campos anonimizados: Nome, Telefone', 'Motivo: data_subject_request']);
    expect(describeRegistryEvent('contact_anonymized', { fields: [] })).toEqual([]);
    expect(describeRegistryEvent('contact_anonymized', { reason: 'outro' })).toEqual(['Motivo: outro']);
    expect(describeRegistryEvent('person_anonymized', { fields: 'x', reason: 3 })).toEqual([]);
    expect(describeRegistryEvent('x', { changes: 'x', changed_sensitive: 'y' })).toEqual([]);
  });
});
