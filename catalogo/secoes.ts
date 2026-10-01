import type React from 'react';
import { PaginaComponentes } from './paginas/componentes';
import { PaginaCores } from './paginas/cores';
import { PaginaExcecoes } from './paginas/excecoes';
import { PaginaIcones } from './paginas/icones';
import { PaginaInicio } from './paginas/inicio';
import { PaginaLayout } from './paginas/layout';
import { PaginaLogotipo } from './paginas/logotipo';
import { PaginaTipografia } from './paginas/tipografia';

export interface SecaoDoCatalogo {
  id: string;
  titulo: string;
  resumo: string;
  Pagina: () => React.JSX.Element;
}

export const SECOES: readonly SecaoDoCatalogo[] = [
  { id: 'inicio', titulo: 'Início', resumo: 'Visão geral do design system.', Pagina: PaginaInicio },
  { id: 'cores', titulo: 'Cores', resumo: 'Paleta, combinações permitidas, contraste e gradientes.', Pagina: PaginaCores },
  { id: 'tipografia', titulo: 'Tipografia', resumo: 'Montserrat, escala, pesos e entrelinhas.', Pagina: PaginaTipografia },
  { id: 'layout', titulo: 'Layout', resumo: 'Espaçamento, grade, containers, raios e sombras.', Pagina: PaginaLayout },
  { id: 'componentes', titulo: 'Componentes', resumo: 'Cada componente em todas as variantes e estados.', Pagina: PaginaComponentes },
  { id: 'icones', titulo: 'Ícones', resumo: 'Os 30 ícones em todos os tamanhos, estados e variantes.', Pagina: PaginaIcones },
  { id: 'logotipo', titulo: 'Logotipo', resumo: 'Versões, área de proteção, redução mínima e usos incorretos.', Pagina: PaginaLogotipo },
  { id: 'excecoes', titulo: 'Exceções', resumo: 'Usos fora do padrão, registrados com motivo.', Pagina: PaginaExcecoes },
];
