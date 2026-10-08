import type { RGBA } from "../state";

/** Source-over of `color` onto straight-alpha RGBA `base`, weighted per pixel by `cov / 255 × opacity`. */
export function paintOver(
  base: Uint8Array,
  cov: Uint8Array,
  color: RGBA,
  opacity: number,
): Uint8Array {
  const out = base.slice();
  const [r, g, b, a] = color;
  for (let i = 0; i < cov.length; i++) {
    const sa = (a / 255) * (cov[i]! / 255) * opacity;
    if (sa <= 0) continue;
    const j = i * 4;
    const da = base[j + 3]! / 255;
    const keep = da * (1 - sa);
    const oa = sa + keep;
    out[j] = Math.round((r * sa + base[j]! * keep) / oa);
    out[j + 1] = Math.round((g * sa + base[j + 1]! * keep) / oa);
    out[j + 2] = Math.round((b * sa + base[j + 2]! * keep) / oa);
    out[j + 3] = Math.round(oa * 255);
  }
  return out;
}

/** Multiplies alpha by `1 − cov / 255 × opacity`. */
export function eraseOver(base: Uint8Array, cov: Uint8Array, opacity: number): Uint8Array {
  const out = base.slice();
  for (let i = 0; i < cov.length; i++) {
    const j = i * 4 + 3;
    out[j] = Math.round(base[j]! * (1 - (cov[i]! / 255) * opacity));
  }
  return out;
}

/** R8 mask: `base + (value − base) × cov / 255 × opacity`, rounded. */
export function paintMask(
  base: Uint8Array,
  cov: Uint8Array,
  value: number,
  opacity: number,
): Uint8Array {
  const out = base.slice();
  for (let i = 0; i < cov.length; i++) {
    out[i] = Math.round(base[i]! + (value - base[i]!) * (cov[i]! / 255) * opacity);
  }
  return out;
}
