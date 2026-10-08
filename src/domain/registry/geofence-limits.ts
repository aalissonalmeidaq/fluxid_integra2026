// Limites da geocerca (RF-014, RF-015). O SQL tem os mesmos valores em private.geofence_limits() e as restrições de
// supabase/migrations/*registry_schema.sql os usam; tests/contract/registry-limits.test.ts reprova divergência.
export const GEOFENCE_LIMITS = {
  radiusMinM: 25,
  radiusMaxM: 5000,
  verticesMin: 3,
  verticesMax: 100,
} as const;

export const LATITUDE_RANGE = { min: -90, max: 90 } as const;
export const LONGITUDE_RANGE = { min: -180, max: 180 } as const;
