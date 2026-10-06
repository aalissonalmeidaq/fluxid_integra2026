import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

describe('formatDate', () => {
  it('formata datas de calendário sem deslocar o dia por fuso', () => {
    expect(formatDate('2026-10-05')).toBe('05/10/2026');
    expect(formatDate('2026-01-31')).toBe('31/01/2026');
  });

  it('devolve o texto original quando não é uma data válida', () => {
    expect(formatDate('ontem')).toBe('ontem');
    expect(formatDate(null)).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('usa o fuso de São Paulo', () => {
    expect(formatDateTime('2026-10-05T13:30:00Z')).toBe('05/10/2026 10:30');
    expect(formatDateTime('2026-10-05T02:30:00Z')).toBe('04/10/2026 23:30');
  });

  it('devolve o texto original quando não é um instante válido', () => {
    expect(formatDateTime('quando')).toBe('quando');
    expect(formatDateTime(null)).toBe('—');
  });
});
