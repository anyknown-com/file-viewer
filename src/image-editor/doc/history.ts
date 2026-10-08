// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/Document/DocumentHistory.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import type { Doc, LayerResize, MessageKey, PixelTile } from "../api";
import { UNDO_MAX_BYTES, UNDO_MAX_STEPS } from "../limits";

/** One undo step: the document after it, and the pixel tiles and resizes it changed. */
export type Step = {
  label: MessageKey;
  doc: Doc;
  tiles: PixelTile[];
  resizes: readonly LayerResize[];
};

export type History = {
  record(step: Step): void;
  undo(): {
    doc: Doc;
    tiles: { tile: PixelTile; use: "before" }[];
    resizes: { resize: LayerResize; use: "before" }[];
  } | null;
  redo(): {
    doc: Doc;
    tiles: { tile: PixelTile; use: "after" }[];
    resizes: { resize: LayerResize; use: "after" }[];
  } | null;
  canUndo(): boolean;
  canRedo(): boolean;
  /** The revision of the document as it stands: unique per recorded step, so a save can be matched later. */
  position(): number;
  /** Pixel bytes held only by history: tiles' before + after and resizes' before.data + after.data. */
  bytes(): number;
};

type Entry = Step & { revision: number; bytes: number };

function stepBytes(step: Step): number {
  let total = 0;
  for (const tile of step.tiles) total += tile.before.byteLength + (tile.after?.byteLength ?? 0);
  for (const r of step.resizes) total += r.before.data.byteLength + (r.after?.data.byteLength ?? 0);
  return total;
}

export function createHistory(initial: Doc): History {
  // entries[0..at) are done (undoable), entries[at..] are undone (redoable).
  const entries: Entry[] = [];
  let at = 0;
  let base = { doc: initial, revision: 0 };
  let nextRevision = 1;
  let total = 0;

  const dropOldest = (): void => {
    const [first] = entries.splice(0, 1);
    total -= first.bytes;
    base = { doc: first.doc, revision: first.revision };
    at -= 1;
  };

  // DocumentHistory.swift `trim`: oldest done step first, then the farthest undone one.
  const trim = (): void => {
    while (entries.length > UNDO_MAX_STEPS || total > UNDO_MAX_BYTES) {
      if (at > 0) dropOldest();
      else if (entries.length > 0) total -= (entries.pop() as Entry).bytes;
      else break;
    }
  };

  const current = (): { doc: Doc; revision: number } => (at > 0 ? entries[at - 1] : base);

  return {
    record(step) {
      for (const dropped of entries.splice(at)) total -= dropped.bytes;
      const bytes = stepBytes(step);
      entries.push({ ...step, revision: nextRevision++, bytes });
      total += bytes;
      at = entries.length;
      trim();
    },
    undo() {
      if (at === 0) return null;
      const step = entries[at - 1];
      at -= 1;
      return {
        doc: current().doc,
        tiles: step.tiles.map((tile) => ({ tile, use: "before" as const })),
        resizes: step.resizes.map((resize) => ({ resize, use: "before" as const })),
      };
    },
    redo() {
      if (at === entries.length) return null;
      const step = entries[at];
      at += 1;
      return {
        doc: step.doc,
        tiles: step.tiles.map((tile) => ({ tile, use: "after" as const })),
        resizes: step.resizes.map((resize) => ({ resize, use: "after" as const })),
      };
    },
    canUndo: () => at > 0,
    canRedo: () => at < entries.length,
    position: () => current().revision,
    bytes: () => total,
  };
}
