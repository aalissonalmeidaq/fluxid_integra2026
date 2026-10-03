import { documentacaoDosComponentes } from './componentes';
import { documentacaoDosEstados } from './estados';
import { documentacaoDosGraficos } from './graficos';
import { documentacaoDoShell } from './shell';
import { documentacaoDaMarca } from './marca';
import type { DocumentacaoDeComponente } from './tipos';

// Toda a documentação do catálogo, na ordem em que aparece (RF-011).
export const documentacao: readonly DocumentacaoDeComponente[] = [...documentacaoDosComponentes, ...documentacaoDosEstados, ...documentacaoDaMarca];

export type { DocumentacaoDeComponente } from './tipos';
export { documentacaoDoShell, documentacaoDosGraficos };
