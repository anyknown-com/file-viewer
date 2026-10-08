import { useCallback } from "react";
import { type AudioClip, type Clip, clipLength, type VideoClip } from "../../model/project";
import { type Ticks, ticksToSeconds } from "../../model/time";
import type { EditorSession } from "../session";
import { pxToTicks, ticksToPx } from "./geometry";

/** One thumbnail per this many px of clip. */
export const TILE_PX = 64;
/** The waveform is fetched in chunks this wide, so scrolling within one does not refetch. */
const WAVE_CHUNK_PX = 512;
/** Px per waveform bar. */
const BAR_PX = 2;

type Span = { from: number; to: number }; // px from the clip's start

const sourceSeconds = (clip: VideoClip | AudioClip, px: number, pps: number) =>
  ticksToSeconds(clip.in + pxToTicks(px, pps));

/** Thumbnail tiles whose centre is on screen: never asks for frames the user cannot see. */
export function visibleTiles(visible: Span, length: number): number[] {
  const tiles: number[] = [];
  const first = Math.max(0, Math.ceil((visible.from - TILE_PX / 2) / TILE_PX));
  for (let i = first; (i + 0.5) * TILE_PX <= Math.min(visible.to, length); i++) tiles.push(i);
  return tiles;
}

/** Draws `draw` once its data arrives; a new key (range, zoom, asset) means a new canvas. */
function useAsyncCanvas<T>(
  key: string,
  load: () => Promise<T>,
  draw: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, data: T) => void,
): (canvas: HTMLCanvasElement | null) => (() => void) | undefined {
  // `load` and `draw` close over the same values `key` encodes.
  /* oxlint-disable react-hooks/exhaustive-deps */
  return useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return undefined;
      let live = true;
      load().then(
        (data) => {
          const ctx = live ? canvas.getContext("2d") : null;
          if (ctx) draw(ctx, canvas, data);
        },
        // A clip whose media cannot be read shows that through the asset status instead.
        () => undefined,
      );
      return () => {
        live = false;
      };
    },
    [key],
  );
  /* oxlint-enable react-hooks/exhaustive-deps */
}

function Thumbs(props: {
  session: EditorSession;
  clip: VideoClip;
  pps: number;
  visible: Span;
}): React.JSX.Element | null {
  const { session, clip, pps } = props;
  const length = ticksToPx(clipLength(clip), pps);
  const tiles = visibleTiles(props.visible, length);
  const seconds = tiles.map((i) => sourceSeconds(clip, (i + 0.5) * TILE_PX, pps));
  const left = (tiles[0] ?? 0) * TILE_PX;
  const width = Math.min(length, ((tiles.at(-1) ?? 0) + 1) * TILE_PX) - left;
  const ref = useAsyncCanvas(
    `${clip.assetId}|${seconds.join(",")}|${left}|${width}`,
    () => session.thumbs.strip(clip.assetId, seconds),
    (ctx, canvas, bitmaps) => {
      bitmaps.forEach((bitmap, n) => {
        if (!bitmap) return;
        // Cover the tile: crop the frame's width to the tile's shape.
        const w = Math.min(bitmap.width, (bitmap.height * TILE_PX) / canvas.height);
        const x = tiles[n]! * TILE_PX - left;
        ctx.drawImage(
          bitmap,
          (bitmap.width - w) / 2,
          0,
          w,
          bitmap.height,
          x,
          0,
          TILE_PX,
          canvas.height,
        );
      });
    },
  );
  if (tiles.length === 0) return null;
  return (
    <canvas
      ref={ref}
      className="fv-ve-thumbs"
      width={Math.round(width)}
      height={40}
      style={{ insetInlineStart: left, inlineSize: width }}
    />
  );
}

function Wave(props: {
  session: EditorSession;
  clip: VideoClip | AudioClip;
  pps: number;
  visible: Span;
  half: boolean;
}): React.JSX.Element | null {
  const { session, clip, pps } = props;
  const length = ticksToPx(clipLength(clip), pps);
  const left = Math.max(0, Math.floor(props.visible.from / WAVE_CHUNK_PX) * WAVE_CHUNK_PX);
  const right = Math.min(length, Math.ceil(props.visible.to / WAVE_CHUNK_PX) * WAVE_CHUNK_PX);
  const width = right - left;
  const buckets = Math.max(1, Math.round(width / BAR_PX));
  const from = sourceSeconds(clip, left, pps);
  const to = sourceSeconds(clip, right, pps);
  const ref = useAsyncCanvas(
    `${clip.assetId}|${from}|${to}|${buckets}`,
    () => session.thumbs.peaks(clip.assetId, from, to, buckets),
    (ctx, canvas, peaks) => {
      ctx.fillStyle = getComputedStyle(canvas).color;
      const bar = canvas.width / peaks.length;
      peaks.forEach((peak, i) => {
        const h = Math.max(1, peak * canvas.height);
        ctx.fillRect(i * bar, (canvas.height - h) / 2, Math.max(1, bar - 0.5), h);
      });
    },
  );
  if (width <= 0) return null;
  return (
    <canvas
      ref={ref}
      className="fv-ve-wave"
      data-half={props.half || undefined}
      width={Math.round(width)}
      height={props.half ? 20 : 40}
      style={{ insetInlineStart: left, inlineSize: width }}
    />
  );
}

function ImageThumb(props: { session: EditorSession; assetId: string }): React.JSX.Element {
  const { session, assetId } = props;
  const ref = useAsyncCanvas(
    assetId,
    () => session.assets.image(assetId),
    (ctx, canvas, bitmap) => {
      canvas.width = Math.max(1, Math.round((bitmap.width / bitmap.height) * canvas.height));
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    },
  );
  return <canvas ref={ref} className="fv-ve-image-thumb" height={40} width={1} />;
}

/**
 * What a clip shows of its media: a thumbnail strip, a waveform or an image. Only the part
 * between `visibleFrom` and `visibleTo` (timeline ticks) is fetched and drawn.
 */
export function ClipMedia(props: {
  session: EditorSession;
  clip: Clip;
  pps: number;
  visibleFrom: Ticks;
  visibleTo: Ticks;
}): React.JSX.Element | null {
  const { session, clip, pps } = props;
  if (clip.kind === "text") return null;
  if (clip.kind === "image") return <ImageThumb session={session} assetId={clip.assetId} />;

  const visible: Span = {
    from: ticksToPx(props.visibleFrom - clip.start, pps),
    to: ticksToPx(props.visibleTo - clip.start, pps),
  };
  if (visible.to <= 0 || visible.from >= ticksToPx(clipLength(clip), pps)) return null;
  if (clip.kind === "audio") {
    return (
      <div className="fv-ve-media">
        <Wave session={session} clip={clip} pps={pps} visible={visible} half={false} />
      </div>
    );
  }
  const status = session.assets.status(clip.assetId);
  const hasAudio = status.state === "ready" && status.info.hasAudio;
  return (
    <div className="fv-ve-media">
      <Thumbs session={session} clip={clip} pps={pps} visible={visible} />
      {hasAudio ? <Wave session={session} clip={clip} pps={pps} visible={visible} half /> : null}
    </div>
  );
}
