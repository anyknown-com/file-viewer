// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/HealPixels.c), MIT, Copyright (c) 2026 Wonder Assembly LLC

export const OUTSIDE = 0;
export const RING = 1;
export const HOLE = 2;

// The C solver keeps its values in floats; Math.fround rounds each step the same way.
const f32 = Math.fround;

/** One coarse cell (2 × 2 fine pixels): the mean of its RING pixels, else of its HOLE pixels. */
function cell(
  value: Float32Array,
  role: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
): { role: number; sum: number[]; n: number } {
  const known = { role: RING, sum: [0, 0, 0, 0], n: 0 };
  const hole = { role: HOLE, sum: [0, 0, 0, 0], n: 0 };
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const fx = x * 2 + i;
      const fy = y * 2 + j;
      if (fx >= w || fy >= h) continue;
      const p = fy * w + fx;
      const into = role[p] === RING ? known : role[p] === HOLE ? hole : null;
      if (!into) continue;
      into.n++;
      for (let c = 0; c < 4; c++) into.sum[c] = f32(into.sum[c]! + value[p * 4 + c]!);
    }
  }
  return known.n ? known : hole;
}

/** Solves a half-size copy and copies its HOLE values in as the starting point. */
function coarseStart(
  value: Float32Array,
  role: Uint8Array,
  w: number,
  h: number,
  depth: number,
  signal?: AbortSignal,
): void {
  const cw = Math.floor((w + 1) / 2);
  const ch = Math.floor((h + 1) / 2);
  const coarse = new Float32Array(cw * ch * 4);
  const coarseRole = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const k = cell(value, role, w, h, x, y);
      if (!k.n) continue;
      const q = y * cw + x;
      coarseRole[q] = k.role;
      for (let c = 0; c < 4; c++) coarse[q * 4 + c] = k.sum[c]! / k.n;
    }
  }
  solveMembrane(coarse, coarseRole, cw, ch, depth + 1, signal);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const q = (y >> 1) * cw + (x >> 1);
      if (role[p] === HOLE && coarseRole[q] === HOLE)
        value.set(coarse.subarray(q * 4, q * 4 + 4), p * 4);
    }
  }
}

/** Sums the non-OUTSIDE 4-neighbours of (x, y) into `sum`; returns how many there were. */
function neighbours(
  value: Float32Array,
  role: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  sum: number[],
): number {
  sum.fill(0);
  let n = 0;
  for (const [nx, ny] of [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ] as const) {
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const q = ny * w + nx;
    if (role[q] === OUTSIDE) continue;
    for (let c = 0; c < 4; c++) sum[c] = f32(sum[c]! + value[q * 4 + c]!);
    n++;
  }
  return n;
}

/** One successive over-relaxation pass over the HOLE pixels. */
function relax(value: Float32Array, role: Uint8Array, w: number, h: number, sum: number[]): void {
  const omega = f32(1.8);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (role[p] !== HOLE) continue;
      const n = neighbours(value, role, w, h, x, y, sum);
      if (!n) continue;
      for (let c = 0; c < 4; c++) {
        const v = value[p * 4 + c]!;
        value[p * 4 + c] = v + f32(omega * f32(f32(sum[c]! / n) - v));
      }
    }
  }
}

/**
 * `heal_solve`: smooth values over HOLE pixels, fixed to the RING values around them. A coarser
 * copy is solved first and used as the starting point, so large spots settle in few passes.
 */
export function solveMembrane(
  value: Float32Array,
  role: Uint8Array,
  w: number,
  h: number,
  depth: number,
  signal?: AbortSignal,
): void {
  let iterations = 300;
  if (w > 32 && h > 32 && depth < 16) {
    coarseStart(value, role, w, h, depth, signal);
    iterations = 40;
  }
  const sum = [0, 0, 0, 0];
  for (let it = 0; it < iterations; it++) {
    signal?.throwIfAborted();
    relax(value, role, w, h, sum);
  }
}
