// The text tool's panel: the editing overlay, the missing-font question and the text properties.
import { useState, useSyncExternalStore } from "react";
import type { LayerTextStyle } from "../../comp/index";
import { ViewerError } from "../../contract/errors";
import { useT } from "../../i18n/use-t";
import { ConfirmDialog } from "../../primitives/dialog";
import { NumberField } from "../../primitives/number-field";
import { Select } from "../../primitives/select";
import { Switch } from "../../primitives/switch";
import { ToggleGroup } from "../../primitives/toggle-group";
import type { EditorApi, LayerId } from "../api";
import { internalsOf } from "../editor-api";
import { writeEditable } from "./dom-text";
import { beginEdit, sameStyle, setRenderHidden, textEditing, type TextEditing } from "./edit-state";
import { TextEditOverlay } from "./editor";
import { GEIST_WEIGHTS, missingFonts, replaceMissingFonts, supportsTracking } from "./fonts";
import { updateTextLayer } from "./layer";
import { textShapeMessages } from "./messages";
import { applyColor, applyFont, styleAt } from "./runs";
import { defaultTextStyle } from "./style";

type Rgb = [number, number, number];
type Alignment = LayerTextStyle["alignment"];
/** A change to a style; `sel` is the edited selection, [0, 0] = the whole text. */
type Change = (s: LayerTextStyle, sel: [number, number]) => LayerTextStyle;
type Target =
  | { kind: "edit" }
  | { kind: "layer"; id: LayerId; style: LayerTextStyle }
  | { kind: "next"; style: LayerTextStyle };

const ALIGNMENTS: readonly {
  value: Alignment;
  key: "image.text.alignLeft" | "image.text.alignCenter" | "image.text.alignRight";
}[] = [
  { value: "Left", key: "image.text.alignLeft" },
  { value: "Center", key: "image.text.alignCenter" },
  { value: "Right", key: "image.text.alignRight" },
];

let nextTextStyle = defaultTextStyle();
const nextListeners = new Set<() => void>();

/** The style the text tool gives new text: the defaults plus what the panel changed with no text. */
export function getNextTextStyle(): LayerTextStyle {
  return nextTextStyle;
}
function setNextTextStyle(s: LayerTextStyle): void {
  nextTextStyle = s;
  for (const fn of nextListeners) fn();
}
function subscribeNext(fn: () => void): () => void {
  nextListeners.add(fn);
  return () => {
    nextListeners.delete(fn);
  };
}

/** Switches the missing fonts to Geist and starts editing with the layer hidden. */
function confirmMissing(api: EditorApi): void {
  const ed = textEditing.get();
  if (!ed?.missing) return;
  if (ed.layerId !== null) setRenderHidden(api, ed.layerId, true);
  textEditing.set({ ...ed, style: replaceMissingFonts(ed.style), missing: null });
}

/** What the controls change: the edited text, else the active text layer, else the next new text. */
function targetOf(api: EditorApi, ed: TextEditing | null, next: LayerTextStyle): Target {
  if (ed && !ed.missing) return { kind: "edit" };
  const layer = api.doc().manifest.layers.find((l) => l.id === api.session().active);
  if (layer?.text) return { kind: "layer", id: layer.id, style: layer.text };
  return { kind: "next", style: next };
}

const ordered = ([a, b]: [number, number]): [number, number] => [Math.min(a, b), Math.max(a, b)];
const hex = (rgb: Rgb) =>
  `#${rgb
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
const fromHex = (h: string): Rgb => [
  Number.parseInt(h.slice(1, 3), 16) / 255,
  Number.parseInt(h.slice(3, 5), 16) / 255,
  Number.parseInt(h.slice(5, 7), 16) / 255,
];

/** Colors the selection, or the whole text when it is empty, with `#rrggbb`. */
function color(h: string): Change {
  const rgb = fromHex(h);
  return (s, [a, b]) => applyColor(s, a, b, rgb);
}

/** Rebuilds the editing overlay's spans after a run change and puts the selection back. */
function redrawOverlay(api: EditorApi, ed: TextEditing): void {
  const canvas = api.gl.canvas;
  const parent = canvas instanceof HTMLCanvasElement ? canvas.parentElement : null;
  const el = parent?.querySelector<HTMLElement>(".fv-text-edit");
  if (el) writeEditable(el, ed.style, ed.selection);
}

/** Weight, size, color, alignment, tracking and leading of the target style. */
export function TextControls({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(textShapeMessages);
  const { store, subscribeSession } = internalsOf(api);
  useSyncExternalStore(store.subscribe, store.get);
  useSyncExternalStore(subscribeSession, api.session);
  const ed = useSyncExternalStore(textEditing.subscribe, textEditing.get);
  const next = useSyncExternalStore(subscribeNext, getNextTextStyle);
  const [draft, setDraft] = useState<{ id: LayerId; style: LayerTextStyle } | null>(null);
  const target = targetOf(api, ed, next);
  let base: LayerTextStyle;
  if (target.kind === "edit") base = ed?.style ?? next;
  else if (target.kind === "layer" && draft?.id === target.id) base = draft.style;
  else base = target.style;
  const sel = target.kind === "edit" && ed ? ordered(ed.selection) : ([0, 0] as [number, number]);
  const shown = styleAt(base, sel[0]);

  /** Shows a change at once: in the edited text, the next new text, or the layer's draft. */
  const live = (fn: Change, redraw = false): void => {
    const now = textEditing.get();
    if (target.kind === "edit" && now) {
      const edited = { ...now, style: fn(now.style, ordered(now.selection)) };
      textEditing.set(edited);
      if (redraw) redrawOverlay(api, edited);
    } else if (target.kind === "next") setNextTextStyle(fn(getNextTextStyle(), [0, 0]));
    else if (target.kind === "layer") setDraft({ id: target.id, style: fn(base, [0, 0]) });
  };
  /** Re-renders a selected (not edited) text layer as one undo step. */
  const commit = (fn: Change): void => {
    if (target.kind !== "layer") return;
    const layer = api.doc().manifest.layers.find((l) => l.id === target.id);
    if (!layer?.text) return setDraft(null);
    if (missingFonts(layer.text).length > 0) {
      setDraft(null);
      if (api.session().tool !== "text") api.setSession({ tool: "text" });
      return beginEdit(api, target.id);
    }
    const style = fn(layer.text, [0, 0]);
    if (sameStyle(style, layer.text)) return setDraft(null);
    updateTextLayer(api, target.id, style, "image.text.edit")
      .catch((e: unknown) => {
        if (!(e instanceof ViewerError)) throw e;
        api.showError(e);
      })
      .finally(() => setDraft(null));
  };
  const both = (fn: Change, redraw = false): void => {
    live(fn, redraw);
    commit(fn);
  };
  const field = (pick: (v: number) => Partial<LayerTextStyle>) => ({
    onChange: (v: number) => live((s) => ({ ...s, ...pick(v) })),
    onCommit: (v: number) => commit((s) => ({ ...s, ...pick(v) })),
  });
  // The native change event (picker closed), not React's onChange (every input while picking).
  const colorRef = (el: HTMLInputElement | null) => {
    if (!el) return;
    const onChange = () => both(color(el.value), true);
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  };

  return (
    <>
      <Select
        label={t("image.text.weight")}
        value={shown.fontName}
        groups={[GEIST_WEIGHTS.map((w) => ({ value: w.name, label: t(w.key) }))]}
        onChange={(name) => both((s, [a, b]) => applyFont(s, a, b, name), true)}
      />
      <NumberField
        label={t("image.text.size")}
        value={base.fontSize}
        min={1}
        max={2000}
        {...field((fontSize) => ({ fontSize }))}
      />
      <input
        ref={colorRef}
        type="color"
        aria-label={t("image.text.color")}
        value={hex(shown.rgb)}
        onChange={(e) => live(color(e.currentTarget.value))}
      />
      <ToggleGroup<Alignment>
        label={t("image.text.align")}
        value={base.alignment}
        options={ALIGNMENTS.map((a) => ({ value: a.value, label: t(a.key) }))}
        onChange={(alignment) => both((s) => ({ ...s, alignment }))}
      />
      <NumberField
        label={t("image.text.tracking")}
        value={base.tracking}
        min={-100}
        max={1000}
        {...field((tracking) => ({ tracking }))}
      />
      {!supportsTracking() && <p>{t("image.text.noTracking")}</p>}
      <Switch
        label={t("image.text.leadingAuto")}
        checked={base.leading === 0}
        onCheckedChange={(auto) =>
          both((s) => ({ ...s, leading: auto ? 0 : Math.round(1.2 * s.fontSize) }))
        }
      />
      {base.leading !== 0 && (
        <NumberField
          label={t("image.text.leading")}
          value={base.leading}
          min={0}
          max={5000}
          {...field((leading) => ({ leading }))}
        />
      )}
    </>
  );
}

export function TextPanel({ api }: { api: EditorApi }): React.JSX.Element {
  const t = useT(textShapeMessages);
  const ed = useSyncExternalStore(textEditing.subscribe, textEditing.get);
  const missing = ed?.missing ?? null;
  return (
    <>
      <TextEditOverlay api={api} />
      <ConfirmDialog
        open={missing !== null}
        onOpenChange={(open) => {
          if (!open && textEditing.get()?.missing) textEditing.set(null);
        }}
        title={t("image.text.missingFont.title")}
        description={t("image.text.missingFont.body", { font: (missing ?? []).join(", ") })}
        confirmLabel={t("image.text.missingFont.confirm")}
        cancelLabel={t("image.text.missingFont.cancel")}
        onConfirm={() => confirmMissing(api)}
      />
      <TextControls api={api} />
    </>
  );
}
