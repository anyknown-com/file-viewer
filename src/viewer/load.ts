import { readBlob } from "../contract/byte-source";
import type { FileRef } from "../contract/byte-source";
import { isAbortError, ViewerError, toViewerError } from "../contract/errors";
import type { ViewKind } from "../contract/formats";
import { mimeOf } from "../contract/kinds";
import type { Limits } from "../contract/limits";

export type Loaded = { blob: Blob; url: string | null; text: string | null };

export const LIMIT_KEY: Record<Exclude<ViewKind, "comp">, keyof Limits> = {
  image: "previewBytes",
  video: "previewBytes",
  audio: "previewBytes",
  pdf: "previewBytes",
  text: "textBytes",
  markdown: "docBytes",
  excalidraw: "docBytes",
}; // "comp" is not listed: preview never checks projectBytes

export async function load(
  view: ViewKind | "comp",
  file: FileRef,
  signal: AbortSignal,
  limits: Limits,
): Promise<Loaded> {
  // The body reads only the head itself; no whole-file read, no size check.
  if (view === "comp") return { blob: new Blob([]), url: null, text: null };
  if (file.source.size > limits[LIMIT_KEY[view]]) throw new ViewerError("too_large");
  try {
    const blob = await readBlob(file.source, {
      type: view === "pdf" ? "application/pdf" : mimeOf(file),
      signal,
    });
    if (view === "text" || view === "markdown" || view === "excalidraw") {
      return { blob, url: null, text: await blob.text() };
    }
    signal.throwIfAborted();
    return { blob, url: URL.createObjectURL(blob), text: null };
  } catch (err) {
    if (signal.aborted || isAbortError(err) || err instanceof ViewerError) throw err;
    throw toViewerError(err, "read_failed");
  }
}
