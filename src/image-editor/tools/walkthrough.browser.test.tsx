import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { page } from "vitest/browser";
import { decodePng, encodePng, fromImage, readProject, writeProject } from "../../comp/index";
import { blobSource } from "../../contract/byte-source";
import type { SaveRequest } from "../../contract/save";
import type { EditorApi, MenuId, Point } from "../api";
import { toViewTransform, viewportOf } from "../canvas";
import { addMask } from "../doc/commands/masks";
import { installExtensions } from "../extensions";
import { ImageEditor } from "../index";
import { menuItems, registerSetup, tools } from "../registry";
import { isMac } from "../shortcut";
import "../../styles.css";
import { selectPaintMessages } from "./messages";
import { mosaicRef } from "./redact";
import { selectionBounds } from "./select/mask";
import { toolState } from "./state";

const SIZE = 256;
const MENUS: MenuId[] = [
  "edit",
  "image",
  "layer",
  "select",
  "layer-context",
  "layer-new",
  "hidden",
];
const MOD = isMac() ? { metaKey: true } : { ctrlKey: true };
let api: EditorApi | null = null;
registerSetup((a) => {
  api = a;
});

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  api = null;
});

function solid(fill: (x: number, y: number) => number[]): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) out.set(fill(x, y), (y * SIZE + x) * 4);
  return out;
}

const checker = solid((x, y) =>
  ((x >> 2) + (y >> 2)) & 1 ? [255, 255, 255, 255] : [0, 0, 0, 255],
);

/** Base gradient, a hidden checkerboard and a visible solid layer, opened in ImageEditor. */
async function open(): Promise<{ api: EditorApi; requests: SaveRequest[]; hiddenId: string }> {
  const project = fromImage(
    { width: SIZE, height: SIZE, rgba: solid((x) => [x, x, x, 255]) },
    "Base",
  );
  const [base] = project.manifest.layers;
  const ids: string[] = [];
  for (const [name, isVisible, data] of [
    ["Hidden", false, checker],
    ["Solid", true, solid(() => [40, 120, 200, 255])],
  ] as const) {
    const id = crypto.randomUUID().toUpperCase();
    ids.push(id);
    project.manifest.layers.push({
      ...base!,
      id,
      name,
      isVisible,
      transform: {
        origin: [0, 0],
        size: [SIZE, SIZE],
        rotation: 0,
        flipX: false,
        flipY: false,
        sampling: "Smooth",
      },
      imageFile: `${id}.png`,
    });
    project.assets.set(
      `images/${id}.png`,
      encodePng({ width: SIZE, height: SIZE, channels: 4, data }),
    );
  }
  const file = { name: "walk.comp.zip", source: blobSource(writeProject(project)) };
  const requests: SaveRequest[] = [];
  await page.viewport(900, 560);
  const host = document.createElement("div");
  host.style.cssText = "width: 800px; height: 480px; display: flex;";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <ImageEditor
        file={file}
        locale="en"
        onSave={async (r) => {
          requests.push(r);
        }}
        onClose={() => {}}
      />,
    ),
  );
  mounted.push(() => {
    root.unmount();
    host.remove();
  });
  await expect.poll(() => api, { timeout: 10_000 }).not.toBeNull();
  await expect.poll(() => document.querySelector(".fv-ie-overlay")).not.toBeNull();
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  return { api: api!, requests, hiddenId: ids[0]! };
}

const key = (k: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));

function pointer(a: EditorApi, type: string, p: Point, init: PointerEventInit = {}): void {
  const vp = viewportOf(a)!;
  const m = toViewTransform(vp.view(), vp.size(), 1).docToScreen;
  const overlay = document.querySelector<HTMLCanvasElement>(".fv-ie-overlay")!;
  const r = overlay.getBoundingClientRect();
  const clientX = r.left + m[0] * p.x + m[4];
  const clientY = r.top + m[3] * p.y + m[5];
  overlay.dispatchEvent(
    new PointerEvent(type, { clientX, clientY, pointerId: 1, button: 0, bubbles: true, ...init }),
  );
}

function drag(a: EditorApi, pts: Point[], init: PointerEventInit = {}): void {
  pointer(a, "pointerdown", pts[0]!, init);
  for (const p of pts.slice(1)) pointer(a, "pointermove", p, init);
  pointer(a, "pointerup", pts.at(-1)!, init);
}

async function click(name: string): Promise<void> {
  const button = page.getByRole("button", { name, exact: true });
  await expect.element(button).toBeInTheDocument();
  (button.element() as HTMLElement).click();
}

/** Runs `act`, waits until the document changes, and checks the top bar's Undo is enabled. */
async function changes(a: EditorApi, act: () => void | Promise<void>): Promise<void> {
  const before = a.doc();
  await act();
  await expect.poll(() => a.doc() !== before, { timeout: 15_000 }).toBe(true);
  await expect.element(page.getByRole("button", { name: "Undo" })).not.toBeDisabled();
}

const run = (a: EditorApi, menu: MenuId, id: string) =>
  menuItems(menu)
    .find((m) => m.id === id)!
    .run(a);

it("walks select, copy, paste, paint, heal, clone, move and redact, then saves", async () => {
  const { api: a, requests, hiddenId } = await open();
  const layerCount = a.doc().manifest.layers.length;

  key("w");
  expect(a.session().tool).toBe("select.wand");
  drag(a, [{ x: 128, y: 128 }]);
  await expect.poll(() => a.selection(), { timeout: 15_000 }).not.toBeNull();
  run(a, "select", "select.feather");
  await page.getByRole("textbox", { name: "Amount (px)" }).fill("2");
  await click("OK");
  key("c", MOD);
  await changes(a, () => run(a, "edit", "edit.paste"));
  expect(a.doc().manifest.layers).toHaveLength(layerCount + 1);
  const pasted = a.session().active!;

  a.dispatch(addMask(pasted, "white"), "image.layers.addMask");
  a.setSession({ target: "mask" });
  key("b");
  await changes(a, () =>
    drag(a, [
      { x: 110, y: 60 },
      { x: 150, y: 60 },
    ]),
  );

  a.setSession({ target: "image" });
  key("j");
  await changes(a, () => drag(a, [{ x: 128, y: 128 }]));
  await expect.poll(() => toolState(a).job).toBeNull();

  key("s");
  drag(a, [{ x: 110, y: 40 }], { altKey: true });
  await changes(a, () =>
    drag(a, [
      { x: 130, y: 180 },
      { x: 140, y: 180 },
    ]),
  );

  key("m");
  drag(a, [
    { x: 100, y: 100 },
    { x: 140, y: 140 },
  ]);
  key("v");
  drag(a, [
    { x: 120, y: 120 },
    { x: 128, y: 120 },
  ]);
  await changes(a, () => void key("Enter"));

  key("m");
  drag(a, [
    { x: 16, y: 16 },
    { x: 80, y: 80 },
  ]);
  const bounds = selectionBounds(a)!;
  const sel = a.selection()!.read(bounds);
  await changes(a, async () => {
    run(a, "image", "image.redact");
    await click("Mosaic");
    await expect.element(page.getByRole("textbox", { name: "Cell size" })).toHaveValue("16");
    await click("Redact");
  });

  key("s", MOD);
  await expect.poll(() => requests.length, { timeout: 15_000 }).toBe(1);
  expect(requests[0]!.ext).toBe(".comp.zip");
  const saved = readProject(new Uint8Array(await requests[0]!.blob.arrayBuffer()));
  const hidden = saved.manifest.layers.find((l) => l.id === hiddenId)!;
  const png = decodePng(saved.assets.get(`images/${hidden.imageFile}`)!, "layer");
  const box = (src: Uint8Array) => {
    const out = new Uint8Array(bounds.width * bounds.height * 4);
    for (let y = 0; y < bounds.height; y++) {
      const at = ((bounds.y + y) * SIZE + bounds.x) * 4;
      out.set(src.subarray(at, at + bounds.width * 4), y * bounds.width * 4);
    }
    return out;
  };
  expect(box(png.data)).toEqual(mosaicRef(box(checker), bounds.width, bounds.height, 16, sel));
  expect(box(png.data)).not.toEqual(box(checker));
});

it("switches tools by key, resizes the brush and deletes pixels or the layer", async () => {
  const { api: a } = await open();
  const pairs =
    "m:select.rect l:select.lasso w:select.wand b:paint.brush e:paint.eraser s:paint.clone";
  const more = "j:paint.heal g:paint.gradient i:paint.eyedropper v:move";
  const expected = `${pairs} ${more}`.split(" ").map((p) => p.split(":"));
  for (const [k, id] of expected) {
    key(k);
    expect(a.session().tool).toBe(id);
  }
  key("b");
  const size = toolState(a).brush.size;
  key("]", { code: "BracketRight" });
  expect(toolState(a).brush.size).toBeGreaterThan(size);

  const count = a.doc().manifest.layers.length;
  const active = a.session().active!;
  key("m");
  drag(a, [
    { x: 40, y: 40 },
    { x: 60, y: 60 },
  ]);
  key("Delete");
  expect(a.doc().manifest.layers).toHaveLength(count);
  expect([...a.readRegion(active, "image", { x: 50, y: 50, width: 1, height: 1 })][3]).toBe(0);
  key("d", MOD);
  key("Delete");
  expect(a.doc().manifest.layers).toHaveLength(count - 1);
});

it("has no shortcut conflicts and labels every select-paint item in both locales", () => {
  installExtensions();
  const shortcuts = MENUS.flatMap((m) => menuItems(m)).flatMap((m) =>
    m.shortcut ? [m.shortcut] : [],
  );
  expect(new Set(shortcuts).size).toBe(shortcuts.length);
  for (const t of tools())
    expect(shortcuts.map((s) => s.toUpperCase())).not.toContain(t.key.toUpperCase());

  const en = selectPaintMessages.en;
  expect(Object.keys(selectPaintMessages["zh-TW"]).toSorted()).toEqual(Object.keys(en).toSorted());
  const ownMenus = new Set([
    ...["all", "deselect", "reselect", "inverse", "expand", "contract", "feather", "loadAlpha"].map(
      (s) => `select.${s}`,
    ),
    ...["cut", "copy", "copyMerged", "paste", "fill", "clear"].map((s) => `edit.${s}`),
    "paint.swapColors",
    "paint.defaultColors",
    "image.redact",
  ]);
  const labels = [
    ...tools().filter((t) => /^(select|paint)\./.test(t.id)),
    ...MENUS.flatMap((m) => menuItems(m)).filter((m) => ownMenus.has(m.id)),
  ].map((x) => x.label);
  expect(labels.length).toBe(11 + ownMenus.size);
  for (const label of labels) expect(Object.keys(en)).toContain(label);
});
