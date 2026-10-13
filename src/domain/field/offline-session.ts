// Sessão local sem conexão (Spec 010, RF-016a; research.md §18). Sem servidor, a pessoa não consegue entrar de novo; por isso a regra de 30 minutos
// de inatividade da Spec 002 **não** bloqueia o registro offline. Vale só o teto de 8 horas desde a última confirmação da sessão pelo servidor,
// que continua protegendo um aparelho perdido. A autorização de verdade é conferida pelo servidor quando o envio acontece.
export const OFFLINE_SESSION_MAX_MS = 8 * 60 * 60 * 1000;
export const OFFLINE_SESSION_EXPIRED_MESSAGE = 'Sessão offline expirada. Conecte-se para entrar de novo.';

export type OfflineSessionState = { allowed: true; remainingMs: number } | { allowed: false; remainingMs: 0; reason: string };

// `confirmedAt`: o instante da última confirmação da sessão pelo servidor (só o instante, nunca o token); nulo quando nunca houve.
export function offlineSessionState(confirmedAt: Date | null, now: Date): OfflineSessionState {
  if (confirmedAt === null) return { allowed: false, remainingMs: 0, reason: OFFLINE_SESSION_EXPIRED_MESSAGE };
  // Relógio atrasado (agora antes da confirmação) nunca estende o teto.
  const elapsed = Math.max(0, now.getTime() - confirmedAt.getTime());
  if (elapsed >= OFFLINE_SESSION_MAX_MS) return { allowed: false, remainingMs: 0, reason: OFFLINE_SESSION_EXPIRED_MESSAGE };
  return { allowed: true, remainingMs: OFFLINE_SESSION_MAX_MS - elapsed };
}
