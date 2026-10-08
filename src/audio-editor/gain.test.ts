import { describe, expect, it } from "vitest";
import { cut, fade, gain as addGain, initialEdit, split } from "./edit";
import { applyGains, downmixToStereo, gainAt } from "./gain";

describe("gainAt", () => {
  it("fade in runs 0 to 1, fade out runs 1 to 0", () => {
    const fi = fade(initialEdit(10), { start: 2, end: 4 }, "in");
    expect(gainAt(fi, 2)).toBeCloseTo(0, 10);
    expect(gainAt(fi, 4)).toBeCloseTo(1, 10);
    const fo = fade(initialEdit(10), { start: 2, end: 4 }, "out");
    expect(gainAt(fo, 2)).toBeCloseTo(1, 10);
    expect(gainAt(fo, 4)).toBeCloseTo(0, 10);
  });

  it("+6 dB is about 1.9953", () => {
    const e = addGain(initialEdit(10), { start: 0, end: 5 }, 6);
    expect(gainAt(e, 1)).toBeCloseTo(1.9953, 4);
    expect(gainAt(e, 6)).toBe(1);
  });

  it("overlapping gains multiply", () => {
    let e = addGain(initialEdit(10), { start: 0, end: 5 }, 6);
    e = addGain(e, { start: 2, end: 8 }, -6);
    expect(gainAt(e, 3)).toBeCloseTo(10 ** (6 / 20) * 10 ** (-6 / 20), 10);
  });

  it("seam fades appear only where the source jumps", () => {
    const contiguous = split(initialEdit(10), 4);
    expect(gainAt(contiguous, 3.999)).toBe(1);
    expect(gainAt(contiguous, 4.001)).toBe(1);
    const jumped = cut(initialEdit(10), { start: 2, end: 5 });
    expect(gainAt(jumped, 1.999)).toBeLessThan(1);
    expect(gainAt(jumped, 2)).toBe(0);
    expect(gainAt(jumped, 2.002)).toBeLessThan(1);
    expect(gainAt(jumped, 1.9)).toBe(1);
    expect(gainAt(jumped, 2.1)).toBe(1);
  });
});

describe("applyGains", () => {
  const make = () => [new Float32Array(48000).fill(0.5), new Float32Array(48000).fill(-0.25)];

  it("is byte-identical before and after a split", () => {
    let e = fade(initialEdit(1), { start: 0, end: 0.5 }, "in");
    e = addGain(e, { start: 0.3, end: 0.9 }, -4);
    const a = make();
    const b = make();
    applyGains(a, 0, 48000, e);
    applyGains(b, 0, 48000, split(e, 0.4));
    for (let c = 0; c < 2; c++) {
      expect(Buffer.from(a[c].buffer).equals(Buffer.from(b[c].buffer))).toBe(true);
    }
  });

  it("leaves samples alone with no gains and no seams", () => {
    const p = make();
    applyGains(p, 0, 48000, initialEdit(1));
    expect(p[0][100]).toBe(0.5);
  });

  it("multiplies samples by the gain at their time", () => {
    const p = make();
    applyGains(p, 0, 48000, addGain(initialEdit(1), { start: 0, end: 1 }, -6));
    expect(p[0][10]).toBeCloseTo(0.5 * 10 ** (-6 / 20), 6);
    expect(p[1][10]).toBeCloseTo(-0.25 * 10 ** (-6 / 20), 6);
  });
});

describe("downmixToStereo", () => {
  const ch = (...v: number[]) => v.map((x) => new Float32Array([x]));

  it("returns mono and stereo as is", () => {
    const m = ch(1);
    const s = ch(1, 2);
    expect(downmixToStereo(m)).toBe(m);
    expect(downmixToStereo(s)).toBe(s);
  });

  it("mixes 4 channels", () => {
    const [l, r] = downmixToStereo(ch(1, 2, 3, 4));
    expect(l[0]).toBeCloseTo(2, 6);
    expect(r[0]).toBeCloseTo(3, 6);
  });

  it("mixes 6 channels, dropping LFE", () => {
    const [l, r] = downmixToStereo(ch(1, 2, 3, 100, 5, 6));
    expect(l[0]).toBeCloseTo(1 + 0.7071 * (3 + 5), 5);
    expect(r[0]).toBeCloseTo(2 + 0.7071 * (3 + 6), 5);
  });

  it("keeps the first two of other counts", () => {
    const out = downmixToStereo(ch(1, 2, 3));
    expect(out.map((p) => p[0])).toEqual([1, 2]);
  });
});
