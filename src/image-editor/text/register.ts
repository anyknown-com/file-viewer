import { registerMessages, registerTool } from "../registry";
import { textShapeMessages } from "./messages";
import { textTool } from "./type-tool";

export function registerTextShapes(): void {
  registerMessages(textShapeMessages);
  registerTool(textTool);
}
