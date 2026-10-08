import { describe, expect, it } from "vitest";
import type { LayerTextStyle } from "../../comp/index";
import { textShapeMessages } from "./messages";
import { applyColor, applyFont, editContent, normalizeRuns, styleAt } from "./runs";
import { type ColorRun, defaultTextStyle } from "./style";

const red = (location: number, length: number): ColorRun => ({
  location,
  length,
  red: 1,
  green: 0,
  blue: 0,
});
const blue = (location: number, length: number): ColorRun => ({
  location,
  length,
  red: 0,
  green: 0,
  blue: 1,
});
const sameColor = (a: ColorRun, b: ColorRun) =>
  a.red === b.red && a.green === b.green && a.blue === b.blue;

function withColors(content: string, colorRuns: ColorRun[]): LayerTextStyle {
  return { ...defaultTextStyle(content), colorRuns };
}

describe("normalizeRuns", () => {
  it("sorts, drops empty runs, clips to the content and merges equal neighbours", () => {
    const runs = [blue(6, 10), red(2, 2), red(0, 0), red(0, 2)];
    expect(normalizeRuns(runs, 8, sameColor)).toEqual([red(0, 4), blue(6, 2)]);
  });
});

describe("editContent", () => {
  const s = withColors("aaaabbbbcccc", [red(4, 4)]);

  it("shifts a run when typing before it", () => {
    expect(editContent(s, 1, 1, "xy").colorRuns).toEqual([red(6, 4)]);
  });

  it("grows a run when typing inside or right after it", () => {
    expect(editContent(s, 6, 6, "xy").colorRuns).toEqual([red(4, 6)]);
    expect(editContent(s, 8, 8, "xy").colorRuns).toEqual([red(4, 6)]);
  });

  it("does not grow a run when typing right before it", () => {
    expect(editContent(s, 4, 4, "x").colorRuns).toEqual([red(5, 4)]);
  });

  it("leaves a run alone when typing after it", () => {
    expect(editContent(s, 10, 10, "xy").colorRuns).toEqual([red(4, 4)]);
  });

  it("shrinks runs when deleting across two of them", () => {
    const two = withColors("aaaabbbbcccc", [red(0, 4), blue(4, 4)]);
    const next = editContent(two, 2, 6, "");
    expect(next.content).toBe("aabbcccc");
    expect(next.colorRuns).toEqual([red(0, 2), blue(2, 2)]);
  });

  it("removes a run whose text is deleted", () => {
    const next = editContent(s, 3, 9, "");
    expect(next.content).toBe("aaaccc");
    expect(next.colorRuns).toBeUndefined();
  });

  it("counts UTF-16 units and keeps surrogate pairs whole", () => {
    const emoji = "😀";
    const next = editContent(s, 6, 6, emoji);
    expect(next.content).toBe(`aaaabb${emoji}bbcccc`);
    expect(next.colorRuns).toEqual([red(4, 6)]);
    const after = editContent(next, 0, 0, emoji);
    expect(after.colorRuns).toEqual([red(6, 6)]);
    expect(after.content.slice(8, 10)).toBe(emoji);
  });
});

describe("applyColor / applyFont", () => {
  it("splits an old run that crosses the edge of the new one", () => {
    const next = applyColor(withColors("aaaabbbbcccc", [red(0, 8)]), 4, 6, [0, 0, 1]);
    expect(next.colorRuns).toEqual([red(0, 4), blue(4, 2), red(6, 2)]);
  });

  it("merges with an equal neighbour", () => {
    const next = applyColor(withColors("aaaabbbb", [red(0, 4)]), 4, 8, [1, 0, 0]);
    expect(next.colorRuns).toEqual([red(0, 8)]);
  });

  it("sets the whole text's color and clears color runs when start === end", () => {
    const next = applyColor(withColors("abc", [red(0, 1)]), 1, 1, [0, 1, 0]);
    expect(next).toMatchObject({ red: 0, green: 1, blue: 0 });
    expect(next.colorRuns).toBeUndefined();
  });

  it("sets the whole text's font and clears font runs when start === end", () => {
    const base = applyFont(defaultTextStyle("abcdef"), 2, 4, "Geist-Bold");
    expect(base.fontRuns).toEqual([{ location: 2, length: 2, fontName: "Geist-Bold" }]);
    expect(styleAt(base, 3).fontName).toBe("Geist-Bold");
    expect(styleAt(base, 4).fontName).toBe("Geist-Regular");
    const next = applyFont(base, 0, 0, "Geist-Light");
    expect(next.fontName).toBe("Geist-Light");
    expect(next.fontRuns).toBeUndefined();
  });
});

describe("textShapeMessages", () => {
  it("has the same keys in en and zh-TW", () => {
    expect(Object.keys(textShapeMessages["zh-TW"]).toSorted()).toEqual(
      Object.keys(textShapeMessages.en).toSorted(),
    );
  });
});
