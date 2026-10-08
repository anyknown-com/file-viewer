import { describe, expect, it } from "vitest";
import { formatTimecode, frameTicks, roundToFrame, secondsToTicks } from "./time";

describe("time", () => {
  it("one second is 120000 ticks", () => {
    expect(secondsToTicks(1)).toBe(120_000);
  });
  it("one frame at 30 fps is 4000 ticks", () => {
    expect(frameTicks(30)).toBe(4000);
  });
  it("roundToFrame snaps to the nearest frame", () => {
    expect(roundToFrame(4100, 30)).toBe(4000);
  });
  it("formats timecodes", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00");
    expect(formatTimecode(secondsToTicks(59.99), 30)).toBe("00:59:29");
    expect(formatTimecode(secondsToTicks(3600), 30)).toBe("1:00:00:00");
  });
});
