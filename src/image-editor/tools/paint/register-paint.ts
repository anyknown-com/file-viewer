import { registerMenuItem, registerTool } from "../../registry";
import { healTool } from "../heal/heal-tool";
import { brushTool, eraserTool } from "./brush-tool";
import { cloneTool } from "./clone";
import { defaultColors, swapColors } from "./color-swatches";
import { eyedropperTool } from "./eyedropper";
import { gradientTool } from "./gradient";

export function registerPaintTools(): void {
  registerTool(brushTool);
  registerTool(eraserTool);
  registerTool(gradientTool);
  registerTool(eyedropperTool);
  registerTool(cloneTool);
  registerTool(healTool);
  registerMenuItem({
    id: "paint.swapColors",
    menu: "hidden",
    label: "image.paint.swap",
    shortcut: "X",
    run: swapColors,
  });
  registerMenuItem({
    id: "paint.defaultColors",
    menu: "hidden",
    label: "image.paint.defaultColors",
    shortcut: "D",
    run: defaultColors,
  });
}
