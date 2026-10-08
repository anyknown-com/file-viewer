// Save, save as and export: which SaveRequest each button makes (the plan's "契約 / 存檔" table).
import type { FileRef } from "../../contract/byte-source";
import { ViewerError } from "../../contract/errors";
import { extOf } from "../../contract/kinds";
import { suggestedName, type SaveHandler, type SaveMode } from "../../contract/save";
import type { Vars } from "../../i18n/messages";
import type { EditorApi, MessageKey } from "../api";
import { isFlat } from "../doc/flat";
import type { DocStore } from "../doc/store";
import { encodeImage, renderFull, type ImageType } from "./flatten";
import { projectBlob } from "./project-blob";
import { askSaveChoice } from "./save-dialog";

export type SaverDeps = {
  api: EditorApi;
  store: DocStore;
  file: FileRef;
  onSave: SaveHandler;
  maxOutputBytes?: number;
  /** useRoot().report (src/primitives/root-context.ts). */
  report(e: ViewerError): void;
  /** Shows a notice under the top bar without reporting. */
  notify(key: MessageKey, vars?: Vars): void;
};
export type SaverState = { saving: boolean; savedAsProject: boolean };
export type Saver = {
  save(): Promise<void>;
  saveAs(): Promise<void>;
  exportAs(opts: { type: "png" | "jpeg" | "webp"; quality: number }): Promise<void>;
  state(): SaverState;
  /** For useSyncExternalStore with state(). */
  subscribe(fn: () => void): () => void;
};

type Output = { blob: Blob; mime: string; ext: string };
const PROJECT_EXT = ".comp.zip";
const PROJECT_MIME = "application/zip";
const EXPORT_TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;
const EXPORT_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const savers = new WeakMap<EditorApi, Saver>();

/** The saver made for this api (the save shortcuts in core.ts find it here). */
export function saverOf(api: EditorApi): Saver | undefined {
  return savers.get(api);
}

/** The format a flat image saves back to: its own, except AVIF and BMP become JPEG. */
function sameFormat(name: string): { type: ImageType; ext: string } {
  const ext = extOf(name);
  if (ext === "png") return { type: "image/png", ext: ".png" };
  if (ext === "webp") return { type: "image/webp", ext: ".webp" };
  if (ext === "jpeg") return { type: "image/jpeg", ext: ".jpeg" };
  return { type: "image/jpeg", ext: ".jpg" };
}

function failureText(cause: unknown): string {
  if (!(cause instanceof Error)) return "";
  if (cause instanceof ViewerError && cause.message === cause.code) return "";
  return cause.message;
}

export function createSaver(deps: SaverDeps): Saver {
  const { api, store, file } = deps;
  let state: SaverState = { saving: false, savedAsProject: extOf(file.name) === "comp.zip" };
  let projectName = suggestedName(file.name, PROJECT_EXT, "replace");
  const listeners = new Set<() => void>();
  const set = (patch: Partial<SaverState>) => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn();
  };

  /** Flattens and encodes; a format the browser swaps (WebP → PNG) is saved as what came back. */
  async function flat(type: ImageType, quality: number, ext: string): Promise<Output> {
    const rgba = renderFull(api, store.get(), {
      background: type === "image/jpeg" ? "white" : undefined,
    });
    const { width, height } = store.get().manifest;
    const out = await encodeImage(rgba, width, height, type, quality, api);
    if (out.type === type) return { blob: out.blob, mime: type, ext };
    deps.notify("image.export.fallbackPng");
    return { blob: out.blob, mime: "image/png", ext: ".png" };
  }

  async function project(): Promise<Output> {
    return { blob: await projectBlob(api, store.get()), mime: PROJECT_MIME, ext: PROJECT_EXT };
  }

  /**
   * Runs one save: `make` must read the document before its first await. Replace and copy mark the
   * position the save started at as saved. Resolves true when the host stored the file.
   */
  async function run(
    mode: SaveMode,
    make: () => Promise<Output>,
    name?: (ext: string) => string,
  ): Promise<boolean> {
    if (state.saving) return false;
    set({ saving: true });
    const at = store.position();
    try {
      const out = await make();
      if (deps.maxOutputBytes !== undefined && out.blob.size > deps.maxOutputBytes) {
        deps.notify("error.output_too_large");
        deps.report(new ViewerError("output_too_large"));
        return false;
      }
      const request = {
        blob: out.blob,
        mime: out.mime,
        ext: out.ext,
        mode,
        suggestedName: name?.(out.ext) ?? suggestedName(file.name, out.ext, mode),
      };
      try {
        await deps.onSave(request);
      } catch (cause) {
        const message = failureText(cause);
        if (message) deps.notify("image.save.failed", { message });
        else deps.notify("error.save_failed");
        deps.report(new ViewerError("save_failed", { cause }));
        return false;
      }
      if (mode !== "export") store.markSaved(at);
      if (mode === "copy" && out.ext === PROJECT_EXT) projectName = request.suggestedName;
      return true;
    } catch (e) {
      const error = e instanceof ViewerError ? e : new ViewerError("save_failed", { cause: e });
      deps.notify(error.code === "too_large" ? "image.export.tooLarge" : `error.${error.code}`);
      deps.report(error);
      return false;
    } finally {
      set({ saving: false });
    }
  }

  const copyProject = async () => {
    if (await run("copy", project)) set({ savedAsProject: true });
  };
  const replaceImage = () => {
    const { type, ext } = sameFormat(file.name);
    return run("replace", () => flat(type, 0.92, ext));
  };

  const saver: Saver = {
    async save() {
      if (state.saving) return;
      if (state.savedAsProject) {
        await run("replace", project, () => projectName);
        return;
      }
      if (isFlat(store.get())) {
        await replaceImage();
        return;
      }
      const choice = await askSaveChoice(api);
      if (choice === "project") await copyProject();
      else if (choice === "flatten") await replaceImage();
    },
    async saveAs() {
      if (state.saving) return;
      if (state.savedAsProject || !isFlat(store.get())) {
        await copyProject();
        return;
      }
      const { type, ext } = sameFormat(file.name);
      await run("copy", () => flat(type, 0.92, ext));
    },
    async exportAs(opts) {
      const type = EXPORT_TYPES[opts.type];
      await run("export", () => flat(type, opts.quality, EXPORT_EXT[type]));
    },
    state: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  savers.set(api, saver);
  return saver;
}
