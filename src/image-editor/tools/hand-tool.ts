// The hand tool: dragging pans the view.
import type { EditorApi, Point, ToolSpec } from "../api";
import { type View, viewportOf } from "../canvas";
import { HandIcon } from "../glyphs";

// Screen positions, not document ones: the document point under the pointer moves with the view.
const drags = new WeakMap<EditorApi, { from: Point; view: View }>();

export const handTool: ToolSpec = {
  id: "hand",
  label: "image.tools.hand",
  icon: HandIcon,
  cursor: "grab",
  key: "H",
  onPointerDown(_p, e, api) {
    const vp = viewportOf(api);
    if (vp) drags.set(api, { from: { x: e.clientX, y: e.clientY }, view: vp.view() });
  },
  onPointerMove(_p, e, api) {
    const drag = drags.get(api);
    const vp = viewportOf(api);
    if (!drag || !vp) return;
    const { zoom, center } = drag.view;
    vp.setView({
      zoom,
      center: {
        x: center.x - (e.clientX - drag.from.x) / zoom,
        y: center.y - (e.clientY - drag.from.y) / zoom,
      },
    });
  },
  onPointerUp(_p, _e, api) {
    drags.delete(api);
  },
  onDeactivate(api) {
    drags.delete(api);
  },
};
