// What a layer draw samples besides its pixels: adjustment LUTs (kept per layer) and masks.
import type { AdjustmentHooks, AdjustmentSettings, Layer, LayerId } from "../api";
import { layerMatrixOf } from "../doc/layer-matrix";
import { drawUtil, type Frame, type MaskRef } from "./draw";
import { readTexture } from "./gl/read";
import { createTarget } from "./gl/target";
import { OP } from "./gl/util.glsl";
import type { TextureStore } from "./textures";

type Lut = { dims: 1 | 3; texture: WebGLTexture };

export function createLayerInputs(gl: WebGL2RenderingContext, textures: TextureStore) {
  const luts = new Map<LayerId, { settings: AdjustmentSettings; lut: Lut }>();

  function lutFor(layer: Layer, make: AdjustmentHooks["lut"]): Lut | null {
    const settings = layer.adjustment;
    if (!settings || !make) return null;
    const cached = luts.get(layer.id);
    const alive = cached !== undefined && gl.isTexture(cached.lut.texture);
    if (alive && cached.settings === settings) return cached.lut;
    if (alive) gl.deleteTexture(cached.lut.texture);
    const lut = make(gl, settings);
    const bind = lut.dims === 1 ? gl.TEXTURE_2D : gl.TEXTURE_3D;
    gl.bindTexture(bind, lut.texture);
    gl.texParameteri(bind, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(bind, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(bind, wrap, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(bind, null);
    luts.set(layer.id, { settings, lut });
    return lut;
  }

  function maskOf(layer: Layer): MaskRef | null {
    // A deleted mask keeps its texture for undo (layer-ops `addLayerMask`); the manifest decides.
    if (layer.maskFile === undefined || layer.maskEnabled === false) return null;
    const texture = textures.get(layer.id, "mask");
    const size = textures.size(layer.id, "mask");
    if (!texture || !size) return null;
    textures.sample(layer.id, "mask", layer.transform.sampling);
    const { width: w, height: h } = size;
    const edge = textures.edge(layer.id, () => {
      const rows = [0, h - 1].map((y) =>
        readTexture(gl, texture, { x: 0, y, width: w, height: 1 }, 1),
      );
      const cols = [0, w - 1].map((x) =>
        readTexture(gl, texture, { x, y: 0, width: 1, height: h }, 1),
      );
      return Uint8Array.from([...rows, ...cols].flatMap((a) => [...a]));
    });
    const mat = layerMatrixOf(layer.maskPlacement ?? layer.transform, size);
    return { texture, mat, width: w, height: h, edge };
  }

  return {
    lutFor,
    maskOf,
    /** Frees the LUTs of layers that are gone or no longer adjustments (texture belongs to 10). */
    prune(byId: ReadonlyMap<LayerId, Layer>) {
      for (const [id, cached] of luts) {
        if (byId.get(id)?.adjustment) continue;
        gl.deleteTexture(cached.lut.texture);
        luts.delete(id);
      }
    },
    dispose() {
      for (const { lut } of luts.values()) gl.deleteTexture(lut.texture);
      luts.clear();
    },
  };
}

/** `texture` (premultiplied, width × height) as straight-alpha RGBA8, rows top first. */
export function readStraight(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number,
): Uint8Array {
  const t = createTarget(gl, width, height, "rgba8");
  const frame: Frame = { width, height, docFromPx: [1, 0, 0, 1, 0, 0] };
  drawUtil(gl, frame, t.framebuffer, OP.present, texture, undefined, {
    flipY: false,
    straight: true,
  });
  const data = readTexture(gl, t.texture, { x: 0, y: 0, width, height }, 4);
  t.dispose();
  return data;
}
