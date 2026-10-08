import { registerMessages, registerPropertyPanel, registerTool } from "../registry";
import { textShapeMessages } from "./messages";
import { TextControls } from "./panel";
import { textTool } from "./type-tool";

export function registerTextShapes(): void {
  registerMessages(textShapeMessages);
  registerTool(textTool);
  // With another tool, a selected text layer still shows its properties (the text tool's own panel has them).
  registerPropertyPanel({
    id: "text",
    when: (layer, api) => layer.text !== undefined && api.session().tool !== "text",
    component: TextControls,
  });
}
