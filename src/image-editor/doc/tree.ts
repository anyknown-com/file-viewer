// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerGroups.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Manifest } from "../../comp/index";
import type { Layer, LayerId } from "../api";

/** Deepest folder nesting (LayerGroups.swift `LayerHierarchy`: depth 64 is the last one visited). */
export const MAX_DEPTH = 64;

/** Direct children of `parent` (null = root), in array order: bottom first. */
export function children(m: Manifest, parent: LayerId | null): Layer[] {
  return m.layers.filter((l) => (l.parentID ?? null) === parent);
}

/** Folders holding `id`, nearest first. Stops at a missing parent, a cycle or MAX_DEPTH. */
export function ancestors(m: Manifest, id: LayerId): Layer[] {
  const byId = new Map(m.layers.map((l) => [l.id, l]));
  const result: Layer[] = [];
  const seen = new Set<LayerId>([id]);
  let parent = byId.get(id)?.parentID;
  while (parent !== undefined && result.length < MAX_DEPTH && !seen.has(parent)) {
    const node = byId.get(parent);
    if (!node) break;
    seen.add(parent);
    result.push(node);
    parent = node.parentID;
  }
  return result;
}

export function depth(m: Manifest, id: LayerId): number {
  return ancestors(m, id).length;
}

function descendants(m: Manifest, id: LayerId): Set<LayerId> {
  const result = new Set<LayerId>();
  const pending = [id];
  for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
    for (const child of children(m, parent)) {
      if (child.id === id || result.has(child.id)) continue;
      result.add(child.id);
      pending.push(child.id);
    }
  }
  return result;
}

/**
 * `[start, end)` of `id` and everything inside it in `m.layers`. In tree order (a folder followed by
 * its contents) that is exactly the subtree; otherwise it runs to the last descendant found by
 * walking `children`. `[-1, -1]` when `id` is not in the document.
 */
export function subtreeRange(m: Manifest, id: LayerId): [start: number, end: number] {
  const start = m.layers.findIndex((l) => l.id === id);
  if (start < 0) return [-1, -1];
  const inside = descendants(m, id);
  let end = start + 1;
  m.layers.forEach((l, i) => {
    if (inside.has(l.id) && i + 1 > end) end = i + 1;
  });
  return [start, end];
}

/** The layer and every folder holding it are visible. */
export function isVisibleInTree(m: Manifest, id: LayerId): boolean {
  const layer = m.layers.find((l) => l.id === id);
  if (!layer?.isVisible) return false;
  return ancestors(m, id).every((a) => a.isVisible);
}

/**
 * Layers in tree order (LayerGroups.swift `LayerHierarchy.entries`, bottom first): siblings in
 * array order, each folder followed by its contents. Layers off the tree (missing parent, cycle,
 * deeper than MAX_DEPTH) keep their array order at the end. Commands run this after reparenting.
 */
export function treeOrder(layers: readonly Layer[]): Layer[] {
  const byParent = new Map<LayerId | undefined, Layer[]>();
  for (const layer of layers) {
    const siblings = byParent.get(layer.parentID);
    if (siblings) siblings.push(layer);
    else byParent.set(layer.parentID, [layer]);
  }
  const placed = new Set<Layer>();
  const sorted: Layer[] = [];
  const visit = (parent: LayerId | undefined, level: number): void => {
    if (level > MAX_DEPTH) return;
    for (const layer of byParent.get(parent) ?? []) {
      if (placed.has(layer)) continue;
      placed.add(layer);
      sorted.push(layer);
      if (layer.isGroup === true) visit(layer.id, level + 1);
    }
  };
  visit(undefined, 0);
  for (const layer of layers) if (!placed.has(layer)) sorted.push(layer);
  return sorted;
}
