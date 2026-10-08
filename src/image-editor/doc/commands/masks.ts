// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerMask.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Command, LayerId } from "../../api";
import { patchLayer } from "./layers";

/**
 * A new mask on the layer (`<ID>.mask.png`, pixels on the GPU). `fill` has no place in the document:
 * a mask with no texture yet reads as white, so the caller writes black pixels for a hide-all mask.
 */
export function addMask(id: LayerId, _fill: "white" | "black"): Command {
  return (doc) => {
    const layer = doc.manifest.layers.find((l) => l.id === id);
    if (!layer || layer.maskFile !== undefined) return doc;
    const next = patchLayer(id, {
      maskFile: `${id}.mask.png`,
      maskEnabled: undefined,
      maskPlacement: undefined,
      maskLinked: undefined,
    })(doc);
    const pixels = new Map(next.pixels);
    pixels.set(id, { ...pixels.get(id), mask: { kind: "gpu" } });
    return { ...next, pixels };
  };
}

export function removeMask(id: LayerId): Command {
  return (doc) => {
    const layer = doc.manifest.layers.find((l) => l.id === id);
    if (layer?.maskFile === undefined) return doc;
    const next = patchLayer(id, {
      maskFile: undefined,
      maskEnabled: undefined,
      maskPlacement: undefined,
      maskLinked: undefined,
    })(doc);
    const pixels = new Map(next.pixels);
    const entry = pixels.get(id);
    if (entry?.image) pixels.set(id, { image: entry.image });
    else pixels.delete(id);
    return { ...next, pixels };
  };
}

function withMask(id: LayerId, command: Command): Command {
  return (doc) =>
    doc.manifest.layers.find((l) => l.id === id)?.maskFile === undefined ? doc : command(doc);
}

export function setMaskEnabled(id: LayerId, enabled: boolean): Command {
  return withMask(id, patchLayer(id, { maskEnabled: enabled }));
}

/**
 * Unlinking keeps the mask where it is on the document: the layer's transform is stored as the
 * mask's placement. Linking drops the placement, so the mask covers the layer again.
 */
export function setMaskLinked(id: LayerId, linked: boolean): Command {
  return withMask(id, (doc) => {
    const layer = doc.manifest.layers.find((l) => l.id === id);
    if (!layer) return doc;
    const patch = linked
      ? { maskLinked: true, maskPlacement: undefined }
      : { maskLinked: false, maskPlacement: layer.maskPlacement ?? layer.transform };
    return patchLayer(id, patch)(doc);
  });
}
