// Limites únicos de uma viagem (RF-002, RF-003, RF-017). Os três primeiros têm o mesmo valor em private.trip_limits() no SQL;
// tests/contract/trips-limits.test.ts reprova divergência. Os demais são os das restrições das tabelas de viagem.
export const TRIP_LIMITS = {
  maxStops: 30,
  maxCylindersPerStop: 200,
  maxNotes: 500,
  justificationMin: 5,
  justificationMax: 500,
  recipientNameMin: 2,
  recipientNameMax: 120,
  recipientRoleMax: 80,
} as const;
