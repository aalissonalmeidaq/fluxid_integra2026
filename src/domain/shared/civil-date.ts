// Datas de calendário (AAAA-MM-DD) sem passar por instantes: não dependem do fuso da máquina nem de horário de verão.
// Módulo comum às Specs 006 e 007 (as funções nasceram em src/domain/cylinders/hydrostatic-status.ts, que as reexporta).

// Dias contados em UTC para não sofrer com horário de verão.
export function daysBetween(fromDate: string, toDate: string): number {
  const toUtc = (iso: string): number => {
    const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(toDate) - toUtc(fromDate)) / 86_400_000);
}

// Soma dias a uma data de calendário (AAAA-MM-DD) usando só o calendário civil.
export function addCivilDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// Dia de hoje em America/Sao_Paulo, o mesmo critério do banco.
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Data de calendário real no formato AAAA-MM-DD (recusa 2026-02-30 e 2028-13-01).
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
