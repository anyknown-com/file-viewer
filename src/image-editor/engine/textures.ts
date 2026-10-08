// Layer and mask textures: image RGBA8 straight alpha, mask R8; rows top first.
import { ViewerError } from "../../contract/errors";
import type { Layer, LayerId, PixelTarget, Size } from "../api";
import { MAX_LAYER_SIDE } from "../limits";

type Sampling = Layer["transform"]["sampling"];
type Entry = { texture: WebGLTexture; width: number; height: number; smooth: boolean };
type Source = ImageBitmap | { width: number; height: number; data: Uint8Array };

export type TextureStore = ReturnType<typeof createTextureStore>;

function key(id: LayerId, target: PixelTarget): string {
  return `${target}:${id}`;
}

/** What a mask shows beyond its pixels: white or black, whichever most of its edge is (LayerMask.swift `background`). */
export function edgeMajority(border: Uint8Array): 0 | 1 {
  let total = 0;
  for (const v of border) total += v;
  return total * 2 >= border.length * 255 ? 1 : 0;
}

export function createTextureStore(
  gl: WebGL2RenderingContext,
  maxTexture: number = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
) {
  const entries = new Map<string, Entry>();
  const versions = new Map<LayerId, number>();
  const edges = new Map<LayerId, { version: number; value: 0 | 1 }>();
  const limit = Math.min(maxTexture, MAX_LAYER_SIDE);

  const bump = (id: LayerId): void => {
    versions.set(id, (versions.get(id) ?? 0) + 1);
  };
  const filter = (entry: Entry): void => {
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    const min = entry.smooth ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, entry.smooth ? gl.LINEAR : gl.NEAREST);
    if (entry.smooth) gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
  };
  const remove = (k: string): void => {
    const old = entries.get(k);
    if (old) gl.deleteTexture(old.texture);
    entries.delete(k);
  };

  function put(id: LayerId, target: PixelTarget, source: Source, sampling: Sampling): void {
    const { width, height } = source;
    if (width < 1 || height < 1 || width > limit || height > limit) {
      throw new ViewerError("too_large", { message: `${width} × ${height} is over ${limit} px.` });
    }
    remove(key(id, target));
    const texture = gl.createTexture();
    const mask = target === "mask";
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    const internal = mask ? gl.R8 : gl.RGBA8;
    const format = mask ? gl.RED : gl.RGBA;
    if ("data" in source) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internal,
        width,
        height,
        0,
        format,
        gl.UNSIGNED_BYTE,
        source.data,
      );
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, format, gl.UNSIGNED_BYTE, source);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const entry = { texture, width, height, smooth: sampling !== "Nearest" };
    entries.set(key(id, target), entry);
    filter(entry);
    bump(id);
  }

  return {
    maxSide: limit,
    upload(id: LayerId, target: PixelTarget, source: Source, sampling: Sampling = "High quality") {
      put(id, target, source, sampling);
    },
    get: (id: LayerId, target: PixelTarget): WebGLTexture | null =>
      entries.get(key(id, target))?.texture ?? null,
    size(id: LayerId, target: PixelTarget): Size | null {
      const e = entries.get(key(id, target));
      return e ? { width: e.width, height: e.height } : null;
    },
    delete(id: LayerId) {
      remove(key(id, "image"));
      remove(key(id, "mask"));
      versions.delete(id);
      edges.delete(id);
    },
    /** Drops the old texture and uploads `data` at the new size. */
    replace(id: LayerId, target: PixelTarget, size: Size, data: Uint8Array, sampling?: Sampling) {
      const smooth = entries.get(key(id, target))?.smooth ?? true;
      put(id, target, { ...size, data }, sampling ?? (smooth ? "High quality" : "Nearest"));
    },
    /** After a write: bumps the version and rebuilds the mipmaps. */
    touch(id: LayerId, target: PixelTarget) {
      const e = entries.get(key(id, target));
      if (e) filter(e);
      bump(id);
    },
    /** Matches the filter to the layer's current sampling. */
    sample(id: LayerId, target: PixelTarget, sampling: Sampling) {
      const e = entries.get(key(id, target));
      if (!e || e.smooth === (sampling !== "Nearest")) return;
      e.smooth = sampling !== "Nearest";
      filter(e);
    },
    totals(): { layerPx: number; maskPx: number } {
      let layerPx = 0;
      let maskPx = 0;
      for (const [k, e] of entries) {
        if (k.startsWith("mask:")) maskPx += e.width * e.height;
        else layerPx += e.width * e.height;
      }
      return { layerPx, maskPx };
    },
    version: (id: LayerId): number => versions.get(id) ?? 0,
    /** The mask's edge majority, cached per version; `read` reads its border pixels. */
    edge(id: LayerId, read: () => Uint8Array): 0 | 1 {
      const version = versions.get(id) ?? 0;
      const cached = edges.get(id);
      if (cached?.version === version) return cached.value;
      const value = edgeMajority(read());
      edges.set(id, { version, value });
      return value;
    },
    ids: (): LayerId[] => [...versions.keys()],
  };
}
