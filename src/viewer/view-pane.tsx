import { Suspense, useCallback, useRef, useState } from "react";
import type { ByteSource, FileRef } from "../contract/byte-source";
import { toViewerError, type ViewerError } from "../contract/errors";
import type { ViewKind } from "../contract/formats";
import type { FileViewerProps } from "../contract/props";
import { useRoot } from "../primitives/root-context";
import { bodies } from "./bodies";
import { load, type Loaded } from "./load";
import { Status } from "./status";

const keys = new WeakMap<ByteSource, number>();
let nextKey = 0;

export function sourceKey(source: ByteSource): number {
  let k = keys.get(source);
  if (k === undefined) {
    k = nextKey++;
    keys.set(source, k);
  }
  return k;
}

type State =
  | { status: "loading" }
  | { status: "ready"; loaded: Loaded }
  | { status: "error"; error: ViewerError };

export function ViewPane(props: {
  file: FileRef;
  view: ViewKind;
  viewer: FileViewerProps;
  report: (e: ViewerError) => void;
}): React.JSX.Element {
  const { file, view, report } = props;
  const { source, name, mime } = file;
  const [state, setState] = useState<State>({ status: "loading" });
  const { limits } = useRoot();
  const limitsRef = useRef(limits);
  // oxlint-disable-next-line react/refs -- kept out of the ref callback deps so a new limits object never reloads the file.
  limitsRef.current = limits;

  const fail = useCallback(
    (e: ViewerError) => {
      setState({ status: "error", error: e });
      report(e);
    },
    [report],
  );

  const stage = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const ctl = new AbortController();
      let url: string | null = null;
      load(view, { name, mime, source }, ctl.signal, limitsRef.current).then(
        (loaded) => {
          if (ctl.signal.aborted) {
            if (loaded.url) URL.revokeObjectURL(loaded.url);
            return;
          }
          url = loaded.url;
          setState({ status: "ready", loaded });
        },
        (err: unknown) => {
          if (ctl.signal.aborted) return;
          fail(toViewerError(err, "read_failed"));
        },
      );
      return () => {
        ctl.abort();
        if (url) URL.revokeObjectURL(url);
      };
    },
    [source, name, mime, view, fail],
  );

  const Body = bodies[view];
  return (
    <div className="fv-stage" ref={stage}>
      {state.status === "loading" && <Status kind="loading" />}
      {state.status === "error" && <Status kind={state.error.code} />}
      {state.status === "ready" && (
        <Suspense fallback={<Status kind="loading" />}>
          <Body file={file} loaded={state.loaded} fail={fail} viewer={props.viewer} />
        </Suspense>
      )}
    </div>
  );
}
