// The image editor's own menu items and shortcuts (11–13 add theirs through installExtensions).
import type { EditorApi } from "./api";
import { internalsOf } from "./editor-api";
import {
  activeLayer,
  deleteLayer,
  duplicate,
  group,
  isFolder,
  newFolder,
  newLayer,
  redo,
  run,
  ungroupFolder,
  undo,
} from "./layer-ops";
import { flipCanvas, rotateCanvas } from "./doc/commands/index";
import { canMergeDown, mergeDown, mergeFolder } from "./engine/merge";
import { menuItems, registerMenuItem, registerTool } from "./registry";
import { cropTool } from "./tools/crop-tool";
import { handTool } from "./tools/hand-tool";
import { transformTool } from "./tools/transform-tool";
import { actualSize, fitToWindow, zoomBy, zoomTool } from "./tools/zoom-tool";
import { openCanvasSizeDialog } from "./ui/canvas-size-dialog";
import { openImageSizeDialog } from "./ui/image-size-dialog";
import { openExportDialog } from "./save/export-dialog";
import { saverOf } from "./save/save";

const hasActive = (api: EditorApi): boolean => activeLayer(api) !== undefined;

function onActive(fn: (api: EditorApi, id: string) => void) {
  return (api: EditorApi) => {
    const layer = activeLayer(api);
    if (layer) fn(api, layer.id);
  };
}

/** Idempotent: returns at once when `edit.undo` is already registered. */
export function registerCore(): void {
  if (menuItems("edit").some((item) => item.id === "edit.undo")) return;
  registerMenuItem({
    id: "edit.undo",
    menu: "edit",
    label: "image.topbar.undo",
    shortcut: "Mod+Z",
    enabled: (api) => internalsOf(api).store.canUndo(),
    run: undo,
  });
  registerMenuItem({
    id: "edit.redo",
    menu: "edit",
    label: "image.topbar.redo",
    shortcut: "Mod+Shift+Z",
    enabled: (api) => internalsOf(api).store.canRedo(),
    run: redo,
  });
  registerMenuItem({ id: "layer.new", menu: "layer", label: "image.layers.new", run: newLayer });
  registerMenuItem({
    id: "layer.newFolder",
    menu: "layer",
    label: "image.layers.newFolder",
    run: newFolder,
  });
  registerMenuItem({
    id: "layer.duplicate",
    menu: "layer",
    label: "image.layers.duplicate",
    shortcut: "Mod+J",
    enabled: hasActive,
    run: onActive(duplicate),
  });
  registerMenuItem({
    id: "layer.group",
    menu: "layer",
    label: "image.layers.group",
    shortcut: "Mod+G",
    enabled: hasActive,
    run: onActive(group),
  });
  registerMenuItem({
    id: "layer.ungroup",
    menu: "layer",
    label: "image.layers.ungroup",
    shortcut: "Mod+Shift+G",
    enabled: (api) => {
      const layer = activeLayer(api);
      return layer !== undefined && isFolder(layer);
    },
    run: onActive(ungroupFolder),
  });
  registerMenuItem({
    id: "layer.delete",
    menu: "layer",
    label: "image.layers.delete",
    shortcut: "Backspace",
    enabled: hasActive,
    run: onActive(deleteLayer),
  });
  // Photoshop deletes the layer on either key; the menu shows the first one.
  registerMenuItem({
    id: "layer.delete.forward",
    menu: "hidden",
    label: "image.layers.delete",
    shortcut: "Delete",
    enabled: hasActive,
    run: onActive(deleteLayer),
  });
  registerMenuItem({
    id: "layer.mergeDown",
    menu: "layer",
    label: "image.layers.mergeDown",
    shortcut: "Mod+E",
    enabled: (api) => {
      const layer = activeLayer(api);
      return layer !== undefined && canMergeDown(api, layer.id);
    },
    run: onActive(mergeDown),
  });
  registerMenuItem({
    id: "layer.mergeFolder",
    menu: "layer",
    label: "image.layers.mergeFolder",
    enabled: (api) => {
      const layer = activeLayer(api);
      return layer !== undefined && isFolder(layer);
    },
    run: onActive(mergeFolder),
  });
  registerTool(transformTool);
  registerTool(cropTool);
  registerTool(handTool);
  registerTool(zoomTool);
  registerMenuItem({
    id: "edit.transform",
    menu: "edit",
    label: "image.transform.label",
    shortcut: "Mod+T",
    run: (api) => api.setSession({ tool: transformTool.id }),
  });
  registerMenuItem({
    id: "image.imageSize",
    menu: "image",
    label: "image.canvas.imageSize",
    run: openImageSizeDialog,
  });
  registerMenuItem({
    id: "image.canvasSize",
    menu: "image",
    label: "image.canvas.canvasSize",
    run: openCanvasSizeDialog,
  });
  const canvas = [
    ["image.flipH", "image.canvas.flipCanvasH", flipCanvas("x")],
    ["image.flipV", "image.canvas.flipCanvasV", flipCanvas("y")],
    ["image.rotateCw", "image.canvas.rotateCw", rotateCanvas(90)],
    ["image.rotateCcw", "image.canvas.rotateCcw", rotateCanvas(-90)],
  ] as const;
  for (const [id, label, command] of canvas)
    registerMenuItem({ id, menu: "image", label, run: (api) => run(api, command, label) });
  const view = [
    ["view.fit", "image.view.fit", "Mod+0", fitToWindow],
    ["view.actual", "image.view.actual", "Mod+1", actualSize],
    ["view.zoomIn", "image.zoom", "+", (api: EditorApi) => zoomBy(api, 2)],
    // "+" needs Shift on most layouts.
    ["view.zoomIn.shift", "image.zoom", "Shift++", (api: EditorApi) => zoomBy(api, 2)],
    ["view.zoomOut", "image.zoom", "-", (api: EditorApi) => zoomBy(api, 0.5)],
  ] as const;
  for (const [id, label, shortcut, fn] of view)
    registerMenuItem({ id, menu: "hidden", label, shortcut, run: fn });
  const save = [
    ["file.save", "image.topbar.save", "Mod+S", (api: EditorApi) => saverOf(api)?.save()],
    [
      "file.saveAs",
      "image.topbar.saveAs",
      "Mod+Shift+S",
      (api: EditorApi) => saverOf(api)?.saveAs(),
    ],
    [
      "file.export",
      "image.topbar.export",
      "Mod+Alt+Shift+S",
      (api: EditorApi) => {
        const saver = saverOf(api);
        if (saver) openExportDialog(api, saver);
      },
    ],
  ] as const;
  for (const [id, label, shortcut, fn] of save)
    registerMenuItem({ id, menu: "hidden", label, shortcut, run: (api) => void fn(api) });
}
