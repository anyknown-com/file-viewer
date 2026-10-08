// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerGroups.swift `placeLayer`, Compositor/Document/SelectionClipboard.swift `insertCopy`), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { BlendMode, Command, Doc, Layer, LayerId, LayerPixels } from "../../api";
import { ancestors, children, depth, MAX_DEPTH, subtreeRange, treeOrder } from "../tree";
import { releaseDetachedClipping } from "./clip";

type PixelEntry = { image?: LayerPixels; mask?: LayerPixels };

/** A document with `layers` (and the rest of the manifest patched by `rest`). */
export function withLayers(doc: Doc, layers: Layer[], rest: Partial<Doc["manifest"]> = {}): Doc {
  return { ...doc, manifest: { ...doc.manifest, ...rest, layers } };
}

/** Shallow merge; keys whose value is undefined are left out. */
export function merged<T extends object>(record: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...record, ...patch };
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return out as T;
}

function pixelsFor(layer: Layer): PixelEntry | null {
  const entry: PixelEntry = {};
  if (layer.isGroup !== true && layer.adjustment === undefined) entry.image = { kind: "gpu" };
  if (layer.maskFile !== undefined) entry.mask = { kind: "gpu" };
  return entry.image || entry.mask ? entry : null;
}

/** Folders and everything in them included. */
export function withDescendants(doc: Doc, ids: readonly LayerId[]): Set<LayerId> {
  const out = new Set(ids);
  for (const layer of doc.manifest.layers) {
    if (ancestors(doc.manifest, layer.id).some((a) => out.has(a.id))) out.add(layer.id);
  }
  return out;
}

export function insertLayer(record: Layer, above: LayerId | null): Command {
  return (doc) => {
    const m = doc.manifest;
    const target = above === null ? undefined : m.layers.find((l) => l.id === above);
    const layer = merged(record, { parentID: target?.parentID });
    const at = target ? subtreeRange(m, target.id)[1] : m.layers.length;
    const layers = [...m.layers.slice(0, at), layer, ...m.layers.slice(at)];
    const pixels = new Map(doc.pixels);
    const entry = pixelsFor(layer);
    if (entry) pixels.set(layer.id, entry);
    else pixels.delete(layer.id);
    return { pixels, manifest: { ...m, layers, activeLayerID: layer.id } };
  };
}

export function removeLayers(ids: readonly LayerId[]): Command {
  return (doc) => {
    const m = doc.manifest;
    const gone = withDescendants(
      doc,
      ids.filter((id) => m.layers.some((l) => l.id === id)),
    );
    if (gone.size === 0) return doc;
    const layers = m.layers
      .filter((l) => !gone.has(l.id))
      .map((l) =>
        l.maskSourceID !== undefined && gone.has(l.maskSourceID)
          ? merged(l, { maskSourceID: undefined })
          : l,
      );
    const pixels = new Map(doc.pixels);
    for (const id of gone) pixels.delete(id);
    let active = m.activeLayerID;
    if (active !== undefined && gone.has(active)) {
      const activeLayer = m.layers.find((l) => l.id === active);
      const siblings = children(m, activeLayer?.parentID ?? null);
      const index = siblings.findIndex((l) => l.id === active);
      active = siblings
        .slice(0, index)
        .toReversed()
        .find((l) => !gone.has(l.id))?.id;
    }
    return { pixels, manifest: merged(m, { layers, activeLayerID: active }) };
  };
}

export function patchLayer(id: LayerId, patch: Partial<Layer>): Command {
  return (doc) => {
    const index = doc.manifest.layers.findIndex((l) => l.id === id);
    if (index < 0) return doc;
    const layers = doc.manifest.layers.with(index, merged(doc.manifest.layers[index], patch));
    return withLayers(doc, layers);
  };
}

/** A plain layer covering the canvas, no `imageFile` (pixels come later). */
export function addLayer(opts: {
  id: LayerId;
  name: string;
  above?: LayerId;
  width: number;
  height: number;
}): Command {
  return insertLayer(
    {
      id: opts.id,
      name: opts.name,
      isVisible: true,
      isGroup: false,
      opacity: 1,
      blendMode: "Normal",
      transform: {
        origin: [0, 0],
        size: [opts.width, opts.height],
        rotation: 0,
        flipX: false,
        flipY: false,
        sampling: "High quality",
      },
    },
    opts.above ?? null,
  );
}

/**
 * A copy of each layer (a folder with everything in it) just above its original, ids from `newIds`
 * (layers without one are not copied). Copies share the originals' pixel entries; GPU textures are
 * copied by the caller. The active layer's copy becomes active.
 */
export function duplicateLayers(ids: LayerId[], newIds: Map<LayerId, LayerId>): Command {
  return (doc) => {
    let layers = doc.manifest.layers;
    const pixels = new Map(doc.pixels);
    const roots = ids.filter((id) => newIds.has(id) && layers.some((l) => l.id === id));
    for (const id of roots) {
      const m = { ...doc.manifest, layers };
      const [start, end] = subtreeRange(m, id);
      const included = withDescendants({ ...doc, manifest: m }, [id]);
      const copies = layers
        .slice(start, end)
        .filter((l) => included.has(l.id) && newIds.has(l.id))
        .map((l) => {
          const copyId = newIds.get(l.id) as LayerId;
          const entry = doc.pixels.get(l.id);
          if (entry) pixels.set(copyId, entry);
          const parent =
            l.parentID === undefined ? undefined : (newIds.get(l.parentID) ?? l.parentID);
          const source =
            l.maskSourceID === undefined
              ? undefined
              : (newIds.get(l.maskSourceID) ?? l.maskSourceID);
          return merged(l, {
            id: copyId,
            parentID: l.id === id ? l.parentID : parent,
            maskSourceID: source,
            imageFile: l.imageFile === undefined ? undefined : `${copyId}.png`,
            maskFile: l.maskFile === undefined ? undefined : `${copyId}.mask.png`,
          });
        });
      layers = [...layers.slice(0, end), ...copies, ...layers.slice(end)];
    }
    if (roots.length === 0) return doc;
    const active = doc.manifest.activeLayerID;
    const activeCopy =
      (active === undefined ? undefined : newIds.get(active)) ?? (newIds.get(roots[0]) as LayerId);
    return { pixels, manifest: { ...doc.manifest, layers, activeLayerID: activeCopy } };
  };
}

export function renameLayer(id: LayerId, name: string): Command {
  return patchLayer(id, { name });
}

export function setVisible(id: LayerId, visible: boolean): Command {
  return patchLayer(id, { isVisible: visible });
}

export function setOpacity(id: LayerId, opacity: number): Command {
  return patchLayer(id, { opacity: Math.min(1, Math.max(0, opacity)) });
}

/** Folders are pass-through: anything but Normal is refused. */
export function setBlendMode(id: LayerId, mode: BlendMode): Command {
  return (doc) => {
    const layer = doc.manifest.layers.find((l) => l.id === id);
    if (layer?.isGroup === true && mode !== "Normal") return doc;
    return patchLayer(id, { blendMode: mode })(doc);
  };
}

function maxDepthInside(doc: Doc, id: LayerId, inside: Set<LayerId>): number {
  let deepest = 0;
  for (const layer of doc.manifest.layers) {
    if (!inside.has(layer.id)) continue;
    const below = ancestors(doc.manifest, layer.id).findIndex((a) => a.id === id);
    if (below + 1 > deepest) deepest = below + 1;
  }
  return deepest;
}

/**
 * Moves the layers (folders with their contents) into `target.parent` at `target.index` among its
 * children once the moved layers are taken out (0 = bottom; past the end = top). Moving a folder
 * into itself or deeper than MAX_DEPTH returns the document unchanged.
 */
export function moveLayers(
  ids: LayerId[],
  target: { parent: LayerId | null; index: number },
): Command {
  return (doc) => {
    const m = doc.manifest;
    const present = ids.filter((id) => m.layers.some((l) => l.id === id));
    if (present.length === 0) return doc;
    const moving = withDescendants(doc, present);
    const parent =
      target.parent === null ? undefined : m.layers.find((l) => l.id === target.parent);
    if (target.parent !== null && (parent?.isGroup !== true || moving.has(target.parent)))
      return doc;
    const roots = m.layers.filter(
      (l) => present.includes(l.id) && !ancestors(m, l.id).some((a) => moving.has(a.id)),
    );
    const base = parent ? depth(m, parent.id) + 1 : 0;
    if (roots.some((r) => base + maxDepthInside(doc, r.id, moving) > MAX_DEPTH)) return doc;
    const moved = roots.map((r) => merged(r, { parentID: parent?.id }));
    const rest = m.layers.filter((l) => !roots.includes(l));
    const siblings = rest.filter(
      (l) => (l.parentID ?? null) === target.parent && !moving.has(l.id),
    );
    const index = Math.max(0, Math.min(target.index, siblings.length));
    // treeOrder groups by parent in array order, so placing the roots next to the sibling is enough.
    const anchor = index < siblings.length ? rest.indexOf(siblings[index]) : rest.length;
    const layers = treeOrder([...rest.slice(0, anchor), ...moved, ...rest.slice(anchor)]);
    return { ...doc, manifest: { ...m, layers: releaseDetachedClipping(layers) } };
  };
}
