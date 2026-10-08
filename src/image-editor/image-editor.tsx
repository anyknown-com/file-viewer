// The image editor: measures its container, builds the GL context, opens the file and shows the shell.
import { useCallback, useRef, useState } from "react";
import { isAbortError, toViewerError, ViewerError } from "../contract/errors";
import { extOf } from "../contract/kinds";
import type { Limits } from "../contract/limits";
import type { Vars } from "../i18n/messages";
import { DiscardDialog } from "../primitives/dialog";
import { useRoot } from "../primitives/root-context";
import { ViewerRoot } from "../primitives/root";
import type { Doc, EditorApi, MessageKey, Session } from "./api";
import type { View } from "./canvas";
import { createDocStore, type DocStore } from "./doc/store";
import { createEditorApi } from "./editor-api";
import { createBufferPool } from "./engine/buffers";
import { guardContext } from "./engine/context-loss";
import { createGl, destroyGl } from "./engine/gl/context";
import { createPixels } from "./engine/pixels";
import { createRenderer } from "./engine/render";
import { createTextureStore } from "./engine/textures";
import { installExtensions } from "./extensions";
import type { ImageEditorProps } from "./index";
import { OpenFailure } from "./open/open-failure";
import { openImage } from "./open/open-image";
import { openProject } from "./open/open-project";
import { setups } from "./registry";
import { createSaver, type Saver } from "./save/save";
import { SaveButtons } from "./save/save-buttons";
import { fitToWindow } from "./tools/zoom-tool";
import { EditorShell } from "./ui/editor-shell";
import { EditorStatus } from "./ui/status";
import { useLabel } from "./ui/use-label";
import { createUiSlot, type UiSlot } from "./ui-slot";
import { createWorkerRunner } from "./worker/run-in-worker";

const NARROW_PX = 768;

type Ready = { api: EditorApi; store: DocStore; ui: UiSlot; saver: Saver };
type Phase =
  | { kind: "loading" }
  | { kind: "failed"; key: MessageKey; vars?: Vars }
  | ({ kind: "ready" } & Ready);
type Latest = { props: ImageEditorProps; limits: Limits; report(e: ViewerError): void };

function failureOf(e: unknown): { error: ViewerError; key: MessageKey; vars?: Vars } {
  if (e instanceof OpenFailure) return { error: e.error, key: e.key, vars: e.vars };
  const error = toViewerError(e, "decode_failed");
  return { error, key: `error.${error.code}` };
}

/** The api over an opened document; `canvas` is attached by EditorCanvas. */
function editorFor(
  gl: WebGL2RenderingContext,
  floatTargets: "rgba16f" | "rgba8",
  textures: ReturnType<typeof createTextureStore>,
  worker: ReturnType<typeof createWorkerRunner>,
  doc: Doc,
  latest: { current: Latest },
): Ready {
  const store = createDocStore(doc);
  const ui = createUiSlot();
  let session: Session = {
    active: doc.manifest.activeLayerID ?? null,
    target: "image",
    tool: "move",
    collapsed: new Set(),
    renderHidden: new Set(),
  };
  const api = createEditorApi({
    gl,
    store,
    textures,
    renderer: createRenderer(gl, textures, createBufferPool(gl, floatTargets)),
    pixels: createPixels(gl, textures, store.get),
    worker,
    session: { get: () => session, set: (p) => (session = { ...session, ...p }) },
    ui,
    requestRender: () => {},
  });
  const saver = createSaver({
    api,
    store,
    file: latest.current.props.file,
    onSave: (request) => latest.current.props.onSave(request),
    get maxOutputBytes() {
      return latest.current.props.maxOutputBytes;
    },
    report: (e) => latest.current.report(e),
    notify: (key, vars) => ui.note(key, vars),
  });
  return { api, store, ui, saver };
}

/** Zooms out to fit once the canvas has its size, when the document is larger than the window. */
function fitWhenLarger(api: EditorApi): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = (api.gl.canvas as HTMLCanvasElement).parentElement;
      const { width, height } = api.doc().manifest;
      if (el && (width > el.clientWidth || height > el.clientHeight)) fitToWindow(api);
    }),
  );
}

function EditorSession(props: {
  latest: { current: Latest };
  source: ImageEditorProps["file"]["source"];
  hidden: boolean;
}): React.JSX.Element {
  const { latest, source } = props;
  const label = useLabel();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [view, setView] = useState<View>({ zoom: 1, center: { x: 0, y: 0 } });
  const [discard, setDiscard] = useState(false);

  const start = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const { props: editor, limits, report } = latest.current;
      const created = createGl(document.createElement("canvas"));
      if (!created) {
        report(new ViewerError("webgl_unavailable"));
        setPhase({ kind: "failed", key: "error.webgl_unavailable" });
        return;
      }
      const { gl, floatTargets, maxTexture } = created;
      const abort = new AbortController();
      const cleanups: (() => void)[] = [];
      const textures = createTextureStore(gl, maxTexture);
      const runner = createWorkerRunner();
      const opening =
        extOf(editor.file.name) === "comp.zip"
          ? openProject(editor.file, limits, { textures, maxTexture, runner }, abort.signal)
          : openImage(editor.file, limits, textures, abort.signal);
      const show = (doc: Doc) => {
        const ready = editorFor(gl, floatTargets, textures, runner, doc, latest);
        let dirty = ready.store.dirty();
        cleanups.push(guardContext(ready.api, ready.store, ready.ui));
        cleanups.push(
          ready.store.subscribe(() => {
            if (ready.store.dirty() === dirty) return;
            dirty = !dirty;
            latest.current.props.onDirtyChange?.(dirty);
          }),
        );
        const fvRoot = el.closest<HTMLElement>(".fv-root") ?? el;
        for (const fn of setups()) {
          const cleanup = fn(ready.api, fvRoot);
          if (cleanup) cleanups.push(cleanup);
        }
        const { width, height } = doc.manifest;
        setView({ zoom: 1, center: { x: width / 2, y: height / 2 } });
        setPhase({ kind: "ready", ...ready });
        fitWhenLarger(ready.api);
      };
      opening.then(
        (doc) => abort.signal.aborted || show(doc),
        (e: unknown) => {
          if (abort.signal.aborted || isAbortError(e)) return;
          const { error, key, vars } = failureOf(e);
          report(error);
          setPhase({ kind: "failed", key, vars });
        },
      );
      return () => {
        abort.abort();
        for (const cleanup of cleanups.splice(0)) cleanup();
        runner.terminate();
        for (const id of textures.ids()) textures.delete(id);
        destroyGl(gl);
      };
    },
    // `source` stands for the file: a host re-creating the FileRef object must not reopen it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [latest, source],
  );

  const close = () => latest.current.props.onClose();
  let body: React.ReactNode;
  if (phase.kind === "loading") body = <EditorStatus state="loading" />;
  else if (phase.kind === "failed") {
    body = <EditorStatus state="message" text={label(phase.key, phase.vars)} onBack={close} />;
  } else {
    body = (
      <EditorShell
        api={phase.api}
        store={phase.store}
        ui={phase.ui}
        name={latest.current.props.file.name}
        view={view}
        onViewChange={setView}
        saveSlot={<SaveButtons api={phase.api} saver={phase.saver} />}
        onClose={() => (phase.store.dirty() ? setDiscard(true) : close())}
      />
    );
  }
  return (
    <div className="fv-ie-session" ref={start} hidden={props.hidden}>
      {body}
      <DiscardDialog open={discard} onOpenChange={setDiscard} onDiscard={close} />
    </div>
  );
}

function ImageEditorBody(props: ImageEditorProps): React.JSX.Element {
  const { limits, report } = useRoot();
  const label = useLabel();
  // Read by the session after render, so new callbacks or limits never reopen the file.
  const latest = useRef<Latest>({ props, limits, report });
  // oxlint-disable-next-line react/refs -- read only from the session's callbacks, after render.
  latest.current = { props, limits, report };
  // `started` stays true once the editor was wide enough: narrowing later hides it, edits stay.
  const [width, setWidth] = useState<{ narrow: boolean; started: boolean } | null>(null);

  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const narrow = el.clientWidth < NARROW_PX;
      setWidth((w) => ({ narrow, started: (w?.started ?? false) || !narrow }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="fv-ie" ref={measure}>
      {width?.narrow === true && (
        <EditorStatus state="message" text={label("image.narrow")} onBack={props.onClose} />
      )}
      {width?.started === true && (
        <EditorSession latest={latest} source={props.file.source} hidden={width.narrow} />
      )}
    </div>
  );
}

/** Edits an image or a `.comp.zip` project; fills the container it is given. */
export function ImageEditor(props: ImageEditorProps): React.JSX.Element {
  installExtensions();
  return (
    <ViewerRoot
      locale={props.locale}
      messages={props.messages}
      theme={props.theme}
      limits={props.limits}
      onError={props.onError}
    >
      <ImageEditorBody {...props} />
    </ViewerRoot>
  );
}
