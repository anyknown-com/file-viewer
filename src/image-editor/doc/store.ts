import type { Command, Doc, LayerResize, MessageKey, PixelTile } from "../api";
import { createHistory, type History } from "./history";

export type DocStore = {
  get(): Doc;
  /** For useSyncExternalStore: called once per change. */
  subscribe(fn: () => void): () => void;
  /** With a label: one undo step from the last recorded point. Without: a live preview, not recorded. */
  dispatch(command: Command, label?: MessageKey): void;
  /** Records a step whose pixels are already written; tiles and resizes are stored as given (after filled in). */
  commit(label: MessageKey, doc: Doc, tiles: PixelTile[], resizes?: readonly LayerResize[]): void;
  undo(): ReturnType<History["undo"]>;
  redo(): ReturnType<History["redo"]>;
  canUndo(): boolean;
  canRedo(): boolean;
  /** The current position differs from the one last marked saved. */
  dirty(): boolean;
  /** `at` is the position the save captured (default: now), so edits made while saving stay unsaved. */
  markSaved(at?: number): void;
  position(): number;
};

export function createDocStore(initial: Doc): DocStore {
  const history = createHistory(initial);
  const listeners = new Set<() => void>();
  let doc = initial;
  // The document at the last recorded point: what undo goes back to after a preview.
  let recorded = initial;
  let saved = history.position();

  const set = (next: Doc): void => {
    doc = next;
    for (const fn of listeners) fn();
  };

  return {
    get: () => doc,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispatch(command, label) {
      const next = command(doc);
      if (label !== undefined && next !== recorded) {
        history.record({ label, doc: next, tiles: [], resizes: [] });
        recorded = next;
      }
      if (next !== doc) set(next);
    },
    commit(label, next, tiles, resizes = []) {
      history.record({ label, doc: next, tiles, resizes });
      recorded = next;
      set(next);
    },
    undo() {
      const result = history.undo();
      if (result) {
        recorded = result.doc;
        set(result.doc);
      }
      return result;
    },
    redo() {
      const result = history.redo();
      if (result) {
        recorded = result.doc;
        set(result.doc);
      }
      return result;
    },
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    dirty: () => history.position() !== saved,
    markSaved(at = history.position()) {
      saved = at;
      for (const fn of listeners) fn();
    },
    position: () => history.position(),
  };
}
