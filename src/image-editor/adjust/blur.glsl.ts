// Gaussian Blur and Motion Blur as WebGL2 fragment passes. As on Compositor's canvas
// (Compositor/Rendering/GPUCanvas.swift), the blur is not clamped: past the frame's edge is
// transparent, so a tile rendered with `reach` px of margin matches the whole frame.

/** `tap(p)`: `u_src` at texel `p`, transparent outside `u_size`. */
const TAP_GLSL = `
vec4 tap(ivec2 p) {
  if (any(lessThan(p, ivec2(0))) || any(greaterThanEqual(p, u_size))) return vec4(0.0);
  return texelFetch(u_src, p, 0);
}
`;

/**
 * One direction of a separable Gaussian: σ = `u_sigma` px along `u_dir` ((1, 0) or (0, 1)),
 * radius `ceil(3σ)`, weights normalized over the taps. σ < 0.01 copies.
 */
export const GAUSS_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
uniform sampler2D u_src;
uniform ivec2 u_size;
uniform ivec2 u_dir;
uniform float u_sigma;
out vec4 o_color;
${TAP_GLSL}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (u_sigma < 0.01) { o_color = tap(p); return; }
  int radius = int(ceil(3.0 * u_sigma));
  float k = -0.5 / (u_sigma * u_sigma);
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -radius; i <= radius; ++i) {
    float w = exp(float(i * i) * k);
    sum += tap(p + u_dir * i) * w;
    total += w;
  }
  o_color = sum / total;
}
`;

/**
 * Photoshop's motion blur: equal weights along a segment of full length `u_length` px centered on
 * the pixel, direction `u_dir` (unit, framebuffer px); `max(1, ceil(u_length))` bilinear samples.
 */
export const MOTION_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
uniform sampler2D u_src;
uniform ivec2 u_size;
uniform vec2 u_dir;
uniform float u_length;
out vec4 o_color;
${TAP_GLSL}
vec4 bilinear(vec2 at) {
  vec2 base = floor(at);
  vec2 f = at - base;
  ivec2 i = ivec2(base);
  return mix(
    mix(tap(i), tap(i + ivec2(1, 0)), f.x),
    mix(tap(i + ivec2(0, 1)), tap(i + ivec2(1, 1)), f.x),
    f.y
  );
}
void main() {
  vec2 center = gl_FragCoord.xy - 0.5;
  int n = max(1, int(ceil(u_length)));
  if (n == 1) { o_color = bilinear(center); return; }
  vec4 sum = vec4(0.0);
  for (int i = 0; i < n; ++i) {
    float t = (float(i) / float(n - 1) - 0.5) * u_length;
    sum += bilinear(center + u_dir * t);
  }
  o_color = sum / float(n);
}
`;
