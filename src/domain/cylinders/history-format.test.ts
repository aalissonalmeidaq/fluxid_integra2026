import { describe, expect, it } from 'vitest';
import { describeEventData } from './history-format';

describe('describeEventData: dados do fato em texto, nunca em JSON bruto', () => {
  it('inativação traz o motivo e se estava em estoque', () => {
    expect(describeEventData('cylinder_inactivated', { reason: 'lost', was_in_stock: true })).toEqual(['Motivo: Perdido', 'Estava em estoque']);
    expect(describeEventData('cylinder_inactivated', { reason: 'condemned', was_in_stock: false })).toEqual(['Motivo: Condenado']);
  });

  it('entrada no estoque traz a situação do teste no momento', () => {
    expect(describeEventData('stock_in', { hydro_status: 'vencido', identifier_kind: 'qr_code' })).toEqual(['Tipo do identificador: QR Code', 'Teste: Vencido']);
  });

  it('edição lista os campos alterados com os valores anteriores e novos', () => {
    expect(describeEventData('cylinder_updated', { changes: { manufacturer: { from: 'A', to: 'B' }, manufacture_year: { from: null, to: 2020 } } }))
      .toEqual(['Fabricante: A → B', 'Ano de fabricação: — → 2020']);
  });

  it('identificadores e testes', () => {
    expect(describeEventData('identifier_added', { kind: 'nfc_tag' })).toEqual(['Tipo: Etiqueta NFC']);
    expect(describeEventData('hydrostatic_test_registered', { result: 'approved', performed_on: '2026-10-01', next_due_on: '2027-10-01', hydro_status: 'em_dia' }))
      .toEqual(['Resultado: Aprovado', 'Realizado em 01/10/2026', 'Próxima data: 01/10/2027', 'Teste: Em dia']);
    expect(describeEventData('hydrostatic_test_registered', { result: 'rejected', performed_on: '2026-10-01', next_due_on: null, hydro_status: 'reprovado' }))
      .toEqual(['Resultado: Reprovado', 'Realizado em 01/10/2026', 'Teste: Reprovado']);
  });

  it('dados desconhecidos ou vazios não geram linhas nem expõem identificadores internos', () => {
    expect(describeEventData('cylinder_created', {})).toEqual([]);
    expect(describeEventData('identifier_transferred_in', { identifier_id: 'abc', from_cylinder_id: 'def', kind: 'qr_code' })).toEqual(['Tipo: QR Code']);
    expect(describeEventData('stock_in', { hydro_status: 'estranho' })).toEqual([]);
  });
});
