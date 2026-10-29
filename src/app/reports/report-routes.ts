// Resolve as rotas dos relatórios da Spec 015 sem biblioteca de roteamento: /relatorios, /relatorios/:tipo e /relatorios/exportacoes/:id.
// A permissão de cada tela é só para decidir o que mostrar; a leitura e a exportação são sempre decididas no servidor. O resolvedor não
// importa nenhuma página: a área registra o `React.lazy` de cada tela em src/pages/reports/reports-area.tsx.
import { isReportType, type ReportType } from '@/domain/reports/report-catalog';

export type ReportRoute =
  | { kind: 'catalog' }
  | { kind: 'report'; type: ReportType }
  | { kind: 'export'; id: string }
  | { kind: 'not_found' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveReportRoute(pathname: string): ReportRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const [, head = '', section, id, ...tail] = path.split('/');
  if (head !== 'relatorios') return null;
  if (section === undefined) return { kind: 'catalog' };
  if (section === 'exportacoes') return id !== undefined && tail.length === 0 && UUID.test(id) ? { kind: 'export', id } : { kind: 'not_found' };
  return isReportType(section) && id === undefined ? { kind: 'report', type: section } : { kind: 'not_found' };
}
