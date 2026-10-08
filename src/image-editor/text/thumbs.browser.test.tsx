import { afterEach, beforeEach, expect, it } from "vitest";
import { resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountEditor } from "../test/mount-editor";
import { registerTextShapes } from "./register";

const row = (id: string) => document.querySelector(`[data-layer-id="${id}"]`);
const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerTextShapes();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

it("the layer list shows text and shape thumbnails and keeps the default for pixels", async () => {
  const doc = makeDoc({
    width: 64,
    height: 48,
    layers: [
      {},
      {
        text: {
          content: "Hello thumbnails",
          fontName: "Geist-Regular",
          fontSize: 12,
          red: 0,
          green: 0,
          blue: 0,
          alignment: "Left",
          tracking: 0,
          leading: 0,
        },
      },
      { shape: { kind: "Rectangle", red: 1, green: 0, blue: 0, cornerRadius: 0 } },
    ],
  });
  const [bg, textLayer, rectLayer] = doc.manifest.layers;
  const m = await mountEditor(doc);
  mounted.push(m.unmount);

  const textThumb = row(textLayer.id)?.querySelector(".fv-text-thumb");
  expect(textThumb?.textContent).toContain("Hello th");
  expect(row(rectLayer.id)?.querySelector(".fv-text-thumb")).toBeNull();
  expect(row(rectLayer.id)?.querySelector('[data-thumb="image"] rect')).not.toBeNull();
  expect(row(bg.id)?.querySelector(".fv-ie-thumb-px")).not.toBeNull();
  expect(row(bg.id)?.querySelector(".fv-text-thumb")).toBeNull();
});
