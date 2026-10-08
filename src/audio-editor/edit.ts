export type Range = { start: number; end: number };
export type Segment = { id: string; in: number; out: number };
export type Gain = {
  id: string;
  start: number;
  end: number;
  kind: "gain" | "fadeIn" | "fadeOut";
  db?: number;
};
export type AudioEdit = { segments: Segment[]; gains: Gain[] };

const EPS = 1e-9;

function nextId(prefix: "s" | "g", ids: string[]): string {
  let max = 0;
  for (const id of ids) max = Math.max(max, Number(id.slice(1)));
  return `${prefix}${max + 1}`;
}

export function initialEdit(duration: number): AudioEdit {
  return { segments: [{ id: "s1", in: 0, out: duration }], gains: [] };
}

export function outputDuration(state: AudioEdit): number {
  let total = 0;
  for (const s of state.segments) total += s.out - s.in;
  return total;
}

export function boundaries(state: AudioEdit): number[] {
  const result = [0];
  let t = 0;
  for (const s of state.segments) {
    t += s.out - s.in;
    if (t - result[result.length - 1] > EPS) result.push(t);
  }
  return result;
}

export function sourceAt(state: AudioEdit, t: number): { segment: Segment; source: number } | null {
  if (t < 0 || state.segments.length === 0) return null;
  let start = 0;
  for (const segment of state.segments) {
    const end = start + (segment.out - segment.in);
    if (t < end) return { segment, source: segment.in + (t - start) };
    start = end;
  }
  if (Math.abs(t - start) <= EPS) {
    const last = state.segments[state.segments.length - 1];
    return { segment: last, source: last.out };
  }
  return null;
}

export function cut(state: AudioEdit, range: Range): AudioEdit {
  const removed = range.end - range.start;
  if (removed <= 0) return state;
  const ids = state.segments.map((s) => s.id);
  const segments: Segment[] = [];
  let start = 0;
  for (const s of state.segments) {
    const end = start + (s.out - s.in);
    const headEnd = Math.min(end, range.start);
    const tailStart = Math.max(start, range.end);
    const hasHead = headEnd - start > EPS;
    const hasTail = end - tailStart > EPS;
    if (hasHead) segments.push({ id: s.id, in: s.in, out: s.in + (headEnd - start) });
    if (hasTail) {
      let id = s.id;
      if (hasHead) {
        id = nextId("s", ids);
        ids.push(id);
      }
      segments.push({ id, in: s.in + (tailStart - start), out: s.out });
    }
    start = end;
  }
  const gains: Gain[] = [];
  for (const g of state.gains) {
    if (g.end <= range.start) gains.push(g);
    else if (g.start >= range.end) {
      gains.push({ ...g, start: g.start - removed, end: g.end - removed });
    } else if (g.start >= range.start && g.end <= range.end) continue;
    else {
      const gStart = g.start < range.start ? g.start : range.start;
      const gEnd = g.end > range.end ? g.end - removed : range.start;
      gains.push({ ...g, start: gStart, end: gEnd });
    }
  }
  return { segments, gains };
}

export function keep(state: AudioEdit, range: Range): AudioEdit {
  const total = outputDuration(state);
  const after = cut(state, { start: range.end, end: total });
  return cut(after, { start: 0, end: range.start });
}

export function split(state: AudioEdit, t: number): AudioEdit {
  const ids = state.segments.map((s) => s.id);
  let start = 0;
  for (let i = 0; i < state.segments.length; i++) {
    const s = state.segments[i];
    const end = start + (s.out - s.in);
    if (t > start + EPS && t < end - EPS) {
      const mid = s.in + (t - start);
      const first = nextId("s", ids);
      const second = nextId("s", [...ids, first]);
      const segments = [...state.segments];
      segments.splice(i, 1, { id: first, in: s.in, out: mid }, { id: second, in: mid, out: s.out });
      return { segments, gains: state.gains };
    }
    start = end;
  }
  return state;
}

function addGain(state: AudioEdit, entry: Omit<Gain, "id">): AudioEdit {
  const id = nextId(
    "g",
    state.gains.map((g) => g.id),
  );
  return { segments: state.segments, gains: [...state.gains, { id, ...entry }] };
}

export function fade(state: AudioEdit, range: Range, dir: "in" | "out"): AudioEdit {
  return addGain(state, {
    start: range.start,
    end: range.end,
    kind: dir === "in" ? "fadeIn" : "fadeOut",
  });
}

export function gain(state: AudioEdit, range: Range, db: number): AudioEdit {
  return addGain(state, { start: range.start, end: range.end, kind: "gain", db });
}
