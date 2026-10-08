import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { EditorProps } from "../../contract/editor";
import { commonMessages } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { Progress } from "../../primitives/progress";
import { videoMessages } from "../messages";
import { addText, deleteClips, splitAt } from "../model/edits";
import type { History } from "../model/history";
import { CloseGuard } from "./close-guard";
import { type KeyAction, keyAction } from "./keyboard";
import { Notice, noticeReason } from "./notice";
import { PreviewPanel } from "./preview-panel";
import { EditorSession, type SessionState } from "./session";
import { Timeline } from "./timeline/timeline";
import { TopBar } from "./top-bar";

/** Below this container width the editor only shows a notice (00-overview §3). */
const NARROW_PX = 768;

const noSubscribe = () => () => {};

function runKey(action: KeyAction, session: EditorSession, history: History): void {
  const { player, state } = session;
  const p = history.project;
  switch (action) {
    case "toggle":
      return player.toggle();
    case "pause":
      return player.pause();
    case "play":
      return player.play();
    case "back5":
      return player.jump(-5);
    case "prevFrame":
      return player.step(-1);
    case "nextFrame":
      return player.step(1);
    case "split":
      return session.run(splitAt(p, state.playhead, state.selection));
    case "delete":
    case "rippleDelete":
      session.run(deleteClips(p, state.selection, action === "rippleDelete"));
      return session.select([], false);
    case "undo":
      return history.undo();
    case "redo":
      return history.redo();
    case "deselect":
      return session.select([], false);
  }
}

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

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Keys typed in a dialog or menu bubble here through their portal; they are not ours.
    if (!session || !history || !(e.target instanceof Node)) return;
    if (!e.currentTarget.contains(e.target)) return;
    const action = keyAction(e);
    if (!action) return;
    e.preventDefault();
    runKey(action, session, history);
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
        <div className="fv-ve-preview">
          <PreviewPanel session={session} />
        </div>
        <div className="fv-ve-inspector" />
        <div className="fv-ve-timeline">
          <Timeline session={session} />
        </div>
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
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex -- the editor root owns the shortcuts and must be focusable to get them without a window listener.
    <div ref={rootRef} className="fv-ve-root" tabIndex={0} onKeyDown={onKeyDown}>
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
