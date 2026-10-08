import { useState } from "react";
import { moveClip, trimClip } from "../../model/edits";
import { type Lane, laneOf } from "../../model/placement";
import { type Clip, clipEnd, type Project, type Track } from "../../model/project";
import { buildSnapPoints, type SnapPoint } from "../../model/snapping";
import type { Ticks } from "../../model/time";
import type { EditorSession } from "../session";
import { dragMove, dragTrim, ticksToPx } from "./geometry";

/** Pressing within this many px of a clip's edge trims instead of moving. */
const EDGE_PX = 6;

type Mode = "move" | "start" | "end";
type Drag = { mode: Mode; x0: number; points: SnapPoint[]; at: Ticks };

function clipLabel(session: EditorSession, clip: Clip): string {
  if (clip.kind === "text") return clip.text;
  const status = session.assets.status(clip.assetId);
  return status.state === "ready" ? status.info.name : clip.assetId;
}

/** The track row under the pointer if it holds clips of the same lane, else the clip's own track. */
function targetTrack(el: Element, clientY: number, lane: Lane, fallback: string): string {
  const rows = el.closest(".fv-ve-tracks")?.querySelectorAll<HTMLElement>("[data-track-id]") ?? [];
  for (const row of rows) {
    const r = row.getBoundingClientRect();
    if (clientY >= r.top && clientY < r.bottom && row.dataset.lane === lane) {
      return row.dataset.trackId ?? fallback;
    }
  }
  return fallback;
}

export function ClipView(props: {
  session: EditorSession;
  project: Project;
  track: Track;
  clip: Clip;
  pps: number;
  playhead: Ticks;
  selected: boolean;
}): React.JSX.Element {
  const { session, project, track, clip, pps } = props;
  const [drag, setDrag] = useState<Drag | null>(null);
  const end = clipEnd(clip);

  const resolve = (d: Drag, clientX: number): { at: Ticks; snapLine: Ticks | null } => {
    const dxPx = clientX - d.x0;
    if (d.mode === "move") {
      const r = dragMove({ clip, dxPx, pps, points: d.points, playhead: props.playhead });
      return { at: r.start, snapLine: r.snapLine };
    }
    const r = dragTrim({ clip, edge: d.mode, dxPx, pps, points: d.points });
    return { at: r.to, snapLine: r.snapLine };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    session.select([clip.id], e.shiftKey);
    if (track.locked) return;
    const width = ticksToPx(end - clip.start, pps);
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let mode: Mode = "move";
    if (width > EDGE_PX * 3 && x <= EDGE_PX) mode = "start";
    else if (width > EDGE_PX * 3 && x >= width - EDGE_PX) mode = "end";
    e.currentTarget.setPointerCapture(e.pointerId);
    const points = buildSnapPoints(project.tracks, props.playhead, new Set([clip.id]));
    setDrag({ mode, x0: e.clientX, points, at: mode === "end" ? end : clip.start });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const r = resolve(drag, e.clientX);
    setDrag({ ...drag, at: r.at });
    session.setSnapLine(r.snapLine);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag(null);
    session.setSnapLine(null);
    if (e.clientX === drag.x0) return;
    const { at } = resolve(drag, e.clientX);
    if (drag.mode === "move") {
      const target = targetTrack(e.currentTarget, e.clientY, laneOf(clip), track.id);
      session.run(moveClip(project, clip.id, target, at));
      return;
    }
    const status = clip.kind === "text" ? null : session.assets.status(clip.assetId);
    const duration = status?.state === "ready" ? status.info.duration : null;
    session.run(trimClip(project, clip.id, drag.mode, at, duration));
  };

  const onPointerCancel = () => {
    setDrag(null);
    session.setSnapLine(null);
  };

  // While dragging, draw where the clip would land; the model clamps it on release.
  let start = clip.start;
  let stop = end;
  if (drag?.mode === "move") {
    start = drag.at;
    stop = drag.at + (end - clip.start);
  } else if (drag?.mode === "start") {
    start = Math.min(drag.at, end);
  } else if (drag?.mode === "end") {
    stop = Math.max(drag.at, clip.start);
  }

  const label = clipLabel(session, clip);
  return (
    <div
      className="fv-ve-clip"
      data-kind={clip.kind}
      data-selected={props.selected || undefined}
      data-dragging={drag ? true : undefined}
      title={label}
      style={{ insetInlineStart: ticksToPx(start, pps), inlineSize: ticksToPx(stop - start, pps) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className="fv-ve-clip-label">{label}</span>
    </div>
  );
}
