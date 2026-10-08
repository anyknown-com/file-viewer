import { afterEach, beforeEach, expect, it } from "vitest";
import { readProject, validateLikeCompositor, writeProject } from "../../comp/index";
import type { LayerTextStyle } from "../../comp/index";
import type { EditorApi, Layer, LayerId } from "../api";
import { patchLayer } from "../doc/commands/layers";
import { resetRegistry } from "../registry";
import { defaultShapeStyle } from "../shapes/render";
import { createShapeLayer } from "../shapes/layer";
import { makeDoc } from "../test/make-doc";
import { mountEditor } from "../test/mount-editor";
import { canvasMeasure, missingFonts } from "./fonts";
import { createTextLayer, resizeTextBox, updateTextLayer } from "./layer";
import { layoutText } from "./layout";
import { rasterSize } from "./raster";
import { registerTextShapes } from "./register";
import { applyColor, applyFont } from "./runs";
import { defaultTextStyle } from "./style";

const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerTextShapes();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const find = (api: EditorApi, id: LayerId) =>
  api.doc().manifest.layers.find((l) => l.id === id) as Layer;
const isBlue = (d: Uint8Array, i: number) => d[i + 3] > 128 && d[i + 2] > 180 && d[i] < 100;

it("text and shape layers survive create, clip, save and reopen", async () => {
  const doc = makeDoc({ width: 600, height: 400, layers: [{}] });
  const bg = doc.manifest.layers[0].id;
  const m = await mountEditor(doc, { [bg]: [255, 255, 255, 255] });
  mounted.push(m.unmount);
  const { api } = m;

  const rect = createShapeLayer(api, {
    style: { ...defaultShapeStyle("Rectangle"), red: 1, green: 0, blue: 0, cornerRadius: 12 },
    origin: [100, 100],
    size: [300, 150],
    name: "Rect",
  });

  const content = "Hello 世界\nsecond line";
  let style: LayerTextStyle = {
    ...defaultTextStyle(content),
    fontSize: 32,
    boxSize: [280, 140] as [number, number],
  };
  style = applyColor(style, 0, 5, [0, 0, 1]);
  style = applyFont(style, content.indexOf("second"), content.indexOf("second") + 6, "Geist-Bold");
  const text = await createTextLayer(api, { style, origin: [150, 120] });
  await updateTextLayer(api, text, style, "image.text.edit");

  const lines = () => {
    const ctx = new OffscreenCanvas(1, 1).getContext("2d") as OffscreenCanvasRenderingContext2D;
    return layoutText(find(api, text).text as NonNullable<Layer["text"]>, canvasMeasure(ctx)).lines
      .length;
  };
  const before = lines();
  await resizeTextBox(api, text, [120, 300], [150, 120]);
  expect(lines()).toBeGreaterThan(before);

  api.dispatch(patchLayer(text, { maskSourceID: rect }), "image.text.edit");

  const comp = api.readComposite({ x: 0, y: 0, width: 600, height: 400 });
  const at = (x: number, y: number) => (y * 600 + x) * 4;
  expect(Array.from(comp.slice(at(50, 50), at(50, 50) + 4))).toEqual([255, 255, 255, 255]);
  let outside = 0;
  for (let y = 260; y < 400; y++)
    for (let x = 150; x < 270; x++) if (isBlue(comp, at(x, y))) outside++;
  expect(outside).toBe(0);
  let inside = 0;
  for (let y = 100; y < 250; y++)
    for (let x = 150; x < 270; x++) if (isBlue(comp, at(x, y))) inside++;
  expect(inside).toBeGreaterThan(0);

  const manifest = structuredClone(api.doc().manifest);
  const assets = new Map<string, Uint8Array>();
  for (const layer of manifest.layers) {
    const { width, height } = rasterSize(api, layer.id);
    const data = api.readRegion(layer.id, "image", { x: 0, y: 0, width, height });
    assets.set(
      `images/${layer.id}.png`,
      await api.runInWorker({ kind: "encodePng", input: { width, height, channels: 4, data } }),
    );
    layer.imageFile = `${layer.id}.png`;
  }
  const blob = writeProject({ manifest, assets });
  const back = readProject(new Uint8Array(await blob.arrayBuffer()));

  expect(validateLikeCompositor(back.manifest)).toEqual([]);
  const textBack = back.manifest.layers.find((l) => l.id === text) as Layer;
  const textBefore = find(api, text).text;
  expect(textBack.text?.content).toBe(textBefore?.content);
  expect(textBack.text?.colorRuns).toEqual(textBefore?.colorRuns);
  expect(textBack.text?.fontRuns).toEqual(textBefore?.fontRuns);
  expect(textBack.text?.boxSize).toEqual([120, 300]);
  expect(back.manifest.layers.find((l) => l.id === rect)?.shape).toEqual(find(api, rect).shape);

  const reopened = await mountEditor(
    makeDoc({ width: 600, height: 400, layers: back.manifest.layers }),
  );
  mounted.push(reopened.unmount);
  const reText = reopened.api.doc().manifest.layers.find((l) => l.id === text) as Layer;
  expect(missingFonts(reText.text as NonNullable<Layer["text"]>)).toEqual([]);
  await updateTextLayer(
    reopened.api,
    text,
    { ...(reText.text as NonNullable<Layer["text"]>), content: "changed" },
    "image.text.edit",
  );
  expect(find(reopened.api, text).text?.content).toBe("changed");
});
