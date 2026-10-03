import React from 'react';
import { AlertsBlock } from './blocks/alerts-block';
import { CylindersBlock } from './blocks/cylinders-block';
import { IndicatorsBlock } from './blocks/indicators-block';
import { MapBlock } from './blocks/map-block';
import { MovementBlock } from './blocks/movement-block';
import { PerformanceBlock } from './blocks/performance-block';
import { StatusBlock } from './blocks/status-block';

// Visão geral: página inicial autenticada (RF-008, RF-009). Mostra só dados de exemplo, rotulados em cada bloco, sem ler
// tenant, pessoa nem dados reais (RF-032). O logotipo do shell é o h1; aqui o título é h2 e cada bloco é h3.
export function OverviewPage(): React.JSX.Element {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="m-0 text-h3 font-semibold text-navy">Visão geral</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">
          Acompanhe cilindros, viagens e alertas da operação. Os números abaixo são dados de exemplo, até a leitura dos dados reais.
        </p>
      </header>
      <IndicatorsBlock />
      <div className="grid grid-cols-1 gap-6 desktop:grid-cols-2">
        <MapBlock />
        <MovementBlock />
      </div>
      <div className="grid grid-cols-1 gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
        <StatusBlock />
        <AlertsBlock />
        <CylindersBlock />
      </div>
      <PerformanceBlock />
    </div>
  );
}
