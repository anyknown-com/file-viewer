import { afterEach, expect, it } from "vitest";
import { makeDoc } from "../../test/make-doc";
import { mountCanvas } from "../../test/mount-canvas";
import {
  combineRef,
  currentSelection,
  deselect,
  hasSelection,
  invertRef,
  invertSelection,
  type MaskOp,
  readSelection,
  reselect,
  selectionBounds,
  selectionInLayer,
  writeSelection,
} from "./mask";
import { loadLayerAlpha } from "./load";
import { expandSelection, featherSelection, gaussianKernel, featherSigma } from "./morph";

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

async function setup(layer: Parameters<typeof makeDoc>[0]["layers"][number] = {}, alpha = 255) {
  const doc = makeDoc({ width: 64, height: 64, layers: [layer] });
  const id = doc.manifest.layers[0].id;
  const m = await mountCanvas(doc, { [id]: [200, 100, 50, alpha] });
  mounted.push(m.unmount);
  return { api: m.api, id };
}

const FULL = { x: 0, y: 0, width: 64, height: 64 };

function pattern(seed: number): Uint8Array {
  return Uint8Array.from(
    { length: 64 * 64 },
    (_, i) => [0, 64, 128, 255][(i * seed + (i >> 3)) % 4],
  );
}

it("writes with every op like combineRef", async () => {
  const { api } = await setup();
  const base = pattern(3);
  const incoming = pattern(5);
  for (const op of ["replace", "add", "subtract", "intersect"] as MaskOp[]) {
    writeSelection(api, base, FULL, "replace");
    writeSelection(api, incoming, FULL, op);
    const got = readSelection(api);
    const want = combineRef(base, incoming, op);
    const worst = got.reduce((m, v, i) => Math.max(m, Math.abs(v - want[i])), 0);
    expect(worst).toBeLessThanOrEqual(1);
  }
});

it("feathers like a separable gaussian", async () => {
  const { api } = await setup();
  const base = new Uint8Array(64 * 64);
  for (let y = 20; y < 44; y++) for (let x = 20; x < 44; x++) base[y * 64 + x] = 255;
  writeSelection(api, base, FULL, "replace");
  featherSelection(api, 4);
  const got = readSelection(api);
  const k = gaussianKernel(featherSigma(4));
  const r = (k.length - 1) / 2;
  const pass = (src: Uint8Array, dx: number, dy: number): Uint8Array =>
    src.map((_, i) => {
      const x = i % 64;
      const y = Math.floor(i / 64);
      let s = 0;
      for (let j = -r; j <= r; j++) {
        const sx = Math.min(63, Math.max(0, x + dx * j));
        const sy = Math.min(63, Math.max(0, y + dy * j));
        s += k[j + r] * src[sy * 64 + sx];
      }
      return Math.round(s);
    });
  const want = pass(pass(base, 1, 0), 0, 1);
  const worst = got.reduce((m, v, i) => Math.max(m, Math.abs(v - want[i])), 0);
  expect(worst).toBeLessThanOrEqual(1);
});

it("deselect then reselect restores the selection", async () => {
  const { api } = await setup();
  const base = pattern(7);
  writeSelection(api, base, FULL, "replace");
  deselect(api);
  expect(hasSelection(api)).toBe(false);
  reselect(api);
  expect(Array.from(readSelection(api))).toEqual(Array.from(base));
});

it("inverts twice back to the original", async () => {
  const { api } = await setup();
  const base = pattern(11);
  writeSelection(api, base, FULL, "replace");
  invertSelection(api);
  expect(Array.from(readSelection(api))).toEqual(Array.from(invertRef(base)));
  invertSelection(api);
  expect(Array.from(readSelection(api))).toEqual(Array.from(base));
});

it("expands a block on the gpu like a square-and-cross dilation", async () => {
  const { api } = await setup();
  const base = new Uint8Array(64 * 64);
  base[32 * 64 + 32] = 255;
  writeSelection(api, base, FULL, "replace");
  expandSelection(api, 2);
  expect(selectionBounds(api)).toEqual({ x: 30, y: 30, width: 5, height: 5 });
});

it("samples the selection into layer pixels", async () => {
  const { api, id } = await setup({
    transform: {
      origin: [16, 16],
      size: [32, 32],
      rotation: 0,
      flipX: false,
      flipY: false,
      sampling: "High quality",
    },
  });
  const base = new Uint8Array(64 * 64);
  for (let y = 20; y < 30; y++) for (let x = 20; x < 30; x++) base[y * 64 + x] = 255;
  writeSelection(api, base, FULL, "replace");
  const got = selectionInLayer(api, id, { x: 0, y: 0, width: 32, height: 32 });
  expect(got[4 * 32 + 4]).toBe(255);
  expect(got[3 * 32 + 4]).toBe(0);
  expect(got[4 * 32 + 3]).toBe(0);
  expect(got[13 * 32 + 13]).toBe(255);
  expect(got[14 * 32 + 14]).toBe(0);
});

it("loads a layer's alpha", async () => {
  const { api, id } = await setup({}, 128);
  loadLayerAlpha(api, id, "image", "replace");
  const got = readSelection(api);
  expect(got[0]).toBe(128);
  expect(got[64 * 64 - 1]).toBe(128);
});

it("reports the current selection", async () => {
  const { api } = await setup();
  expect(currentSelection(api)).toBeNull();
  const base = new Uint8Array(10 * 6).fill(255);
  writeSelection(api, base, { x: 60, y: 10, width: 10, height: 6 }, "replace");
  const sel = currentSelection(api);
  expect(sel?.bounds).toEqual({ x: 60, y: 10, width: 4, height: 6 });
  const read = sel?.read({ x: 62, y: 10, width: 6, height: 1 });
  expect(Array.from(read ?? [])).toEqual([255, 255, 0, 0, 0, 0]);
});
