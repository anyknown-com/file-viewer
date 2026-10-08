import type { EditorApi, Point, Rect } from "../../api";
import { addPixelLayer, newLayerId } from "../commands";
import { apply, docRectToLayer, invert, layerPixelSize } from "../geom";
import { currentSelection, selectionBounds } from "./mask";
import { selectionInLayer } from "./mask-sample";
import { editSelected } from "./pixel-edit";
import { clampRect } from "./resample";

export type Clip = { width: number; height: number; data: Uint8Array; origin: Point };

const clips = new WeakMap<EditorApi, Clip>();

/** The editor's own clipboard (document coordinates for `origin`), or null while empty. */
export function internalClip(api: EditorApi): Clip | null {
  return clips.get(api) ?? null;
}

function mulAlpha(data: Uint8Array, sel: Uint8Array): void {
  for (let i = 0; i < sel.length; i++)
    data[i * 4 + 3] = Math.round((data[i * 4 + 3] * sel[i]) / 255);
}

function writeSystemClipboard(api: EditorApi, clip: Clip): void {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return;
    const png = api
      .runInWorker({
        kind: "encodePng",
        input: { width: clip.width, height: clip.height, channels: 4, data: clip.data.slice() },
      })
      .then((b) => new Blob([b as BlobPart], { type: "image/png" }));
    png.catch(() => {});
    navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).catch(() => {});
  } catch {
    // The system clipboard is a courtesy; the editor's own one already holds the pixels.
  }
}

/** Copies the selection of the active layer (or the merged image); false when nothing is copied. */
export function copy(api: EditorApi, merged: boolean): boolean {
  const { width, height } = api.doc().manifest;
  const bounds = selectionBounds(api);
  const sel = currentSelection(api);
  let clip: Clip;
  if (merged) {
    const rect: Rect = bounds ?? { x: 0, y: 0, width, height };
    const data = api.readComposite(rect);
    if (sel) mulAlpha(data, sel.read(rect));
    clip = { width: rect.width, height: rect.height, data, origin: { x: rect.x, y: rect.y } };
  } else {
    const id = api.session().active;
    const layer = api.doc().manifest.layers.find((l) => l.id === id);
    if (!id || !layer || layer.isGroup === true || layer.adjustment !== undefined) return false;
    const size = layerPixelSize(api, id, "image");
    const rect = bounds
      ? clampRect(docRectToLayer(api, id, bounds), size.width, size.height)
      : { x: 0, y: 0, ...size };
    const data = api.readRegion(id, "image", rect);
    if (bounds) mulAlpha(data, selectionInLayer(api, id, rect));
    const origin = apply(invert(api.layerMatrix(id)), { x: rect.x, y: rect.y });
    clip = { width: rect.width, height: rect.height, data, origin };
  }
  if (clip.width === 0 || clip.height === 0) return false;
  clips.set(api, clip);
  writeSystemClipboard(api, clip);
  return true;
}

/** Deletes the selected pixels of the active layer (its mask when painting on the mask). */
export function clearSelection(api: EditorApi): boolean {
  return editSelected(api, "image.select.clear", { wholeIfNone: false }, (px, sel, target) => {
    for (let i = 0; i < sel.length; i++) {
      const keep = (255 - sel[i]) / 255;
      if (target === "mask") px[i] = Math.round(px[i] * keep);
      else px[i * 4 + 3] = Math.round(px[i * 4 + 3] * keep);
    }
  });
}

export function cut(api: EditorApi): void {
  if (copy(api, false)) clearSelection(api);
}

/** A new layer above the active one; centered on the canvas when `origin` is null. */
export function pasteImage(
  api: EditorApi,
  img: { width: number; height: number; data: Uint8Array },
  origin: Point | null,
): void {
  const err = api.checkBudget({ layerPx: img.width * img.height });
  if (err) return api.showError(err);
  const m = api.doc().manifest;
  const at = origin ?? { x: (m.width - img.width) / 2, y: (m.height - img.height) / 2 };
  const id = newLayerId();
  api.dispatch(
    addPixelLayer({
      id,
      name: api.t("image.select.pastedLayer"),
      above: api.session().active,
      transform: {
        origin: [at.x, at.y],
        size: [img.width, img.height],
        rotation: 0,
        flipX: false,
        flipY: false,
        sampling: "Smooth",
      },
    }),
  );
  api.setSession({ active: id, target: "image" });
  api.writeRegion(id, "image", { x: 0, y: 0, width: img.width, height: img.height }, img.data);
  api.commit("image.select.paste", api.doc(), []);
}

export function pasteInternal(api: EditorApi): void {
  const clip = internalClip(api);
  if (clip) pasteImage(api, clip, clip.origin);
}

async function decodeImage(
  file: Blob,
): Promise<{ width: number; height: number; data: Uint8Array }> {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("image-editor: no 2d context to decode the pasted image.");
  ctx.drawImage(bitmap, 0, 0);
  const { width, height, data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return { width, height, data: new Uint8Array(data.buffer) };
}

const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** `SetupFn`: listens for the browser's `paste` on the editor root; returns the remover. */
export function attachPaste(api: EditorApi, root: HTMLElement): () => void {
  const onPaste = (e: Event): void => {
    if (typing(e.target)) return;
    const file = [...((e as ClipboardEvent).clipboardData?.files ?? [])].find((f) =>
      f.type.startsWith("image/"),
    );
    const clip = internalClip(api);
    if (!file && !clip) return;
    e.preventDefault();
    if (!file) return pasteInternal(api);
    decodeImage(file).then(
      (img) => {
        const same = clip && clip.width === img.width && clip.height === img.height;
        pasteImage(api, img, same ? clip.origin : null);
        return undefined;
      },
      () => {},
    );
  };
  root.addEventListener("paste", onPaste);
  return () => root.removeEventListener("paste", onPaste);
}
