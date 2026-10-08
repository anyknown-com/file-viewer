// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/EffectsPreviewCache.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
// On screen, effects of a zoomed-out layer render at a capped size that shrinks as more layers
// carry effects, and each layer's last result is kept until its pixels, effects or view change.
import type { EffectTarget, Layer, PassView } from "../api";
import { compile, drawFullscreen, FULLSCREEN_VS } from "../engine/gl/program";
import { createTarget } from "../engine/gl/target";
import { EFFECT_NAMES } from "./defaults";
import { runEffectPasses } from "./passes";

type Target = ReturnType<typeof createTarget>;
/** A picture of a layer: its inner box `width` × `height`, `pad` px in from every edge. */
type Box = { width: number; height: number; pad: number };
type Entry = { id: string; target: Target; box: Box };

const CACHE_MAX = 64;
const caches = new WeakMap<WebGL2RenderingContext, Map<string, Entry>>();

function cacheOf(gl: WebGL2RenderingContext): Map<string, Entry> {
  let cache = caches.get(gl);
  if (!cache) caches.set(gl, (cache = new Map()));
  return cache;
}

/** How many layers' effects the on-screen cache holds now. */
export function cachedEffects(gl: WebGL2RenderingContext): number {
  return caches.get(gl)?.size ?? 0;
}

/** The longest inner side effects render at on screen while `n` layers carry them. */
export function previewLongSide(n: number): number {
  return Math.floor(Math.min(1536, Math.max(32, Math.sqrt(16_700_000 / Math.max(n, 1)))));
}

/** `from` (a box) stretched over the inner box of `dst`; texel for texel at the same size. */
const BLIT_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform ivec2 u_srcSize;
uniform int u_srcPad;
uniform int u_pad;
uniform vec2 u_ratio;
out vec4 o_color;
void main() {
  vec2 q = (gl_FragCoord.xy - float(u_pad)) * u_ratio + float(u_srcPad);
  if (any(lessThan(q, vec2(0.0))) || any(greaterThanEqual(q, vec2(u_srcSize)))) {
    o_color = vec4(0.0);
  } else if (u_ratio == vec2(1.0)) {
    o_color = texelFetch(u_src, ivec2(q), 0);
  } else {
    o_color = texture(u_src, q / vec2(u_srcSize));
  }
}
`;

function blit(gl: WebGL2RenderingContext, src: WebGLTexture, from: Box, dst: EffectTarget): void {
  const p = compile(gl, FULLSCREEN_VS, BLIT_FS);
  gl.useProgram(p);
  const u = (name: string) => gl.getUniformLocation(p, name);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer);
  gl.viewport(0, 0, dst.width, dst.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, src);
  gl.uniform1i(u("u_src"), 0);
  gl.uniform2i(u("u_srcSize"), from.width + 2 * from.pad, from.height + 2 * from.pad);
  gl.uniform1i(u("u_srcPad"), from.pad);
  gl.uniform1i(u("u_pad"), dst.pad);
  gl.uniform2f(
    u("u_ratio"),
    from.width / (dst.width - 2 * dst.pad),
    from.height / (dst.height - 2 * dst.pad),
  );
  drawFullscreen(gl);
}

/**
 * `EffectsHooks.pass`: `src` (the layer in output px, the size of `dst`'s inner box) with its
 * effects drawn into `dst`. Export renders full size and leaves the on-screen cache alone.
 */
export function renderEffects(
  gl: WebGL2RenderingContext,
  layer: Layer,
  src: WebGLTexture,
  dst: EffectTarget,
  view: PassView & { version: number },
): void {
  const inner = { width: dst.width - 2 * dst.pad, height: dst.height - 2 * dst.pad };
  const fx = layer.effects;
  if (!fx || !EFFECT_NAMES.some((name) => fx[name] && fx[name].enabled !== false)) {
    blit(gl, src, { ...inner, pad: 0 }, dst);
    return;
  }
  if (view.forExport) {
    runEffectPasses(gl, src, inner, dst, fx, view.scale);
    return;
  }

  const cache = cacheOf(gl);
  // The view's placement and the layer's own placement too: panning or moving the layer moves
  // `src` without touching its pixels.
  const key = JSON.stringify([
    layer.id,
    view.version,
    fx,
    view.scale,
    dst.width,
    dst.height,
    view.docFromPx,
    layer.transform,
    layer.maskPlacement,
    layer.maskEnabled,
  ]);
  const hit = cache.get(key);
  if (hit && gl.isTexture(hit.target.texture)) {
    cache.delete(key);
    cache.set(key, hit);
    blit(gl, hit.target.texture, hit.box, dst);
    return;
  }
  for (const [k, e] of cache) {
    if (e.id !== layer.id && gl.isTexture(e.target.texture)) continue;
    e.target.dispose();
    cache.delete(k);
  }

  const limit = previewLongSide(cache.size + 1);
  const long = Math.max(inner.width, inner.height);
  const r = view.scale < 1 && long > limit ? limit / long : 1;
  const box: Box = {
    width: Math.max(1, Math.round(inner.width * r)),
    height: Math.max(1, Math.round(inner.height * r)),
    pad: Math.ceil(dst.pad * r),
  };
  const target = createTarget(gl, box.width + 2 * box.pad, box.height + 2 * box.pad, "rgba16f");
  runEffectPasses(gl, src, inner, { ...target, pad: box.pad }, fx, view.scale * r);
  cache.set(key, { id: layer.id, target, box });
  for (const [k, e] of cache) {
    if (cache.size <= CACHE_MAX) break;
    e.target.dispose();
    cache.delete(k);
  }
  blit(gl, target.texture, box, dst);
}
