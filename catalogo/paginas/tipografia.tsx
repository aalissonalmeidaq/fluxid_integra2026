import React from 'react';
import { Card } from '@/design-system';
import { tipografia } from '@/design-system/tokens';

const AMOSTRAS: ReadonlyArray<{ id: keyof typeof tipografia.tamanhos; nome: string; classe: string }> = [
  { id: 'display', nome: 'Display', classe: 'text-display font-extrabold' },
  { id: 'h1', nome: 'H1', classe: 'text-h1 font-bold' },
  { id: 'h2', nome: 'H2', classe: 'text-h2 font-bold' },
  { id: 'h3', nome: 'H3', classe: 'text-h3 font-semibold' },
  { id: 'corpo', nome: 'Corpo', classe: 'text-corpo font-normal' },
  { id: 'legenda', nome: 'Legenda', classe: 'text-legenda font-normal' },
];

const PESOS: ReadonlyArray<{ nome: string; peso: number; classe: string }> = [
  { nome: 'Light', peso: 300, classe: 'font-light' },
  { nome: 'Regular', peso: 400, classe: 'font-normal' },
  { nome: 'Medium', peso: 500, classe: 'font-medium' },
  { nome: 'Semibold', peso: 600, classe: 'font-semibold' },
  { nome: 'Bold', peso: 700, classe: 'font-bold' },
  { nome: 'Extrabold', peso: 800, classe: 'font-extrabold' },
];

export function PaginaTipografia(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h2 font-extrabold text-navy tablet:text-h1">Tipografia</h1>
        <p className="max-w-padrao text-corpo text-grafite">
          Montserrat, hospedada no próprio aplicativo. Se a fonte não carregar, o texto usa Arial ou a sans-serif do sistema e o
          layout continua utilizável.
        </p>
      </header>

      <section aria-labelledby="escala" className="flex flex-col gap-4">
        <h2 id="escala" className="text-h3 font-semibold text-navy">
          Escala
        </h2>
        <ul role="list" className="flex flex-col gap-4">
          {AMOSTRAS.map((amostra) => (
            <li key={amostra.id}>
              <Card className="flex flex-col gap-2 p-4">
                <p className="text-legenda text-texto-secundario">
                  {amostra.nome}: {tipografia.tamanhos[amostra.id]} px (em telas estreitas, {tipografia.tamanhosEstreitos[amostra.id]} px), entrelinha de{' '}
                  {tipografia.entrelinhas[amostra.id] * 100}%
                </p>
                <p className={`${amostra.classe} break-words text-grafite`}>Rastreabilidade que protege</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pesos" className="flex flex-col gap-4">
        <h2 id="pesos" className="text-h3 font-semibold text-navy">
          Pesos
        </h2>
        <ul role="list" className="grid grid-cols-1 gap-2 tablet:grid-cols-2">
          {PESOS.map((peso) => (
            <li key={peso.peso} className={`${peso.classe} rounded-card border border-borda-suave bg-branco p-4 text-corpo text-grafite`}>
              {peso.nome} ({peso.peso}): Inteligência que conecta
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="reserva" className="flex flex-col gap-2">
        <h2 id="reserva" className="text-h3 font-semibold text-navy">
          Fontes de reserva e usos a evitar
        </h2>
        <p className="max-w-padrao text-corpo text-grafite">Reserva: {tipografia.familia.slice(2).join(' e ')}. Evite misturar outras famílias, esticar ou condensar o texto e usar pesos fora de 300 a 800.</p>
      </section>
    </div>
  );
}
