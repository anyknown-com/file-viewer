import { useT } from "../../../i18n/use-t";
import { Button } from "../../../primitives/button";
import { Icon } from "../../../primitives/icon";
import { Tooltip } from "../../../primitives/tooltip";
import { videoMessages } from "../../messages";
import type { Lane } from "../../model/placement";
import type { Track } from "../../model/project";

function SoundIcon(props: { off: boolean }): React.JSX.Element {
  return (
    <Icon size="sm">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {props.off ? <path d="m22 9-6 6m0-6 6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
    </Icon>
  );
}

function EyeIcon(props: { off: boolean }): React.JSX.Element {
  return (
    <Icon size="sm">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {props.off ? <path d="m3 3 18 18" /> : null}
    </Icon>
  );
}

function LockIcon(props: { open: boolean }): React.JSX.Element {
  return (
    <Icon size="sm">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d={props.open ? "M8 11V7a4 4 0 0 1 7.5-2" : "M8 11V7a4 4 0 0 1 8 0v4"} />
    </Icon>
  );
}

function FlagButton(props: {
  label: string;
  pressed: boolean;
  icon: React.ReactNode;
  onClick(): void;
}): React.JSX.Element {
  return (
    <Tooltip content={props.label}>
      <Button
        variant="ghost"
        aria-label={props.label}
        aria-pressed={props.pressed}
        icon={props.icon}
        onClick={props.onClick}
      />
    </Tooltip>
  );
}

/** Overlay tracks hide and show (the `muted` flag); main and audio tracks mute. Every track locks. */
export function TrackHeader(props: {
  track: Track;
  lane: Lane;
  onFlag(flag: "muted" | "locked", value: boolean): void;
}): React.JSX.Element {
  const t = useT(videoMessages);
  const { track } = props;
  const muteLabel =
    props.lane === "overlay"
      ? t(track.muted ? "video.track.show" : "video.track.hide")
      : t(track.muted ? "video.track.unmute" : "video.track.mute");
  return (
    <div className="fv-ve-track-header">
      <FlagButton
        label={muteLabel}
        pressed={track.muted}
        icon={
          props.lane === "overlay" ? <EyeIcon off={track.muted} /> : <SoundIcon off={track.muted} />
        }
        onClick={() => props.onFlag("muted", !track.muted)}
      />
      <FlagButton
        label={t(track.locked ? "video.track.unlock" : "video.track.lock")}
        pressed={track.locked}
        icon={<LockIcon open={!track.locked} />}
        onClick={() => props.onFlag("locked", !track.locked)}
      />
    </div>
  );
}
