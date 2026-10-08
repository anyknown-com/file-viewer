import type { AudioCodec } from "mediabunny";
import { describe, expect, it } from "vitest";
import {
  availableFormats,
  defaultFormat,
  estimateBytes,
  isSameFormatLost,
  outputSampleRate,
} from "./formats";

const encodes =
  (...codecs: AudioCodec[]) =>
  async (codec: AudioCodec) =>
    codecs.includes(codec);

describe("availableFormats", () => {
  it("lists aac, opus, wav when all encode", async () => {
    expect(await availableFormats(encodes("aac", "opus"), 2, 48000)).toEqual([
      "aac",
      "opus",
      "wav",
    ]);
  });

  it("lists opus and wav when only opus encodes", async () => {
    expect(await availableFormats(encodes("opus"), 2, 48000)).toEqual(["opus", "wav"]);
  });

  it("keeps wav when nothing encodes", async () => {
    expect(await availableFormats(encodes(), 1, 44100)).toEqual(["wav"]);
  });

  it("asks with the output sample rate", async () => {
    const asked: [AudioCodec, number][] = [];
    await availableFormats(
      async (codec, o) => {
        asked.push([codec, o.sampleRate]);
        return true;
      },
      2,
      22050,
    );
    expect(asked).toEqual([
      ["aac", 48000],
      ["opus", 48000],
    ]);
  });
});

describe("defaultFormat", () => {
  it("picks wav for pcm and flac sources", () => {
    expect(defaultFormat("pcm-s16", ["aac", "opus", "wav"])).toBe("wav");
    expect(defaultFormat("flac", ["aac", "opus", "wav"])).toBe("wav");
  });

  it("picks aac, then opus, then wav for others", () => {
    expect(defaultFormat("mp3", ["aac", "opus", "wav"])).toBe("aac");
    expect(defaultFormat("mp3", ["opus", "wav"])).toBe("opus");
    expect(defaultFormat(null, ["wav"])).toBe("wav");
  });
});

describe("outputSampleRate", () => {
  it("moves a 22050 Hz source to 48000 for aac", () => {
    expect(outputSampleRate("aac", 22050)).toBe(48000);
  });

  it("keeps 44.1 kHz for aac and wav, forces 48 kHz for opus", () => {
    expect(outputSampleRate("aac", 44100)).toBe(44100);
    expect(outputSampleRate("wav", 22050)).toBe(22050);
    expect(outputSampleRate("opus", 44100)).toBe(48000);
  });
});

describe("estimateBytes", () => {
  it("counts 16-bit frames plus the header for wav", () => {
    expect(estimateBytes({ format: "wav", bitrate: null }, 480000, 2, 48000)).toBe(1920044);
  });

  it("uses bitrate with 5% overhead, rounded up, for compressed formats", () => {
    expect(estimateBytes({ format: "aac", bitrate: 192000 }, 480000, 2, 48000)).toBe(252000);
    expect(estimateBytes({ format: "opus", bitrate: 96000 }, 1, 2, 48000)).toBe(1);
  });
});

describe("isSameFormatLost", () => {
  it("is true for mp3 and flac only", () => {
    expect(isSameFormatLost("mp3")).toBe(true);
    expect(isSameFormatLost("flac")).toBe(true);
    expect(isSameFormatLost("aac")).toBe(false);
    expect(isSameFormatLost(null)).toBe(false);
  });
});
