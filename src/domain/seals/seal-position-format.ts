// Descrição compartilhada da qualidade que o Supabase devolve para cada posição do lacre.
export const sealPositionQuality = (quality: 'gps' | 'last_known', accuracy: number | null): string =>
  quality === 'gps' ? `com GPS${accuracy === null ? '' : `, precisão de ${Math.round(accuracy)} m`}` : 'sem GPS: última posição conhecida';
