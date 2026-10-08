import { registerLayerEffects } from "../effects/register";
import { registerMessages } from "../registry";
import { adjustMessages } from "./messages";
import { registerBlurAdjustments } from "./register-blur";
import { registerLutAdjustments } from "./register-lut";
import { registerNoiseAdjustments } from "./register-noise";

export function registerAdjust(): void {
  registerMessages(adjustMessages);
  registerLutAdjustments();
  registerNoiseAdjustments();
  registerBlurAdjustments();
  registerLayerEffects();
}
