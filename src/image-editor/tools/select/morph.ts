// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/Selection.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { EditorApi } from "../../api";
import { renderSelection } from "./mask";

const MAX_MORPH = 500;
const MAX_FEATHER = 250;

/**
 * CPU reference of expand / contract: `px` passes of a 3 × 3 max (expand) or min (contract),
 * alternating cross and square so the edge approximates a circle. Outside the canvas counts as 0.
 */
export function morphRef(
  mask: Uint8Array,
  w: number,
  h: number,
  px: number,
  kind: "expand" | "contract",
): Uint8Array {
  let cur = mask;
  const passes = Math.min(MAX_MORPH, Math.max(0, Math.floor(px)));
  const at = (m: Uint8Array, x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x];
  for (let i = 0; i < passes; i++) {
    const next = new Uint8Array(w * h);
    const square = i % 2 === 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = [
          at(cur, x, y),
          at(cur, x + 1, y),
          at(cur, x - 1, y),
          at(cur, x, y + 1),
          at(cur, x, y - 1),
          ...(square
            ? [
                at(cur, x + 1, y + 1),
                at(cur, x - 1, y + 1),
                at(cur, x + 1, y - 1),
                at(cur, x - 1, y - 1),
              ]
            : []),
        ];
        next[y * w + x] = kind === "expand" ? Math.max(...v) : Math.min(...v);
      }
    }
    cur = next;
  }
  return cur;
}

export const featherSigma = (radius: number): number => radius / 2;

/** Normalized Gaussian taps, `2 * ceil(3σ) + 1` of them. */
export function gaussianKernel(sigma: number): Float32Array {
  const r = Math.ceil(3 * sigma);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = sigma > 0 ? Math.exp(-(i * i) / (2 * sigma * sigma)) : 1;
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

const MORPH_FS = `#version 300 es
precision highp float;
uniform sampler2D u_sel;
uniform ivec2 u_size;
uniform int u_square;
uniform int u_expand;
out vec4 o;
float at(ivec2 i) {
  if (i.x < 0 || i.y < 0 || i.x >= u_size.x || i.y >= u_size.y) return 0.0;
  return texelFetch(u_sel, i, 0).r;
}
float pick(float a, float b) { return u_expand == 1 ? max(a, b) : min(a, b); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float v = at(p);
  v = pick(v, at(p + ivec2(1, 0)));
  v = pick(v, at(p + ivec2(-1, 0)));
  v = pick(v, at(p + ivec2(0, 1)));
  v = pick(v, at(p + ivec2(0, -1)));
  if (u_square == 1) {
    v = pick(v, at(p + ivec2(1, 1)));
    v = pick(v, at(p + ivec2(-1, 1)));
    v = pick(v, at(p + ivec2(1, -1)));
    v = pick(v, at(p + ivec2(-1, -1)));
  }
  o = vec4(v, 0.0, 0.0, 1.0);
}
`;

const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D u_sel;
uniform ivec2 u_size;
uniform ivec2 u_dir;
uniform float u_sigma;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int r = int(ceil(3.0 * u_sigma));
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = -r; i <= r; i++) {
    float w = exp(-float(i * i) / (2.0 * u_sigma * u_sigma));
    ivec2 q = clamp(p + u_dir * i, ivec2(0), u_size - 1);
    sum += w * texelFetch(u_sel, q, 0).r;
    wsum += w;
  }
  o = vec4(sum / wsum, 0.0, 0.0, 1.0);
}
`;

function morph(api: EditorApi, px: number, expand: boolean): void {
  const passes = Math.min(MAX_MORPH, Math.max(0, Math.floor(px)));
  const { width, height } = api.doc().manifest;
  for (let i = 0; i < passes; i++) {
    renderSelection(api, MORPH_FS, (gl, program) => {
      gl.uniform2i(gl.getUniformLocation(program, "u_size"), width, height);
      gl.uniform1i(gl.getUniformLocation(program, "u_square"), i % 2);
      gl.uniform1i(gl.getUniformLocation(program, "u_expand"), expand ? 1 : 0);
    });
  }
}

export const expandSelection = (api: EditorApi, px: number): void => morph(api, px, true);
export const contractSelection = (api: EditorApi, px: number): void => morph(api, px, false);

/** Separable Gaussian blur, σ = radius / 2; the canvas edge repeats outward. */
export function featherSelection(api: EditorApi, radius: number): void {
  const r = Math.min(MAX_FEATHER, Math.floor(radius));
  if (r < 1) return;
  const { width, height } = api.doc().manifest;
  for (const dir of [
    [1, 0],
    [0, 1],
  ]) {
    renderSelection(api, BLUR_FS, (gl, program) => {
      gl.uniform2i(gl.getUniformLocation(program, "u_size"), width, height);
      gl.uniform2i(gl.getUniformLocation(program, "u_dir"), dir[0], dir[1]);
      gl.uniform1f(gl.getUniformLocation(program, "u_sigma"), featherSigma(r));
    });
  }
}
