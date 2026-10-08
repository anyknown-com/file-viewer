// The contenteditable over the canvas while text is being edited, lined up with the layer.
import { useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { EditorApi, Mat2D } from "../api";
import { invert, multiply } from "../tools/geom";
import { readEditable, writeEditable } from "./dom-text";
import { endEdit, textEditing } from "./edit-state";
import { cssFont } from "./fonts";
import { editContent } from "./runs";
import { lineHeight, TEXT_PADDING } from "./style";

/** Replaces the selection with `text` and redraws the DOM from the new style. */
function insert(el: HTMLElement, text: string): void {
  const ed = textEditing.get();
  if (!ed) return;
  const [start, end] = readEditable(el).selection;
  const style = editContent(ed.style, start, end, text);
  const at = Math.min(start + text.length, style.content.length);
  writeEditable(el, style, [at, at]);
  textEditing.set({ ...ed, style, selection: [at, at] });
}

/** Folds what the browser typed into the style: the changed range from common prefix / suffix. */
function onInput(el: HTMLElement): void {
  const ed = textEditing.get();
  if (!ed) return;
  const { text, selection } = readEditable(el);
  const old = ed.style.content;
  let pre = 0;
  while (pre < old.length && pre < text.length && old[pre] === text[pre]) pre++;
  let post = 0;
  const room = Math.min(old.length, text.length) - pre;
  while (post < room && old[old.length - 1 - post] === text[text.length - 1 - post]) post++;
  const style = editContent(ed.style, pre, old.length - post, text.slice(pre, text.length - post));
  if (style.content !== text) writeEditable(el, style, selection);
  textEditing.set({ ...ed, style, selection });
}

function onBeforeInput(e: InputEvent): void {
  if (e.inputType.startsWith("format") || e.inputType === "insertFromDrop") e.preventDefault();
}

/** Mount: fill and focus the element, follow the selection; returns the cleanup. */
function mount(el: HTMLDivElement): () => void {
  const ed = textEditing.get();
  if (ed) writeEditable(el, ed.style, ed.selection);
  el.focus();
  const doc = el.ownerDocument;
  const onSelection = () => {
    const sel = doc.getSelection();
    const now = textEditing.get();
    if (!now || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
    const selection = readEditable(el).selection;
    if (selection[0] === now.selection[0] && selection[1] === now.selection[1]) return;
    textEditing.set({ ...now, selection });
  };
  el.addEventListener("beforeinput", onBeforeInput);
  doc.addEventListener("selectionchange", onSelection);
  return () => {
    el.removeEventListener("beforeinput", onBeforeInput);
    doc.removeEventListener("selectionchange", onSelection);
  };
}

const css = (m: Mat2D) => `matrix(${m.join(", ")})`;

export function TextEditOverlay({ api }: { api: EditorApi }): React.JSX.Element | null {
  const ed = useSyncExternalStore(textEditing.subscribe, textEditing.get);
  const ref = useCallback((el: HTMLDivElement | null) => (el ? mount(el) : undefined), []);
  const canvas = api.gl.canvas;
  const parent = canvas instanceof HTMLCanvasElement ? canvas.parentElement : null;
  if (!ed || ed.missing || !ed.view || !parent || !(canvas instanceof HTMLCanvasElement)) {
    return null;
  }
  const { style } = ed;
  const exists = ed.layerId !== null && api.doc().manifest.layers.some((l) => l.id === ed.layerId);
  const layerToDoc: Mat2D =
    exists && ed.layerId !== null
      ? invert(api.layerMatrix(ed.layerId))
      : [1, 0, 0, 1, ed.origin[0], ed.origin[1]];
  const rgb = [style.red, style.green, style.blue].map((c) => Math.round(c * 255)).join(", ");
  return createPortal(
    <div
      key={ed.layerId ?? "new"}
      ref={ref}
      className="fv-text-edit"
      contentEditable
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- styled runs need contenteditable, not a textarea
      role="textbox"
      aria-multiline
      tabIndex={0}
      aria-label={api.t("image.text.tool")}
      spellCheck={false}
      style={{
        left: canvas.offsetLeft,
        top: canvas.offsetTop,
        transform: css(multiply(ed.view.docToScreen, layerToDoc)),
        font: cssFont(style.fontName, style.fontSize),
        letterSpacing: `${style.tracking}px`,
        lineHeight: `${lineHeight(style)}px`,
        textAlign:
          style.alignment === "Left" ? "left" : style.alignment === "Center" ? "center" : "right",
        color: `rgb(${rgb})`,
        padding: TEXT_PADDING,
        boxSizing: "border-box",
        width: style.boxSize ? style.boxSize[0] : "max-content",
        minHeight: style.boxSize ? style.boxSize[1] : lineHeight(style) + 2 * TEXT_PADDING,
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          void endEdit(api);
        } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          insert(e.currentTarget, "\n");
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        insert(e.currentTarget, e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n"));
      }}
      onInput={(e) => onInput(e.currentTarget)}
    />,
    parent,
  );
}
