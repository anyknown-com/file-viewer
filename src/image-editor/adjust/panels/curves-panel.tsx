import { useRef, useState } from "react";
import { useT } from "../../../i18n/use-t";
import type { EditorApi, Layer } from "../../api";
import { setAdjustment } from "../commands";
import { curveSample } from "../curves";
import { adjustMessages } from "../messages";
import { type Channel, ChannelSelect, channelIndex } from "./channel-select";

type Point = { x: number; y: number };
type Drag = { index: number; points: Point[] };

const MIN_POINTS = 2;
const MAX_POINTS = 32;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

// Keeps x strictly ascending: a point stays between its neighbours.
function moved(points: Point[], index: number, x: number, y: number): Point[] {
  const lo = (points[index - 1]?.x ?? -1) + 1;
  const hi = (points[index + 1]?.x ?? 256) - 1;
  return points.map((p, i) => (i === index ? { x: clamp(x, lo, hi), y: clamp(y, 0, 255) } : p));
}

function NumberField(props: { label: string; value: number; onCommit: (v: number) => void }) {
  return (
    <label className="fv-ie-adj-color">
      <span>{props.label}</span>
      <input
        type="number"
        min={0}
        max={255}
        step={1}
        aria-label={props.label}
        ref={(el) => {
          if (!el) return;
          el.value = String(props.value);
          const onChange = () => {
            if (el.value !== "") props.onCommit(Number(el.value));
          };
          el.addEventListener("change", onChange);
          return () => el.removeEventListener("change", onChange);
        }}
      />
    </label>
  );
}

export function CurvesPanel({ layer, api }: { layer: Layer; api: EditorApi }): React.JSX.Element {
  const t = useT(adjustMessages);
  const [channel, setChannel] = useState<Channel>(layer.adjustment?.curves.channel ?? "RGB");
  const [selected, setSelected] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const adjustment = layer.adjustment;
  if (!adjustment) return <></>;
  const index = channelIndex(channel);
  const stored: Point[] = adjustment.curves.channels[index] ?? [];
  const points = drag?.points ?? stored;
  const current = () => api.doc().manifest.layers.find((l) => l.id === layer.id)?.adjustment;

  const latest = (): Point[] => current()?.curves.channels[index] ?? stored;
  const write = (next: Point[], label?: "image.adjust.change") => {
    const base = current();
    if (!base) return;
    const channels = base.curves.channels.map((c, i) => (i === index ? next : c));
    api.dispatch(
      setAdjustment(layer.id, { ...base, curves: { ...base.curves, channel, channels } }),
      label,
    );
  };

  const start = (e: React.PointerEvent, at: number | null) => {
    const rect = (svgRef.current ?? e.currentTarget).getBoundingClientRect();
    const toCurve = (cx: number, cy: number): Point => ({
      x: ((cx - rect.left) / rect.width) * 255,
      y: (1 - (cy - rect.top) / rect.height) * 255,
    });
    let working = [...latest()];
    let i = at;
    if (i === null) {
      if (working.length >= MAX_POINTS) return;
      const p = toCurve(e.clientX, e.clientY);
      const x = clamp(p.x, 0, 255);
      if (working.some((q) => q.x === x)) return;
      working = [...working, { x, y: clamp(p.y, 0, 255) }].toSorted((a, b) => a.x - b.x);
      i = working.findIndex((q) => q.x === x);
    }
    const dragged = i;
    setSelected(dragged);
    setDrag({ index: dragged, points: working });
    if (at === null) write(working);
    const onMove = (ev: PointerEvent) => {
      const p = toCurve(ev.clientX, ev.clientY);
      working = moved(working, dragged, p.x, p.y);
      setDrag({ index: dragged, points: working });
      write(working);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const inside =
        ev.clientX >= rect.left &&
        ev.clientX <= rect.right &&
        ev.clientY >= rect.top &&
        ev.clientY <= rect.bottom;
      setDrag(null);
      if (!inside && working.length > MIN_POINTS) {
        working = working.filter((_, k) => k !== dragged);
        setSelected(Math.max(0, dragged - 1));
      }
      write(working, "image.adjust.change");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const key = (e: React.KeyboardEvent, i: number) => {
    const d = e.shiftKey ? 10 : 1;
    const pts = latest();
    const p = pts[i];
    if (!p) return;
    const delta: Record<string, [number, number]> = {
      ArrowUp: [0, d],
      ArrowDown: [0, -d],
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
    };
    const step = delta[e.key];
    if (!step) return;
    e.preventDefault();
    write(moved(pts, i, p.x + step[0], p.y + step[1]), "image.adjust.change");
  };

  const sel = points[selected] ?? points[0];
  const path = Array.from(
    { length: 256 },
    (_, x) => `${x === 0 ? "M" : "L"}${x} ${255 - curveSample(points, x)}`,
  ).join("");
  return (
    <div className="fv-ie-adj-fields">
      <ChannelSelect value={channel} onChange={setChannel} />
      <svg
        className="fv-ie-adj-curve"
        ref={svgRef}
        viewBox="0 0 255 255"
        aria-label={t("image.adjust.curves.grid")}
        onPointerDown={(e) => start(e, null)}
      >
        <rect className="fv-ie-adj-curve-bg" x={0} y={0} width={255} height={255} />
        <path className="fv-ie-adj-curve-line" d={path} />
        {points.map((p, i) => (
          <circle
            key={p.x}
            className="fv-ie-adj-curve-point"
            data-selected={i === selected}
            cx={p.x}
            cy={255 - p.y}
            r={5}
            tabIndex={0}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an SVG handle cannot be an <input>
            role="slider"
            aria-label={t("image.adjust.curves.point")}
            aria-valuemin={0}
            aria-valuemax={255}
            aria-valuenow={p.y}
            aria-valuetext={`${p.x}, ${p.y}`}
            onFocus={() => setSelected(i)}
            onKeyDown={(e) => key(e, i)}
            onPointerDown={(e) => {
              e.stopPropagation();
              start(e, i);
            }}
          />
        ))}
      </svg>
      {sel ? (
        <div className="fv-ie-adj-field" key={`${selected}:${sel.x}:${sel.y}`}>
          <NumberField
            label={t("image.adjust.curves.input")}
            value={sel.x}
            onCommit={(v) =>
              write(
                moved(latest(), selected, v, latest()[selected]?.y ?? sel.y),
                "image.adjust.change",
              )
            }
          />
          <NumberField
            label={t("image.adjust.curves.output")}
            value={sel.y}
            onCommit={(v) =>
              write(
                moved(latest(), selected, latest()[selected]?.x ?? sel.x, v),
                "image.adjust.change",
              )
            }
          />
        </div>
      ) : null}
    </div>
  );
}
