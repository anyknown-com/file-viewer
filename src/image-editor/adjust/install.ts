import { registerMessages } from "../registry";
import { adjustMessages } from "./messages";
import { registerLutAdjustments } from "./register-lut";

export function registerAdjust(): void {
  registerMessages(adjustMessages);
  registerLutAdjustments();
}
