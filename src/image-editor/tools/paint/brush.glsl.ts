// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/MetalBrushCoverage.swift: continuousBrush, one segment at a time), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Point } from "../../api";

/**
 * One segment a→b in target pixel space, in one of three passes (`u_pass`):
 * 0 — hard tips: coverage (0–1) from the distance to the segment with a 1 px antialiased edge,
 *     × the selection; drawn with MAX blending.
 * 1 — soft tips: the segment's optical density integrated along it (8-point Gauss–Legendre),
 *     uncapped; added into the stroke's float density buffer.
 * 2 — soft tips: coverage = 1 − e^−min(density, 20) from the whole stroke's density
 *     (`u_density`), × the selection, as in Compositor's per-stroke cap.
 * The selection is `u_sel` (canvas-size R8, sampled bilinearly through `u_docFromLayer`) when
 * `u_useSel`.
 */
export const BRUSH_FS = `#version 300 es
precision highp float;
uniform vec2 u_a;
uniform vec2 u_b;
uniform float u_radius;
uniform float u_hardness;
uniform bool u_useSel;
uniform sampler2D u_sel;
uniform ivec2 u_selSize;
uniform mat3 u_docFromLayer;
uniform int u_pass;
uniform sampler2D u_density;
out vec4 o;

const float NODES[4] = float[4](0.1834346425, 0.5255324099, 0.7966664774, 0.9602898565);
const float WEIGHTS[4] = float[4](0.3626837834, 0.3137066459, 0.2223810345, 0.1012285363);

float tip(float d2) {
  float d = sqrt(d2);
  if (u_hardness >= 1.0) return clamp(u_radius - d + 0.5, 0.0, 1.0);
  float t = clamp((d / u_radius - u_hardness) / (1.0 - u_hardness), 0.0, 1.0);
  return max(0.0, (exp(-2.5 * t * t) - exp(-2.5)) / (1.0 - exp(-2.5)));
}

float tipDensity(float d2) {
  return -log(max(1.0 - tip(d2), 0.001));
}

float hardCoverage(vec2 p) {
  vec2 v = u_b - u_a;
  float t = clamp(dot(p - u_a, v) / max(dot(v, v), 1e-12), 0.0, 1.0);
  vec2 delta = p - (u_a + t * v);
  return tip(dot(delta, delta));
}

float density(vec2 p) {
  vec2 v = u_b - u_a;
  float len = length(v);
  if (len < 1e-6) return tipDensity(dot(p - u_a, p - u_a));
  vec2 dir = v / len;
  float proj = dot(p - u_a, dir);
  vec2 perp = p - u_a - proj * dir;
  float perp2 = dot(perp, perp);
  float r2 = u_radius * u_radius;
  if (perp2 >= r2) return 0.0;
  float reach = sqrt(r2 - perp2);
  float lo = max(0.0, proj - reach);
  float hi = min(len, proj + reach);
  if (hi <= lo) return 0.0;
  float mid = (lo + hi) * 0.5;
  float half_ = (hi - lo) * 0.5;
  float integral = 0.0;
  for (int i = 0; i < 4; ++i) {
    float a = mid - half_ * NODES[i] - proj;
    float b = mid + half_ * NODES[i] - proj;
    integral += WEIGHTS[i] * (tipDensity(perp2 + a * a) + tipDensity(perp2 + b * b));
  }
  // Soft tips deposit paint every max(0.25, 2.5% of the diameter), Compositor's spacingFraction.
  float spacing = max(0.25, u_radius * 0.05);
  return integral * half_ / spacing;
}

float selAt(ivec2 i) {
  if (i.x < 0 || i.y < 0 || i.x >= u_selSize.x || i.y >= u_selSize.y) return 0.0;
  return texelFetch(u_sel, i, 0).r;
}

float selection(vec2 lp) {
  if (!u_useSel) return 1.0;
  vec2 d = (u_docFromLayer * vec3(lp, 1.0)).xy - 0.5;
  ivec2 i = ivec2(floor(d));
  vec2 f = fract(d);
  return mix(mix(selAt(i), selAt(i + ivec2(1, 0)), f.x), mix(selAt(i + ivec2(0, 1)), selAt(i + ivec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 p = gl_FragCoord.xy;
  if (u_pass == 1) {
    o = vec4(density(p), 0.0, 0.0, 1.0);
    return;
  }
  float c = u_pass == 0
    ? hardCoverage(p)
    : 1.0 - exp(-min(texelFetch(u_density, ivec2(p), 0).r, 20.0));
  o = vec4(c * selection(p), 0.0, 0.0, 1.0);
}
`;

const NODES = [0.1834346425, 0.5255324099, 0.7966664774, 0.9602898565];
const WEIGHTS = [0.3626837834, 0.3137066459, 0.2223810345, 0.1012285363];

function tip(d2: number, radius: number, hardness: number): number {
  const d = Math.sqrt(d2);
  if (hardness >= 1) return Math.min(1, Math.max(0, radius - d + 0.5));
  const t = Math.min(1, Math.max(0, (d / radius - hardness) / (1 - hardness)));
  return Math.max(0, (Math.exp(-2.5 * t * t) - Math.exp(-2.5)) / (1 - Math.exp(-2.5)));
}

/** BRUSH_FS coverage (without the selection) of a one-segment stroke at `px`; `size` is the diameter. */
export function coverageRef(px: Point, a: Point, b: Point, size: number, hardness: number): number {
  const radius = size / 2;
  const density = (d2: number) => -Math.log(Math.max(1 - tip(d2, radius, hardness), 0.001));
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const qx = px.x - a.x;
  const qy = px.y - a.y;
  if (hardness >= 1) {
    const t = Math.min(1, Math.max(0, (qx * vx + qy * vy) / Math.max(vx * vx + vy * vy, 1e-12)));
    const dx = qx - t * vx;
    const dy = qy - t * vy;
    return tip(dx * dx + dy * dy, radius, hardness);
  }
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return 1 - Math.exp(-density(qx * qx + qy * qy));
  const proj = (qx * vx + qy * vy) / len;
  const perp2 = Math.max(0, qx * qx + qy * qy - proj * proj);
  const r2 = radius * radius;
  if (perp2 >= r2) return 0;
  const reach = Math.sqrt(r2 - perp2);
  const lo = Math.max(0, proj - reach);
  const hi = Math.min(len, proj + reach);
  if (hi <= lo) return 0;
  const mid = (lo + hi) / 2;
  const half = (hi - lo) / 2;
  let integral = 0;
  for (let i = 0; i < 4; i++) {
    const s = mid - half * NODES[i]! - proj;
    const t = mid + half * NODES[i]! - proj;
    integral += WEIGHTS[i]! * (density(perp2 + s * s) + density(perp2 + t * t));
  }
  return 1 - Math.exp(-Math.min((integral * half) / Math.max(0.25, size * 0.025), 20));
}
