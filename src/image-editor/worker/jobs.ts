import { decodePng, encodePng, type PngImage } from "../../comp/index"; // 09

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
};

export type JobKind = keyof typeof jobs;
export type JobInput<K extends JobKind> = Parameters<(typeof jobs)[K]>[0];
export type JobOutput<K extends JobKind> = Awaited<ReturnType<(typeof jobs)[K]>>;
