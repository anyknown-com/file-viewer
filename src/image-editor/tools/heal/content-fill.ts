// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/ContentFill.c), MIT, Copyright (c) 2026 Wonder Assembly LLC

/** The largest hole (pixels at least half selected) Content-Aware Fill takes on. */
export const CONTENT_FILL_MAX_PIXELS = 4_000_000;

export type ContentFillInput = {
  width: number;
  height: number;
  data: Uint8Array; // RGBA8, straight alpha
  hole: Uint8Array; // R8, nonzero = fill
};

const DBL_MAX = Number.MAX_VALUE;

/** Mean squared RGBA difference of the known pixels around p and the same spots around q. */
function match(
  px: Uint8Array,
  known: Uint8Array,
  w: number,
  h: number,
  p: number,
  q: number,
  radius: number,
): number {
  const ax = p % w;
  const ay = (p / w) | 0;
  const qx = q % w;
  const qy = (q / w) | 0;
  let count = 0;
  let sum = 0;
  for (let dy = -radius; dy <= radius; ++dy) {
    for (let dx = -radius; dx <= radius; ++dx) {
      const x = ax + dx;
      const y = ay + dy;
      const sx = qx + dx;
      const sy = qy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h || sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      if (!known[y * w + x]) continue;
      const a = (y * w + x) * 4;
      const b = (sy * w + sx) * 4;
      for (let c = 0; c < 4; ++c) {
        const d = px[a + c]! - px[b + c]!;
        sum += d * d;
      }
      ++count;
    }
  }
  return count ? sum / count : DBL_MAX;
}

type Fill = {
  px: Uint8Array;
  w: number;
  h: number;
  radius: number;
  known: Uint8Array;
  target: Uint8Array;
  valid: Uint8Array; // known pixels whose whole patch is known
  donors: Int32Array;
  donorCount: number;
  chosen: Int32Array; // the source each filled pixel copied, -1 before
  next: () => number; // C's next_random
};

/** True when the patch around (x, y) lies inside the image and is all known. */
function wholePatchKnown(f: Fill, x: number, y: number): boolean {
  for (let dy = -f.radius; dy <= f.radius; ++dy) {
    for (let dx = -f.radius; dx <= f.radius; ++dx) {
      const sx = x + dx;
      const sy = y + dy;
      if (sx < 0 || sy < 0 || sx >= f.w || sy >= f.h || !f.known[sy * f.w + sx]) return false;
    }
  }
  return true;
}

function findDonors(f: Fill): void {
  for (let y = 0; y < f.h; ++y) {
    for (let x = 0; x < f.w; ++x) {
      const p = y * f.w + x;
      if (!f.known[p] || !wholePatchKnown(f, x, y)) continue;
      f.valid[p] = 1;
      f.donors[f.donorCount++] = p;
    }
  }
}

/** The k-th candidate source for p: a neighbor's offset carried over (k < 4), else a random donor. */
function candidate(f: Fill, p: number, neighbors: number[], k: number): number {
  if (k >= 4) return f.donors[f.next() % f.donorCount]!;
  const t = neighbors[k]!;
  if (t < 0) return -1;
  return (f.chosen[t]! >= 0 ? f.chosen[t]! : t) + (p - t);
}

/** The best source for p: propagated and random candidates, then a shrinking random search. */
function bestSource(f: Fill, p: number, neighbors: number[]): number {
  const { w, h, valid } = f;
  let best = -1;
  let score = DBL_MAX;
  // Propagate coherent source offsets, then refine with randomized patch search.
  for (let k = 0; k < 28; ++k) {
    const q = candidate(f, p, neighbors, k);
    if (q < 0 || q >= w * h || !valid[q]) continue;
    const s = match(f.px, f.known, w, h, p, q, f.radius);
    if (best < 0 || s < score) {
      score = s;
      best = q;
    }
  }
  if (best < 0) best = f.donors[0]!;
  for (let r = 64; r >= 1; r = (r / 2) | 0) {
    const qx = (best % w) + (f.next() % (2 * r + 1)) - r;
    const qy = ((best / w) | 0) + (f.next() % (2 * r + 1)) - r;
    if (qx < 0 || qy < 0 || qx >= w || qy >= h || !valid[qy * w + qx]) continue;
    const q = qy * w + qx;
    const s = match(f.px, f.known, w, h, p, q, f.radius);
    if (s < score) {
      score = s;
      best = q;
    }
  }
  return best;
}

function holeSize(hole: Uint8Array): number {
  let size = 0;
  for (const v of hole) if (v >= 128) size++;
  return size;
}

/**
 * Fills the hole from its edge inwards, copying for each pixel the best-matching opaque pixel
 * outside it (Compositor's `content_fill`). Unselected transparent pixels are left as they are.
 * Returns the filled RGBA; throws RangeError past CONTENT_FILL_MAX_PIXELS, an Error when no
 * opaque source patch exists, and AbortError once `signal` is aborted (checked per ring).
 */
export function contentFill(input: ContentFillInput, signal?: AbortSignal): Uint8Array {
  signal?.throwIfAborted();
  const { width: w, height: h, hole } = input;
  if (holeSize(hole) > CONTENT_FILL_MAX_PIXELS)
    throw new RangeError(`Content-Aware Fill takes up to ${CONTENT_FILL_MAX_PIXELS} pixels.`);
  const n = w * h;
  let seed = 0x6d2b79f5;
  const f: Fill = {
    px: input.data.slice(),
    w,
    h,
    radius: w >= 5 && h >= 5 ? 2 : 0,
    known: new Uint8Array(n),
    target: new Uint8Array(n),
    valid: new Uint8Array(n),
    donors: new Int32Array(n),
    donorCount: 0,
    chosen: new Int32Array(n).fill(-1),
    next: () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0),
  };
  const { px, known, target } = f;
  const queued = new Uint8Array(n);
  const queue = new Int32Array(n);
  let missing = 0;
  for (let p = 0; p < n; p++) {
    target[p] = hole[p] !== 0 ? 1 : 0;
    known[p] = !target[p] && px[p * 4 + 3] === 255 ? 1 : 0;
    if (target[p]) ++missing;
  }
  if (!missing) return px;
  findDonors(f);
  if (!f.donorCount) throw new Error("Content-Aware Fill found no opaque pixels to copy from.");
  let head = 0;
  let tail = 0;
  for (let p = 0; p < n; p++) {
    const x = p % w;
    const edge =
      (x > 0 && known[p - 1]) ||
      (x + 1 < w && known[p + 1]) ||
      (p >= w && known[p - w]) ||
      (p + w < n && known[p + w]);
    if (target[p] && edge) {
      queue[tail++] = p;
      queued[p] = 1;
    }
  }
  let ring = tail; // where the ring being filled ends in the queue
  let scan = 0;
  for (;;) {
    while (head < tail) {
      if (head === ring) {
        signal?.throwIfAborted();
        ring = tail;
      }
      const p = queue[head++]!;
      const x = p % w;
      const neighbors = [
        x ? p - 1 : -1,
        x + 1 < w ? p + 1 : -1,
        p >= w ? p - w : -1,
        p + w < n ? p + w : -1,
      ];
      const best = bestSource(f, p, neighbors);
      px.copyWithin(p * 4, best * 4, best * 4 + 4);
      known[p] = 1;
      f.chosen[p] = best;
      for (const q of neighbors) {
        if (q < 0 || !target[q] || known[q] || queued[q]) continue;
        queued[q] = 1;
        queue[tail++] = q;
      }
    }
    // A selected area that only transparency touches starts from the best random donor, then spreads.
    while (scan < n && (!target[scan] || known[scan])) ++scan;
    if (scan >= n) break;
    signal?.throwIfAborted();
    queue[tail++] = scan;
    queued[scan] = 1;
    ring = tail;
  }
  return px;
}
