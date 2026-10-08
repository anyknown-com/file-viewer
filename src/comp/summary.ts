import type { Manifest } from "./manifest";
import type { LayerRecord } from "./manifest-layer";
import { treeEntries } from "./tree";

const MAX_ROWS = 500;
const TEXT_CODE_POINTS = 80;
const EFFECT_ORDER = [
  "stroke",
  "shadow",
  "colorOverlay",
  "innerShadow",
  "outerGlow",
  "innerGlow",
] as const;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function textKind(layer: LayerRecord): string | undefined {
  const t = layer.text;
  if (!t) return undefined;
  const flat = t.content.replace(/\r\n|\n/g, "⏎");
  const points = Array.from(flat);
  const shown =
    points.length > TEXT_CODE_POINTS ? `${points.slice(0, TEXT_CODE_POINTS).join("")}…` : flat;
  const size = Math.round(t.fontSize * 10) / 10;
  return `text ${JSON.stringify(shown)} · ${t.fontName} ${size} px · ${t.alignment}`;
}

function kind(layer: LayerRecord): string | undefined {
  if (layer.isGroup === true) return undefined;
  if (layer.text) return textKind(layer);
  if (layer.shape) return `shape ${layer.shape.kind}`;
  if (layer.adjustment) return `adjustment ${layer.adjustment.kind}`;
  return layer.imageFile === undefined ? "empty" : undefined;
}

function geometry(layer: LayerRecord): string[] {
  if (layer.isGroup === true || layer.text || layer.adjustment) return [];
  if (layer.imageFile === undefined && !layer.shape) return [];
  const { size, origin, rotation } = layer.transform;
  const parts = [
    `${Math.round(size[0])}×${Math.round(size[1])} at (${Math.round(origin[0])}, ${Math.round(origin[1])})`,
  ];
  const turn = Math.round(rotation);
  if (turn !== 0) parts.push(`${turn}°`);
  return parts;
}

function effects(layer: LayerRecord): string[] {
  const e = layer.effects;
  if (!e) return [];
  const on = EFFECT_ORDER.filter((key) => e[key] !== undefined && e[key]?.enabled !== false);
  return on.length > 0 ? [`effects: ${on.join(", ")}`] : [];
}

function row(layer: LayerRecord, depth: number): string {
  const isFolder = layer.isGroup === true;
  const clipped = layer.maskSourceID !== undefined;
  const name = JSON.stringify(layer.name);
  const parts: string[] = [];
  const body = `${clipped ? "↳ " : ""}${isFolder ? "folder " : ""}${name}`;
  parts.push(body);
  const k = kind(layer);
  if (k) parts.push(k);
  if (layer.isVisible === false) parts.push("hidden");
  if (layer.blendMode !== undefined && layer.blendMode !== "Normal") parts.push(layer.blendMode);
  const opacity = layer.opacity ?? 1;
  if (opacity !== 1) parts.push(`${Math.round(opacity * 100)}%`);
  if (layer.maskFile !== undefined) parts.push(layer.maskEnabled === false ? "mask off" : "mask");
  if (clipped) parts.push("clipped");
  parts.push(...geometry(layer), ...effects(layer));
  return `${"  ".repeat(depth)}- ${parts.join(" · ")} #${layer.id.slice(0, 8)}`;
}

/** A fenced `image-project` block that shows a model the layer tree, top layer first. */
export function summarize(m: Manifest, name: string): string {
  const entries = treeEntries(m.layers, true);
  const folders = entries.filter((e) => e.layer.isGroup === true).length;
  const header = [
    name,
    `${m.width}×${m.height}`,
    `${Math.round(m.resolution ?? 72)} ppi`,
    plural(entries.length - folders, "layer"),
    ...(folders > 0 ? [plural(folders, "folder")] : []),
    "top first",
  ].join(" · ");
  const rows = entries.slice(0, MAX_ROWS).map((e) => row(e.layer, e.depth));
  if (entries.length > MAX_ROWS) rows.push(`- … ${entries.length - MAX_ROWS} more`);
  return ["```image-project", header, ...rows, "```"].join("\n");
}
