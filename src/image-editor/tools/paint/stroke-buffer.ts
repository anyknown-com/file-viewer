import type { EditorApi, LayerId, PixelTarget, Point, Rect } from "../../api";
import { compile, drawFullscreen, FULLSCREEN_VS } from "../../engine/gl/program";
import { invert, layerPixelSize, targetMatrix } from "../geom";
import { createR8, readRgba, withFramebuffer } from "../gl";
import { hasSelection, selectionOf, unbind } from "../select/mask";
import { BRUSH_FS } from "./brush.glsl";

/** R16F, renderable and blendable with EXT_color_buffer_float (or _half_float). */
function createDensity(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  if (!gl.getExtension("EXT_color_buffer_float")) gl.getExtension("EXT_color_buffer_half_float");
  const t = gl.createTexture();
  if (!t) throw new Error("Could not create a texture.");
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R16F, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return t;
}

/**
 * One stroke's coverage on a target-size R8 texture. Each segment draws only its bounding box
 * (scissored). Hard tips write coverage with MAX blending, so overlaps never add up. Soft tips add
 * their optical density into a float buffer and re-derive the box's coverage from the whole
 * stroke's density, capped once per stroke (Compositor), so joints between segments stay even.
 */
export function createStrokeBuffer(
  api: EditorApi,
  id: LayerId,
  target: PixelTarget,
): {
  segment(a: Point, b: Point, size: number, hardness: number): Rect;
  read(rect: Rect): Uint8Array;
  dispose(): void;
} {
  const gl = api.gl;
  const { width, height } = layerPixelSize(api, id, target);
  const texture = createR8(gl, width, height);
  let density: WebGLTexture | null = null;
  const sel = hasSelection(api) ? selectionOf(api) : null;
  const m = invert(targetMatrix(api, id, target));

  function pass(program: WebGLProgram, out: WebGLTexture, n: 0 | 1 | 2, rect: Rect): void {
    withFramebuffer(gl, out, width, height, () => {
      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, "u_pass"), n);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(rect.x, rect.y, rect.width, rect.height);
      gl.enable(gl.BLEND);
      if (n === 1) gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendEquation(gl.MAX);
      drawFullscreen(gl);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ZERO);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
    });
  }

  return {
    segment(a, b, size, hardness) {
      const r = size / 2 + 1;
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r));
      const x1 = Math.min(width, Math.ceil(Math.max(a.x, b.x) + r));
      const y1 = Math.min(height, Math.ceil(Math.max(a.y, b.y) + r));
      const rect = { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
      if (rect.width === 0 || rect.height === 0) return rect;
      const program = compile(gl, FULLSCREEN_VS, BRUSH_FS);
      gl.useProgram(program);
      const u = (name: string) => gl.getUniformLocation(program, name);
      gl.uniform2f(u("u_a"), a.x, a.y);
      gl.uniform2f(u("u_b"), b.x, b.y);
      gl.uniform1f(u("u_radius"), Math.max(size / 2, 1e-3));
      gl.uniform1f(u("u_hardness"), hardness);
      gl.uniform1i(u("u_useSel"), sel ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sel?.texture ?? null);
      gl.uniform1i(u("u_sel"), 0);
      gl.uniform2i(u("u_selSize"), sel?.width ?? 0, sel?.height ?? 0);
      gl.uniformMatrix3fv(u("u_docFromLayer"), false, [
        m[0],
        m[1],
        0,
        m[2],
        m[3],
        0,
        m[4],
        m[5],
        1,
      ]);
      gl.uniform1i(u("u_density"), 1);
      if (hardness >= 1) {
        pass(program, texture, 0, rect);
      } else {
        density ??= createDensity(gl, width, height);
        pass(program, density, 1, rect);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, density);
        pass(program, texture, 2, rect);
      }
      unbind(gl, 2);
      api.requestRender();
      return rect;
    },
    read(rect) {
      const rgba = readRgba(gl, texture, rect);
      const out = new Uint8Array(rect.width * rect.height);
      for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4]!;
      return out;
    },
    dispose() {
      gl.deleteTexture(texture);
      if (density) gl.deleteTexture(density);
    },
  };
}
