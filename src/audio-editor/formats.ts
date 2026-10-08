import type { AudioCodec } from "mediabunny";

export type FormatId = "aac" | "opus" | "wav";
export type OutputChoice = { format: FormatId; bitrate: number | null }; // wav is null; bps

type Format = {
  codec: AudioCodec;
  ext: ".m4a" | ".ogg" | ".wav";
  mime: "audio/mp4" | "audio/ogg" | "audio/wav";
  bitrates: number[] | null;
  defaultBitrate: number | null;
};

export const FORMATS: Record<FormatId, Format> = {
  aac: {
    codec: "aac",
    ext: ".m4a",
    mime: "audio/mp4",
    bitrates: [128000, 192000],
    defaultBitrate: 192000,
  },
  opus: {
    codec: "opus",
    ext: ".ogg",
    mime: "audio/ogg",
    bitrates: [96000, 128000, 160000],
    defaultBitrate: 128000,
  },
  wav: { codec: "pcm-s16", ext: ".wav", mime: "audio/wav", bitrates: null, defaultBitrate: null },
};

type CanEncode = (
  codec: AudioCodec,
  o: { numberOfChannels: number; sampleRate: number },
) => Promise<boolean>;

/** AAC keeps 44.1 / 48 kHz and moves everything else to 48 kHz; Opus is always 48 kHz. */
export function outputSampleRate(format: FormatId, sourceRate: number): number {
  if (format === "wav") return sourceRate;
  if (format === "aac" && (sourceRate === 44100 || sourceRate === 48000)) return sourceRate;
  return 48000;
}

/** Formats this browser can encode, in the order aac, opus, wav. WAV is always listed. */
export async function availableFormats(
  canEncode: CanEncode,
  channels: 1 | 2,
  sourceRate: number,
): Promise<FormatId[]> {
  const compressed: FormatId[] = ["aac", "opus"];
  const ok = await Promise.all(
    compressed.map((f) =>
      canEncode(FORMATS[f].codec, {
        numberOfChannels: channels,
        sampleRate: outputSampleRate(f, sourceRate),
      }),
    ),
  );
  return [...compressed.filter((_, i) => ok[i]), "wav"];
}

/** Lossless sources default to WAV; others to AAC, then Opus, then WAV. */
export function defaultFormat(sourceCodec: AudioCodec | null, available: FormatId[]): FormatId {
  if (sourceCodec === "flac" || sourceCodec?.startsWith("pcm-")) return "wav";
  if (available.includes("aac")) return "aac";
  if (available.includes("opus")) return "opus";
  return "wav";
}

export function estimateBytes(
  choice: OutputChoice,
  outFrames: number,
  channels: 1 | 2,
  sampleRate: number,
): number {
  if (choice.format === "wav") return outFrames * channels * 2 + 44;
  return Math.ceil(((choice.bitrate ?? 0) * (outFrames / sampleRate) * 1.05) / 8);
}

/** MP3 and FLAC sources cannot be written back in their own format. */
export function isSameFormatLost(sourceCodec: AudioCodec | null): boolean {
  return sourceCodec === "mp3" || sourceCodec === "flac";
}
