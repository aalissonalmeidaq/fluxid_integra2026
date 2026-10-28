import React from 'react';
import { usePermissions } from '@/app/navigation/permissions-context';
import { EmptyState, Icon, Loading } from '@/design-system';
import { REPORT_TYPES, reportDefinition } from '@/domain/reports/report-catalog';

// Catálogo dos relatórios (Spec 015, US5; RF-024, RF-037): só os tipos que a pessoa pode ler, cada um com descrição. Ver a tela não
// concede exportação: a mensagem diz se a conta exporta ou só consulta.
export function ReportCatalogScreen({ permissions }: { permissions: readonly string[] }): React.JSX.Element {
  const available = REPORT_TYPES.map(reportDefinition).filter((definition) => permissions.includes(definition.permission));
  const canExport = permissions.includes('report.export');
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-h3 font-semibold text-navy">Relatórios</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">Relatórios operacionais da empresa ativa, com critérios, totais e as linhas que os sustentam.</p>
        <p className="m-0 text-corpo text-grafite">{canExport ? 'Você pode exportar em CSV os relatórios que consulta.' : 'Sua conta consulta, mas não exporta relatórios.'}</p>
      </header>
      {available.length === 0 ? (
        <EmptyState title="Nenhum relatório disponível" description="Sua conta não tem permissão de leitura para nenhum relatório. Fale com quem administra a empresa." />
      ) : (
        <ul aria-label="Relatórios disponíveis" className="m-0 grid list-none gap-4 p-0 tablet:grid-cols-2 desktop:grid-cols-3">
          {available.map((definition) => (
            <li key={definition.type} className="flex flex-col gap-2 rounded-card border border-borda-suave bg-branco p-4">
              <span className="flex items-center gap-2 text-navy"><Icon name="relatorios" size={24} /><a className="font-semibold text-azul-profundo underline" href={`/relatorios/${definition.type}`}>{definition.label}</a></span>
              <p className="m-0 text-corpo text-grafite">{definition.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReportCatalogPage(): React.JSX.Element {
  const { status, permissions } = usePermissions();
  if (status === 'loading') return <Loading variant="pagina" busy label="Verificando permissões…" />;
  return <ReportCatalogScreen permissions={permissions?.tenant ?? []} />;
}
