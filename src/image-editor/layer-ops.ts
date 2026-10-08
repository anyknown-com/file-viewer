// Layer operations shared by the core menu items, the layer panel and its context menu.
import type { Command, EditorApi, Layer, LayerId, MessageKey } from "./api";
import {
  addLayer,
  addMask,
  clipToBelow,
  duplicateLayers,
  groupLayers,
  insertLayer,
  releaseClip,
  removeLayers,
  removeMask,
  setMaskEnabled,
  setMaskLinked,
  ungroup,
} from "./doc/commands/index";
import { withDescendants } from "./doc/commands/layers";
import { applyUndo, internalsOf } from "./editor-api";

const newId = () => crypto.randomUUID().toUpperCase();

export const isFolder = (l: Layer): boolean => l.isGroup === true;

export function layerOf(api: EditorApi, id: LayerId | null): Layer | undefined {
  return id === null ? undefined : api.doc().manifest.layers.find((l) => l.id === id);
}

export function activeLayer(api: EditorApi): Layer | undefined {
  return layerOf(api, api.session().active);
}

/**
 * Keeps the session on a layer that exists: the document's active layer when a command moved it
 * (`moved`) or the session's layer is gone; back to painting on the image when there is no mask.
 */
function syncSession(api: EditorApi, moved: boolean): void {
  const m = api.doc().manifest;
  const { active, target } = api.session();
  const gone = active !== null && !m.layers.some((l) => l.id === active);
  const next = moved || gone ? (m.activeLayerID ?? null) : active;
  const masked = layerOf(api, next)?.maskFile !== undefined;
  const nextTarget = target === "mask" && !masked ? "image" : target;
  if (next !== active || nextTarget !== target)
    api.setSession({ active: next, target: nextTarget });
}

/** One undo step; the session follows the document's active layer when the command moved it. */
export function run(api: EditorApi, command: Command, label: MessageKey): void {
  const before = api.doc().manifest.activeLayerID;
  api.dispatch(command, label);
  syncSession(api, api.doc().manifest.activeLayerID !== before);
}

export function undo(api: EditorApi): void {
  const result = internalsOf(api).store.undo();
  if (!result) return;
  applyUndo(api, result);
  syncSession(api, false);
}

export function redo(api: EditorApi): void {
  const result = internalsOf(api).store.redo();
  if (!result) return;
  applyUndo(api, result);
  syncSession(api, false);
}

const canvasTransform = (api: EditorApi): Layer["transform"] => {
  const { width, height } = api.doc().manifest;
  return {
    origin: [0, 0],
    size: [width, height],
    rotation: 0,
    flipX: false,
    flipY: false,
    sampling: "High quality",
  };
};

export function newLayer(api: EditorApi): void {
  const { width, height } = api.doc().manifest;
  const above = api.session().active ?? undefined;
  run(
    api,
    addLayer({ id: newId(), name: api.t("image.layers.new"), above, width, height }),
    "image.layers.new",
  );
}

export function newFolder(api: EditorApi): void {
  const record: Layer = {
    id: newId(),
    name: api.t("image.layers.folder"),
    isVisible: true,
    isGroup: true,
    opacity: 1,
    blendMode: "Normal",
    transform: canvasTransform(api),
  };
  run(api, insertLayer(record, api.session().active), "image.layers.newFolder");
}

/** The layer (a folder with everything in it) and its pixels, copied just above it. */
export function duplicate(api: EditorApi, id: LayerId): void {
  const ids = [...withDescendants(api.doc(), [id])];
  const sizes = ids.flatMap((src) =>
    (["image", "mask"] as const).flatMap((target) => {
      const size = api.pixelSize(src, target);
      return size ? [{ src, target, size }] : [];
    }),
  );
  const px = (target: "image" | "mask") =>
    sizes.filter((s) => s.target === target).reduce((n, s) => n + s.size.width * s.size.height, 0);
  const over = api.checkBudget({ layerPx: px("image"), maskPx: px("mask") });
  if (over) return api.showError(over);
  const copies = new Map(ids.map((src) => [src, newId()]));
  for (const { src, target, size } of sizes) {
    const pixels = api.readRegion(src, target, { x: 0, y: 0, ...size });
    api.resizePixels(copies.get(src) as LayerId, target, size, { pixels });
  }
  run(api, duplicateLayers([id], copies), "image.layers.duplicate");
}

export function deleteLayer(api: EditorApi, id: LayerId): void {
  run(api, removeLayers([id]), "image.layers.delete");
}

export function group(api: EditorApi, id: LayerId): void {
  run(api, groupLayers([id], newId(), api.t("image.layers.folder")), "image.layers.group");
}

export function ungroupFolder(api: EditorApi, id: LayerId): void {
  if (layerOf(api, id)?.isGroup === true) run(api, ungroup(id), "image.layers.ungroup");
}

export function toggleClip(api: EditorApi, id: LayerId): void {
  const clipped = layerOf(api, id)?.maskSourceID !== undefined;
  if (clipped) run(api, releaseClip(id), "image.layers.unclip");
  else run(api, clipToBelow(id), "image.layers.clip");
}

/**
 * A white mask. A texture left over from a deleted mask is reset to white in the same step, so
 * undoing it brings the old pixels back for the undo of that delete.
 */
export function addLayerMask(api: EditorApi, id: LayerId): void {
  const layer = layerOf(api, id);
  if (!layer || layer.maskFile !== undefined) return;
  const old = api.pixelSize(id, "mask");
  if (!old) {
    const [w, h] = layer.transform.size;
    const over = api.checkBudget({ maskPx: Math.round(w) * Math.round(h) });
    if (over) return api.showError(over);
    return run(api, addMask(id, "white"), "image.layers.addMask");
  }
  const white = new Uint8Array(old.width * old.height).fill(255);
  const resize = api.resizePixels(id, "mask", old, { pixels: white });
  api.commit("image.layers.addMask", addMask(id, "white")(api.doc()), [], [resize]);
}

export function deleteMask(api: EditorApi, id: LayerId): void {
  run(api, removeMask(id), "image.layers.maskDelete");
}

export function setMaskOn(api: EditorApi, id: LayerId, on: boolean): void {
  run(api, setMaskEnabled(id, on), on ? "image.layers.maskEnable" : "image.layers.maskDisable");
}

export function linkMask(api: EditorApi, id: LayerId, linked: boolean): void {
  run(api, setMaskLinked(id, linked), linked ? "image.layers.maskLink" : "image.layers.maskUnlink");
}

/** 255 − value over the whole mask, one undo step. */
export function invertMask(api: EditorApi, id: LayerId): void {
  const layer = layerOf(api, id);
  if (layer?.maskFile === undefined) return;
  const placed = layer.maskPlacement ?? layer.transform;
  const size = api.pixelSize(id, "mask") ?? {
    width: Math.max(1, Math.round(placed.size[0])),
    height: Math.max(1, Math.round(placed.size[1])),
  };
  const rect = { x: 0, y: 0, ...size };
  const tiles = api.snapshotTiles(id, "mask", rect);
  const data = api.readRegion(id, "mask", rect);
  for (let i = 0; i < data.length; i++) data[i] = 255 - data[i];
  api.writeRegion(id, "mask", rect, data);
  api.commit("image.layers.maskInvert", api.doc(), tiles);
}
