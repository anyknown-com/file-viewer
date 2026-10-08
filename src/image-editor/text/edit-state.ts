// The text being edited, shared by the text tool, the editing overlay and the properties panel.
import type { LayerTextStyle } from "../../comp/index";
import { ViewerError } from "../../contract/errors";
import type { EditorApi, LayerId, ViewTransform } from "../api";
import { missingFonts } from "./fonts";
import { createTextLayer, deleteTextLayer, updateTextLayer } from "./layer";

/** `layerId` null = new text with no layer yet; `missing` non-null = asking about missing fonts. */
export type TextEditing = {
  layerId: LayerId | null;
  style: LayerTextStyle;
  origin: [number, number];
  selection: [number, number];
  view: ViewTransform | null;
  missing: string[] | null;
};

let current: TextEditing | null = null;
const listeners = new Set<() => void>();

export const textEditing = {
  get(): TextEditing | null {
    return current;
  },
  set(next: TextEditing | null): void {
    current = next;
    for (const fn of listeners) fn();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** Adds `id` to or takes it out of `session.renderHidden`. */
export function setRenderHidden(api: EditorApi, id: LayerId, hidden: boolean): void {
  const next = new Set(api.session().renderHidden);
  if (hidden) next.add(id);
  else next.delete(id);
  api.setSession({ renderHidden: next });
}

/** A style as comparable JSON: keys sorted, undefined values dropped. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v === null || typeof v !== "object") return v;
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  entries.sort(([a], [b]) => (a < b ? -1 : 1));
  return Object.fromEntries(entries.map(([k, x]) => [k, canon(x)]));
}
export const sameStyle = (a: LayerTextStyle, b: LayerTextStyle) =>
  JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/**
 * Starts editing text layer `id`; with missing fonts it first asks (TextPanel's dialog). `view`
 * null = the text tool's drawOverlay fills it in on the next frame.
 */
export function beginEdit(api: EditorApi, id: LayerId, view: ViewTransform | null = null): void {
  const layer = api.doc().manifest.layers.find((l) => l.id === id);
  if (!layer?.text) return;
  const missing = missingFonts(layer.text);
  const end = layer.text.content.length;
  if (missing.length === 0) setRenderHidden(api, id, true);
  textEditing.set({
    layerId: id,
    style: layer.text,
    origin: layer.transform.origin,
    selection: [end, end],
    view,
    missing: missing.length > 0 ? missing : null,
  });
}

/** Ends editing: commits the change as one undo step (none when nothing changed). */
export async function endEdit(api: EditorApi): Promise<void> {
  const ed = textEditing.get();
  if (!ed) return;
  textEditing.set(null);
  if (ed.missing) return;
  const { layerId: id, style } = ed;
  const before = api.doc().manifest.layers.find((l) => l.id === id)?.text;
  try {
    if (id === null) {
      if (style.content !== "") await createTextLayer(api, { style, origin: ed.origin });
    } else if (before && style.content === "") deleteTextLayer(api, id);
    else if (before && !sameStyle(before, style)) {
      await updateTextLayer(api, id, style, "image.text.edit");
    }
  } catch (e) {
    if (!(e instanceof ViewerError)) throw e;
    api.showError(e);
  } finally {
    if (id !== null) setRenderHidden(api, id, false);
  }
}
