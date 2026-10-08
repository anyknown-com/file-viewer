import type { ToolSpec } from "../../api";
import { BrushGlyph, EraserGlyph } from "../glyphs";
import { setToolState, toolState } from "../state";
import { eraseOver, paintMask, paintOver } from "./composite";
import { PaintPanel } from "./paint-panel";
import { createStrokeTool } from "./stroke-tool";

type Kind = "brush" | "eraser";

export function createPaintTool(kind: Kind): ToolSpec {
  const brush = kind === "brush";
  return createStrokeTool({
    id: brush ? "paint.brush" : "paint.eraser",
    label: brush ? "image.paint.brush" : "image.paint.eraser",
    icon: brush ? BrushGlyph : EraserGlyph,
    key: brush ? "B" : "E",
    panel: PaintPanel,
    commitLabel: brush ? "image.paint.brush" : "image.paint.eraser",
    onAlt: brush
      ? (p, api) => {
          const [r, g, b] = api.readComposite({
            x: Math.floor(p.x),
            y: Math.floor(p.y),
            width: 1,
            height: 1,
          });
          setToolState(api, { fg: [r!, g!, b!, 255] });
        }
      : undefined,
    start(api, t) {
      const { fg, brush: opts } = toolState(api);
      const [r, g, b] = fg;
      if (t.target === "mask") {
        const value = brush ? Math.round(0.299 * r + 0.587 * g + 0.114 * b) : 0;
        return (base, cov) => paintMask(base, cov, value, opts.opacity);
      }
      return brush
        ? (base, cov) => paintOver(base, cov, fg, opts.opacity)
        : (base, cov) => eraseOver(base, cov, opts.opacity);
    },
  });
}

export const brushTool: ToolSpec = createPaintTool("brush");
export const eraserTool: ToolSpec = createPaintTool("eraser");
