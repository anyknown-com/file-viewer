import { registerSelection, registerTool } from "../../registry";
import { ellipseMarqueeTool, rectMarqueeTool } from "./marquee";
import { lassoTool, polygonLassoTool } from "./lasso";
import { registerSelectMenu } from "./menu";
import { selectionProvider } from "./provider";

export function registerSelectTools(): void {
  registerTool(rectMarqueeTool);
  registerTool(ellipseMarqueeTool);
  registerTool(lassoTool);
  registerTool(polygonLassoTool);
  registerSelectMenu();
  registerSelection(selectionProvider);
}
