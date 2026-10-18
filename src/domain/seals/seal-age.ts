// Idade de uma posição ou de um contato em texto (Spec 012, RF-011): "agora", "há 2 minutos", "há 3 horas", "hoje às 00:15",
// "ontem às 14:05" ou a data. Sempre no fuso de São Paulo e com o "agora" informado, para não depender do relógio do sistema.
const ZONE = 'America/Sao_Paulo';

const parts = (date: Date) => {
  const values = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${values.year}-${values.month}-${values.day}`, date: `${values.day}/${values.month}/${values.year}`, time: `${values.hour}:${values.minute}` };
};

const plural = (n: number, one: string, many: string) => `há ${n} ${n === 1 ? one : many}`;

export function positionAge(iso: string | null | undefined, now: Date): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return 'sem posição';
  const seconds = Math.floor((now.getTime() - at.getTime()) / 1000);
  if (seconds < 60) return 'agora';
  if (seconds < 3600) return plural(Math.floor(seconds / 60), 'minuto', 'minutos');
  const when = parts(at);
  const today = parts(now);
  const yesterday = parts(new Date(now.getTime() - 86_400_000));
  if (when.day === today.day) return seconds < 12 * 3600 ? plural(Math.floor(seconds / 3600), 'hora', 'horas') : `hoje às ${when.time}`;
  if (when.day === yesterday.day) return `ontem às ${when.time}`;
  return `${when.date} às ${when.time}`;
}

// Último contato do lacre: a mesma idade, mas "nunca" para quem ainda não comunicou (posição e contato são coisas diferentes).
export function contactAge(iso: string | null | undefined, now: Date): string {
  return iso ? positionAge(iso, now) : 'nunca';
}
