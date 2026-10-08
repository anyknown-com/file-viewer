// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/MetalLayerEffects.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
// `effects_blur_rows` / `_columns`, `effects_inside` and `effects_compose` as WebGL2 fragment passes.
import { LAYER_GLSL } from "./passes.glsl";

const HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
uniform ivec2 u_size;
out vec4 o_color;
`;

/**
 * effects_blur_rows / _columns: a Gaussian of `u_sigma` px over `u_radius` px along `u_dir`, weights
 * normalized; a sample past the edge takes the edge texel.
 */
export const BLUR_FS = `${HEAD}
uniform sampler2D u_src;
uniform ivec2 u_dir;
uniform float u_sigma;
uniform int u_radius;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float total = 0.0;
  float weights = 0.0;
  for (int o = -u_radius; o <= u_radius; ++o) {
    float w = exp(-float(o * o) / (2.0 * u_sigma * u_sigma));
    total += w * texelFetch(u_src, clamp(p + u_dir * o, ivec2(0), u_size - 1), 0).r;
    weights += w;
  }
  o_color = vec4(total / weights, 0.0, 0.0, 1.0);
}
`;

/** effects_inside: the shape kept where `u_moved` is not, so it lies inside the layer's edge. */
export const INSIDE_FS = `${HEAD}
uniform sampler2D u_shape;
uniform sampler2D u_moved;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float v = texelFetch(u_shape, p, 0).r * (1.0 - texelFetch(u_moved, p, 0).r);
  o_color = vec4(clamp(v, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

/**
 * effects_compose: shadow behind, outer glow over it, outside stroke over that, the layer's pixels
 * over that, then color overlay, inner glow, inner shadow and inside stroke on top, each a Normal
 * source-over. Colors are rgb + opacity; `u_flags` = has stroke, stroke inside, has shadow, has
 * inner shadow; `u_more` = has color overlay, has outer glow, has inner glow. Premultiplied out.
 */
export const COMPOSE_FS = `${HEAD}${LAYER_GLSL}
uniform sampler2D u_ring;
uniform sampler2D u_shadow;
uniform sampler2D u_innerShadow;
uniform sampler2D u_shape;
uniform sampler2D u_glow;
uniform sampler2D u_innerGlow;
uniform vec4 u_strokeColor;
uniform vec4 u_shadowColor;
uniform vec4 u_overlayColor;
uniform vec4 u_innerColor;
uniform vec4 u_glowColor;
uniform vec4 u_innerGlowColor;
uniform ivec4 u_flags;
uniform ivec4 u_more;
vec3 color = vec3(0.0);
float alpha = 0.0;
void over(vec3 c, float coverage) {
  color = c * coverage + color * (1.0 - coverage);
  alpha = coverage + alpha * (1.0 - coverage);
}
float cov(sampler2D t, ivec2 p) { return texelFetch(t, p, 0).r; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (u_flags.z == 1) {
    float c = clamp(cov(u_shadow, p) * u_shadowColor.a, 0.0, 1.0);
    color = u_shadowColor.rgb * c;
    alpha = c;
  }
  if (u_more.y == 1)
    over(u_glowColor.rgb, clamp(cov(u_glow, p) * (1.0 - cov(u_shape, p)) * u_glowColor.a, 0.0, 1.0));
  float stroke = u_flags.x == 1 ? clamp(cov(u_ring, p) * u_strokeColor.a, 0.0, 1.0) : 0.0;
  if (u_flags.x == 1 && u_flags.y == 0) over(u_strokeColor.rgb, stroke);
  vec4 src = layerAt(p);
  color = src.rgb + color * (1.0 - src.a);
  alpha = src.a + alpha * (1.0 - src.a);
  if (u_more.x == 1) over(u_overlayColor.rgb, clamp(cov(u_shape, p) * u_overlayColor.a, 0.0, 1.0));
  if (u_more.z == 1)
    over(u_innerGlowColor.rgb, clamp(cov(u_innerGlow, p) * u_innerGlowColor.a, 0.0, 1.0));
  if (u_flags.w == 1) over(u_innerColor.rgb, clamp(cov(u_innerShadow, p) * u_innerColor.a, 0.0, 1.0));
  if (u_flags.x == 1 && u_flags.y == 1) over(u_strokeColor.rgb, stroke);
  o_color = vec4(clamp(color, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}
`;
