// Limites do lacre (Spec 012, data-model.md, "Limites"). Têm o mesmo valor em private.seal_limits() no SQL;
// tests/contract/seals-limits.test.ts reprova divergência. Tempos em segundos.
export const SEAL_LIMITS = {
  repeatDistanceM: 20,
  reportIntervalDefaultS: 60,
  reportIntervalMinS: 30,
  reportIntervalMaxS: 900,
  noCommGraceS: 30,
  noGpsIntervals: 3,
  geofenceToleranceM: 50,
  geofenceOutsideStreak: 2,
  deliverySealPositionMaxAgeS: 120,
  commandConfirmTimeoutS: 600,
  commandNotDeliveredS: 1800,
  batchMax: 50,
  autoLockAfterS: 180,
  wifiListMax: 5,
  lowBatteryPct: 15,
  weakSignalDbm: -85,
  deviceRequestsPerMinute: 6,
  authFailuresMax: 10,
  authFailuresWindowS: 600,
  authBlockS: 900,
  readAtFutureToleranceS: 300,
  justificationMin: 5,
  justificationMax: 500,
  // Versões do contrato das mensagens aceitas ao mesmo tempo (RF-007a).
  protocols: [1],
} as const;
