import { useCallback, useSyncExternalStore } from "react";
import { useT } from "../../../i18n/use-t";
import { Slider } from "../../../primitives/slider";
import { videoMessages } from "../../messages";
import { setTrackFlag } from "../../model/edits";
import type { Lane } from "../../model/placement";
import { projectDuration, type Track } from "../../model/project";
import type { EditorSession } from "../session";
import { ClipView } from "./clip-view";
import { ticksToPx } from "./geometry";
import { Ruler } from "./ruler";
import { TrackHeader } from "./track-header";

/** Room after the last clip, so clips can be dragged past the end. */
const TAIL_PX = 400;

const at = (px: number) => `calc(var(--fv-ve-header) + ${px}px)`;

export function Timeline(props: { session: EditorSession }): React.JSX.Element | null {
  const { session } = props;
  const t = useT(videoMessages);
  const subscribe = useCallback((l: () => void) => session.subscribe(l), [session]);
  const state = useSyncExternalStore(subscribe, () => session.state);
  const history = session.history;
  if (!history) return null;

  const p = history.project;
  const pps = state.pixelsPerSecond;
  const width = ticksToPx(projectDuration(p), pps) + TAIL_PX;
  const rows: { track: Track; lane: Lane }[] = [
    ...p.tracks.overlay.map((track) => ({ track, lane: "overlay" as const })),
    { track: p.tracks.main, lane: "main" },
    ...p.tracks.audio.map((track) => ({ track, lane: "audio" as const })),
  ];

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
      <div className="fv-ve-tl-scroll">
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
                <div className="fv-ve-lane">
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
