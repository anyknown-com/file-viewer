import { registerMessages } from "../registry";
import { selectPaintMessages } from "./messages";

export function registerSelectPaint(): void {
  registerMessages(selectPaintMessages);
}
