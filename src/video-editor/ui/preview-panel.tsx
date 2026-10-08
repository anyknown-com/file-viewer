import { useCallback, useSyncExternalStore } from "react";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { Icon } from "../../primitives/icon";
import { Menu, type MenuItem } from "../../primitives/menu";
import { Tooltip } from "../../primitives/tooltip";
import { videoMessages } from "../messages";
import { setAspect } from "../model/edits";
import { type Aspect, projectDuration } from "../model/project";
import { formatTimecode } from "../model/time";
import type { EditorSession } from "./session";

function PlayIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M7 4v16l13-8z" />
    </Icon>
  );
}

function PauseIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M8 5v14M16 5v14" />
    </Icon>
  );
}

const ASPECTS: readonly Aspect[] = ["source", "16:9", "9:16", "1:1"];

export function PreviewPanel(props: { session: EditorSession }): React.JSX.Element | null {
  const { session } = props;
  const t = useT(videoMessages);
  const subscribe = useCallback((l: () => void) => session.subscribe(l), [session]);
  const state = useSyncExternalStore(subscribe, () => session.state);
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => (canvas ? session.player.attach(canvas) : undefined),
    [session],
  );
  const history = session.history;
  if (!history) return null;

  const p = history.project;
  const aspectLabel = (a: Aspect) => (a === "source" ? t("video.preview.aspectSource") : a);
  const items: MenuItem[] = ASPECTS.map((a) => ({
    id: a,
    label: aspectLabel(a),
    onSelect: () => session.run(setAspect(history.project, a)),
  }));
  // `playing` is not part of the session state; pause and every playing frame report a time,
  // which re-renders this panel.
  const playing = session.player.playing;
  const playLabel = t(playing ? "video.preview.pause" : "video.preview.play");

  return (
    <div className="fv-ve-pv">
      <div className="fv-ve-stage">
        {/* Resizing a canvas clears it, so a new size gets a new canvas and a fresh attach. */}
        <canvas
          key={`${p.width}x${p.height}`}
          ref={canvasRef}
          className="fv-ve-canvas"
          width={p.width}
          height={p.height}
        />
      </div>
      <div className="fv-ve-pv-bar">
        <Tooltip content={playLabel}>
          <Button
            variant="ghost"
            aria-label={playLabel}
            icon={playing ? <PauseIcon /> : <PlayIcon />}
            onClick={() => session.player.toggle()}
          />
        </Tooltip>
        <span className="fv-ve-timecode">
          {formatTimecode(state.playhead, p.fps)} / {formatTimecode(projectDuration(p), p.fps)}
        </span>
        <Menu
          trigger={
            <Button variant="ghost" aria-label={t("video.preview.aspect")}>
              {aspectLabel(p.aspect)}
            </Button>
          }
          items={items}
        />
      </div>
    </div>
  );
}
