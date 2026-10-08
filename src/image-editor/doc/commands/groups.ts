// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerGroups.swift `groupSelectedLayers`, `ungroupLayers`), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Command, Layer, LayerId } from "../../api";
import { ancestors, depth, MAX_DEPTH, treeOrder } from "../tree";
import { releaseDetachedClipping } from "./clip";
import { merged, withDescendants } from "./layers";

/**
 * Wraps the layers (a folder carries its contents) in a new folder covering the canvas, placed at
 * the topmost of them in their closest common folder. The new folder becomes active.
 */
export function groupLayers(ids: LayerId[], folderId: LayerId, name: string): Command {
  return (doc) => {
    const m = doc.manifest;
    const selected = new Set(ids.filter((id) => m.layers.some((l) => l.id === id)));
    const roots = m.layers.filter(
      (l) => selected.has(l.id) && !ancestors(m, l.id).some((a) => selected.has(a.id)),
    );
    if (roots.length === 0) return doc;
    const chain = (id: LayerId): (LayerId | undefined)[] => [
      ...ancestors(m, id).map((a) => a.id),
      undefined,
    ];
    const parent = chain(roots[0].id).find((candidate) =>
      roots.every((r) => chain(r.id).includes(candidate)),
    );
    // Each root's branch: the child of `parent` that holds it.
    const branches = new Set(
      roots.map((r) => {
        const up = chain(r.id);
        const at = up.indexOf(parent);
        return at === 0 ? r.id : (up[at - 1] as LayerId);
      }),
    );
    const inside = withDescendants(
      doc,
      roots.map((r) => r.id),
    );
    const deepest = Math.max(
      ...m.layers.filter((l) => inside.has(l.id)).map((l) => depth(m, l.id)),
    );
    if (deepest + 1 > MAX_DEPTH) return doc;
    const folder: Layer = {
      id: folderId,
      name,
      isVisible: true,
      isGroup: true,
      opacity: 1,
      blendMode: "Normal",
      transform: {
        origin: [0, 0],
        size: [m.width, m.height],
        rotation: 0,
        flipX: false,
        flipY: false,
        sampling: "High quality",
      },
      ...(parent === undefined ? {} : { parentID: parent }),
    };
    const isRoot = new Set(roots);
    const highest = m.layers.findLastIndex((l) => branches.has(l.id));
    const insertion = m.layers.slice(0, highest + 1).filter((l) => !isRoot.has(l)).length;
    const layers = m.layers.filter((l) => !isRoot.has(l));
    layers.splice(insertion, 0, folder);
    for (const r of roots) layers.push({ ...r, parentID: folderId });
    return { ...doc, manifest: { ...m, layers: treeOrder(layers), activeLayerID: folderId } };
  };
}

/**
 * The folder's direct children take its place among its siblings, in their order; the folder (and
 * its opacity, blend mode and mask) goes. The lowest child becomes active.
 */
export function ungroup(folderId: LayerId): Command {
  return (doc) => {
    const m = doc.manifest;
    const folder = m.layers.find((l) => l.id === folderId);
    if (folder?.isGroup !== true) return doc;
    const kids = m.layers
      .filter((l) => l.parentID === folderId)
      .map((l) => merged(l, { parentID: folder.parentID }));
    const layers: Layer[] = [];
    for (const layer of m.layers) {
      if (layer.id === folderId) layers.push(...kids);
      else if (layer.parentID !== folderId) layers.push(layer);
    }
    const pixels = new Map(doc.pixels);
    pixels.delete(folderId);
    const manifest = merged(m, {
      layers: releaseDetachedClipping(treeOrder(layers)),
      activeLayerID: kids[0]?.id,
    });
    return { pixels, manifest };
  };
}
