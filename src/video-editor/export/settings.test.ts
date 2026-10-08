import { canEncodeAudio, canEncodeVideo } from "mediabunny";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject, type Project } from "../model/project";
import { secondsToTicks } from "../model/time";
import {
  canEncodePreset,
  estimateBytes,
  exportPresets,
  pickAudioCodec,
  type PresetId,
} from "./settings";

vi.mock("mediabunny", () => ({
  canEncodeAudio: vi.fn<() => Promise<boolean>>(async () => true),
  canEncodeVideo: vi.fn<() => Promise<boolean>>(async () => true),
}));

function project(width: number, height: number, fps = 30): Project {
  return {
    ...createProject({
      id: "source",
      name: "a.mp4",
      kind: "video",
      duration: secondsToTicks(10),
      width,
      height,
      fps,
      hasAudio: true,
    }),
    // Set directly so odd sizes reach the presets as they would from an unrounded canvas.
    width,
    height,
  };
}

const byId = (p: Project, id: PresetId) => exportPresets(p).find((x) => x.id === id);

afterEach(() => {
  vi.clearAllMocks();
});

describe("exportPresets", () => {
  it("offers three presets for 1920×1080, with 1080p at 8 Mbps", () => {
    const presets = exportPresets(project(1920, 1080));
    expect(presets.map((x) => x.id)).toEqual(["original", "1080p", "720p"]);
    expect(byId(project(1920, 1080), "1080p")).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 30,
      videoBitrate: 8_000_000,
      audioBitrate: 128_000,
    });
    expect(byId(project(1920, 1080), "720p")).toMatchObject({
      width: 1280,
      height: 720,
      videoBitrate: 5_000_000,
    });
  });

  it("leaves out 1080p for a 1280×720 project", () => {
    expect(exportPresets(project(1280, 720)).map((x) => x.id)).toEqual(["original", "720p"]);
  });

  it("makes 9:16 1080p 1080×1920", () => {
    expect(byId(project(1080, 1920), "1080p")).toMatchObject({ width: 1080, height: 1920 });
  });

  it("clamps a 4K original to at most 40 Mbps", () => {
    expect(byId(project(7680, 4320), "original")!.videoBitrate).toBe(40_000_000);
    expect(byId(project(3840, 2160), "original")!.videoBitrate).toBe(32_000_000);
    expect(byId(project(320, 180), "original")!.videoBitrate).toBe(1_000_000);
  });

  it("rounds every preset down to even sizes", () => {
    for (const p of [project(1921, 1081), project(1081, 1923), project(1279, 719)]) {
      for (const preset of exportPresets(p)) {
        expect(preset.width % 2, `${preset.id} width`).toBe(0);
        expect(preset.height % 2, `${preset.id} height`).toBe(0);
      }
    }
    expect(byId(project(1921, 1081), "original")).toMatchObject({ width: 1920, height: 1080 });
  });

  it("uses the project fps for every preset", () => {
    expect(exportPresets(project(1920, 1080, 60)).map((x) => x.fps)).toEqual([60, 60, 60]);
  });
});

describe("estimateBytes", () => {
  it("matches the formula for 2 minutes of 1080p", () => {
    const preset = byId(project(1920, 1080), "1080p")!;
    expect(estimateBytes(preset, secondsToTicks(120))).toBe(
      Math.ceil((((8_000_000 + 128_000) * 120) / 8) * 1.05),
    );
  });
});

describe("pickAudioCodec", () => {
  it("picks AAC when it can encode it", async () => {
    expect(await pickAudioCodec()).toBe("aac");
    expect(canEncodeAudio).toHaveBeenCalledWith("aac", {
      numberOfChannels: 2,
      sampleRate: 48_000,
      bitrate: 128_000,
    });
  });

  it("falls back to Opus when AAC cannot be encoded", async () => {
    vi.mocked(canEncodeAudio).mockResolvedValueOnce(false);
    expect(await pickAudioCodec()).toBe("opus");
  });
});

describe("canEncodePreset", () => {
  it("asks for H.264 at the preset's even size and bitrate", async () => {
    const preset = byId(project(1921, 1081), "original")!;
    vi.mocked(canEncodeVideo).mockResolvedValueOnce(false);
    expect(await canEncodePreset(preset)).toBe(false);
    expect(canEncodeVideo).toHaveBeenCalledWith("avc", {
      width: 1920,
      height: 1080,
      bitrate: preset.videoBitrate,
    });
  });
});
