import { useCallback, useRef } from "react";
import { useT } from "../i18n/use-t";
import { Progress } from "../primitives/progress";
import type { AudioEdit } from "./edit";
import { audioMessages } from "./messages";
import type { Peaks } from "./peaks";
import { clampView, columns, fitView, timeAt, type View, xAt } from "./view";
import { fitCanvas, paintColumns, readColors } from "./waveform";

export type OverviewProps = {
  peaks: Peaks | null;
  progress: number;
  state: AudioEdit;
  duration: number;
  view: View;
  onViewChange: (v: View) => void;
};

/** The view's left and right edge on the overview, in CSS pixels. */
function frameOf(full: View, view: View): [number, number] {
  return [xAt(full, view.start), xAt(full, timeAt(view, view.width))];
}

export function Overview(props: OverviewProps): React.JSX.Element {
  const t = useT(audioMessages);
  const latest = useRef(props);
  // oxlint-disable-next-line react/refs -- the canvas loop reads the newest props without re-creating itself.
  latest.current = props;

  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let drawn: unknown[] = [];
    let grab: number | null = null;
    const full = () => fitView(latest.current.duration, canvas.clientWidth);

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const p = latest.current;
      const key = [p.peaks, p.state, p.view, p.duration, canvas.clientWidth, canvas.clientHeight];
      if (key.every((v, i) => v === drawn[i])) return;
      drawn = key;
      const { w, h } = fitCanvas(canvas, ctx);
      const colors = readColors(canvas);
      const whole = full();
      paintColumns(ctx, p.peaks && w > 0 ? columns(p.peaks, p.state, whole) : null, w, h, colors);
      if (p.view.width <= 0 || whole.secondsPerPixel <= 0) return;
      const [x0, x1] = frameOf(whole, p.view);
      ctx.fillStyle = colors.frame;
      ctx.fillRect(x0, 0, x1 - x0, h);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, 0.5, Math.max(0, x1 - x0 - 1), h - 1);
    };
    frame = requestAnimationFrame(tick);

    const moveTo = (clientX: number) => {
      const p = latest.current;
      const whole = full();
      if (grab === null || whole.secondsPerPixel <= 0) return;
      const x = clientX - canvas.getBoundingClientRect().left;
      p.onViewChange(clampView({ ...p.view, start: timeAt(whole, x - grab) }, p.duration));
    };
    const onDown = (e: PointerEvent) => {
      const whole = full();
      if (whole.secondsPerPixel <= 0) return;
      canvas.setPointerCapture(e.pointerId);
      const x = e.clientX - canvas.getBoundingClientRect().left;
      const [x0, x1] = frameOf(whole, latest.current.view);
      grab = x >= x0 && x <= x1 ? x - x0 : (x1 - x0) / 2;
      moveTo(e.clientX);
    };
    const onMove = (e: PointerEvent) => moveTo(e.clientX);
    const onUp = () => {
      grab = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div className="fv-audio-overview">
      {props.progress < 1 && <Progress label={t("audio.scanning")} value={props.progress} />}
      <canvas ref={canvasRef} className="fv-audio-canvas" aria-hidden="true" />
    </div>
  );
}
