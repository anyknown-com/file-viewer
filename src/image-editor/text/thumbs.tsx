import type { ReactNode } from "react";
import type { EditorApi, Layer } from "../api";
import { EllipseIcon, LineIcon, RectangleIcon, TextIcon } from "./glyphs";

const THUMB_GRAPHEMES = 8;

function firstGraphemes(content: string, count: number): string {
  const out: string[] = [];
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
    content,
  )) {
    if (out.length === count) break;
    out.push(segment);
  }
  return out.join("");
}

/** Layer-row thumbnail: a "T" plus the first characters for text layers, a shape icon for shape layers. */
export function textShapeThumbnail(layer: Layer, _api: EditorApi): ReactNode | null {
  if (layer.text !== undefined) {
    return (
      <span className="fv-text-thumb">
        <TextIcon size="sm" />
        <span>{firstGraphemes(layer.text.content, THUMB_GRAPHEMES)}</span>
      </span>
    );
  }
  if (layer.shape !== undefined) {
    if (layer.shape.kind === "Ellipse") return <EllipseIcon size="md" />;
    if (layer.shape.kind === "Line") return <LineIcon size="md" />;
    return <RectangleIcon size="md" />;
  }
  return null;
}
