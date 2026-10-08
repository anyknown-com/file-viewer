import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type { EditorProps } from "../contract/editor";
import type { ViewerError } from "../contract/errors";
import { commonMessages } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { toMediaError } from "../media";
import { Button } from "../primitives/button";
import { DiscardDialog } from "../primitives/dialog";
import { CloseIcon } from "../primitives/glyphs";
import { useRoot } from "../primitives/root-context";
import { type AudioEdit, initialEdit, outputDuration } from "./edit";
import { RedoIcon, UndoIcon } from "./glyphs";
import {
  type History,
  type HistoryAction,
  historyReducer,
  initialHistory,
  isDirty,
} from "./history";
import { audioMessages } from "./messages";
import { type OpenedTrack, openTrack } from "./open-track";
import type { Peaks } from "./peaks";
import { Overview } from "./overview";
import { scanPeaks } from "./scan";
import { clampView, fitView, type View, zoom } from "./view";
import { Waveform } from "./waveform";
import { createZoomWindow } from "./zoom-window";

type Load =
  | { status: "opening" }
  | { status: "scanning"; opened: OpenedTrack; progress: number; peaks: Peaks | null }
  | { status: "ready"; opened: OpenedTrack; peaks: Peaks }
  | { status: "error"; error: ViewerError };

/** How often the half-scanned peak table is copied out so the waveform fills in while it runs. */
const SNAPSHOT_MS = 500;
const ZOOM_STEP = 2;

/** `+` / `-` zoom around the middle, `0` fits the whole timeline; null for other keys. */
function zoomKey(key: string, view: View, duration: number, sampleRate: number): View | null {
  if (view.width <= 0) return null;
  if (key === "+" || key === "=")
    return zoom(view, 1 / ZOOM_STEP, view.width / 2, duration, sampleRate);
  if (key === "-") return zoom(view, ZOOM_STEP, view.width / 2, duration, sampleRate);
  if (key === "0") return fitView(duration, view.width);
  return null;
}

type Action = HistoryAction | { type: "init"; edit: AudioEdit };

function reducer(h: History | null, a: Action): History | null {
  if (a.type === "init") return initialHistory(a.edit);
  return h && historyReducer(h, a);
}

export function EditorBody(props: EditorProps): React.JSX.Element {
  const t = useT(audioMessages);
  const tc = useT(commonMessages);
  const root = useRoot();
  const reportRef = useRef(root.report);
  // oxlint-disable-next-line react/refs -- kept out of the ref callback deps so a new onError never reopens the file.
  reportRef.current = root.report;
  const [load, setLoad] = useState<Load>({ status: "opening" });
  const [history, dispatchRaw] = useReducer(reducer, null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [rawView, setView] = useState<View>({ start: 0, secondsPerPixel: 0, width: 0 });
  const source = props.file.source;

  const rootRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const ac = new AbortController();
      const signal = ac.signal;
      let opened: OpenedTrack | null = null;
      const run = async () => {
        try {
          const o = await openTrack(source, signal);
          if (signal.aborted) {
            o.dispose();
            return;
          }
          opened = o;
          dispatchRaw({ type: "init", edit: initialEdit(o.duration) });
          setLoad({ status: "scanning", opened: o, progress: 0, peaks: null });
          let snappedAt = performance.now();
          const peaks = await scanPeaks(o, {
            signal,
            onProgress: (b) => {
              const now = performance.now();
              const snap = now - snappedAt >= SNAPSHOT_MS ? b.finish() : null;
              if (snap) snappedAt = now;
              setLoad((l) => ({
                status: "scanning",
                opened: o,
                progress: b.progress(),
                peaks: snap ?? (l.status === "scanning" ? l.peaks : null),
              }));
            },
          });
          if (!signal.aborted) setLoad({ status: "ready", opened: o, peaks });
        } catch (e) {
          if (signal.aborted) return;
          const error = toMediaError(e, "decode_failed");
          setLoad({ status: "error", error });
          reportRef.current(error);
        }
      };
      void run();
      return () => {
        ac.abort();
        opened?.dispose();
      };
    },
    [source],
  );

  const live = load.status === "scanning" || load.status === "ready" ? load : null;
  const opened = live && live.opened;
  const peaks = live && live.peaks;
  const progress = load.status === "scanning" ? load.progress : 1;
  const zoomWindow = useMemo(() => opened && createZoomWindow(opened.track), [opened]);
  const duration = history ? outputDuration(history.present) : 0;
  const view = useMemo(() => clampView(rawView, duration), [rawView, duration]);

  const dirty = history !== null && isDirty(history);
  const dispatch = (a: HistoryAction) => {
    if (!history) return;
    const next = historyReducer(history, a);
    dispatchRaw(a);
    if (isDirty(next) !== dirty) props.onDirtyChange?.(isDirty(next));
  };

  const requestClose = () => {
    if (dirty) setDiscardOpen(true);
    else props.onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      requestClose();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || !opened) return;
    const next = zoomKey(e.key, view, duration, opened.sampleRate);
    if (!next) return;
    e.preventDefault();
    setView(next);
  };

  return (
    <>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex -- the editor root owns the shortcuts (Esc, undo / redo, later space / Delete / S / T) and must be focusable to get them without a window listener. */}
      <div ref={rootRef} className="fv-audio" tabIndex={0} onKeyDown={onKeyDown}>
        <div className="fv-audio-top">
          <Button
            variant="ghost"
            aria-label={tc("common.close")}
            icon={<CloseIcon />}
            onClick={requestClose}
          />
          <span className="fv-audio-name">{props.file.name}</span>
          <Button
            variant="ghost"
            aria-label={t("audio.undo")}
            icon={<UndoIcon />}
            disabled={!history || history.past.length === 0}
            onClick={() => dispatch({ type: "undo" })}
          />
          <Button
            variant="ghost"
            aria-label={t("audio.redo")}
            icon={<RedoIcon />}
            disabled={!history || history.future.length === 0}
            onClick={() => dispatch({ type: "redo" })}
          />
          <Button variant="primary" disabled>
            {t("audio.export")}
          </Button>
        </div>
        <div className="fv-audio-wave-slot">
          {load.status === "opening" && (
            <div className="fv-audio-status">{tc("common.loading")}</div>
          )}
          {history && opened && zoomWindow && (
            <>
              <Overview
                peaks={peaks}
                progress={progress}
                state={history.present}
                duration={duration}
                view={view}
                onViewChange={setView}
              />
              <Waveform
                peaks={peaks}
                progress={progress}
                state={history.present}
                view={view}
                duration={duration}
                sampleRate={opened.sampleRate}
                zoomWindow={zoomWindow}
                onViewChange={setView}
                playhead={() => 0}
              />
            </>
          )}
          {load.status === "error" && (
            <div className="fv-audio-status" role="alert">
              {tc(`error.${load.error.code}`)}
            </div>
          )}
        </div>
        <div className="fv-audio-transport" />
        <div className="fv-audio-tools" />
      </div>
      <DiscardDialog open={discardOpen} onOpenChange={setDiscardOpen} onDiscard={props.onClose} />
    </>
  );
}
