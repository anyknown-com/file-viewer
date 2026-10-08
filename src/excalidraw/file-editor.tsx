import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { readBlob } from "../contract/byte-source";
import type { EditorProps } from "../contract/editor";
import { isAbortError, toViewerError, ViewerError } from "../contract/errors";
import { mimeOf } from "../contract/kinds";
import { suggestedName } from "../contract/save";
import { commonMessages } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";
import { useRoot } from "../primitives/root-context";
import { ViewerRoot } from "../primitives/root";
import { Spinner } from "../primitives/spinner";
import { excalidrawMessages } from "./messages";
import { parseScene } from "./parse-scene";

const LazyDiagramEditor = lazy(() => import("./diagram-editor"));

const MIME = "application/vnd.excalidraw+json";

type State =
  | { phase: "loading" }
  | { phase: "ready"; text: string }
  | { phase: "error"; message: string };

type BodyProps = Pick<EditorProps, "file" | "onSave" | "onClose" | "onDirtyChange">;

function FileEditorBody({ file, onSave, onClose, onDirtyChange }: BodyProps) {
  const tc = useT(commonMessages);
  const t = useT(excalidrawMessages);
  const { report } = useRoot();
  const reportRef = useRef(report);
  // oxlint-disable-next-line react/refs -- kept out of the ref callback deps so a new onError never rereads the file.
  reportRef.current = report;
  const [state, setState] = useState<State>({ phase: "loading" });

  const rootRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const ctl = new AbortController();
      const run = async () => {
        try {
          const blob = await readBlob(file.source, { type: mimeOf(file), signal: ctl.signal });
          const text = await blob.text();
          if (ctl.signal.aborted) return;
          if (parseScene(text).ok) {
            setState({ phase: "ready", text });
          } else {
            reportRef.current(new ViewerError("decode_failed"));
            setState({ phase: "error", message: t("excalidraw.broken") });
          }
        } catch (e) {
          if (ctl.signal.aborted || isAbortError(e)) return;
          reportRef.current(toViewerError(e, "read_failed"));
          setState({ phase: "error", message: tc("error.read_failed") });
        }
      };
      void run();
      return () => ctl.abort();
    },
    // t and tc only change with the locale; the message is chosen once per read.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [file],
  );

  const spinner = <Spinner label={tc("common.loading")} />;
  return (
    <div className="fv-diagram-file-editor" ref={rootRef}>
      {state.phase === "loading" && spinner}
      {state.phase === "error" && (
        <div className="fv-diagram-broken" role="alert">
          <p>{state.message}</p>
          <Button onClick={onClose}>{tc("common.close")}</Button>
        </div>
      )}
      {state.phase === "ready" && (
        <Suspense fallback={spinner}>
          <LazyDiagramEditor
            json={state.text}
            onDirtyChange={onDirtyChange}
            onClose={onClose}
            onSave={async (json) => {
              await onSave({
                blob: new Blob([json], { type: MIME }),
                mime: MIME,
                ext: ".excalidraw",
                mode: "replace",
                suggestedName: suggestedName(file.name, ".excalidraw", "replace"),
              });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

/** Editor FileViewer opens for a .excalidraw file: reads the file, edits it in Excalidraw and saves it back through onSave. Call setAssetPath first when mounting it on its own. */
export function ExcalidrawFileEditor(props: EditorProps): React.JSX.Element {
  const {
    onSave,
    onClose,
    onDirtyChange,
    maxOutputBytes: _max,
    assets: _assets,
    file,
    ...root
  } = props;
  return (
    <ViewerRoot {...root}>
      <FileEditorBody file={file} onSave={onSave} onClose={onClose} onDirtyChange={onDirtyChange} />
    </ViewerRoot>
  );
}
