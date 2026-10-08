// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/MetalLayerEffects.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
// `MetalLayerEffects.render`: the same passes in the same order, each a fullscreen draw over the
// output, with every effect's size in layer px times `k`.
import type { LayerEffects } from "../../comp/index";
import { compile, drawFullscreen, FULLSCREEN_VS } from "../engine/gl/program";
import { createTarget } from "../engine/gl/target";
import { BLUR_FS, COMPOSE_FS, INSIDE_FS } from "./passes-blur.glsl";
import { ALPHA_FS, RING_FS, SHIFT_FS, SPREAD_FS } from "./passes.glsl";

type Target = ReturnType<typeof createTarget>;
type Uniform = (name: string) => WebGLUniformLocation | null;
type Size = { width: number; height: number };
type Colored = { enabled?: boolean; red: number; green: number; blue: number; opacity: number };

/** Switched on and showing; otherwise skipped, as `MetalLayerEffects.render` does. */
function live<T extends Colored>(e: T | undefined, also = true): T | undefined {
  return e && e.enabled !== false && e.opacity > 0 && also ? e : undefined;
}

/** Where a shadow falls, in px (y down): away from the light at `angle`° counterclockwise from the right. */
function offsetOf(angle: number, distance: number): [number, number] {
  const r = (angle * Math.PI) / 180;
  return [-Math.cos(r) * distance, Math.sin(r) * distance];
}

const flag = (on: unknown) => (on ? 1 : 0);

/**
 * Draws `src` (premultiplied, `srcSize`) into the inner box of `out` (`pad` px in from each edge)
 * with `effects` around and over it; `k` = layer px → output px.
 */
export function runEffectPasses(
  gl: WebGL2RenderingContext,
  src: WebGLTexture,
  srcSize: Size,
  out: { framebuffer: WebGLFramebuffer; width: number; height: number; pad: number },
  effects: LayerEffects,
  k: number,
): void {
  const { width, height, pad } = out;
  const made: Target[] = [];
  const target = (): Target => {
    const t = createTarget(gl, width, height, "rgba16f");
    made.push(t);
    return t;
  };

  function run(
    fs: string,
    into: WebGLFramebuffer,
    inputs: Record<string, WebGLTexture>,
    set: (u: Uniform) => void = () => {},
  ): void {
    const p = compile(gl, FULLSCREEN_VS, fs);
    gl.useProgram(p);
    const u: Uniform = (name) => gl.getUniformLocation(p, name);
    gl.bindFramebuffer(gl.FRAMEBUFFER, into);
    gl.viewport(0, 0, width, height);
    Object.entries(inputs).forEach(([name, texture], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(u(name), unit);
    });
    gl.uniform2i(u("u_size"), width, height);
    set(u);
    drawFullscreen(gl);
    gl.activeTexture(gl.TEXTURE0);
  }

  const layer = (u: Uniform) => {
    gl.uniform2i(u("u_srcSize"), srcSize.width, srcSize.height);
    gl.uniform2i(u("u_inner"), width - 2 * pad, height - 2 * pad);
    gl.uniform1i(u("u_pad"), pad);
  };

  let scratch: Target | undefined;
  /** `from` softened by a Gaussian of σ px into `into`; `from` itself when σ ≤ 0.01. */
  function blur(from: Target, sigma: number, into: () => Target): Target {
    if (sigma <= 0.01) return from;
    scratch ??= target();
    const radius = Math.max(1, Math.round(sigma * 3));
    const dst = into();
    const pass = (a: Target, b: Target, dx: number, dy: number) =>
      run(BLUR_FS, b.framebuffer, { u_src: a.texture }, (u) => {
        gl.uniform2i(u("u_dir"), dx, dy);
        gl.uniform1f(u("u_sigma"), sigma);
        gl.uniform1i(u("u_radius"), radius);
      });
    pass(from, scratch, 1, 0);
    pass(scratch, dst, 0, 1);
    return dst;
  }

  function shifted(from: Target, angle: number, distance: number): Target {
    const [dx, dy] = offsetOf(angle, distance * k);
    const dst = target();
    run(SHIFT_FS, dst.framebuffer, { u_src: from.texture }, (u) =>
      gl.uniform2f(u("u_offset"), dx, dy),
    );
    return dst;
  }

  function inside(shape: Target, moved: Target): Target {
    const dst = target();
    run(INSIDE_FS, dst.framebuffer, { u_shape: shape.texture, u_moved: moved.texture });
    return dst;
  }

  const shape = target();
  run(ALPHA_FS, shape.framebuffer, { u_layer: src }, layer);

  const stroke = live(effects.stroke, (effects.stroke?.size ?? 0) > 0);
  let ring = shape;
  if (stroke) {
    const smallest = stroke.inside ? 1 : 0;
    const reach = Math.max(1, Math.round(stroke.size * k));
    const rows = target();
    const spread = target();
    const set = (dx: number, dy: number) => (u: Uniform) => {
      gl.uniform2i(u("u_dir"), dx, dy);
      gl.uniform1i(u("u_reach"), reach);
      gl.uniform1i(u("u_smallest"), smallest);
    };
    run(SPREAD_FS, rows.framebuffer, { u_src: shape.texture }, set(1, 0));
    run(SPREAD_FS, spread.framebuffer, { u_src: rows.texture }, set(0, 1));
    ring = target();
    run(RING_FS, ring.framebuffer, { u_shape: shape.texture, u_moved: spread.texture }, (u) =>
      gl.uniform1i(u("u_smallest"), smallest),
    );
  }

  const shadowFx = live(effects.shadow);
  const shadow = shadowFx
    ? blur(shifted(shape, shadowFx.angle, shadowFx.distance), (shadowFx.blur * k) / 2, target)
    : shape;

  const overlay = live(effects.colorOverlay);

  const innerFx = live(effects.innerShadow);
  const inner = innerFx
    ? inside(
        shape,
        blur(shifted(shape, innerFx.angle, innerFx.distance), (innerFx.blur * k) / 2, target),
      )
    : shape;

  const glowFx = live(effects.outerGlow, (effects.outerGlow?.size ?? 0) > 0);
  const glow = glowFx ? blur(shape, (glowFx.size * k) / 2, target) : shape;

  const innerGlowFx = live(effects.innerGlow, (effects.innerGlow?.size ?? 0) > 0);
  const innerGlow = innerGlowFx
    ? inside(shape, blur(shape, (innerGlowFx.size * k) / 2, target))
    : shape;

  const color = (u: Uniform, name: string, e: Colored | undefined) =>
    gl.uniform4f(u(name), e?.red ?? 0, e?.green ?? 0, e?.blue ?? 0, e?.opacity ?? 0);
  run(
    COMPOSE_FS,
    out.framebuffer,
    {
      u_layer: src,
      u_ring: ring.texture,
      u_shadow: shadow.texture,
      u_innerShadow: inner.texture,
      u_shape: shape.texture,
      u_glow: glow.texture,
      u_innerGlow: innerGlow.texture,
    },
    (u) => {
      layer(u);
      color(u, "u_strokeColor", stroke);
      color(u, "u_shadowColor", shadowFx);
      color(u, "u_overlayColor", overlay);
      color(u, "u_innerColor", innerFx);
      color(u, "u_glowColor", glowFx);
      color(u, "u_innerGlowColor", innerGlowFx);
      gl.uniform4i(u("u_flags"), flag(stroke), flag(stroke?.inside), flag(shadowFx), flag(innerFx));
      gl.uniform4i(u("u_more"), flag(overlay), flag(glowFx), flag(innerGlowFx), 0);
    },
  );
  for (const t of made) t.dispose();
}
