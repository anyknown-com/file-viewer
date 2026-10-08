// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/GPUNoise.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import { HASH_GLSL } from "./noise.glsl";

/**
 * `add_grain`: two value-noise fields over document position (cells of `u_size` and
 * `u_detailSize` document px), mixed by roughness, strongest in the midtones. `u_src` is
 * premultiplied.
 */
export const GRAIN_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
uniform sampler2D u_src;
uniform mat3 u_docFromPx;
uniform uint u_seed;
uniform float u_strength;
uniform float u_roughness;
uniform float u_size;
uniform float u_detailSize;
out vec4 o_color;
${HASH_GLSL}
float lattice(int ix, int iy, uint seed) {
  uint h = mix32(uint(ix) * 0x9E3779B1u ^ mix32(uint(iy) * 0x85EBCA77u ^ seed));
  return float(h & 0xFFFFu) / 65535.0 + float(h >> 16u) / 65535.0 - 1.0;
}
float grainField(vec2 p, float scale, uint seed) {
  vec2 cell = floor(p / scale);
  vec2 t = p / scale - cell;
  t = t * t * (3.0 - 2.0 * t);
  int ix = int(cell.x), iy = int(cell.y);
  float n00 = lattice(ix, iy, seed), n10 = lattice(ix + 1, iy, seed);
  float n01 = lattice(ix, iy + 1, seed), n11 = lattice(ix + 1, iy + 1, seed);
  float top = n00 + (n10 - n00) * t.x, bottom = n01 + (n11 - n01) * t.x;
  return (top + (bottom - top) * t.y) * 1.6;
}
void main() {
  vec4 color = texelFetch(u_src, ivec2(gl_FragCoord.xy), 0);
  if (color.a <= 0.0) { o_color = color; return; }
  vec2 doc = (u_docFromPx * vec3(gl_FragCoord.xy, 1.0)).xy;
  float coarse = grainField(doc, u_size, u_seed);
  float fine = grainField(doc, u_detailSize, mix32(u_seed ^ 0xA511E9B3u));
  float noise = coarse + (fine - coarse) * u_roughness;
  vec3 rgb = color.rgb / color.a * 255.0;
  float level = min(1.0, (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255.0);
  // Film grain shows most in the midtones.
  float delta = noise * u_strength * (0.4 + 2.4 * level * (1.0 - level));
  o_color = vec4(clamp(rgb + delta, 0.0, 255.0) / 255.0 * color.a, color.a);
}
`;
