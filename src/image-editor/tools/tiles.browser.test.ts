import { afterEach, expect, it } from "vitest";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { createTileTracker } from "./tiles";

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

async function setup() {
  const m = await mountCanvas(makeDoc({ width: 600, height: 300, layers: [{}] }));
  mounted.push(m.unmount);
  return { api: m.api, id: m.api.doc().manifest.layers[0].id };
}

it("snapshots each cell once", async () => {
  const { api, id } = await setup();
  const tracker = createTileTracker(api, id, "image");
  expect(tracker.has()).toBe(false);
  tracker.touch({ x: 250, y: 10, width: 20, height: 10 });
  expect(tracker.tiles().map((t) => t.x)).toEqual([0, 256]);
  tracker.touch({ x: 250, y: 10, width: 20, height: 10 });
  expect(tracker.tiles()).toHaveLength(2);
  expect(tracker.has()).toBe(true);
});

it("clamps to the layer", async () => {
  const { api, id } = await setup();
  const tracker = createTileTracker(api, id, "image");
  tracker.touch({ x: 590, y: 290, width: 100, height: 100 });
  expect(tracker.tiles()).toHaveLength(1);
  const t = tracker.tiles()[0];
  expect([t.x, t.y, t.width, t.height]).toEqual([512, 256, 88, 44]);
  tracker.touch({ x: 700, y: 0, width: 10, height: 10 });
  tracker.touch({ x: -50, y: -50, width: 10, height: 10 });
  expect(tracker.tiles()).toHaveLength(1);
});
