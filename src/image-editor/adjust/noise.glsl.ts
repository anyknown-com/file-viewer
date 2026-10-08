// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/GPUNoise.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC

/** `mix32` and `unit`: the integer hash both noise kernels share. */
export const HASH_GLSL = `
uint mix32(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du;
  x ^= x >> 15u; x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}
float unit(uint key) { return float(mix32(key) >> 8u) * (1.0 / 16777216.0); }
`;

/**
 * `add_noise`: one value per document pixel, hashed from `floor(document position)` and the seed,
 * so the pattern holds still under pan, zoom and tiled export. `u_src` is premultiplied.
 */
export const ADD_NOISE_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
uniform sampler2D u_src;
uniform mat3 u_docFromPx;
uniform uint u_seed;
uniform float u_amount;
uniform bool u_gaussian;
uniform bool u_monochromatic;
out vec4 o_color;
${HASH_GLSL}
void main() {
  vec4 color = texelFetch(u_src, ivec2(gl_FragCoord.xy), 0);
  if (color.a <= 0.0) { o_color = color; return; }
  vec2 doc = floor((u_docFromPx * vec3(gl_FragCoord.xy, 1.0)).xy);
  uint px = uint(int(doc.x)), py = uint(int(doc.y));
  uint base = mix32(u_seed ^ mix32(px * 0x9e3779b9u ^ mix32(py * 0x85ebca6bu)));
  float spread = u_amount / 100.0 * 127.5;
  vec3 result;
  for (int c = 0; c < 3; ++c) {
    uint key = u_monochromatic ? base : base + uint(c) * 0x9e3779b9u;
    float n;
    if (u_gaussian) {
      float u1 = unit(key), u2 = unit(key ^ 0x68e31da4u);
      n = sqrt(-2.0 * log(1.0 - u1)) * cos(6.2831853 * u2) * spread * (2.0 / 3.0);
    } else {
      n = (unit(key) * 2.0 - 1.0) * spread;
    }
    result[c] = clamp(color[c] * 255.0 / color.a + n, 0.0, 255.0) / 255.0 * color.a;
  }
  o_color = vec4(result, color.a);
}
`;
