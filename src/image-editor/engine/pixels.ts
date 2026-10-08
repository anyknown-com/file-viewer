// Layer pixel access for EditorApi: read, write, snapshot and resize image and mask textures.
import { ViewerError } from "../../contract/errors";
import type { Doc, LayerId, LayerResize, PixelTarget, PixelTile, Point, Rect, Size } from "../api";
import { TILE } from "../limits";
import { readTexture } from "./gl/read";
import { edgeMajority, type TextureStore } from "./textures";

export type Pixels = ReturnType<typeof createPixels>;

/** A fresh `size` surface: image transparent, mask all `fill` (255 = reveal). */
function blank(size: Size, target: PixelTarget, fill = 255): Uint8Array {
  if (target === "image") return new Uint8Array(size.width * size.height * 4);
  return new Uint8Array(size.width * size.height).fill(fill);
}

function border(data: Uint8Array, w: number, h: number): Uint8Array {
  const out: number[] = [];
  for (let x = 0; x < w; x++) out.push(data[x], data[(h - 1) * w + x]);
  for (let y = 0; y < h; y++) out.push(data[y * w], data[y * w + w - 1]);
  return Uint8Array.from(out);
}

/** Copies `src` (sw × sh) into `dst` (dw × dh) at `at`, clipped; `bpp` bytes per pixel. */
function place(
  src: Uint8Array,
  sw: number,
  sh: number,
  dst: Uint8Array,
  dw: number,
  dh: number,
  at: Point,
  bpp: number,
) {
  const x0 = Math.max(0, at.x);
  const x1 = Math.min(dw, at.x + sw);
  if (x1 <= x0) return;
  for (let y = Math.max(0, at.y); y < Math.min(dh, at.y + sh); y++) {
    const from = ((y - at.y) * sw + (x0 - at.x)) * bpp;
    dst.set(src.subarray(from, from + (x1 - x0) * bpp), (y * dw + x0) * bpp);
  }
}

export function createPixels(gl: WebGL2RenderingContext, textures: TextureStore, doc: () => Doc) {
  const layerOf = (id: LayerId) => doc().manifest.layers.find((l) => l.id === id);
  /**
   * The size a missing texture starts at: one pixel per document unit of the layer's transform, or
   * for a mask of its `maskPlacement` when it has one (LayerMask.swift places the mask grid there).
   */
  const transformSize = (id: LayerId, target: PixelTarget): Size => {
    const layer = layerOf(id);
    const t = (target === "mask" ? layer?.maskPlacement : undefined) ?? layer?.transform;
    return {
      width: Math.max(1, Math.round(t?.size[0] ?? 1)),
      height: Math.max(1, Math.round(t?.size[1] ?? 1)),
    };
  };
  const sizeOf = (id: LayerId, target: PixelTarget) =>
    textures.size(id, target) ?? transformSize(id, target);

  /** The texture, created at transformSize (transparent, mask all white) when missing. */
  function ensure(id: LayerId, target: PixelTarget): WebGLTexture {
    const existing = textures.get(id, target);
    if (existing) return existing;
    const size = transformSize(id, target);
    textures.upload(
      id,
      target,
      { ...size, data: blank(size, target) },
      layerOf(id)?.transform.sampling,
    );
    return textures.get(id, target) as WebGLTexture;
  }

  function readRegion(id: LayerId, target: PixelTarget, rect: Rect): Uint8Array {
    const texture = textures.get(id, target);
    if (!texture) return blank(rect, target);
    return readTexture(gl, texture, rect, target === "mask" ? 1 : 4);
  }

  function writeRegion(id: LayerId, target: PixelTarget, rect: Rect, pixels: Uint8Array): void {
    gl.bindTexture(gl.TEXTURE_2D, ensure(id, target));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const format = target === "mask" ? gl.RED : gl.RGBA;
    const { x, y, width, height } = rect;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, width, height, format, gl.UNSIGNED_BYTE, pixels);
    gl.bindTexture(gl.TEXTURE_2D, null);
    textures.touch(id, target);
  }

  function snapshotTiles(id: LayerId, target: PixelTarget, rect: Rect): PixelTile[] {
    const { width: w, height: h } = sizeOf(id, target);
    const x0 = Math.max(0, Math.floor(rect.x / TILE) * TILE);
    const y0 = Math.max(0, Math.floor(rect.y / TILE) * TILE);
    const x1 = Math.min(w, rect.x + rect.width);
    const y1 = Math.min(h, rect.y + rect.height);
    const tiles: PixelTile[] = [];
    for (let y = y0; y < y1; y += TILE) {
      for (let x = x0; x < x1; x += TILE) {
        const tile = { x, y, width: Math.min(TILE, w - x), height: Math.min(TILE, h - y) };
        tiles.push({ layer: id, target, ...tile, before: readRegion(id, target, tile) });
      }
    }
    return tiles;
  }

  function resizePixels(
    id: LayerId,
    target: PixelTarget,
    size: Size,
    opts: { offset?: Point; pixels?: Uint8Array } = {},
  ): LayerResize {
    const limit = textures.maxSide;
    if (size.width < 1 || size.height < 1 || size.width > limit || size.height > limit) {
      throw new ViewerError("too_large", {
        message: `${size.width} × ${size.height} is over ${limit} px.`,
      });
    }
    const old = sizeOf(id, target);
    const before = { ...old, data: readRegion(id, target, { x: 0, y: 0, ...old }) };
    let data = opts.pixels;
    if (!data) {
      const fill =
        target === "mask" ? edgeMajority(border(before.data, old.width, old.height)) * 255 : 0;
      data = blank(size, target, fill);
      const bpp = target === "mask" ? 1 : 4;
      const at = opts.offset ?? { x: 0, y: 0 };
      place(before.data, old.width, old.height, data, size.width, size.height, at, bpp);
    }
    textures.replace(id, target, size, data, layerOf(id)?.transform.sampling);
    return { layer: id, target, before };
  }

  return {
    layerTexture: (id: LayerId): WebGLTexture => ensure(id, "image"),
    maskTexture: (id: LayerId): WebGLTexture | null => textures.get(id, "mask"),
    pixelSize: (id: LayerId, target: PixelTarget): Size | null => textures.size(id, target),
    readRegion,
    writeRegion,
    snapshotTiles,
    resizePixels,
  };
}
