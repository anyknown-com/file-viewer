// The editing surface: the GL canvas with a 2D overlay on top, zoom and pan, and pointer input for tools.
import { useCallback, useRef } from "react";
import type { EditorApi, Mat2D, Point, Size, ViewTransform } from "./api";
import { internalsOf } from "./editor-api";
import { destroyGl } from "./engine/gl/context";
import { VIEW_MAX_PIXELS } from "./limits";
import { overlays, tools } from "./registry";

export type View = { zoom: number; center: Point };

type RenderResult = { unsupported: boolean };
type Props = {
  api: EditorApi;
  view: View;
  onViewChange(view: View): void;
  /** After every frame: whether the document uses an adjustment or effect that is not registered. */
  onRender?(result: RenderResult): void;
};
type Live = {
  view: View;
  onViewChange(view: View): void;
  onRender?(result: RenderResult): void;
  schedule: (() => void) | null;
};

/** The mounted canvas's view, for the hand and zoom tools and the view menu items. */
export type Viewport = {
  view(): View;
  /** The canvas in CSS px. */
  size(): Size;
  /** Zoom is clamped to 1/64–64. */
  setView(view: View): void;
};

const MIN_ZOOM = 1 / 64;
const MAX_ZOOM = 64;
const viewports = new WeakMap<EditorApi, Viewport>();

/** The viewport of the EditorCanvas mounted for `api`; undefined when none is. */
export function viewportOf(api: EditorApi): Viewport | undefined {
  return viewports.get(api);
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const apply = (m: Mat2D, x: number, y: number): Point => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});

/** Document ↔ canvas CSS px for `view` on a `size` canvas; `center` sits in the middle. */
export function toViewTransform(view: View, size: Size, dpr: number): ViewTransform {
  const { zoom, center } = view;
  const e = size.width / 2 - center.x * zoom;
  const f = size.height / 2 - center.y * zoom;
  return {
    zoom,
    dpr,
    docToScreen: [zoom, 0, 0, zoom, e, f],
    screenToDoc: [1 / zoom, 0, 0, 1 / zoom, -e / zoom, -f / zoom],
  };
}

/** `view` zoomed to `zoom` keeping the document point under `at` (CSS px) in place. */
function zoomAt(view: View, size: Size, at: Point, zoom: number): View {
  const p = apply(toViewTransform(view, size, 1).screenToDoc, at.x, at.y);
  const z = clampZoom(zoom);
  return {
    zoom: z,
    center: { x: p.x - (at.x - size.width / 2) / z, y: p.y - (at.y - size.height / 2) / z },
  };
}

function attach(container: HTMLDivElement, overlay: HTMLCanvasElement, api: EditorApi, live: Live) {
  const gl = api.gl;
  const glCanvas = gl.canvas as HTMLCanvasElement;
  glCanvas.classList.add("fv-ie-gl");
  container.insertBefore(glCanvas, overlay);
  const { renderer } = internalsOf(api);
  const ctx = overlay.getContext("2d");
  let size: Size = { width: 0, height: 0 };
  let raf = 0;
  let space = false;
  const touches = new Map<number, Point>();
  let pinch: { distance: number; view: View } | null = null;
  let pan: { from: Point; view: View } | null = null;

  const setView = (next: View) => {
    live.view = next;
    live.onViewChange(next);
    schedule();
  };
  const tool = () => tools().find((t) => t.id === api.session().tool);
  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = overlay.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function paint(c2d: CanvasRenderingContext2D, vt: ViewTransform, time: number) {
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.clearRect(0, 0, overlay.width, overlay.height);
    c2d.setTransform(vt.dpr, 0, 0, vt.dpr, 0, 0);
    for (const o of overlays()) {
      c2d.save();
      o.draw(c2d, vt, api, time);
      c2d.restore();
    }
    const current = tool();
    current?.drawOverlay?.(c2d, vt, api);
    const cursor = current?.cursor;
    const named = typeof cursor === "function" ? cursor(api) : (cursor ?? "default");
    overlay.style.cursor = space || pan ? "grab" : named;
  }

  function draw(time: number) {
    raf = 0;
    if (size.width <= 0 || size.height <= 0) return;
    let ratio = Math.min(devicePixelRatio || 1, 2);
    const area = size.width * size.height * ratio * ratio;
    if (area > VIEW_MAX_PIXELS) ratio *= Math.sqrt(VIEW_MAX_PIXELS / area);
    const w = Math.max(1, Math.round(size.width * ratio));
    const h = Math.max(1, Math.round(size.height * ratio));
    for (const c of [glCanvas, overlay]) {
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
    }
    const vt = toViewTransform(live.view, size, ratio);
    const topLeft = apply(vt.screenToDoc, 0, 0);
    const docRect = { ...topLeft, width: size.width / vt.zoom, height: size.height / vt.zoom };
    // The document's rectangle on screen, for the checkerboard behind the GL canvas (styles.css).
    const corner = apply(vt.docToScreen, 0, 0);
    const { width: docW, height: docH } = api.doc().manifest;
    container.style.setProperty("--fv-ie-doc-x", `${corner.x}px`);
    container.style.setProperty("--fv-ie-doc-y", `${corner.y}px`);
    container.style.setProperty("--fv-ie-doc-w", `${docW * vt.zoom}px`);
    container.style.setProperty("--fv-ie-doc-h", `${docH * vt.zoom}px`);
    const result = renderer.render(
      api.doc(),
      api.session(),
      { framebuffer: null, width: w, height: h, docRect },
      { forExport: false },
    );
    live.onRender?.(result);
    if (ctx) paint(ctx, vt, time);
    if (overlays().some((o) => o.animated?.(api) === true)) schedule();
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(draw);
  }
  live.schedule = schedule;
  internalsOf(api).onFrame(schedule);
  viewports.set(api, {
    view: () => live.view,
    size: () => size,
    setView: (v) => setView({ zoom: clampZoom(v.zoom), center: v.center }),
  });

  const ro = new ResizeObserver(() => {
    size = { width: container.clientWidth, height: container.clientHeight };
    schedule();
  });
  ro.observe(container);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const step = e.ctrlKey ? 0.01 : 0.002;
    setView(zoomAt(live.view, size, local(e), live.view.zoom * Math.exp(-e.deltaY * step)));
  };
  const onDown = (e: PointerEvent) => {
    if (e.isTrusted) overlay.setPointerCapture(e.pointerId);
    if (e.pointerType === "touch") touches.set(e.pointerId, local(e));
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), view: live.view };
      return;
    }
    if (space || e.button === 1) {
      pan = { from: local(e), view: live.view };
      return;
    }
    const doc = apply(toViewTransform(live.view, size, 1).screenToDoc, local(e).x, local(e).y);
    tool()?.onPointerDown?.(doc, e, api);
  };
  const onMove = (e: PointerEvent) => {
    const at = local(e);
    if (touches.has(e.pointerId)) touches.set(e.pointerId, at);
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance;
      return setView(zoomAt(pinch.view, size, mid, pinch.view.zoom * ratio));
    }
    if (pan) {
      const { zoom, center } = pan.view;
      const c = {
        x: center.x - (at.x - pan.from.x) / zoom,
        y: center.y - (at.y - pan.from.y) / zoom,
      };
      return setView({ zoom, center: c });
    }
    const doc = apply(toViewTransform(live.view, size, 1).screenToDoc, at.x, at.y);
    tool()?.onPointerMove?.(doc, e, api);
  };
  const onUp = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    if (pinch || pan) {
      if (touches.size < 2) pinch = null;
      pan = null;
      return schedule();
    }
    const at = local(e);
    const doc = apply(toViewTransform(live.view, size, 1).screenToDoc, at.x, at.y);
    tool()?.onPointerUp?.(doc, e, api);
  };
  const onKey = (e: KeyboardEvent) => {
    if (
      e.code !== "Space" ||
      (e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]")
    )
      return;
    space = e.type === "keydown";
    schedule();
  };

  overlay.addEventListener("wheel", onWheel, { passive: false });
  overlay.addEventListener("pointerdown", onDown);
  overlay.addEventListener("pointermove", onMove);
  overlay.addEventListener("pointerup", onUp);
  overlay.addEventListener("pointercancel", onUp);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  schedule();

  return () => {
    ro.disconnect();
    if (raf) cancelAnimationFrame(raf);
    overlay.removeEventListener("wheel", onWheel);
    overlay.removeEventListener("pointerdown", onDown);
    overlay.removeEventListener("pointermove", onMove);
    overlay.removeEventListener("pointerup", onUp);
    overlay.removeEventListener("pointercancel", onUp);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    internalsOf(api).onFrame(null);
    viewports.delete(api);
    live.schedule = null;
    renderer.dispose();
    renderer.pool.dispose();
    destroyGl(gl);
    glCanvas.remove();
  };
}

/** The GL canvas (`api.gl.canvas`) and the overlay, filling the parent; `view` is controlled. */
export function EditorCanvas({ api, view, onViewChange, onRender }: Props): React.JSX.Element {
  const live = useRef<Live>({ view, onViewChange, onRender, schedule: null });
  const sync = useCallback(
    (overlay: HTMLCanvasElement | null) => {
      if (!overlay) return;
      live.current.view = view;
      live.current.onViewChange = onViewChange;
      live.current.onRender = onRender;
      live.current.schedule?.();
    },
    [view, onViewChange, onRender],
  );
  const mount = useCallback(
    (container: HTMLDivElement | null) => {
      const overlay = container?.querySelector<HTMLCanvasElement>(".fv-ie-overlay");
      if (!container || !overlay) return;
      return attach(container, overlay, api, live.current);
    },
    [api],
  );
  return (
    <div className="fv-ie-canvas" ref={mount}>
      <canvas className="fv-ie-overlay" ref={sync} />
    </div>
  );
}
