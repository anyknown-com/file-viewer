// oxlint-disable-next-line no-unassigned-import -- the font CSS registers Geist for canvas text
import "@fontsource-variable/geist";
import { clipEnd, type Fit, type Project, type TextClip } from "../model/project";
import { type Ticks, ticksToSeconds } from "../model/time";

export const TEXT_FONT = '"Geist Variable", sans-serif';

export type DrawItem =
  | { kind: "video"; assetId: string; seconds: number; fit: Fit }
  | { kind: "image"; assetId: string; x: number; y: number; width: number }
  | { kind: "text"; clip: TextClip };

export type FrameSources = {
  frame(assetId: string, seconds: number): Promise<CanvasImageSource | null>;
  image(assetId: string): Promise<ImageBitmap | null>;
};

const LINE_HEIGHT = 1.2;
const TEXT_PADDING = 0.3;
const TEXT_BACKGROUND = "rgba(0,0,0,0.6)";

/** What to draw at `t`, bottom layer first: the main video, then overlays from the last track to `overlay[0]`. */
export function drawPlan(p: Project, t: Ticks): DrawItem[] {
  const items: DrawItem[] = [];
  const video = p.tracks.main.clips.find((c) => c.start <= t && t < clipEnd(c));
  if (video) {
    items.push({
      kind: "video",
      assetId: video.assetId,
      seconds: ticksToSeconds(t - video.start + video.in),
      fit: video.fit,
    });
  }
  for (let i = p.tracks.overlay.length - 1; i >= 0; i--) {
    const track = p.tracks.overlay[i]!;
    if (track.muted) continue;
    const clip = track.clips.find((c) => c.start <= t && t < clipEnd(c));
    if (!clip) continue;
    if (clip.kind === "text") items.push({ kind: "text", clip });
    else
      items.push({ kind: "image", assetId: clip.assetId, x: clip.x, y: clip.y, width: clip.width });
  }
  return items;
}

/** `fit` letterboxes the source inside the canvas; `fill` covers it and crops the overflow. Both center. */
export function fitRect(
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  fit: Fit,
): { x: number; y: number; w: number; h: number } {
  const scale = fit === "fit" ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

export async function ensureFonts(): Promise<void> {
  await document.fonts.load(`32px ${TEXT_FONT}`);
}

function sourceSize(s: CanvasImageSource): [number, number] {
  if ("displayWidth" in s) return [s.displayWidth, s.displayHeight];
  if ("videoWidth" in s) return [s.videoWidth, s.videoHeight];
  if ("naturalWidth" in s) return [s.naturalWidth, s.naturalHeight];
  const { width, height } = s as { width: number; height: number };
  return [width, height];
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function drawText(ctx: Ctx, clip: TextClip, cw: number, ch: number): void {
  const px = clip.size * ch;
  const lineHeight = px * LINE_HEIGHT;
  const lines = clip.text.split("\n");
  const cx = clip.x * cw;
  const top = clip.y * ch - (lines.length * lineHeight) / 2;
  ctx.font = `${px}px ${TEXT_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (clip.background) {
    const pad = px * TEXT_PADDING;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const h = lines.length * lineHeight + pad * 2;
    ctx.fillStyle = TEXT_BACKGROUND;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, top - pad, w, h, pad);
    ctx.fill();
  }
  ctx.fillStyle = clip.color;
  lines.forEach((line, i) => ctx.fillText(line, cx, top + (i + 0.5) * lineHeight));
}

/** Fetches every source first, then paints the frame in one go so the canvas never shows a half-drawn frame. */
export async function renderFrame(ctx: Ctx, p: Project, t: Ticks, s: FrameSources): Promise<void> {
  const plan = drawPlan(p, t);
  const sources = await Promise.all(
    plan.map((item) =>
      item.kind === "video"
        ? s.frame(item.assetId, item.seconds)
        : item.kind === "image"
          ? s.image(item.assetId)
          : null,
    ),
  );
  const { width: cw, height: ch } = ctx.canvas;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);
  plan.forEach((item, i) => {
    const source = sources[i];
    if (item.kind === "text") return drawText(ctx, item.clip, cw, ch);
    if (!source) return;
    const [sw, sh] = sourceSize(source);
    if (item.kind === "video") {
      const r = fitRect(sw, sh, cw, ch, item.fit);
      ctx.drawImage(source, r.x, r.y, r.w, r.h);
      return;
    }
    const w = item.width * cw;
    const h = (w * sh) / sw;
    ctx.drawImage(source, item.x * cw - w / 2, item.y * ch - h / 2, w, h);
  });
}
