// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/GPUNoise.swift, GPUCanvas.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
// Grain and Add Noise as passes: each draws `src` with its noise into `dst` once.
import type { AdjustmentKind, PassView } from "../api";
import { compile, drawFullscreen, FULLSCREEN_VS } from "../engine/gl/program";
import { registerAdjustment } from "../registry";
import { GRAIN_FS } from "./grain.glsl";
import { ADD_NOISE_FS } from "./noise.glsl";

type Uniform = (name: string) => WebGLUniformLocation | null;

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
  const [a, b, c, d, e, f] = view.docFromPx;
  gl.uniformMatrix3fv(u("u_docFromPx"), false, [a, b, 0, c, d, 0, e, f, 1]);
  set(u);
  drawFullscreen(gl);
}

export function registerNoiseAdjustments(): void {
  const kinds: Record<"Grain" | "Add Noise", string> = {
    Grain: GRAIN_FS,
    "Add Noise": ADD_NOISE_FS,
  };
  for (const kind of Object.keys(kinds) as (keyof typeof kinds & AdjustmentKind)[]) {
    registerAdjustment(kind, {
      pass(gl, src, dst, s, view) {
        draw(gl, kinds[kind], src, dst, view, (u) => {
          if (kind === "Grain") {
            // GrainSettings defaults when the record has none; parameters as GPUNoise.addGrain.
            const g = s.grainSettings ?? { amount: 25, size: 1.5, roughness: 50, seed: 0 };
            gl.uniform1ui(u("u_seed"), g.seed);
            gl.uniform1f(u("u_strength"), Math.min(1, g.amount / 100) * 0.35 * 255);
            gl.uniform1f(u("u_roughness"), Math.min(1, Math.max(0, g.roughness / 100)));
            gl.uniform1f(u("u_size"), Math.max(g.size, 0.01));
            gl.uniform1f(u("u_detailSize"), Math.max(0.5, g.size * 0.35));
          } else {
            gl.uniform1ui(u("u_seed"), s.noiseSeed ?? 0);
            gl.uniform1f(u("u_amount"), Math.min(400, Math.max(0.1, s.noiseAmount ?? 10)));
            gl.uniform1i(u("u_gaussian"), s.noiseGaussian ? 1 : 0);
            gl.uniform1i(u("u_monochromatic"), s.noiseMonochromatic ? 1 : 0);
          }
        });
      },
      reach: () => 0,
    });
  }
}
