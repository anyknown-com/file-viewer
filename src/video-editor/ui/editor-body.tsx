import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { EditorProps } from "../../contract/editor";
import { commonMessages } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { Progress } from "../../primitives/progress";
import { videoMessages } from "../messages";
import { addText, splitAt } from "../model/edits";
import { CloseGuard } from "./close-guard";
import { Notice, noticeReason } from "./notice";
import { EditorSession, type SessionState } from "./session";
import { TopBar } from "./top-bar";

/** Below this container width the editor only shows a notice (00-overview §3). */
const NARROW_PX = 768;

const noSubscribe = () => () => {};

export function VideoEditorBody(props: EditorProps): React.JSX.Element {
  const t = useT(videoMessages);
  const tc = useT(commonMessages);
  // Kept out of the ref callback deps so new callbacks or a new file object never restart the session.
  const latest = useRef(props);
  // oxlint-disable-next-line react/refs -- read only from the session's callbacks, after render.
  latest.current = props;
  const [session, setSession] = useState<EditorSession | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const source = props.file.source;
  const provider = props.assets;

  const rootRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const s = new EditorSession({
        file: latest.current.file,
        provider,
        onError: (e) => latest.current.onError?.(e),
      });
      let dirty = false;
      const off = s.subscribe(() => {
        const next = s.history?.dirty ?? false;
        if (next === dirty) return;
        dirty = next;
        latest.current.onDirtyChange?.(next);
      });
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) setNarrow(entry.contentRect.width < NARROW_PX);
      });
      ro.observe(el);
      setSession(s);
      void s.start();
      return () => {
        ro.disconnect();
        off();
        s.dispose();
      };
    },
    // `source` stands for the file: a host re-creating the FileRef object must not reopen it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [source, provider],
  );

  const subscribe = useCallback(
    (l: () => void) => (session ? session.subscribe(l) : noSubscribe()),
    [session],
  );
  const state: SessionState | null = useSyncExternalStore(subscribe, () => session?.state ?? null);
  const history = session?.history ?? null;

  const requestClose = () => {
    if (history?.dirty) setGuardOpen(true);
    else props.onClose();
  };

  let body: React.ReactNode;
  if (state?.status === "unsupported" && state.error) {
    body = <Notice reason={noticeReason(state.error.code)} onBack={props.onClose} />;
  } else if (narrow) {
    body = <Notice reason="narrow" onBack={props.onClose} />;
  } else if (session && state?.status === "ready" && history) {
    body = (
      <>
        <TopBar
          name={props.file.name}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onClose={requestClose}
          onUndo={() => history.undo()}
          onRedo={() => history.redo()}
          onSplit={() => session.run(splitAt(history.project, state.playhead, state.selection))}
          onAddText={() =>
            session.run(addText(history.project, state.playhead, t("video.defaultText")))
          }
          // The export dialog arrives with Phase 04.
          onExport={() => undefined}
        />
        <div className="fv-ve-assets" />
        <div className="fv-ve-preview" />
        <div className="fv-ve-inspector" />
        <div className="fv-ve-timeline" />
      </>
    );
  } else {
    body = (
      <div className="fv-ve-status">
        <Progress label={tc("common.loading")} value={null} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="fv-ve-root">
      {body}
      <CloseGuard
        open={guardOpen}
        exporting={false}
        onConfirm={props.onClose}
        onCancel={() => setGuardOpen(false)}
      />
    </div>
  );
}
