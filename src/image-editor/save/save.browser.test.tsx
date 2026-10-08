import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { decodePng, encodePng, readProject, validateLikeCompositor } from "../../comp/index";
import { bytesSource } from "../../contract/byte-source";
import type { ViewerError } from "../../contract/errors";
import type { SaveRequest } from "../../contract/save";
import type { Doc, EditorApi } from "../api";
import { addMask, patchLayer } from "../doc/commands/index";
import { resetRegistry } from "../registry";
import { isMac } from "../shortcut";
import { makeDoc } from "../test/make-doc";
import { mountEditor } from "../test/mount-editor";
import { createSaver } from "./save";

const W = 40;
const H = 30;
const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  vi.restoreAllMocks();
  resetRegistry();
});

async function mount(
  name: string,
  opts: { layers?: number; doc?: Doc; maxOutputBytes?: number; onSave?: () => Promise<void> } = {},
) {
  const doc =
    opts.doc ??
    makeDoc({ width: W, height: H, layers: Array.from({ length: opts.layers ?? 1 }, () => ({})) });
  const m = await mountEditor(doc, undefined, { width: 320, height: 240 });
  mounted.push(m.unmount);
  const requests: SaveRequest[] = [];
  const report = vi.fn<(e: ViewerError) => void>();
  const saver = createSaver({
    api: m.api,
    store: m.store,
    file: { name, source: bytesSource(new Uint8Array(0)) },
    onSave: async (request) => {
      requests.push(request);
      await opts.onSave?.();
    },
    maxOutputBytes: opts.maxOutputBytes,
    report,
    notify: (key, vars) => m.ui.note(key, vars),
  });
  return { ...m, saver, requests, report };
}

const rename = (api: EditorApi, name: string) =>
  api.dispatch(patchLayer(api.doc().manifest.layers[0].id, { name }), "image.layers.rename");

const rejectSave = () => Promise.reject(new Error("Disk full"));

const pick = (r: SaveRequest) => ({
  mode: r.mode,
  ext: r.ext,
  mime: r.mime,
  type: r.blob.type,
  suggestedName: r.suggestedName,
});

it("replaces a flat png with a png and marks the document saved", async () => {
  const { api, store, saver, requests } = await mount("x.png");
  rename(api, "B");
  expect(store.dirty()).toBe(true);
  await saver.save();
  expect(requests.map(pick)).toEqual([
    { mode: "replace", ext: ".png", mime: "image/png", type: "image/png", suggestedName: "x.png" },
  ]);
  expect(store.dirty()).toBe(false);
  const png = decodePng(new Uint8Array(await requests[0].blob.arrayBuffer()), "layer");
  expect([png.width, png.height]).toEqual([W, H]);
  expect(png.data).toEqual(api.readComposite({ x: 0, y: 0, width: W, height: H }));
});

it("replaces a flat avif with a jpeg", async () => {
  const { saver, requests } = await mount("x.avif");
  await saver.save();
  expect(requests.map(pick)).toEqual([
    {
      mode: "replace",
      ext: ".jpg",
      mime: "image/jpeg",
      type: "image/jpeg",
      suggestedName: "x.jpg",
    },
  ]);
});

it("asks about layers, then keeps saving to the project copy", async () => {
  const { store, saver, requests } = await mount("x.png", { layers: 2 });
  const saving = saver.save();
  const asProject = page.getByRole("button", { name: "Save as layered project" });
  await expect.element(asProject).toHaveFocus();
  await asProject.click();
  await saving;
  await saver.save();
  expect(requests.map((r) => [r.mode, r.ext, r.mime, r.suggestedName])).toEqual([
    ["copy", ".comp.zip", "application/zip", "x (edited).comp.zip"],
    ["replace", ".comp.zip", "application/zip", "x (edited).comp.zip"],
  ]);
  expect(saver.state().savedAsProject).toBe(true);
  expect(store.dirty()).toBe(false);
});

it("flattens over the original when asked", async () => {
  const { saver, requests } = await mount("x.png", { layers: 2 });
  const saving = saver.save();
  await page.getByRole("button", { name: "Flatten and replace" }).click();
  await saving;
  expect(requests.map(pick)).toEqual([
    { mode: "replace", ext: ".png", mime: "image/png", type: "image/png", suggestedName: "x.png" },
  ]);
  expect(saver.state().savedAsProject).toBe(false);
});

it("saves a layered copy as a project without asking", async () => {
  const { saver, requests } = await mount("x.jpeg", { layers: 2 });
  await saver.saveAs();
  expect(requests.map((r) => [r.mode, r.ext, r.suggestedName])).toEqual([
    ["copy", ".comp.zip", "x (edited).comp.zip"],
  ]);
});

it("exports a jpeg without touching the saved state", async () => {
  const { api, store, saver, requests } = await mount("x.png", { layers: 2 });
  rename(api, "B");
  await saver.exportAs({ type: "jpeg", quality: 0.8 });
  expect(requests.map(pick)).toEqual([
    {
      mode: "export",
      ext: ".jpg",
      mime: "image/jpeg",
      type: "image/jpeg",
      suggestedName: "x (edited).jpg",
    },
  ]);
  expect(store.dirty()).toBe(true);
});

it("saves as png when the browser hands back png for webp, and says so", async () => {
  vi.spyOn(OffscreenCanvas.prototype, "convertToBlob").mockResolvedValue(
    new Blob([new Uint8Array(8)], { type: "image/png" }),
  );
  const { saver, requests } = await mount("x.png");
  await saver.exportAs({ type: "webp", quality: 0.92 });
  expect(requests.map((r) => [r.ext, r.mime, r.suggestedName])).toEqual([
    [".png", "image/png", "x (edited).png"],
  ]);
  await expect.element(page.getByText("saved as PNG", { exact: false })).toBeVisible();
});

it("does not hand the host a file over maxOutputBytes", async () => {
  const { saver, requests, report } = await mount("x.png", { maxOutputBytes: 10 });
  await saver.save();
  expect(requests).toEqual([]);
  expect(report.mock.calls.map(([e]) => e.code)).toEqual(["output_too_large"]);
  await expect.element(page.getByText("larger than allowed", { exact: false })).toBeVisible();
});

it("stays unsaved and shows the message when the host rejects", async () => {
  const { api, store, saver, report } = await mount("x.png", { onSave: rejectSave });
  rename(api, "B");
  await saver.save();
  expect(store.dirty()).toBe(true);
  expect(report.mock.calls.map(([e]) => e.code)).toEqual(["save_failed"]);
  await expect.element(page.getByText("Disk full")).toBeVisible();
});

it("keeps edits made while saving unsaved", async () => {
  const held: { resolve?: () => void } = {};
  const onSave = () => new Promise<void>((resolve) => (held.resolve = resolve));
  const { api, store, saver } = await mount("x.png", { onSave });
  const saving = saver.save();
  expect(saver.state().saving).toBe(true);
  rename(api, "C");
  await vi.waitFor(() => expect(held.resolve).toBeDefined());
  held.resolve?.();
  await saving;
  expect(saver.state().saving).toBe(false);
  expect(store.dirty()).toBe(true);
});

it("writes a project Compositor reads, original PNGs byte for byte", async () => {
  const doc = makeDoc({ width: W, height: H, layers: [{}, {}] });
  const [a, b] = doc.manifest.layers;
  const original = encodePng({
    width: W,
    height: H,
    channels: 4,
    data: new Uint8Array(W * H * 4).fill(200),
  });
  const pixels = new Map(doc.pixels).set(a.id, { image: { kind: "png", bytes: original } });
  const { api, saver, requests } = await mount("x.png", { doc: { ...doc, pixels } });
  api.dispatch(addMask(b.id, "white"), "image.layers.addMask");
  await saver.saveAs();
  const bytes = new Uint8Array(await requests[0].blob.arrayBuffer());
  const first = new TextDecoder().decode(bytes.subarray(30, 30 + bytes[26] + bytes[27] * 256));
  expect(first).toBe("manifest.json");
  const project = readProject(bytes);
  expect(validateLikeCompositor(project.manifest)).toEqual([]);
  expect(project.assets.get(`images/${a.id}.png`)).toEqual(original);
  const layer = decodePng(project.assets.get(`images/${b.id}.png`) as Uint8Array, "layer");
  expect(layer.data).toEqual(api.readRegion(b.id, "image", { x: 0, y: 0, width: W, height: H }));
  expect(project.assets.has(`images/${b.id}.mask.png`)).toBe(true);
  expect(project.preview?.subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
});

it("refuses to export a canvas over 100 megapixels", async () => {
  const { api, saver, requests, report } = await mount("x.png");
  api.dispatch((d) => ({ ...d, manifest: { ...d.manifest, width: 10_001, height: 10_000 } }));
  await saver.exportAs({ type: "png", quality: 1 });
  expect(requests).toEqual([]);
  expect(report.mock.calls.map(([e]) => e.code)).toEqual(["too_large"]);
});

it("saves on Mod+S", async () => {
  const { requests } = await mount("x.png");
  const mod = isMac() ? { metaKey: true } : { ctrlKey: true };
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true, ...mod }));
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].mode).toBe("replace");
});
