import { afterEach, expect, it } from "vitest";
import type { Layer } from "../../api";
import { makeDoc } from "../../test/make-doc";
import { mountCanvas } from "../../test/mount-canvas";
import { writeSelection } from "../select/mask";
import { coverageRef } from "./brush.glsl";
import { createStrokeBuffer } from "./stroke-buffer";

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

async function setup(layer: Partial<Layer> = {}) {
  const doc = makeDoc({ width: 128, height: 128, layers: [layer] });
  const id = doc.manifest.layers[0]!.id;
  const m = await mountCanvas(doc, { [id]: [255, 255, 255, 255] });
  mounted.push(m.unmount);
  return { api: m.api, id };
}

function selectLeftHalf(api: Awaited<ReturnType<typeof setup>>["api"]): void {
  const rect = { x: 0, y: 0, width: 64, height: 128 };
  writeSelection(api, new Uint8Array(64 * 128).fill(255), rect, "replace");
}

it("matches the reference coverage of a soft segment within 1", async () => {
  const { api, id } = await setup();
  const buffer = createStrokeBuffer(api, id, "image");
  const a = { x: 30, y: 40 };
  const b = { x: 90, y: 70 };
  const rect = buffer.segment(a, b, 24, 0.3);
  const got = buffer.read(rect);
  let worst = 0;
  for (let y = 0; y < rect.height; y++)
    for (let x = 0; x < rect.width; x++) {
      const p = { x: rect.x + x + 0.5, y: rect.y + y + 0.5 };
      const want = Math.round(255 * coverageRef(p, a, b, 24, 0.3));
      worst = Math.max(worst, Math.abs(got[y * rect.width + x]! - want));
    }
  expect(worst).toBeLessThanOrEqual(1);
  expect(Math.max(...got)).toBeGreaterThan(200);
  buffer.dispose();
});

it("keeps coverage when the same segment is drawn twice", async () => {
  const { api, id } = await setup();
  const buffer = createStrokeBuffer(api, id, "image");
  const a = { x: 20, y: 64 };
  const b = { x: 100, y: 64 };
  const rect = buffer.segment(a, b, 16, 0.5);
  const once = buffer.read(rect);
  buffer.segment(a, b, 16, 0.5);
  expect(buffer.read(rect)).toEqual(once);
  buffer.dispose();
});

it("paints nothing outside the selection", async () => {
  const { api, id } = await setup();
  selectLeftHalf(api);
  const buffer = createStrokeBuffer(api, id, "image");
  const rect = buffer.segment({ x: 20, y: 64 }, { x: 108, y: 64 }, 10, 1);
  const got = buffer.read(rect);
  const split = 64 - rect.x;
  for (let y = 0; y < rect.height; y++)
    for (let x = split; x < rect.width; x++) expect(got[y * rect.width + x]).toBe(0);
  expect(got[(64 - rect.y) * rect.width + (40 - rect.x)]).toBe(255);
  buffer.dispose();
});

it("maps the selection through a translated layer", async () => {
  // The layer starts at document x = 32, so the document's left half is layer x < 32.
  const { api, id } = await setup({
    transform: {
      origin: [32, 0],
      size: [64, 128],
      rotation: 0,
      flipX: false,
      flipY: false,
      sampling: "High quality",
    },
  });
  selectLeftHalf(api);
  const buffer = createStrokeBuffer(api, id, "image");
  const rect = buffer.segment({ x: 0, y: 64 }, { x: 64, y: 64 }, 10, 1);
  const got = buffer.read(rect);
  const row = (64 - rect.y) * rect.width;
  expect(got[row + 16 - rect.x]).toBe(255);
  expect(got[row + 31 - rect.x]).toBe(255);
  expect(got[row + 32 - rect.x]).toBe(0);
  expect(got[row + 48 - rect.x]).toBe(0);
  buffer.dispose();
});
