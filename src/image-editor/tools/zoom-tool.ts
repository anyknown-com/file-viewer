// The zoom tool (click zooms in, Alt-click out) and the view commands behind Mod+0, Mod+1, + and -.
import type { EditorApi, Point, ToolSpec } from "../api";
import { viewportOf } from "../canvas";
import { ZoomIcon } from "../glyphs";

/** Zooms by `factor` keeping the document point `at` (default: the view's center) in place. */
export function zoomBy(api: EditorApi, factor: number, at?: Point): void {
  const vp = viewportOf(api);
  if (!vp) return;
  const { zoom, center } = vp.view();
  const p = at ?? center;
  vp.setView({
    zoom: zoom * factor,
    center: { x: p.x - (p.x - center.x) / factor, y: p.y - (p.y - center.y) / factor },
  });
}

/** The whole canvas in the window, centered. */
export function fitToWindow(api: EditorApi): void {
  const vp = viewportOf(api);
  if (!vp) return;
  const { width, height } = api.doc().manifest;
  const size = vp.size();
  if (size.width <= 0 || size.height <= 0) return;
  vp.setView({
    zoom: Math.min(size.width / width, size.height / height),
    center: { x: width / 2, y: height / 2 },
  });
}

/** One document pixel per CSS pixel, keeping the center. */
export function actualSize(api: EditorApi): void {
  const vp = viewportOf(api);
  if (vp) vp.setView({ zoom: 1, center: vp.view().center });
}

export const zoomTool: ToolSpec = {
  id: "zoom",
  label: "image.tools.zoom",
  icon: ZoomIcon,
  cursor: "zoom-in",
  key: "Z",
  onPointerDown(p, e, api) {
    zoomBy(api, e.altKey ? 0.5 : 2, p);
  },
};
