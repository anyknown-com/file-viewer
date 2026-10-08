// Cases from Compositor (github.com/robbietilton/Compositor @11d8d7a, CompositorTests/CloneStampTests.swift), MIT
import { describe, expect, it } from "vitest";
import { cloneOffset, cloneOver } from "./clone";

describe("cloneOffset", () => {
  const source = { x: 15, y: 20 };

  it("runs from the first stroke to the source", () => {
    expect(cloneOffset({ source, firstDest: null, aligned: true }, { x: 60, y: 20 })).toEqual({
      x: -45,
      y: 0,
    });
  });

  it("keeps the first stroke's offset for the next aligned stroke", () => {
    // (66, 20) copies from (21, 20), not from the source.
    const o = cloneOffset({ source, firstDest: { x: 60, y: 20 }, aligned: true }, { x: 66, y: 20 });
    expect(o).toEqual({ x: -45, y: 0 });
    expect({ x: 66 + o.x, y: 20 + o.y }).toEqual({ x: 21, y: 20 });
  });

  it("starts every stroke at the source again when not aligned", () => {
    const o = cloneOffset(
      { source, firstDest: { x: 60, y: 20 }, aligned: false },
      { x: 50, y: 10 },
    );
    expect({ x: 50 + o.x, y: 10 + o.y }).toEqual(source);
  });

  it("rounds to whole pixels", () => {
    expect(
      cloneOffset({ source: { x: 10.4, y: 3 }, firstDest: null, aligned: true }, { x: 0, y: 0.6 }),
    ).toEqual({ x: 10, y: 2 });
  });
});

describe("cloneOver", () => {
  const base = new Uint8Array([0, 0, 255, 255, 0, 0, 255, 255]);
  const src = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);

  it("equals the source pixel at full coverage", () => {
    expect([...cloneOver(base, new Uint8Array([255, 255]), src, 1)]).toEqual([...src]);
  });

  it("leaves pixels without coverage alone", () => {
    expect([...cloneOver(base, new Uint8Array([0, 0]), src, 1)]).toEqual([...base]);
  });

  it("leaves pixels under a transparent source alone", () => {
    const clear = new Uint8Array(8);
    expect([...cloneOver(base, new Uint8Array([255, 255]), clear, 1)]).toEqual([...base]);
  });

  it("blends by coverage and opacity", () => {
    const out = cloneOver(base, new Uint8Array([255, 0]), src, 0.5);
    expect([...out.subarray(0, 4)]).toEqual([128, 0, 128, 255]);
  });

  it("mixes R8 masks toward the source value", () => {
    const out = cloneOver(
      new Uint8Array([0, 200]),
      new Uint8Array([255, 128]),
      new Uint8Array([100, 0]),
      1,
    );
    expect([...out]).toEqual([100, 100]);
  });
});
