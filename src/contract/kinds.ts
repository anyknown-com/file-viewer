import {
  AUDIO_EXT,
  AUDIO_MIME,
  COMP_SUFFIX,
  EDITABLE_IMAGE_EXT,
  EXCALIDRAW_EXT,
  EXCALIDRAW_MIME,
  IMAGE_EXT,
  IMAGE_MIME,
  MARKDOWN_EXT,
  MARKDOWN_MIME,
  PDF_EXT,
  PDF_MIME,
  TEXT_EXT,
  TEXT_MIME,
  VIDEO_EXT,
  VIDEO_MIME,
  type EditKind,
  type ViewKind,
} from "./formats";
import { editors } from "../viewer/editors";
import { resolveLimits, type Limits } from "./limits";

export type { ViewKind, EditKind } from "./formats";
export type FileInfo = { name: string; mime?: string; size: number };
export type KindResult = { view: ViewKind | null; edit: EditKind | null; tooLarge: boolean };

const EXT_TABLES: [ViewKind, Readonly<Record<string, string>>][] = [
  ["image", IMAGE_EXT],
  ["video", VIDEO_EXT],
  ["audio", AUDIO_EXT],
  ["pdf", PDF_EXT],
  ["markdown", MARKDOWN_EXT],
  ["excalidraw", EXCALIDRAW_EXT],
  ["text", TEXT_EXT],
];

const MIME_TABLES: [ViewKind, ReadonlySet<string>][] = [
  ["image", IMAGE_MIME],
  ["video", VIDEO_MIME],
  ["audio", AUDIO_MIME],
  ["pdf", PDF_MIME],
  ["markdown", MARKDOWN_MIME],
  ["excalidraw", EXCALIDRAW_MIME],
  ["text", TEXT_MIME],
];

const isComp = (name: string): boolean => name.toLowerCase().endsWith(COMP_SUFFIX);

/** Lowercase, no dot; ".comp.zip" gives "comp.zip". */
export function extOf(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(COMP_SUFFIX) && lower.length > COMP_SUFFIX.length) return "comp.zip";
  const i = lower.lastIndexOf(".");
  return i < 0 ? "" : lower.slice(i + 1);
}

function cleanMime(mime?: string): string {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  return m === "application/octet-stream" ? "" : m;
}

function extEntry(file: { name: string; mime?: string }): [ViewKind, string] | null {
  const ext = extOf(file.name);
  if (ext === "webm" && cleanMime(file.mime) === "audio/webm") return ["audio", "audio/webm"];
  for (const [kind, table] of EXT_TABLES) {
    if (Object.hasOwn(table, ext)) return [kind, table[ext]];
  }
  return null;
}

export function formatOf(file: { name: string; mime?: string }): ViewKind | null {
  if (isComp(file.name)) return null;
  const hit = extEntry(file);
  if (hit) return hit[0];
  const mime = cleanMime(file.mime);
  if (!mime) return null;
  for (const [kind, set] of MIME_TABLES) {
    if (set.has(mime)) return kind;
  }
  return mime.startsWith("text/") ? "text" : null;
}

export function mimeOf(file: { name: string; mime?: string }): string {
  if (isComp(file.name)) return "application/zip";
  const hit = extEntry(file);
  if (hit) return hit[1];
  return cleanMime(file.mime) || "application/octet-stream";
}

export function editKindOf(file: FileInfo, limits: Limits): EditKind | null {
  if (isComp(file.name)) return file.size <= limits.projectBytes ? "image" : null;
  const format = formatOf(file);
  if ((format === "markdown" || format === "excalidraw") && file.size <= limits.docBytes) {
    return format;
  }
  if (EDITABLE_IMAGE_EXT.has(extOf(file.name)) && file.size <= limits.previewBytes) return "image";
  if (format === "video" || format === "audio") return format;
  return null;
}

function limitFor(kind: ViewKind, limits: Limits): number {
  if (kind === "text") return limits.textBytes;
  if (kind === "markdown" || kind === "excalidraw") return limits.docBytes;
  return limits.previewBytes;
}

export function kindOf(file: FileInfo, limits?: Partial<Limits>): KindResult {
  const resolved = resolveLimits(limits);
  const kind = editKindOf(file, resolved);
  const edit = kind && editors[kind] ? kind : null;
  const format = formatOf(file);
  if (!format) return { view: null, edit, tooLarge: false };
  if (file.size > limitFor(format, resolved)) return { view: null, edit, tooLarge: true };
  return { view: format, edit, tooLarge: false };
}
