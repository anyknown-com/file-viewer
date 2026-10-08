// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Rendering/LiveMaskRenderer.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Manifest } from "../../comp/index";
import type { Layer, LayerId } from "../api";
import { isVisibleInTree } from "../doc/tree";

/** Coverage chains stop here (LiveMaskRenderer `visiting.count < 256`). */
export const MAX_CHAIN = 256;

/** Visible non-folder layers in drawing order, minus `hidden` (LayerHierarchy.visibleLayers). */
export function drawnLayers(m: Manifest, hidden?: ReadonlySet<LayerId>): Layer[] {
  return m.layers.filter(
    (l) => l.isGroup !== true && !hidden?.has(l.id) && isVisibleInTree(m, l.id),
  );
}

/**
 * Clipping stacks (LiveMaskRenderer `prepareStacks`), base → clipped layers: a base with no
 * `maskSourceID` that is not an adjustment layer, and the drawn layers right above it with the same
 * parent and `maskSourceID` = base. The base draws the whole stack.
 */
export function clipStacks(m: Manifest, hidden?: ReadonlySet<LayerId>): Map<LayerId, LayerId[]> {
  const ids = drawnLayers(m, hidden);
  const stacks = new Map<LayerId, LayerId[]>();
  ids.forEach((base, index) => {
    if (base.maskSourceID !== undefined || base.adjustment !== undefined) return;
    const children: LayerId[] = [];
    for (const child of ids.slice(index + 1)) {
      if (child.maskSourceID !== base.id || child.parentID !== base.parentID) break;
      children.push(child.id);
    }
    if (children.length > 0) stacks.set(base.id, children);
  });
  return stacks;
}

/**
 * The layers whose coverage multiplies into `id`'s: `id`, its `maskSourceID`, that one's, and so on,
 * whether visible or not. Empty when the chain loops or is longer than MAX_CHAIN.
 */
export function coverageChain(m: Manifest, id: LayerId): LayerId[] {
  const byId = new Map(m.layers.map((l) => [l.id, l]));
  const chain: LayerId[] = [];
  const seen = new Set<LayerId>();
  let current: LayerId | undefined = id;
  while (current !== undefined) {
    if (seen.has(current) || chain.length >= MAX_CHAIN) return [];
    seen.add(current);
    chain.push(current);
    current = byId.get(current)?.maskSourceID;
  }
  return chain;
}
