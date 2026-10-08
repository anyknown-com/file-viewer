// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/HueSaturation.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// `HueSaturationFilter.buildCube`: 33 points per axis, red fastest, then green, then blue.

export const LUT3D_SIZE = 33;

type Rgb = [number, number, number];

/** A 33³ RGBA cube of `fn` at every grid point (input = index / 32); A is 1. */
export function buildLut3d(fn: (r: number, g: number, b: number) => Rgb): Float32Array {
  const n = LUT3D_SIZE;
  const step = n - 1;
  const lut = new Float32Array(n * n * n * 4);
  let index = 0;
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const [or, og, ob] = fn(r / step, g / step, b / step);
        lut[index] = or;
        lut[index + 1] = og;
        lut[index + 2] = ob;
        lut[index + 3] = 1;
        index += 4;
      }
    }
  }
  return lut;
}

/** Trilinear lookup on the CPU, the reference for what the GPU's LINEAR `TEXTURE_3D` returns. */
export function sampleLut3d(lut: Float32Array, r: number, g: number, b: number): Rgb {
  const step = LUT3D_SIZE - 1;
  const axis = (v: number) => {
    const p = Math.min(1, Math.max(0, v)) * step;
    const i = Math.min(step - 1, Math.floor(p));
    return [i, p - i] as const;
  };
  const [ri, rf] = axis(r);
  const [gi, gf] = axis(g);
  const [bi, bf] = axis(b);
  const out: Rgb = [0, 0, 0];
  for (let corner = 0; corner < 8; corner++) {
    const dr = corner & 1;
    const dg = (corner >> 1) & 1;
    const db = (corner >> 2) & 1;
    const w = (dr ? rf : 1 - rf) * (dg ? gf : 1 - gf) * (db ? bf : 1 - bf);
    if (w === 0) continue;
    const at = (((bi + db) * LUT3D_SIZE + gi + dg) * LUT3D_SIZE + ri + dr) * 4;
    for (let c = 0; c < 3; c++) out[c] += w * (lut[at + c] ?? 0);
  }
  return out;
}
