import type { EditorApi, LayerId, PixelTarget, Point, Rect } from "../../api";
import { compile, drawFullscreen, FULLSCREEN_VS } from "../../engine/gl/program";
import { invert, layerPixelSize, targetMatrix } from "../geom";
import { createR8, readRgba, withFramebuffer } from "../gl";
import { hasSelection, selectionOf, unbind } from "../select/mask";
import { BRUSH_FS } from "./brush.glsl";

/**
 * One stroke's coverage on a target-size R8 texture. Each segment draws only its bounding box
 * (scissored) with MAX blending, so overlaps within a stroke never add up.
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
  const sel = hasSelection(api) ? selectionOf(api) : null;
  const m = invert(targetMatrix(api, id, target));
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
      withFramebuffer(gl, texture, width, height, () => {
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
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(rect.x, rect.y, rect.width, rect.height);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.MAX);
        drawFullscreen(gl);
        gl.blendEquation(gl.FUNC_ADD);
        gl.disable(gl.BLEND);
        gl.disable(gl.SCISSOR_TEST);
        unbind(gl, 1);
      });
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
    },
  };
}
