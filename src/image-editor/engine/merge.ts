// Merge down and merge folder: the layers drawn by `render` into one layer's new pixels, one undo step.
import { ViewerError } from "../../contract/errors";
import type { Doc, EditorApi, Layer, LayerId, Rect } from "../api";
import { insertLayer, patchLayer, removeLayers, removeMask } from "../doc/commands/index";
import { withDescendants } from "../doc/commands/layers";
import { children } from "../doc/tree";
import { internalsOf } from "../editor-api";
import { EXPORT_TILE, MAX_LAYER_SIDE } from "../limits";
import { boundsOf } from "../tools/transform-drag";
import { totalReach } from "./tiles";

const hasPixels = (l: Layer): boolean => l.isGroup !== true && l.adjustment === undefined;
const find = (api: EditorApi, id: LayerId) => api.doc().manifest.layers.find((l) => l.id === id);

/** The sibling just below `id` (same folder); undefined at the bottom. */
export function layerBelow(api: EditorApi, id: LayerId): Layer | undefined {
  const m = api.doc().manifest;
  const layer = m.layers.find((l) => l.id === id);
  if (!layer) return undefined;
  const siblings = children(m, layer.parentID ?? null);
  return siblings[siblings.findIndex((l) => l.id === id) - 1];
}

/** A layer (not a folder) over a pixel layer in the same folder. */
export function canMergeDown(api: EditorApi, id: LayerId): boolean {
  const layer = find(api, id);
  const below = layerBelow(api, id);
  return layer !== undefined && layer.isGroup !== true && below !== undefined && hasPixels(below);
}

const subDoc = (doc: Doc, layers: Layer[]): Doc => ({
  ...doc,
  manifest: { ...doc.manifest, layers, activeLayerID: undefined },
});

/** Whole pixels around the pixel layers' bounds plus their effects' reach; null when empty. */
function areaOf(doc: Doc, layers: Layer[]): Rect | null {
  const boxes = layers.filter(hasPixels).map((l) => boundsOf(l.transform));
  if (boxes.length === 0) return null;
  const reach = totalReach(doc, 1);
  const x = Math.floor(Math.min(...boxes.map((b) => b.x))) - reach;
  const y = Math.floor(Math.min(...boxes.map((b) => b.y))) - reach;
  const right = Math.ceil(Math.max(...boxes.map((b) => b.x + b.width))) + reach;
  const bottom = Math.ceil(Math.max(...boxes.map((b) => b.y + b.height))) + reach;
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/** Too large for one texture or over the pixel budget: shows why and returns false. */
function fits(api: EditorApi, rect: Rect, freed: number): boolean {
  const gl = api.gl;
  const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, MAX_LAYER_SIDE);
  const error =
    rect.width > max || rect.height > max
      ? new ViewerError("too_large")
      : api.checkBudget({ layerPx: rect.width * rect.height - freed });
  if (error) api.showError(error, "image.open.budget");
  return error === null;
}

/** `doc` rendered over `rect` at one pixel per document unit, straight RGBA8, in export tiles. */
function draw(api: EditorApi, doc: Doc, rect: Rect): Uint8Array {
  const { renderer } = internalsOf(api);
  const pad = totalReach(doc, 1);
  const out = new Uint8Array(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += EXPORT_TILE) {
    for (let x = 0; x < rect.width; x += EXPORT_TILE) {
      const w = Math.min(EXPORT_TILE, rect.width - x);
      const h = Math.min(EXPORT_TILE, rect.height - y);
      const pw = w + 2 * pad;
      const ph = h + 2 * pad;
      const buffer = renderer.pool.borrow(pw, ph);
      const docRect = { x: rect.x + x - pad, y: rect.y + y - pad, width: pw, height: ph };
      const target = { framebuffer: buffer.framebuffer, width: pw, height: ph, docRect };
      renderer.render(doc, api.session(), target, { forExport: true });
      const data = renderer.readStraight(buffer.texture, pw, ph);
      buffer.release();
      for (let row = 0; row < h; row++) {
        const from = ((row + pad) * pw + pad) * 4;
        out.set(data.subarray(from, from + w * 4), ((y + row) * rect.width + x) * 4);
      }
    }
  }
  return out;
}

const flat = (rect: Rect, sampling: Layer["transform"]["sampling"]): Layer["transform"] => ({
  origin: [rect.x, rect.y],
  size: [rect.width, rect.height],
  rotation: 0,
  flipX: false,
  flipY: false,
  sampling,
});

/**
 * `id` drawn onto the layer below over the two layers' area. The lower layer keeps its id, name,
 * opacity and blend mode; its mask, effects, text and shape are baked in. `id` is removed.
 */
export function mergeDown(api: EditorApi, id: LayerId): void {
  const upper = find(api, id);
  const lower = layerBelow(api, id);
  if (!upper || !lower || !canMergeDown(api, id)) return;
  const doc = api.doc();
  const sub = subDoc(doc, [
    {
      ...lower,
      parentID: undefined,
      maskSourceID: undefined,
      opacity: 1,
      blendMode: "Normal",
      isVisible: true,
    },
    {
      ...upper,
      parentID: undefined,
      maskSourceID: upper.maskSourceID === lower.id ? lower.id : undefined,
    },
  ]);
  const rect = areaOf(sub, sub.manifest.layers);
  const old = api.pixelSize(lower.id, "image");
  if (!rect || !fits(api, rect, old ? old.width * old.height : 0)) return;
  const pixels = draw(api, sub, rect);
  const size = { width: rect.width, height: rect.height };
  const resizes = [api.resizePixels(lower.id, "image", size, { pixels })];
  // The mask is baked in; the renderer still samples a mask texture, so it becomes 1 × 1 white.
  if (api.pixelSize(lower.id, "mask")) {
    const white = Uint8Array.of(255);
    resizes.push(api.resizePixels(lower.id, "mask", { width: 1, height: 1 }, { pixels: white }));
  }
  let next = removeMask(lower.id)(removeLayers([id])(doc));
  next = patchLayer(lower.id, {
    transform: flat(rect, lower.transform.sampling),
    effects: undefined,
    text: undefined,
    shape: undefined,
  })(next);
  next = { ...next, manifest: { ...next.manifest, activeLayerID: lower.id } };
  api.commit("image.layers.mergeDown", next, [], resizes);
  api.setSession({ active: lower.id, target: "image" });
}

/** Everything in the folder (its opacity and mask too) as one new Normal layer in its place. */
export function mergeFolder(api: EditorApi, folderId: LayerId): void {
  const folder = find(api, folderId);
  if (folder?.isGroup !== true) return;
  const doc = api.doc();
  const inside = withDescendants(doc, [folderId]);
  const layers = doc.manifest.layers
    .filter((l) => inside.has(l.id))
    .map((l) => (l.id === folderId ? { ...l, parentID: undefined, isVisible: true } : l));
  const sub = subDoc(doc, layers);
  const rect = areaOf(sub, layers);
  if (!rect || !fits(api, rect, 0)) return;
  const pixels = draw(api, sub, rect);
  const id = crypto.randomUUID().toUpperCase();
  const resize = api.resizePixels(
    id,
    "image",
    { width: rect.width, height: rect.height },
    { pixels },
  );
  const record: Layer = {
    id,
    name: folder.name,
    isVisible: folder.isVisible,
    opacity: 1,
    blendMode: "Normal",
    transform: flat(rect, "High quality"),
  };
  const next = removeLayers([folderId])(insertLayer(record, folderId)(doc));
  api.commit("image.layers.mergeFolder", next, [], [resize]);
  api.setSession({ active: id, target: "image" });
}
