import { useCallback, useState, useSyncExternalStore } from "react";
import { useT } from "../../../i18n/use-t";
import { Slider } from "../../../primitives/slider";
import { videoMessages } from "../../messages";
import { setTrackFlag } from "../../model/edits";
import type { Lane } from "../../model/placement";
import { projectDuration, type Track } from "../../model/project";
import { ASSET_MIME, addAt } from "../asset-panel";
import type { EditorSession } from "../session";
import { ClipView } from "./clip-view";
import { pxToTicks, ticksToPx } from "./geometry";
import { Ruler } from "./ruler";
import { TrackHeader } from "./track-header";

/** Room after the last clip, so clips can be dragged past the end. */
const TAIL_PX = 400;

const at = (px: number) => `calc(var(--fv-ve-header) + ${px}px)`;

/** The scrolled-to part of the timeline, in px from its left edge (the header column included). */
type View = { left: number; width: number };

function onDragOver(e: React.DragEvent<HTMLDivElement>): void {
  if (!e.dataTransfer.types.includes(ASSET_MIME)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
}

export function Timeline(props: { session: EditorSession }): React.JSX.Element | null {
  const { session } = props;
  const t = useT(videoMessages);
  const subscribe = useCallback((l: () => void) => session.subscribe(l), [session]);
  const state = useSyncExternalStore(subscribe, () => session.state);
  const [view, setView] = useState<View>({ left: 0, width: 0 });
  const scrollRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setView({ left: el.scrollLeft, width: entry.contentRect.width });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const history = session.history;
  if (!history) return null;

  const p = history.project;
  const pps = state.pixelsPerSecond;
  const width = ticksToPx(projectDuration(p), pps) + TAIL_PX;
  // The header column covers the first part of the view; counting it only fetches a little more.
  const visibleFrom = pxToTicks(view.left, pps);
  const visibleTo = pxToTicks(view.left + view.width, pps);
  const rows: { track: Track; lane: Lane }[] = [
    ...p.tracks.overlay.map((track) => ({ track, lane: "overlay" as const })),
    { track: p.tracks.main, lane: "main" },
    ...p.tracks.audio.map((track) => ({ track, lane: "audio" as const })),
  ];

  const onDrop = (e: React.DragEvent<HTMLDivElement>, track: Track, lane: Lane) => {
    const id = e.dataTransfer.getData(ASSET_MIME);
    if (!id) return;
    e.preventDefault();
    const time = pxToTicks(e.clientX - e.currentTarget.getBoundingClientRect().left, pps);
    void addAt(session, id, Math.max(0, time), { id: track.id, lane });
  };

  return (
    <div className="fv-ve-tl">
      <div className="fv-ve-tl-bar">
        <div className="fv-ve-tl-zoom">
          <Slider
            label={t("video.timeline.zoom")}
            value={pps}
            min={5}
            max={400}
            onValueChange={(v) => session.setZoom(v)}
          />
        </div>
      </div>
      <div
        ref={scrollRef}
        className="fv-ve-tl-scroll"
        onScroll={(e) => setView({ ...view, left: e.currentTarget.scrollLeft })}
      >
        <div className="fv-ve-tl-content" style={{ inlineSize: at(width) }}>
          <div className="fv-ve-tl-ruler-row">
            <div className="fv-ve-tl-corner" />
            <Ruler
              pps={pps}
              fps={p.fps}
              width={width}
              onSeek={(time) => session.player.seek(time)}
            />
          </div>
          <div className="fv-ve-tracks">
            {rows.map(({ track, lane }) => (
              <div key={track.id} className="fv-ve-track" data-track-id={track.id} data-lane={lane}>
                <TrackHeader
                  track={track}
                  lane={lane}
                  onFlag={(flag, value) => session.run(setTrackFlag(p, track.id, flag, value))}
                />
                <div
                  className="fv-ve-lane"
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, track, lane)}
                >
                  {track.clips.map((clip) => (
                    <ClipView
                      key={clip.id}
                      session={session}
                      project={p}
                      track={track}
                      clip={clip}
                      pps={pps}
                      playhead={state.playhead}
                      selected={state.selection.has(clip.id)}
                      visibleFrom={visibleFrom}
                      visibleTo={visibleTo}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div
            className="fv-ve-playhead"
            style={{ insetInlineStart: at(ticksToPx(state.playhead, pps)) }}
          />
          {state.snapLine === null ? null : (
            <div
              className="fv-ve-snapline"
              data-testid="fv-ve-snapline"
              style={{ insetInlineStart: at(ticksToPx(state.snapLine, pps)) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
