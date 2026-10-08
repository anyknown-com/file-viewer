import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type { EditorProps } from "../contract/editor";
import { commonMessages } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";
import { DiscardDialog } from "../primitives/dialog";
import { CloseIcon } from "../primitives/glyphs";
import { useRoot } from "../primitives/root-context";
import { type AudioEdit, cut, initialEdit, keep, outputDuration, type Range, split } from "./edit";
import { ExportDialog } from "./export-dialog";
import { RedoIcon, UndoIcon } from "./glyphs";
import {
  type History,
  type HistoryAction,
  historyReducer,
  initialHistory,
  isDirty,
} from "./history";
import { audioMessages } from "./messages";
import { NormalizePopover } from "./normalize-popover";
import { Overview } from "./overview";
import { createPlayer, type Player } from "./player";
import { SelectionLayer } from "./selection-layer";
import { SilencePopover } from "./silence-popover";
import { Tools } from "./tools";
import { togglePlay, Transport } from "./transport";
import { type Load, useTrackLoad } from "./use-track-load";
import { clampView, fitView, type View, zoom } from "./view";
import { VolumePopover } from "./volume-popover";
import { Waveform } from "./waveform";
import { createZoomWindow } from "./zoom-window";

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

/** Delete / Backspace cut and T keeps the selection, S splits at the playhead; null for other keys. */
function editKey(key: string, state: AudioEdit, sel: Range | null, playhead: number) {
  const k = key.toLowerCase();
  if ((k === "delete" || k === "backspace") && sel) return cut(state, sel);
  if (k === "t" && sel) return keep(state, sel);
  if (k === "s") return split(state, playhead);
  return null;
}

/** What the export dialog needs, once the peak scan is done. */
function exportable(load: Load, history: History | null) {
  return load.status === "ready" && history ? { opened: load.opened, edit: history.present } : null;
}

type Action = HistoryAction | { type: "init"; edit: AudioEdit };

function reducer(h: History | null, a: Action): History | null {
  if (a.type === "init") return initialHistory(a.edit);
  return h && historyReducer(h, a);
}

export function EditorBody(props: EditorProps): React.JSX.Element {
  const t = useT(audioMessages);
  const tc = useT(commonMessages);
  const [history, dispatchRaw] = useReducer(reducer, null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [rawView, setView] = useState<View>({ start: 0, secondsPerPixel: 0, width: 0 });
  const [selection, setSelection] = useState<Range | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [silence, setSilence] = useState<Range[]>([]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [loop, setLoop] = useState(false);
  const root = useRoot();

  const { rootRef, load, opened, peaks, progress } = useTrackLoad(props.file.source, (o) =>
    dispatchRaw({ type: "init", edit: initialEdit(o.duration) }),
  );
  const zoomWindow = useMemo(() => opened && createZoomWindow(opened.track), [opened]);
  const duration = history ? outputDuration(history.present) : 0;
  const view = useMemo(() => clampView(rawView, duration), [rawView, duration]);

  const live = useRef({ edit: initialEdit(0), loop: null as Range | null, report: root.report });
  // oxlint-disable-next-line react/refs -- the player reads the newest edit and loop on its own timer.
  live.current = {
    edit: history?.present ?? initialEdit(0),
    loop: loop ? selection : null,
    report: root.report,
  };
  const playerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !opened) return;
      const ctx = new AudioContext();
      const p = createPlayer(
        ctx,
        opened.track,
        () => ({ edit: live.current.edit, loop: live.current.loop }),
        (e) => live.current.report(e),
      );
      setPlayer(p);
      return () => {
        p.dispose();
        ctx.close().catch(() => undefined);
        setPlayer(null);
      };
    },
    [opened],
  );
  const head = () => (player ? player.position() : playhead);
  const seek = (to: number) => {
    setPlayhead(to);
    player?.seek(to);
  };

  const dirty = history !== null && isDirty(history);
  const toExport = exportable(load, history);
  const dispatch = (a: HistoryAction) => {
    if (!history) return;
    const next = historyReducer(history, a);
    if (next === history) return;
    dispatchRaw(a);
    if (isDirty(next) !== dirty) props.onDirtyChange?.(isDirty(next));
    const nextDuration = outputDuration(next.present);
    if (nextDuration !== duration) {
      // Cut / keep (or undoing them) moves everything after the edit: the old selection means nothing.
      setSelection(null);
      setPlayhead((p) => Math.min(p, nextDuration));
      if (player && !player.playing()) player.seek(Math.min(player.position(), nextDuration));
    }
  };
  const apply = (next: AudioEdit) => {
    if (history && next !== history.present) dispatch({ type: "apply", next });
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
    if (e.metaKey || e.ctrlKey || e.altKey || !opened || !history) return;
    if (transportKey(e)) return;
    const edit = editKey(e.key, history.present, selection, head());
    if (edit) {
      e.preventDefault();
      apply(edit);
      return;
    }
    const next = zoomKey(e.key, view, duration, opened.sampleRate);
    if (!next) return;
    e.preventDefault();
    setView(next);
  };

  /** Space plays / pauses (unless a focused control takes it), L loops, Home / End seek. */
  const transportKey = (e: React.KeyboardEvent<HTMLDivElement>): boolean => {
    const k = e.key.toLowerCase();
    if (k === " " && e.target !== e.currentTarget) return false;
    if (k === " " && player) togglePlay(player);
    else if (k === "l") setLoop((on) => !on);
    else if (k === "home") seek(0);
    else if (k === "end") seek(duration);
    else return false;
    e.preventDefault();
    return true;
  };

  return (
    <>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex -- the editor root owns the shortcuts (Esc, undo / redo, space, Delete / S / T, L, Home / End) and must be focusable to get them without a window listener. */}
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
            className="fv-audio-top-history"
            aria-label={t("audio.undo")}
            icon={<UndoIcon />}
            disabled={!history || history.past.length === 0}
            onClick={() => dispatch({ type: "undo" })}
          />
          <Button
            variant="ghost"
            className="fv-audio-top-history"
            aria-label={t("audio.redo")}
            icon={<RedoIcon />}
            disabled={!history || history.future.length === 0}
            onClick={() => dispatch({ type: "redo" })}
          />
          <Button variant="primary" disabled={!toExport} onClick={() => setExportOpen(true)}>
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
                playhead={head}
                overlay={
                  <SelectionLayer
                    view={view}
                    state={history.present}
                    selection={selection}
                    playhead={head()}
                    silence={silence}
                    onSelect={setSelection}
                    onSeek={seek}
                  />
                }
              />
            </>
          )}
          {load.status === "error" && (
            <div className="fv-audio-status" role="alert">
              {tc(`error.${load.error.code}`)}
            </div>
          )}
        </div>
        <div ref={playerRef} className="fv-audio-transport">
          <Transport
            player={player}
            duration={duration}
            selection={selection}
            loop={loop}
            onLoopChange={setLoop}
          />
        </div>
        {history && (
          <Tools
            selection={selection}
            playhead={head()}
            onApply={apply}
            state={history.present}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            onUndo={() => dispatch({ type: "undo" })}
            onRedo={() => dispatch({ type: "redo" })}
          >
            <VolumePopover selection={selection} state={history.present} onApply={apply} />
            <NormalizePopover
              peaks={peaks}
              selection={selection}
              state={history.present}
              onApply={apply}
            />
            <SilencePopover
              peaks={peaks}
              state={history.present}
              onMark={setSilence}
              onApply={apply}
            />
          </Tools>
        )}
      </div>
      <DiscardDialog open={discardOpen} onOpenChange={setDiscardOpen} onDiscard={props.onClose} />
      {toExport && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          opened={toExport.opened}
          edit={toExport.edit}
          fileName={props.file.name}
          maxOutputBytes={props.maxOutputBytes}
          onSave={props.onSave}
          onDone={props.onClose}
          onError={root.report}
        />
      )}
    </>
  );
}
