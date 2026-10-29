// Cronologia do histórico (Spec 015, T058; US3, RF-019 a RF-021). Agregador puro: ordena por instante e id (determinístico, mesmo com
// páginas que chegam em qualquer ordem ou repetidas), separa os trechos contínuos de cada origem e insere lacunas explícitas onde não há
// evidência — a lacuna nunca vira percurso.
import { segmentTrail, type RuleLimits } from './freshness';
import type { PositionOrigin } from './tracking-types';

export interface ChronoEntry {
  id: string;
  occurredAt: string;
  // Presente nas posições: a origem e quem a emitiu (a viagem para o celular, o dispositivo para o lacre).
  position?: { origin: PositionOrigin; subjectId: string };
}

export interface GapEntry {
  id: string;
  kind: 'gap';
  occurredAt: string;
  endedAt: string;
  origin: PositionOrigin;
  subjectId: string;
}

export interface ChronoSegment {
  key: string;
  origin: PositionOrigin;
  subjectId: string;
  positionIds: string[];
}

export interface Chronology<T extends ChronoEntry> {
  entries: (T | GapEntry)[];
  segments: ChronoSegment[];
}

export function buildChronology<T extends ChronoEntry>(input: readonly T[], rule: RuleLimits): Chronology<T> {
  const unique = new Map<string, T>();
  for (const entry of input) if (!unique.has(entry.id)) unique.set(entry.id, entry);
  const entries = [...unique.values()];

  const tracks = new Map<string, { origin: PositionOrigin; subjectId: string; points: { id: string; observedAt: string }[] }>();
  for (const entry of entries) {
    if (!entry.position) continue;
    const key = `${entry.position.origin}:${entry.position.subjectId}`;
    const track = tracks.get(key) ?? { origin: entry.position.origin, subjectId: entry.position.subjectId, points: [] };
    track.points.push({ id: entry.id, observedAt: entry.occurredAt });
    tracks.set(key, track);
  }

  const segments: ChronoSegment[] = [];
  const gaps: (GapEntry & { after: string })[] = [];
  for (const [key, track] of [...tracks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const trail = segmentTrail(track.points, rule);
    for (const ids of trail.segments) segments.push({ key, origin: track.origin, subjectId: track.subjectId, positionIds: ids });
    trail.segments.slice(0, -1).forEach((ids, index) => {
      const last = ids[ids.length - 1]!;
      const gap = trail.gaps[index]!;
      gaps.push({ id: `gap:${key}:${last}`, kind: 'gap', occurredAt: gap.from, endedAt: gap.to, origin: track.origin, subjectId: track.subjectId, after: last });
    });
  }

  // Ordem: instante, depois fatos antes das lacunas do mesmo instante (a lacuna começa depois da última posição), depois id.
  const rank = (entry: T | GapEntry) => ('kind' in entry && entry.kind === 'gap' ? 1 : 0);
  const ordered: (T | GapEntry)[] = [...entries, ...gaps.map(({ after: _after, ...gap }) => gap)];
  ordered.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || rank(a) - rank(b) || a.id.localeCompare(b.id));
  return { entries: ordered, segments };
}
