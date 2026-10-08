import { registerMessages } from "../registry";
import { selectPaintMessages } from "./messages";
import { registerPaintTools } from "./paint/register-paint";
import { registerSelectTools } from "./select/register-select";

export function registerSelectPaint(): void {
  registerMessages(selectPaintMessages);
  registerSelectTools();
  registerPaintTools();
}
