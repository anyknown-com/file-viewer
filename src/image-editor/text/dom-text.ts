// The editing overlay's DOM ↔ content and selection (UTF-16 positions). The DOM holds only text
// nodes, our own spans and `<br>`s; nothing is parsed from HTML. A `<br>` after the last text is
// not content: Chrome leaves one in an emptied element, and we add one so the caret can sit on an
// empty last line.
import type { LayerTextStyle } from "../../comp/index";
import { weightOf } from "./fonts";
import { styleAt } from "./runs";

type Caret = { node: Node; offset: number };

/** The text (each `<br>` a `\n`) and the selection inside `el` as UTF-16 positions. */
export function readEditable(el: HTMLElement): { text: string; selection: [number, number] } {
  const sel = el.ownerDocument.getSelection();
  const ends: Caret[] = sel && sel.rangeCount > 0 ? [sel.getRangeAt(0)].flatMap(rangeEnds) : [];
  const found: (number | null)[] = ends.map(() => null);
  let text = "";
  let tail = false;
  const mark = (node: Node, offset: number) => {
    ends.forEach((c, i) => {
      if (c.node === node && c.offset === offset && found[i] === null) found[i] = text.length;
    });
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const data = (node as Text).data;
      ends.forEach((c, i) => {
        if (c.node === node) found[i] = text.length + Math.min(c.offset, data.length);
      });
      text += data;
      if (data !== "") tail = false;
      return;
    }
    if (node instanceof HTMLBRElement) {
      text += "\n";
      tail = true;
      return;
    }
    node.childNodes.forEach((child, i) => {
      mark(node, i);
      walk(child);
    });
    mark(node, node.childNodes.length);
  };
  walk(el);
  if (tail) text = text.slice(0, -1);
  const [a = text.length, b = a] = found.map((p) => Math.min(p ?? text.length, text.length));
  return { text, selection: [Math.min(a, b), Math.max(a, b)] };
}

function rangeEnds(r: Range): Caret[] {
  return [
    { node: r.startContainer, offset: r.startOffset },
    { node: r.endContainer, offset: r.endOffset },
  ];
}

/** Rebuilds `el` from `style` (one span per run piece) and puts the selection at `selection`. */
export function writeEditable(
  el: HTMLElement,
  style: LayerTextStyle,
  selection: [number, number],
): void {
  const doc = el.ownerDocument;
  const { content } = style;
  const cuts = new Set([0, content.length]);
  for (const r of [...(style.colorRuns ?? []), ...(style.fontRuns ?? [])]) {
    cuts.add(r.location);
    cuts.add(r.location + r.length);
  }
  const points = [...cuts].filter((p) => p >= 0 && p <= content.length).toSorted((a, b) => a - b);
  const texts: { node: Text; start: number }[] = [];
  el.replaceChildren();
  for (let i = 0; i + 1 < points.length; i++) {
    const start = points[i] ?? 0;
    const end = points[i + 1] ?? start;
    if (end <= start) continue;
    const { fontName, rgb } = styleAt(style, start);
    const span = doc.createElement("span");
    span.textContent = content.slice(start, end);
    span.style.color = `rgb(${rgb.map((c) => Math.round(c * 255)).join(", ")})`;
    span.style.fontWeight = String(weightOf(fontName) ?? 400);
    el.append(span);
    if (span.firstChild instanceof Text) texts.push({ node: span.firstChild, start });
  }
  if (content.endsWith("\n")) {
    el.append(doc.createElement("br"));
  }
  if (!el.isConnected) return;
  const at = (pos: number): Caret => {
    const hit = texts.findLast((t) => t.start <= pos);
    return hit ? { node: hit.node, offset: pos - hit.start } : { node: el, offset: 0 };
  };
  const a = at(selection[0]);
  const b = at(selection[1]);
  doc.getSelection()?.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
}
