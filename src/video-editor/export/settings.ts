import { canEncodeAudio, canEncodeVideo } from "mediabunny";
import type { Project } from "../model/project";
import { type Ticks, ticksToSeconds } from "../model/time";

export const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 ** 3;

export type PresetId = "original" | "1080p" | "720p";
export type ExportPreset = {
  id: PresetId;
  width: number;
  height: number;
  fps: number;
  videoBitrate: number;
  audioBitrate: 128_000;
};

const AUDIO_BITRATE = 128_000;
const FULL_HD_PIXELS = 1920 * 1080;

/** Encoders using 4:2:0 chroma (H.264, VP9) need even dimensions, so every size rounds down to one. */
const even = (n: number) => Math.floor(n / 2) * 2;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Scales the canvas so its short side is `short`, keeping the canvas's aspect. */
function scaled(p: Project, short: number): { width: number; height: number } {
  const landscape = p.width >= p.height;
  const long = even(
    Math.floor((short * Math.max(p.width, p.height)) / Math.min(p.width, p.height)),
  );
  return landscape ? { width: long, height: short } : { width: short, height: long };
}

export function exportPresets(p: Project): ExportPreset[] {
  const width = even(p.width);
  const height = even(p.height);
  const presets: ExportPreset[] = [
    {
      id: "original",
      width,
      height,
      fps: p.fps,
      videoBitrate: clamp(
        Math.round((8_000_000 * width * height) / FULL_HD_PIXELS),
        1_000_000,
        40_000_000,
      ),
      audioBitrate: AUDIO_BITRATE,
    },
  ];
  const short = Math.min(p.width, p.height);
  if (short >= 1080) {
    presets.push({
      id: "1080p",
      ...scaled(p, 1080),
      fps: p.fps,
      videoBitrate: 8_000_000,
      audioBitrate: AUDIO_BITRATE,
    });
  }
  if (short >= 720) {
    presets.push({
      id: "720p",
      ...scaled(p, 720),
      fps: p.fps,
      videoBitrate: 5_000_000,
      audioBitrate: AUDIO_BITRATE,
    });
  }
  return presets;
}

export function estimateBytes(preset: ExportPreset, duration: Ticks): number {
  return Math.ceil(
    (((preset.videoBitrate + preset.audioBitrate) * ticksToSeconds(duration)) / 8) * 1.05,
  );
}

export async function pickAudioCodec(): Promise<"aac" | "opus"> {
  const aac = await canEncodeAudio("aac", {
    numberOfChannels: 2,
    sampleRate: 48_000,
    bitrate: AUDIO_BITRATE,
  });
  return aac ? "aac" : "opus";
}

export function canEncodePreset(preset: ExportPreset): Promise<boolean> {
  return canEncodeVideo("avc", {
    width: preset.width,
    height: preset.height,
    bitrate: preset.videoBitrate,
  });
}
