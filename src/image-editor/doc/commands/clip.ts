// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LiveLayerMask.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Command, Layer, LayerId } from "../../api";
import { children } from "../tree";

function unclipped(layer: Layer): Layer {
  const out = { ...layer };
  delete out.maskSourceID;
  return out;
}

/** LiveLayerMask.swift `releaseDetachedClipping`: a clipped layer no longer right above its base's stack stops clipping. */
export function releaseDetachedClipping(layers: Layer[]): Layer[] {
  const stacks = new Map<LayerId | undefined, Layer[]>();
  for (const layer of layers) {
    const stack = stacks.get(layer.parentID);
    if (stack) stack.push(layer);
    else stacks.set(layer.parentID, [layer]);
  }
  const release = new Set<LayerId>();
  for (const stack of stacks.values()) {
    let base: LayerId | undefined;
    for (const layer of stack) {
      if (layer.maskSourceID === undefined) base = layer.isGroup === true ? undefined : layer.id;
      else if (layer.maskSourceID !== base) {
        release.add(layer.id);
        base = layer.id;
      }
    }
  }
  if (release.size === 0) return layers;
  return layers.map((l) => (release.has(l.id) ? unclipped(l) : l));
}

/**
 * LiveLayerMask.swift `toggleClippingMask` (clipping half): clips to the next lower sibling, sharing
 * its base when that one is clipped already. The base cannot be a folder or an adjustment layer.
 */
export function clipToBelow(id: LayerId): Command {
  return (doc) => {
    const m = doc.manifest;
    const layer = m.layers.find((l) => l.id === id);
    if (!layer || layer.isGroup === true) return doc;
    const siblings = children(m, layer.parentID ?? null);
    const index = siblings.findIndex((l) => l.id === id);
    if (index < 1) return doc;
    const baseId = siblings[index - 1].maskSourceID ?? siblings[index - 1].id;
    const base = m.layers.find((l) => l.id === baseId);
    if (!base || base.isGroup === true || base.adjustment !== undefined || baseId === id)
      return doc;
    if (layer.maskSourceID === baseId) return doc;
    const layers = m.layers.map((l) => (l.id === id ? { ...l, maskSourceID: baseId } : l));
    return { ...doc, manifest: { ...m, layers } };
  };
}

/**
 * LiveLayerMask.swift `removeLiveMask`: releases the layer and the clipped siblings right above it
 * that share its base. Lower ones keep clipping.
 */
export function releaseClip(id: LayerId): Command {
  return (doc) => {
    const m = doc.manifest;
    const layer = m.layers.find((l) => l.id === id);
    const source = layer?.maskSourceID;
    if (!layer || source === undefined) return doc;
    const siblings = children(m, layer.parentID ?? null);
    const index = siblings.findIndex((l) => l.id === id);
    const release = new Set<LayerId>();
    for (const sibling of siblings.slice(index)) {
      if (sibling.id !== id && sibling.maskSourceID !== source) break;
      release.add(sibling.id);
    }
    const layers = m.layers.map((l) => (release.has(l.id) ? unclipped(l) : l));
    return { ...doc, manifest: { ...m, layers } };
  };
}
