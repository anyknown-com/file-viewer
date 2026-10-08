import { useCallback, useRef, useState } from "react";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";
import { Tooltip } from "../primitives/tooltip";
import type { Range } from "./edit";
import { LoopIcon, PauseIcon, PlayIcon, ToEndIcon, ToStartIcon } from "./glyphs";
import { audioMessages } from "./messages";
import type { Player } from "./player";

export type TransportProps = {
  player: Player | null;
  duration: number;
  selection: Range | null;
  loop: boolean;
  onLoopChange: (on: boolean) => void;
};

/** `m:ss.mmm`. */
export function timecode(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

/** Plays from the current position, or pauses; the player starts over when it sits at the end. */
export function togglePlay(player: Player): void {
  if (player.playing()) player.pause();
  else player.play(player.position());
}

export function Transport(props: TransportProps): React.JSX.Element {
  const t = useT(audioMessages);
  const { player } = props;
  const [playing, setPlaying] = useState(false);
  const latest = useRef(playing);
  // oxlint-disable-next-line react/refs -- the frame loop compares against the newest render.
  latest.current = playing;

  // Display only: the player stops and schedules on its own timer, so a stalled frame never matters.
  const positionRef = useCallback(
    (el: HTMLSpanElement | null) => {
      if (!el || !player) return;
      let frame = 0;
      let shown = "";
      const tick = () => {
        frame = requestAnimationFrame(tick);
        const text = timecode(player.position());
        if (text !== shown) el.textContent = shown = text;
        if (player.playing() !== latest.current) setPlaying(player.playing());
      };
      tick();
      return () => cancelAnimationFrame(frame);
    },
    [player],
  );

  const toggle = () => {
    if (!player) return;
    togglePlay(player);
    setPlaying(player.playing());
  };
  const playLabel = t(playing ? "audio.pause" : "audio.play");
  const sel = props.selection;

  return (
    <>
      <Tooltip content={playLabel}>
        <Button
          variant="ghost"
          aria-label={playLabel}
          icon={playing ? <PauseIcon /> : <PlayIcon />}
          disabled={!player}
          onClick={toggle}
        />
      </Tooltip>
      <Tooltip content={t("audio.loop")}>
        <Button
          variant="ghost"
          aria-label={t("audio.loop")}
          aria-pressed={props.loop}
          icon={<LoopIcon />}
          onClick={() => props.onLoopChange(!props.loop)}
        />
      </Tooltip>
      <Tooltip content={t("audio.toStart")}>
        <Button
          variant="ghost"
          aria-label={t("audio.toStart")}
          icon={<ToStartIcon />}
          disabled={!player}
          onClick={() => player?.seek(0)}
        />
      </Tooltip>
      <Tooltip content={t("audio.toEnd")}>
        <Button
          variant="ghost"
          aria-label={t("audio.toEnd")}
          icon={<ToEndIcon />}
          disabled={!player}
          onClick={() => player?.seek(props.duration)}
        />
      </Tooltip>
      <span className="fv-audio-time">
        <span className="fv-audio-time-label">{t("audio.position")}</span>
        <span ref={positionRef} className="fv-audio-time-value">
          {timecode(0)}
        </span>
      </span>
      <span className="fv-audio-time">
        <span className="fv-audio-time-label">{t("audio.selection")}</span>
        <span className="fv-audio-time-value">{timecode(sel ? sel.end - sel.start : 0)}</span>
      </span>
    </>
  );
}
