// CSV seguro dos relatórios (Spec 015, T080; RF-027, RF-030). UTF-8 com BOM e separador ";" (planilhas em português), cabeçalhos em
// português e CRLF. Texto que começa com =, +, -, @, tab ou CR recebe um apóstrofo antes da citação, para nunca virar fórmula, comando
// ou hiperlink ativo. Números usam vírgula decimal e não são alterados. Empresa, relatório, geração e critérios vão em colunas, para o
// arquivo continuar tabular, com o fuso das datas. Datas e códigos saem como na tela (values.ts). Determinístico: o mesmo recorte gera o
// mesmo arquivo.
import { localDateTime, presentValue, TIME_ZONE_LABEL } from './values.ts';

export interface CsvColumn {
  key: string;
  label: string;
}

export interface CsvContext {
  organization: string;
  reportType: string;
  generatedAt: string;
  criteria: string;
}

// Marca de ordem de bytes do UTF-8: faz as planilhas abrirem os acentos corretamente.
const BOM = String.fromCharCode(0xfeff);
const SEPARATOR = ';';
const LINE = '\r\n';
const DANGEROUS_START = /^[=+\-@\t\r]/;

export function neutralize(text: string): string {
  return DANGEROUS_START.test(text) ? `'${text}` : text;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  const text = neutralize(String(value));
  const needsQuotes = /[;"\r\n]/.test(text) || text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: readonly CsvColumn[], rows: readonly Record<string, unknown>[], context: CsvContext): string {
  const header = ['Empresa', 'Relatório', 'Gerado em', 'Critérios', 'Fuso horário', ...columns.map((column) => column.label)].map(cell).join(SEPARATOR);
  const prefix = [context.organization, context.reportType, localDateTime(context.generatedAt), context.criteria, TIME_ZONE_LABEL].map(cell);
  const lines = rows.map((row) => [...prefix, ...columns.map((column) => {
    const value = row[column.key];
    return cell(typeof value === 'string' ? presentValue(column.key, value) : value);
  })].join(SEPARATOR));
  return `${BOM}${[header, ...lines].join(LINE)}${LINE}`;
}
