// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/LayerGroups.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { LayerRecord } from "./manifest-layer";

export type TreeEntry = { layer: LayerRecord; depth: number; visible: boolean };

/**
 * Flattens layers into display order with their depth and whether they are visible.
 * (LayerGroups.swift `LayerHierarchy.entries` with `collapsed` always empty: children grouped by
 * `parentID` in array order, visited from the root; a folder is followed by its descendants;
 * `topFirst` reverses each run of siblings; deeper than 64 levels stops.)
 */
export function treeEntries(layers: LayerRecord[], topFirst: boolean): TreeEntry[] {
  const children = new Map<string | undefined, LayerRecord[]>();
  for (const layer of layers) {
    const siblings = children.get(layer.parentID);
    if (siblings) siblings.push(layer);
    else children.set(layer.parentID, [layer]);
  }
  const result: TreeEntry[] = [];
  const visit = (parent: string | undefined, depth: number, visible: boolean): void => {
    if (depth > 64) return;
    const siblings = children.get(parent) ?? [];
    // toReversed is ES2023; ./comp targets ES2022
    const ordered = topFirst ? [...siblings].reverse() : siblings;
    for (const layer of ordered) {
      const effective = visible && layer.isVisible;
      result.push({ layer, depth, visible: effective });
      if (layer.isGroup === true) visit(layer.id, depth + 1, effective);
    }
  };
  visit(undefined, 0, true);
  return result;
}

/**
 * Layers in tree order (bottom first). Layers off the tree (a `parentID` that names no folder, a
 * cycle, too deep) keep their array order at the end, so validation can still report them.
 */
export function sortTreeOrder(layers: LayerRecord[]): LayerRecord[] {
  const placed = new Set<LayerRecord>();
  const sorted: LayerRecord[] = [];
  const add = (layer: LayerRecord): void => {
    if (placed.has(layer)) return; // duplicate ids can visit a folder's children twice
    placed.add(layer);
    sorted.push(layer);
  };
  for (const entry of treeEntries(layers, false)) add(entry.layer);
  for (const layer of layers) add(layer);
  return sorted;
}
