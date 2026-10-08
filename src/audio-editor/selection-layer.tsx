import { useRef } from "react";
import { type AudioEdit, boundaries, outputDuration, type Range } from "./edit";
import { dragSelect, moveHandle, segmentAt } from "./selection";
import { timeAt, type View, xAt } from "./view";

export type SelectionLayerProps = {
  view: View;
  state: AudioEdit;
  selection: Range | null;
  playhead: number;
  silence: Range[];
  onSelect: (r: Range | null) => void;
  onSeek: (t: number) => void;
};

/** Below this many pixels of movement a press counts as a click (seek), not a drag. */
const CLICK_PX = 3;

type Drag = {
  pointerId: number;
  x0: number;
  t0: number;
  handle: "start" | "end" | null;
  before: Range | null;
  moved: boolean;
};

/** Left / width in CSS pixels, clipped a little outside the view so huge zooms stay sane. */
function span(view: View, r: Range): React.CSSProperties | null {
  const a = Math.max(-1, xAt(view, r.start));
  const b = Math.min(view.width + 1, xAt(view, r.end));
  if (b <= a) return null;
  return { left: a, width: b - a };
}

export function SelectionLayer(props: SelectionLayerProps): React.JSX.Element {
  const drag = useRef<Drag | null>(null);
  const { view, selection } = props;

  const timeOf = (e: React.PointerEvent | React.MouseEvent) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    return Math.min(outputDuration(props.state), Math.max(0, timeAt(view, x)));
  };
  const targets = () => [...boundaries(props.state), props.playhead];

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (view.secondsPerPixel <= 0) return;
    if (drag.current) {
      // A second finger: hand the gesture to the waveform's pinch zoom, undo this drag.
      props.onSelect(drag.current.before);
      drag.current = null;
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const edge = e.target instanceof HTMLElement ? e.target.dataset.edge : undefined;
    const handle = selection && (edge === "start" || edge === "end") ? edge : null;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      t0: timeOf(e),
      handle,
      before: selection,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < CLICK_PX) return;
    d.moved = true;
    const t = timeOf(e);
    const next =
      d.handle && d.before
        ? moveHandle(d.before, d.handle, t, targets(), view)
        : dragSelect(d.t0, t, targets(), view);
    props.onSelect(next.end > next.start ? next : null);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.moved || d.handle) return;
    props.onSelect(null);
    props.onSeek(d.t0);
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (view.secondsPerPixel <= 0) return;
    props.onSelect(segmentAt(props.state, timeOf(e)));
  };

  const sel = selection && span(view, selection);
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer selection on the waveform; the keyboard path is the transport and tool shortcuts.
    <div
      className="fv-audio-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
    >
      {props.silence.map((r) => {
        const s = span(view, r);
        return s && <div key={`${r.start}-${r.end}`} className="fv-audio-silence" style={s} />;
      })}
      {sel && (
        <div className="fv-audio-selection" style={sel}>
          <div className="fv-audio-handle" data-edge="start" />
          <div className="fv-audio-handle" data-edge="end" />
        </div>
      )}
    </div>
  );
}
