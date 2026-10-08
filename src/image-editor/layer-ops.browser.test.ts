import { afterEach, expect, it } from "vitest";
import { addLayerMask, deleteMask, redo, undo } from "./layer-ops";
import { makeDoc } from "./test/make-doc";
import { mountCanvas } from "./test/mount-canvas";

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

it("stops compositing a deleted mask; undo brings it back, redo removes it again", async () => {
  const doc = makeDoc({ width: 2, height: 2, layers: [{}] });
  const id = doc.manifest.layers[0].id;
  const m = await mountCanvas(doc, { [id]: [200, 100, 50, 255] });
  mounted.push(m.unmount);
  const { api } = m;
  const rect = { x: 0, y: 0, width: 2, height: 2 };
  const alpha = () => api.readComposite(rect)[3];

  addLayerMask(api, id);
  api.writeRegion(id, "mask", rect, new Uint8Array(4));
  expect(alpha()).toBe(0);

  deleteMask(api, id);
  expect(alpha()).toBe(255);

  undo(api);
  expect(api.doc().manifest.layers[0].maskFile).toBeDefined();
  expect(alpha()).toBe(0);

  redo(api);
  expect(alpha()).toBe(255);
});
