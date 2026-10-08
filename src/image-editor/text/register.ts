import {
  registerLayerDecor,
  registerMessages,
  registerPropertyPanel,
  registerTool,
} from "../registry";
import { redrawAfterTransform } from "../shapes/layer";
import { shapeTool } from "../shapes/shape-tool";
import { textShapeMessages } from "./messages";
import { TextControls } from "./panel";
import { textShapeThumbnail } from "./thumbs";
import { textTool } from "./type-tool";

export function registerTextShapes(): void {
  registerMessages(textShapeMessages);
  registerTool(textTool);
  registerTool(shapeTool);
  registerLayerDecor({ id: "shape-resize", onTransformEnd: redrawAfterTransform });
  registerLayerDecor({ id: "text-shape-thumb", thumbnail: textShapeThumbnail });
  // With another tool, a selected text layer still shows its properties (the text tool's own panel has them).
  registerPropertyPanel({
    id: "text",
    when: (layer, api) => layer.text !== undefined && api.session().tool !== "text",
    component: TextControls,
  });
}
