import { registerMessages } from "../registry";
import { selectPaintMessages } from "./messages";
import { registerSelectTools } from "./select/register-select";

export function registerSelectPaint(): void {
  registerMessages(selectPaintMessages);
  registerSelectTools();
}
