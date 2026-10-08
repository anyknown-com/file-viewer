import { registerMessages } from "../registry";
import { selectPaintMessages } from "./messages";
import { registerPaintTools } from "./paint/register-paint";
import { registerRedact } from "./register-redact";
import { registerSelectTools } from "./select/register-select";

export function registerSelectPaint(): void {
  registerMessages(selectPaintMessages);
  registerSelectTools();
  registerPaintTools();
  registerRedact();
}
