import { formatTimecode, secondsToTicks, type Ticks } from "../../model/time";
import { pxToTicks } from "./geometry";

const STEPS = [1, 5, 10, 30, 60];
/** Labels need about this much room; the step is the smallest one that leaves it. */
const MIN_LABEL_PX = 80;

export function rulerStep(pps: number): number {
  return STEPS.find((s) => s * pps >= MIN_LABEL_PX) ?? STEPS[STEPS.length - 1]!;
}

/** Time ruler. Pressing it seeks; dragging keeps seeking, so it is also the playhead handle. */
export function Ruler(props: {
  pps: number;
  fps: number;
  width: number;
  onSeek(t: Ticks): void;
}): React.JSX.Element {
  const step = rulerStep(props.pps);
  const marks: number[] = [];
  for (let sec = 0; sec * props.pps <= props.width; sec += step) marks.push(sec);

  const seekAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    props.onSeek(Math.max(0, pxToTicks(x, props.pps)));
  };

  return (
    <div
      className="fv-ve-ruler"
      data-testid="fv-ve-ruler"
      style={{ inlineSize: props.width }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekAt(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(e);
      }}
    >
      {marks.map((sec) => (
        <span key={sec} className="fv-ve-ruler-mark" style={{ insetInlineStart: sec * props.pps }}>
          {formatTimecode(secondsToTicks(sec), props.fps)}
        </span>
      ))}
    </div>
  );
}
