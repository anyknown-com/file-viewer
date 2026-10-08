// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/IO/ImageExporter.swift and Compositor/Rendering/LiveMaskRenderer.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Manifest } from "../../comp/index";
import {
  BLEND_MODES,
  type Doc,
  type Layer,
  type LayerId,
  type PassView,
  type Rect,
  type Session,
} from "../api";
import { layerMatrixOf } from "../doc/layer-matrix";
import { ancestors } from "../doc/tree";
import { adjustment, effects } from "../registry";
import type { Borrowed, BufferPool } from "./buffers";
import { blankTextures, clearTo, drawComposite, drawUtil, type Frame, type MaskRef } from "./draw";
import { KIND, MAX_FOLDER_MASKS } from "./gl/composite.glsl";
import { createTarget } from "./gl/target";
import { OP } from "./gl/util.glsl";
import { clipStacks, coverageChain, drawnLayers } from "./stacks";
import type { TextureStore } from "./textures";
import { createLayerInputs, readStraight } from "./inputs";

export type RenderOut = {
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
  docRect: Rect;
};
export type RenderOpts = { background?: [number, number, number, number]; forExport: boolean };
export type Renderer = ReturnType<typeof createRenderer>;

type Acc = { cur: Borrowed; next: Borrowed };

const modeOf = (l: Layer): number => Math.max(0, BLEND_MODES.indexOf(l.blendMode ?? "Normal"));

export function createRenderer(
  gl: WebGL2RenderingContext,
  textures: TextureStore,
  pool: BufferPool,
) {
  const inputs = createLayerInputs(gl, textures);
  const { lutFor, maskOf } = inputs;

  function render(doc: Doc, session: Session, out: RenderOut, opts: RenderOpts) {
    const m: Manifest = doc.manifest;
    const { width, height, docRect: r } = out;
    const frame: Frame = {
      width,
      height,
      docFromPx: [r.width / width, 0, 0, r.height / height, r.x, r.y],
    };
    const view: PassView = {
      scale: width / r.width,
      width,
      height,
      docFromPx: frame.docFromPx,
      forExport: opts.forExport,
    };
    const borrowed: Borrowed[] = [];
    const borrow = (): Borrowed => {
      const b = pool.borrow(width, height);
      borrowed.push(b);
      return b;
    };
    const swap = (a: Acc) => {
      [a.cur, a.next] = [a.next, a.cur];
    };
    const blank = blankTextures(gl);
    let unsupported = false;
    const byId = new Map(m.layers.map((l) => [l.id, l]));
    const opacityOf = (l: Layer) =>
      ancestors(m, l.id).reduce((op, a) => op * (a.opacity ?? 1), l.opacity ?? 1);
    const foldersOf = (l: Layer) =>
      ancestors(m, l.id).flatMap((a) => (a.isGroup === true ? (maskOf(a) ?? []) : []));

    /** own(L) on a cleared `dst`: pixels × own mask, effects, × opacity. Nothing for folders and adjustments. */
    function ownInto(dst: Borrowed, layer: Layer) {
      clearTo(gl, dst.framebuffer, frame, 0);
      const src = textures.get(layer.id, "image");
      const size = textures.size(layer.id, "image");
      if (layer.isGroup === true || layer.adjustment || !src || !size) return;
      textures.sample(layer.id, "image", layer.transform.sampling);
      const base = {
        acc: blank.clear,
        mode: 0,
        src,
        srcMat: layerMatrixOf(layer.transform, size),
        srcSize: [size.width, size.height] as [number, number],
        mask: maskOf(layer),
      };
      const fx = effects();
      if (!layer.effects || !fx) {
        if (layer.effects) unsupported = true;
        drawComposite(gl, frame, {
          ...base,
          kind: KIND.layer,
          dst: dst.framebuffer,
          opacity: opacityOf(layer),
        });
        return;
      }
      const plain = borrow();
      drawComposite(gl, frame, { ...base, kind: KIND.layer, dst: plain.framebuffer, opacity: 1 });
      const pad = Math.ceil(fx.reach(layer.effects, view.scale));
      const padded = createTarget(gl, width + 2 * pad, height + 2 * pad, "rgba16f");
      clearTo(gl, padded.framebuffer, { ...frame, width: padded.width, height: padded.height }, 0);
      const target = {
        framebuffer: padded.framebuffer,
        width: padded.width,
        height: padded.height,
        pad,
      };
      fx.pass(gl, layer, plain.texture, target, { ...view, version: textures.version(layer.id) });
      drawComposite(gl, frame, {
        kind: KIND.surface,
        acc: blank.clear,
        dst: dst.framebuffer,
        mode: 0,
        opacity: opacityOf(layer),
        src: padded.texture,
        srcSize: [padded.width, padded.height],
        srcOffset: [pad, pad],
      });
      padded.dispose();
    }

    /** coverage(S): the alpha of own(S) times its source's coverage; null when the chain loops or runs too long. */
    function coverage(id: LayerId): WebGLTexture | null {
      const chain = coverageChain(m, id);
      if (chain.length === 0) return null;
      const acc: Acc = { cur: borrow(), next: borrow() };
      const tmp = borrow();
      chain.forEach((sid, i) => {
        const layer = byId.get(sid);
        if (!layer) return;
        ownInto(i === 0 ? acc.cur : tmp, layer);
        if (i === 0) return;
        drawUtil(gl, frame, acc.next.framebuffer, OP.multiplyAlpha, acc.cur.texture, tmp.texture);
        swap(acc);
      });
      return acc.cur.texture;
    }

    /** Folder masks beyond MAX_FOLDER_MASKS go into the cover surface, 8 per pass. */
    function factor(folders: MaskRef[], cover: WebGLTexture | null) {
      if (folders.length <= MAX_FOLDER_MASKS) return { folders, cover };
      let current = cover;
      for (let i = 0; i < folders.length; i += MAX_FOLDER_MASKS) {
        const dst = borrow();
        const chunk = folders.slice(i, i + MAX_FOLDER_MASKS);
        drawComposite(gl, frame, {
          kind: KIND.surface,
          acc: blank.clear,
          dst: dst.framebuffer,
          mode: 0,
          opacity: 1,
          src: blank.white,
          srcSize: [1, 1],
          folders: chunk,
          cover: current,
        });
        current = dst.texture;
      }
      return { folders: [], cover: current };
    }

    /** An adjustment layer over `acc`, mixed in by `opacity` × its mask × the factor. */
    function adjust(
      acc: Acc,
      layer: Layer,
      opacity: number,
      f: { folders: MaskRef[]; cover: WebGLTexture | null },
    ) {
      const settings = layer.adjustment;
      const hooks = settings && adjustment(settings.kind);
      if (!settings || !hooks || (!hooks.lut && !hooks.pass)) {
        unsupported = true;
        return;
      }
      const common = {
        acc: acc.cur.texture,
        dst: acc.next.framebuffer,
        mode: modeOf(layer),
        opacity,
        mask: maskOf(layer),
        ...f,
      };
      if (hooks.lut) {
        drawComposite(gl, frame, { ...common, kind: KIND.lut, lut: lutFor(layer, hooks.lut) });
      } else if (hooks.pass) {
        const result = borrow();
        clearTo(gl, result.framebuffer, frame, 0);
        hooks.pass(gl, acc.cur.texture, result.framebuffer, settings, view);
        drawComposite(gl, frame, { ...common, kind: KIND.adjusted, src: result.texture });
      }
      swap(acc);
    }

    /** A clipping stack: the base made opaque, the clipped layers drawn in, the base's alpha put back. */
    function stack(acc: Acc, base: Layer, children: readonly LayerId[]) {
      const own = borrow();
      ownInto(own, base);
      const g: Acc = { cur: borrow(), next: borrow() };
      drawUtil(gl, frame, g.cur.framebuffer, OP.opaque, own.texture);
      for (const id of children) {
        const child = byId.get(id);
        if (!child) continue;
        if (child.adjustment) {
          adjust(g, child, opacityOf(child), { folders: [], cover: null });
          continue;
        }
        const tmp = borrow();
        ownInto(tmp, child);
        const draw = {
          acc: g.cur.texture,
          dst: g.next.framebuffer,
          mode: modeOf(child),
          opacity: 1,
        };
        drawComposite(gl, frame, { ...draw, kind: KIND.surface, src: tmp.texture });
        swap(g);
      }
      drawUtil(gl, frame, g.next.framebuffer, OP.restoreAlpha, g.cur.texture, own.texture);
      const f = factor(foldersOf(base), null);
      const draw = {
        acc: acc.cur.texture,
        dst: acc.next.framebuffer,
        mode: modeOf(base),
        opacity: 1,
      };
      drawComposite(gl, frame, { ...draw, ...f, kind: KIND.surface, src: g.next.texture });
      swap(acc);
    }

    const hidden = opts.forExport ? undefined : session.renderHidden;
    const stacks = clipStacks(m, hidden);
    const stacked = new Set([...stacks.values()].flat());
    const acc: Acc = { cur: borrow(), next: borrow() };
    clearTo(gl, acc.cur.framebuffer, frame, 0);

    // Each layer's temporary surfaces go back to the pool once it is drawn.
    const release = (from: number) => {
      for (const b of borrowed.splice(from)) b.release();
    };
    const kept = borrowed.length;
    for (const layer of drawnLayers(m, hidden)) {
      release(kept);
      if (stacked.has(layer.id)) continue;
      if (layer.adjustment) {
        if (layer.maskSourceID === undefined)
          adjust(acc, layer, opacityOf(layer), factor(foldersOf(layer), null));
        continue;
      }
      const children = stacks.get(layer.id);
      if (children) {
        stack(acc, layer, children);
        continue;
      }
      let cover: WebGLTexture | null = null;
      if (layer.maskSourceID !== undefined) {
        cover = coverage(layer.maskSourceID);
        if (!cover) continue;
      }
      const f = factor(foldersOf(layer), cover);
      const own = borrow();
      ownInto(own, layer);
      const draw = {
        acc: acc.cur.texture,
        dst: acc.next.framebuffer,
        mode: modeOf(layer),
        opacity: 1,
      };
      drawComposite(gl, frame, { ...draw, ...f, kind: KIND.surface, src: own.texture });
      swap(acc);
    }

    drawUtil(gl, frame, out.framebuffer, OP.present, acc.cur.texture, undefined, {
      background: opts.background,
      flipY: out.framebuffer === null,
      straight: false,
    });
    release(0);
    inputs.prune(byId);
    return { unsupported };
  }

  return {
    render,
    readStraight: (t: WebGLTexture, w: number, h: number) => readStraight(gl, t, w, h),
    pool,
    dispose: inputs.dispose,
  };
}
