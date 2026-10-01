import { ativosLogistica } from './ativos-logistica';
import { conectividade } from './conectividade';
import { rastreabilidade } from './rastreabilidade';
import { seguranca } from './seguranca';
import { sistema } from './sistema';
import type { Forma, GrupoDeIcones, IconName } from './tipos';

// Registro dos cinco grupos da prancha de iconografia: 30 ícones (RF-027).
const GRUPOS: Record<GrupoDeIcones, Partial<Record<IconName, readonly Forma[]>>> = {
  rastreabilidade,
  seguranca,
  conectividade,
  'ativos-logistica': ativosLogistica,
  sistema,
};

export const GRUPOS_REGISTRADOS = Object.keys(GRUPOS) as GrupoDeIcones[];

export const ICONES: Partial<Record<IconName, readonly Forma[]>> = Object.assign({}, ...Object.values(GRUPOS));
