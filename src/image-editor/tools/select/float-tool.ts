import type { Point, ToolSpec } from "../../api";
import { isMac } from "../../shortcut";
import { floatKey, floating, commitFloat, floatOverlay, selectionMove } from "./floating";

const isMod = (e: PointerEvent): boolean => (isMac() ? e.metaKey : e.ctrlKey);

/** Mod + drag inside the selection moves its pixels (Photoshop's temporary move tool). */
export function withFloat(tool: ToolSpec): ToolSpec {
  const moving = new WeakSet<object>();
  return {
    ...tool,
    onPointerDown(p: Point, e, api) {
      const inside = api
        .selection()
        ?.read({ x: Math.floor(p.x), y: Math.floor(p.y), width: 1, height: 1 })[0];
      if (isMod(e) && ((inside ?? 0) >= 128 || floating(api))) {
        moving.add(api);
        selectionMove.onPointerDown?.(p, e, api);
        return;
      }
      tool.onPointerDown?.(p, e, api);
    },
    onPointerMove(p, e, api) {
      if (moving.has(api)) selectionMove.onPointerMove?.(p, e, api);
      else tool.onPointerMove?.(p, e, api);
    },
    onPointerUp(p, e, api) {
      if (moving.delete(api)) selectionMove.onPointerUp?.(p, e, api);
      else tool.onPointerUp?.(p, e, api);
    },
    onKeyDown: (e, api) => floatKey(e, api) || (tool.onKeyDown?.(e, api) ?? false),
    drawOverlay(ctx, view, api) {
      floatOverlay(ctx, view, api);
      tool.drawOverlay?.(ctx, view, api);
    },
    onDeactivate(api) {
      moving.delete(api);
      if (floating(api)) commitFloat(api);
      tool.onDeactivate?.(api);
    },
  };
}
