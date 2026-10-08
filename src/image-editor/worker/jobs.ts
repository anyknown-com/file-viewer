import { decodePng, encodePng, type PngImage } from "../../comp/index"; // 09
import { contentFill } from "../tools/heal/content-fill";
import { spotHeal } from "../tools/heal/spot-heal";
import { wandMask } from "../tools/select/wand";

// Jobs the module worker runs. Other plans add one key each (11: wand, heal, contentFill).
export const jobs = {
  encodePng: (input: PngImage, signal: AbortSignal): Uint8Array => {
    signal.throwIfAborted();
    return encodePng(input);
  },
  decodePng: (
    input: { bytes: Uint8Array; kind: "layer" | "mask" },
    signal: AbortSignal,
  ): PngImage => {
    signal.throwIfAborted();
    return decodePng(input.bytes, input.kind);
  },
  wand: (input: Parameters<typeof wandMask>[0], signal: AbortSignal): Uint8Array =>
    wandMask(input, signal),
  heal: (input: Parameters<typeof spotHeal>[0], signal: AbortSignal): Uint8Array =>
    spotHeal(input, signal),
  contentFill: (input: Parameters<typeof contentFill>[0], signal: AbortSignal): Uint8Array =>
    contentFill(input, signal),
};

export type JobKind = keyof typeof jobs;
export type JobInput<K extends JobKind> = Parameters<(typeof jobs)[K]>[0];
export type JobOutput<K extends JobKind> = Awaited<ReturnType<(typeof jobs)[K]>>;
