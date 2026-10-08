import { registerMessages } from "../registry";
import { adjustMessages } from "./messages";
import { registerLutAdjustments } from "./register-lut";
import { registerNoiseAdjustments } from "./register-noise";

export function registerAdjust(): void {
  registerMessages(adjustMessages);
  registerLutAdjustments();
  registerNoiseAdjustments();
}
