import { type ReactNode, useCallback, useRef } from "react";
import { useT } from "../i18n/use-t";
import { toMediaError } from "../media";
import { useRoot } from "../primitives/root-context";
import { type AudioEdit, type Range, sourceAt } from "./edit";
import { audioMessages } from "./messages";
import type { Peaks } from "./peaks";
import {
  clampView,
  type Columns,
  columns,
  fitView,
  sampleColumns,
  scroll,
  timeAt,
  type View,
  xAt,
  zoom,
} from "./view";
import type { ZoomWindow } from "./zoom-window";

export type WaveformProps = {
  peaks: Peaks | null;
  progress: number;
  state: AudioEdit;
  view: View;
  duration: number;
  sampleRate: number;
  zoomWindow: ZoomWindow;
  onViewChange: (v: View) => void;
  playhead: () => number;
  overlay?: ReactNode;
};

export type Colors = { surface: string; wave: string; seam: string; accent: string; frame: string };

const LINE_PX = 16;
const WHEEL_ZOOM = 0.002;
/** Past this many seconds of source per visible second (a long cut in view) the peaks are used. */
const MAX_WINDOW_SPREAD = 4;

export function readColors(el: Element): Colors {
  const s = getComputedStyle(el);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    surface: v("--ak-surface"),
    wave: v("--ak-text-muted"),
    seam: v("--ak-border-strong"),
    accent: v("--ak-accent"),
    frame: v("--ak-accent-subtle"),
  };
}

/** Sizes the backing store to the CSS box × devicePixelRatio; returns the CSS size. */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): { w: number; h: number } {
  const dpr = devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

export function paintColumns(
  ctx: CanvasRenderingContext2D,
  cols: Columns | null,
  w: number,
  h: number,
  colors: Colors,
): void {
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, w, h);
  if (!cols) return;
  const mid = h / 2;
  ctx.fillStyle = colors.wave;
  for (let x = 0; x < cols.max.length; x++) {
    const top = mid - Math.min(1, cols.max[x]) * mid;
    const bottom = mid - Math.max(-1, cols.min[x]) * mid;
    ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
  }
  ctx.fillStyle = colors.seam;
  for (const x of cols.seams) ctx.fillRect(Math.round(x), 0, 1, h);
}

/** The source range on screen, or null when a long cut sits inside it. */
function visibleSource(p: WaveformProps): Range | null {
  const end = Math.min(timeAt(p.view, p.view.width), p.duration);
  const a = sourceAt(p.state, p.view.start);
  const b = sourceAt(p.state, end);
  if (!a || !b || b.source <= a.source) return null;
  if (b.source - a.source > MAX_WINDOW_SPREAD * (end - p.view.start)) return null;
  return { start: a.source, end: b.source };
}

export function Waveform(props: WaveformProps): React.JSX.Element {
  const t = useT(audioMessages);
  const root = useRoot();
  const latest = useRef({ props, report: root.report });
  // oxlint-disable-next-line react/refs -- the canvas loop reads the newest props without re-creating itself.
  latest.current = { props, report: root.report };

  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    const wrap = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;
    let frame = 0;
    let drawn: unknown[] = [];
    let version = 0;
    let loading: Range | null = null;
    let loader: AbortController | null = null;
    let sent: { base: View; next: View } | null = null;
    const pointers = new Map<number, number>();
    let pinch: number | null = null;

    const view = () => {
      const v = latest.current.props.view;
      return sent && sent.base === v ? sent.next : v;
    };
    const setView = (next: View) => {
      sent = { base: latest.current.props.view, next };
      latest.current.props.onViewChange(next);
    };

    const requestWindow = (p: WaveformProps, range: Range) => {
      if (loading && loading.start <= range.start && loading.end >= range.end) return;
      loader?.abort();
      const pad = range.end - range.start;
      const want = { start: Math.max(0, range.start - pad), end: range.end + pad };
      const ac = new AbortController();
      loading = want;
      loader = ac;
      void (async () => {
        try {
          await p.zoomWindow.load(want, ac.signal);
          version++;
        } catch (e) {
          if (!ac.signal.aborted) latest.current.report(toMediaError(e, "decode_failed"));
        }
      })();
    };

    const cols = (p: WaveformProps): Columns | null => {
      if (!p.peaks || p.view.secondsPerPixel <= 0) return null;
      if (p.view.secondsPerPixel * p.peaks.sampleRate < p.peaks.levels[0].framesPerBin) {
        const range = visibleSource(p);
        const planes = range && p.zoomWindow.get(range);
        if (range && planes) {
          return sampleColumns(planes, range.start, p.sampleRate, p.state, p.view);
        }
        if (range) requestWindow(p, range);
      }
      return columns(p.peaks, p.state, p.view);
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const p = latest.current.props;
      const head = p.playhead();
      const key = [p.peaks, p.state, p.view, p.duration, head, version, canvas.clientWidth];
      if (key.length === drawn.length && key.every((v, i) => v === drawn[i])) return;
      drawn = key;
      const { w, h } = fitCanvas(canvas, ctx);
      const colors = readColors(canvas);
      paintColumns(ctx, cols(p), w, h, colors);
      const x = xAt(p.view, head);
      if (x >= 0 && x <= w) {
        ctx.fillStyle = colors.accent;
        ctx.fillRect(Math.round(x) - 1, 0, 2, h);
      }
    };
    frame = requestAnimationFrame(tick);

    const ro = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const p = latest.current.props;
      const v = view();
      if (width === v.width) return;
      const fresh = v.width === 0 || v.secondsPerPixel === 0;
      setView(fresh ? fitView(p.duration, width) : clampView({ ...v, width }, p.duration));
    });
    ro.observe(wrap);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = latest.current.props;
      const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? wrap.clientWidth : 1;
      if (e.ctrlKey || e.metaKey) {
        const x = e.clientX - wrap.getBoundingClientRect().left;
        const factor = Math.exp(e.deltaY * scale * WHEEL_ZOOM);
        setView(zoom(view(), factor, x, p.duration, p.sampleRate));
      } else {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        setView(scroll(view(), d * scale, p.duration));
      }
    };
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, e.clientX);
      pinch = null;
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e.clientX);
      if (pointers.size !== 2) return;
      const [a, b] = [...pointers.values()];
      const dist = Math.abs(a - b);
      if (pinch !== null && dist > 0) {
        const p = latest.current.props;
        const mid = (a + b) / 2 - wrap.getBoundingClientRect().left;
        setView(zoom(view(), pinch / dist, mid, p.duration, p.sampleRate));
      }
      pinch = dist;
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = null;
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      loader?.abort();
      wrap.removeEventListener("wheel", onWheel);
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div className="fv-audio-wave">
      <canvas
        ref={canvasRef}
        className="fv-audio-canvas"
        aria-label={t("audio.waveform")}
        aria-busy={props.progress < 1}
      />
      {props.overlay}
    </div>
  );
}
