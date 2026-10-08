// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/HealPixels.c), MIT, Copyright (c) 2026 Wonder Assembly LLC
import { HOLE, OUTSIDE, RING, solveMembrane } from "./heal-solve";

export type SpotHealInput = {
  width: number;
  height: number;
  data: Uint8Array; // RGBA8, straight alpha
  mask: Uint8Array; // R8 coverage, what to heal
  mode: "contentAware" | "texture";
};

// Compositor seeds each stroke at random; a fixed seed keeps the grain repeatable.
const SEED = 1;
const FACTORS = [1.05, 1.35, 1.75, 2.25, 2.8];

/** Half-open bounds [x0, y0, x1, y1] of nonzero bytes in a gray bitmap; all zero when empty. */
export function coverageBounds(
  gray: Uint8Array,
  width: number,
  height: number,
): [number, number, number, number] {
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!gray[y * width + x]) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
    }
  }
  return x1 <= x0 || y1 <= y0 ? [0, 0, 0, 0] : [x0, y0, x1, y1];
}

function hash(v: number): number {
  let x = v >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
const unit = (key: number): number => (hash(key) >>> 8) / 16777216;
// C's lround: halves round away from zero.
const lround = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));

/** The work box (the spot plus its ring, clipped to the image) inside a W × H image. */
type Box = { x0: number; y0: number; w: number; h: number; W: number; H: number };
type Offset = { x: number; y: number };

/** HOLE under the coverage, RING within `ring` of it (a square dilation), OUTSIDE elsewhere. */
function roles(coverage: Uint8Array, b: Box, ring: number): Uint8Array {
  const { w, h } = b;
  const role = new Uint8Array(w * h);
  const near = new Uint8Array(w * h);
  const prefix = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      role[y * w + x] = coverage[(b.y0 + y) * b.W + b.x0 + x] ? HOLE : OUTSIDE;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x]! + (role[y * w + x] === HOLE ? 1 : 0);
    for (let x = 0; x < w; x++)
      near[y * w + x] =
        prefix[Math.min(w, x + ring + 1)]! - prefix[Math.max(0, x - ring)]! > 0 ? 1 : 0;
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y]! + near[y * w + x]!;
    for (let y = 0; y < h; y++) {
      const hit = prefix[Math.min(h, y + ring + 1)]! - prefix[Math.max(0, y - ring)]! > 0;
      if (role[y * w + x] === OUTSIDE && hit) role[y * w + x] = RING;
    }
  }
  return role;
}

// Mean squared difference between the ring around the spot and the ring around the patch
// offset by (dx, dy). Infinite when the patch would overlap the spot or leave the image.
function score(rgba: Uint8Array, role: Uint8Array, b: Box, dx: number, dy: number): number {
  if (Math.abs(dx) < b.w && Math.abs(dy) < b.h) return Infinity;
  if (b.x0 + dx < 0 || b.y0 + dy < 0 || b.x0 + b.w + dx > b.W || b.y0 + b.h + dy > b.H)
    return Infinity;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (role[y * b.w + x] !== RING) continue;
      const t = ((b.y0 + y) * b.W + b.x0 + x) * 4;
      const s = t + (dy * b.W + dx) * 4;
      for (let c = 0; c < 4; c++) sum += (rgba[t + c]! - rgba[s + c]!) ** 2;
      n++;
    }
  }
  return n ? sum / n : Infinity;
}

/** Content-Aware's source patch: 24 angles × 5 distances, then ±3 px to line texture up. */
function findSource(
  rgba: Uint8Array,
  role: Uint8Array,
  b: Box,
  signal?: AbortSignal,
): Offset | null {
  let best = Infinity;
  let o = { x: 0, y: 0 };
  for (let f = 0; f < FACTORS.length; f++) {
    signal?.throwIfAborted();
    for (let a = 0; a < 24; a++) {
      const angle = (a * Math.PI) / 12;
      const dx = lround(Math.cos(angle) * FACTORS[f]! * b.w);
      const dy = lround(Math.sin(angle) * FACTORS[f]! * b.h);
      const s = score(rgba, role, b, dx, dy);
      if (!Number.isFinite(s)) continue;
      const weighted = s * (1 + 0.1 * f); // nearer patches win ties
      if (weighted < best) [best, o] = [weighted, { x: dx, y: dy }];
    }
  }
  if (!Number.isFinite(best)) return null;
  const c = o;
  let refined = score(rgba, role, b, c.x, c.y);
  for (let j = -3; j <= 3; j++) {
    for (let i = -3; i <= 3; i++) {
      const s = score(rgba, role, b, c.x + i, c.y + j);
      if (s < refined) [refined, o] = [s, { x: c.x + i, y: c.y + j }];
    }
  }
  return o;
}

/** Adds the squared difference of pixel `t` against its 4-neighbour average to `detail`. */
function addDetail(rgba: Uint8Array, b: Box, ix: number, iy: number, detail: number[]): void {
  const t = (iy * b.W + ix) * 4;
  for (let c = 0; c < 3; c++) {
    let around = 0;
    let n = 0;
    for (const [nx, ny] of [
      [ix - 1, iy],
      [ix + 1, iy],
      [ix, iy - 1],
      [ix, iy + 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= b.W || ny >= b.H) continue;
      around += rgba[(ny * b.W + nx) * 4 + c]!;
      n++;
    }
    if (n) detail[c] += (rgba[t + c]! - around / n) ** 2;
  }
}

/**
 * Membrane: the edge difference between the original and the patch (or the original itself for
 * a smooth fill), spread across the spot. Returns the grain strength per channel.
 */
function membrane(
  rgba: Uint8Array,
  role: Uint8Array,
  b: Box,
  src: Offset | null,
  value: Float32Array,
  signal?: AbortSignal,
): number[] {
  const mean = [0, 0, 0, 0];
  const detail = [0, 0, 0];
  let ringCount = 0;
  for (let y = 0; y < b.h; y++) {
    signal?.throwIfAborted();
    for (let x = 0; x < b.w; x++) {
      const p = y * b.w + x;
      if (role[p] !== RING) continue; // value stays 0
      ringCount++;
      const t = ((b.y0 + y) * b.W + b.x0 + x) * 4;
      const s = src ? t + (src.y * b.W + src.x) * 4 : -1;
      for (let c = 0; c < 4; c++) {
        value[p * 4 + c] = rgba[t + c]! - (s >= 0 ? rgba[s + c]! : 0);
        mean[c] += value[p * 4 + c]!;
      }
      if (!src) addDetail(rgba, b, b.x0 + x, b.y0 + y, detail);
    }
  }
  for (let p = 0; p < b.w * b.h; p++)
    if (role[p] === HOLE)
      value.set(
        mean.map((m) => m / ringCount),
        p * 4,
      );
  solveMembrane(value, role, b.w, b.h, 0, signal);
  return detail.map((d) => Math.sqrt(d / ringCount) * 0.9);
}

/** Gaussian grain for one pixel, from the C file's hash. */
function grainAt(i: number): number {
  const key = hash(SEED ^ hash(i));
  const u1 = unit(key);
  const u2 = unit((key ^ 0x68e31da4) >>> 0);
  return Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
}

/** Replaces each HOLE pixel by (patch + membrane + grain), weighted by its coverage. */
function blend(
  rgba: Uint8Array,
  coverage: Uint8Array,
  role: Uint8Array,
  b: Box,
  src: Offset | null,
  value: Float32Array,
  detail: number[],
): void {
  const out = [0, 0, 0, 0];
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const p = y * b.w + x;
      if (role[p] !== HOLE) continue;
      const i = (b.y0 + y) * b.W + b.x0 + x;
      const t = i * 4;
      const s = src ? t + (src.y * b.W + src.x) * 4 : -1;
      const amount = coverage[i]! / 255;
      const grain = src ? 0 : grainAt(i);
      for (let c = 0; c < 4; c++) {
        const healed =
          (s >= 0 ? rgba[s + c]! : 0) + value[p * 4 + c]! + (c < 3 ? grain * detail[c]! : 0);
        out[c] = rgba[t + c]! + (healed - rgba[t + c]!) * amount;
      }
      rgba[t + 3] = lround(Math.min(255, Math.max(0, out[3]!)));
      for (let c = 0; c < 3; c++)
        rgba[t + c] = lround(Math.min(rgba[t + 3]!, Math.max(0, out[c]!)));
    }
  }
}

/** `spot_heal` (opacity 1) in place over premultiplied RGBA. */
function heal(
  rgba: Uint8Array,
  coverage: Uint8Array,
  W: number,
  H: number,
  texture: boolean,
  signal?: AbortSignal,
): void {
  const [bx0, by0, bx1, by1] = coverageBounds(coverage, W, H);
  if (bx1 <= bx0) return;
  const ring = Math.min(16, Math.max(2, Math.floor(Math.max(bx1 - bx0, by1 - by0) / 8)));
  const x0 = Math.max(0, bx0 - ring);
  const y0 = Math.max(0, by0 - ring);
  const b: Box = { x0, y0, w: Math.min(W, bx1 + ring) - x0, h: Math.min(H, by1 + ring) - y0, W, H };
  const role = roles(coverage, b, ring);
  if (!role.includes(RING)) return;
  const src = texture ? null : findSource(rgba, role, b, signal);
  const value = new Float32Array(b.w * b.h * 4);
  const detail = membrane(rgba, role, b, src, value, signal);
  blend(rgba, coverage, role, b, src, value, detail);
}

/**
 * Spot healing. Content-Aware copies texture from the nearby patch whose ring best matches the
 * ring around the spot; Create Texture fills smoothly from the edges and adds grain matching the
 * detail around it. Returns the whole image (RGBA8, straight alpha); pixels where `mask` is 0 come
 * back byte for byte. Throws AbortError once `signal` is aborted.
 */
export function spotHeal(input: SpotHealInput, signal?: AbortSignal): Uint8Array {
  signal?.throwIfAborted();
  const { width, height, data, mask } = input;
  // HealPixels.c works on premultiplied pixels (it clamps color to alpha).
  const pre = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    for (let c = 0; c < 3; c++) pre[i + c] = Math.round((data[i + c]! * a) / 255);
    pre[i + 3] = a;
  }
  heal(pre, mask, width, height, input.mode === "texture", signal);
  const out = data.slice();
  for (let p = 0; p < width * height; p++) {
    if (!mask[p]) continue;
    const a = pre[p * 4 + 3]!;
    for (let c = 0; c < 3; c++)
      out[p * 4 + c] = a ? Math.min(255, Math.round((pre[p * 4 + c]! * 255) / a)) : 0;
    out[p * 4 + 3] = a;
  }
  return out;
}
