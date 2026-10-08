// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/GPUCanvas.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
// Gaussian Blur and Motion Blur as passes over the accumulated result below.
import type { PassView } from "../api";
import { compile, drawFullscreen, FULLSCREEN_VS } from "../engine/gl/program";
import { createTarget } from "../engine/gl/target";
import { registerAdjustment } from "../registry";
import { GAUSS_FS, MOTION_FS } from "./blur.glsl";
import { blurRadiusOf, blurReach, motionDistanceOf } from "./reach";

type Target = ReturnType<typeof createTarget>;
type Uniform = (name: string) => WebGLUniformLocation | null;

/** One scratch target per gl, rebuilt when too small or lost with the context. */
const scratch = new WeakMap<WebGL2RenderingContext, Target>();

function scratchFor(gl: WebGL2RenderingContext, width: number, height: number): Target {
  const kept = scratch.get(gl);
  if (kept && kept.width >= width && kept.height >= height && gl.isTexture(kept.texture))
    return kept;
  kept?.dispose();
  const made = createTarget(
    gl,
    Math.max(width, kept?.width ?? 0),
    Math.max(height, kept?.height ?? 0),
    "rgba16f",
  );
  scratch.set(gl, made);
  return made;
}

function draw(
  gl: WebGL2RenderingContext,
  fs: string,
  src: WebGLTexture,
  dst: WebGLFramebuffer,
  view: PassView,
  set: (u: Uniform) => void,
): void {
  const p = compile(gl, FULLSCREEN_VS, fs);
  gl.useProgram(p);
  const u: Uniform = (name) => gl.getUniformLocation(p, name);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
  gl.viewport(0, 0, view.width, view.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, src);
  gl.uniform1i(u("u_src"), 0);
  gl.uniform2i(u("u_size"), view.width, view.height);
  set(u);
  drawFullscreen(gl);
}

export function registerBlurAdjustments(): void {
  registerAdjustment("Gaussian Blur", {
    pass(gl, src, dst, s, view) {
      const sigma = blurRadiusOf(s) * view.scale;
      if (sigma < 0.01) {
        draw(gl, GAUSS_FS, src, dst, view, (u) => gl.uniform1f(u("u_sigma"), 0));
        return;
      }
      const tmp = scratchFor(gl, view.width, view.height);
      const pass = (from: WebGLTexture, to: WebGLFramebuffer, dx: number, dy: number) =>
        draw(gl, GAUSS_FS, from, to, view, (u) => {
          gl.uniform2i(u("u_dir"), dx, dy);
          gl.uniform1f(u("u_sigma"), sigma);
        });
      pass(src, tmp.framebuffer, 1, 0);
      pass(tmp.texture, dst, 0, 1);
    },
    reach: blurReach,
  });
  registerAdjustment("Motion Blur", {
    pass(gl, src, dst, s, view) {
      // GPUCanvas.swift hands CIMotionBlur −angle with the frame's y down: in document
      // coordinates (y down) the streak runs along (cos a, −sin a), counterclockwise on screen.
      const a = ((s.motionAngle ?? 0) * Math.PI) / 180;
      draw(gl, MOTION_FS, src, dst, view, (u) => {
        gl.uniform2f(u("u_dir"), Math.cos(a), -Math.sin(a));
        gl.uniform1f(u("u_length"), motionDistanceOf(s) * view.scale);
      });
    },
    reach: blurReach,
  });
}
