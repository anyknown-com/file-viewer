// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/MetalLayerEffects.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
// `effects_alpha`, `effects_spread_rows` / `_columns`, `effects_ring` and `effects_shift` as WebGL2
// fragment passes. Every pass covers the whole output; coverage lives in the red channel.

const HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
uniform ivec2 u_size;
out vec4 o_color;
`;

/** `at(t, p)`: coverage of `t` at texel `p`; nothing past the edge. */
const AT_GLSL = `
float at(sampler2D t, ivec2 p) {
  if (any(lessThan(p, ivec2(0))) || any(greaterThanEqual(p, u_size))) return 0.0;
  return texelFetch(t, p, 0).r;
}
`;

/**
 * `layerAt(p)`: the layer's premultiplied pixel at output texel `p`. The layer fills the inner
 * `u_inner` box `u_pad` px in from every edge: texel for texel when `u_srcSize` matches it,
 * bilinear when it is drawn smaller.
 */
export const LAYER_GLSL = `
uniform sampler2D u_layer;
uniform ivec2 u_srcSize;
uniform ivec2 u_inner;
uniform int u_pad;
vec4 layerAt(ivec2 p) {
  ivec2 q = p - ivec2(u_pad);
  if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, u_inner))) return vec4(0.0);
  if (u_inner == u_srcSize) return texelFetch(u_layer, q, 0);
  return texture(u_layer, (vec2(q) + 0.5) / vec2(u_inner));
}
`;

/** effects_alpha: the shape's own coverage. */
export const ALPHA_FS = `${HEAD}${LAYER_GLSL}
void main() {
  o_color = vec4(layerAt(ivec2(gl_FragCoord.xy)).a, 0.0, 0.0, 1.0);
}
`;

/**
 * effects_spread_rows / _columns: the largest (`u_smallest` 0) or smallest (1) coverage within
 * `u_reach` px along `u_dir` ((1, 0) rows, (0, 1) columns); past the edge there is nothing.
 */
export const SPREAD_FS = `${HEAD}
uniform sampler2D u_src;
uniform ivec2 u_dir;
uniform int u_reach;
uniform int u_smallest;
${AT_GLSL}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float best = u_smallest == 1 ? 1.0 : 0.0;
  for (int o = -u_reach; o <= u_reach; ++o) {
    float v = at(u_src, p + u_dir * o);
    best = u_smallest == 1 ? min(best, v) : max(best, v);
  }
  o_color = vec4(best, 0.0, 0.0, 1.0);
}
`;

/** effects_ring: what the stroke covers, between the shape and the spread shape. */
export const RING_FS = `${HEAD}
uniform sampler2D u_shape;
uniform sampler2D u_moved;
uniform int u_smallest;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float shape = texelFetch(u_shape, p, 0).r;
  float moved = texelFetch(u_moved, p, 0).r;
  o_color = vec4(clamp(u_smallest == 1 ? shape - moved : moved - shape, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

/**
 * effects_shift: coverage moved by `u_offset` px (y down), bilinear between texels; a sample that
 * falls outside the frame is nothing.
 */
export const SHIFT_FS = `${HEAD}
uniform sampler2D u_src;
uniform vec2 u_offset;
${AT_GLSL}
void main() {
  vec2 s = vec2(ivec2(gl_FragCoord.xy)) - u_offset;
  float v = 0.0;
  if (all(greaterThanEqual(s, vec2(0.0))) && all(lessThanEqual(s, vec2(u_size - 1)))) {
    ivec2 i0 = ivec2(floor(s));
    ivec2 i1 = min(i0 + 1, u_size - 1);
    vec2 f = s - vec2(i0);
    float top = mix(at(u_src, i0), at(u_src, ivec2(i1.x, i0.y)), f.x);
    float bottom = mix(at(u_src, ivec2(i0.x, i1.y)), at(u_src, i1), f.x);
    v = mix(top, bottom, f.y);
  }
  o_color = vec4(v, 0.0, 0.0, 1.0);
}
`;
