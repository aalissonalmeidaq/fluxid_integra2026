// Porta do provedor de e-mail e mensagem mínima dos avisos (Spec 015, US6; RF-033; contracts/avisos-email.md). A mensagem usa só uma
// lista fechada de campos: empresa, categoria, tipo do alerta de lacre, instante, severidade, identificador operacional e o caminho do registro no FluxID, que
// exige entrar. Nunca coordenada, endereço, token, URL assinada ou observação. O provedor real só existe depois de escolhido e autorizado;
// até lá, só o falso (testes e ambiente local).
import { ALERT_KIND_LABEL } from '../_shared/alert-kinds.ts';

export interface EmailItem {
  id: string;
  category: 'proximity_confirmed' | 'seal_high_critical' | 'seal_recovered';
  transition: 'opened' | 'recovered';
  to: string;
  organization: string;
  occurred_at: string;
  severity: string;
  kind: string;
  identifier: string;
  path: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type SendResult = { ok: true; ref: string } | { ok: false; permanent: boolean; code: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
}

const CATEGORY: Record<EmailItem['category'], string> = {
  proximity_confirmed: 'Afastamento confirmado',
  seal_high_critical: 'Alerta alto ou crítico de lacre',
  seal_recovered: 'Lacre recuperado',
};
const SEVERITY: Record<string, string> = { high: 'Alta', critical: 'Crítica' };
const EVENT: Record<EmailItem['category'], string> = {
  proximity_confirmed: 'O cilindro se afastou do celular do motorista além do limite da regra de proximidade.',
  seal_high_critical: 'Um alerta de lacre de severidade alta ou crítica foi aberto.',
  seal_recovered: 'O lacre voltou a comunicar depois de um alerta alto ou crítico.',
};

function brasilia(instant: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return 'horário indisponível';
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

export function buildEmailMessage(item: EmailItem, appUrl: string): EmailMessage {
  const base = appUrl.replace(/\/+$/, '');
  const category = CATEGORY[item.category];
  const lines = [
    EVENT[item.category],
    '',
    `Empresa: ${item.organization}`,
    `Identificação: ${item.identifier}`,
    ...(item.category !== 'proximity_confirmed' && ALERT_KIND_LABEL[item.kind] ? [`Alerta: ${ALERT_KIND_LABEL[item.kind]}`] : []),
    `Severidade: ${SEVERITY[item.severity] ?? 'Alta'}`,
    `Quando: ${brasilia(item.occurred_at)} (horário de Brasília)`,
    '',
    `Abra o registro no FluxID (é preciso entrar): ${base}${item.path}`,
    '',
    `Para deixar de receber este aviso, ajuste suas escolhas em Meu perfil: ${base}/perfil`,
  ];
  return { to: item.to, subject: `FluxID · ${category} · ${item.organization}`, text: lines.join('\n') };
}

// Provedor falso: guarda as mensagens em memória e responde com referência sequencial. `rejected` simula recusa permanente e
// `unavailable`, indisponibilidade (para os testes ao vivo do envio com falha).
export function createFakeEmailProvider(mode: 'accept' | 'rejected' | 'unavailable' = 'accept'): EmailProvider & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      if (mode === 'rejected') return { ok: false, permanent: true, code: 'DELIVERY_REJECTED' };
      if (mode === 'unavailable') return { ok: false, permanent: false, code: 'PROVIDER_UNAVAILABLE' };
      sent.push(message);
      return { ok: true, ref: `fake-${sent.length}` };
    },
  };
}
