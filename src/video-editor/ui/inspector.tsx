import { useCallback, useState, useSyncExternalStore } from "react";
import { useT } from "../../i18n/use-t";
import { RadioGroup } from "../../primitives/radio-group";
import { Slider } from "../../primitives/slider";
import { Switch } from "../../primitives/switch";
import { videoMessages } from "../messages";
import { type ClipPatch, updateClip } from "../model/edits";
import { type Clip, findClip, type Fit, type ImageClip, type TextClip } from "../model/project";
import type { EditorSession } from "./session";

/**
 * A slider that only redraws while dragging and runs one command on release, so a drag is
 * one undo step.
 */
function DraftSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit(v: number): void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<number | null>(null);
  return (
    <div className="fv-ve-inspector-field">
      <span className="fv-ve-inspector-label">{props.label}</span>
      <Slider
        label={props.label}
        value={draft ?? props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onValueChange={setDraft}
        onValueCommitted={(v) => {
          setDraft(null);
          props.onCommit(v);
        }}
      />
    </div>
  );
}

/**
 * A text area that keeps the typing local and runs one command on blur or Enter, so a
 * typed phrase is one undo step. Shift+Enter adds a line; Enter while composing (IME) is
 * left to the input method.
 */
function DraftText(props: {
  label: string;
  value: string;
  onCommit(v: string): void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft !== props.value) props.onCommit(draft);
  };
  return (
    <label className="fv-ve-inspector-field">
      <span className="fv-ve-inspector-label">{props.label}</span>
      <textarea
        className="fv-ve-input"
        rows={3}
        value={draft ?? props.value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          e.preventDefault();
          commit();
        }}
      />
    </label>
  );
}

function Position(props: {
  clip: ImageClip | TextClip;
  patch(p: ClipPatch): void;
}): React.JSX.Element {
  const { clip, patch } = props;
  const t = useT(videoMessages);
  return (
    <>
      <DraftSlider
        label={t("video.inspector.x")}
        value={clip.x}
        min={0}
        max={1}
        step={0.01}
        onCommit={(x) => patch({ x })}
      />
      <DraftSlider
        label={t("video.inspector.y")}
        value={clip.y}
        min={0}
        max={1}
        step={0.01}
        onCommit={(y) => patch({ y })}
      />
    </>
  );
}

function ClipFields(props: { clip: Clip; patch(p: ClipPatch): void }): React.JSX.Element {
  const { clip, patch } = props;
  const t = useT(videoMessages);
  if (clip.kind === "video" || clip.kind === "audio") {
    return (
      <>
        <DraftSlider
          label={t("video.inspector.volume")}
          value={Math.round(clip.volume * 100)}
          min={0}
          max={200}
          step={1}
          onCommit={(v) => patch({ volume: v / 100 })}
        />
        <Switch
          label={t("video.inspector.mute")}
          checked={clip.muted}
          onCheckedChange={(muted) => patch({ muted })}
        />
        {clip.kind === "video" ? (
          <RadioGroup<Fit>
            label={`${t("video.inspector.fit")} / ${t("video.inspector.fill")}`}
            value={clip.fit}
            options={[
              { value: "fit", label: t("video.inspector.fit") },
              { value: "fill", label: t("video.inspector.fill") },
            ]}
            onChange={(fit) => patch({ fit })}
          />
        ) : null}
      </>
    );
  }

  if (clip.kind === "image") {
    return (
      <>
        <Position clip={clip} patch={patch} />
        <DraftSlider
          label={t("video.inspector.width")}
          value={clip.width}
          min={0}
          max={1}
          step={0.01}
          onCommit={(width) => patch({ width })}
        />
      </>
    );
  }

  return (
    <>
      <DraftText
        label={t("video.inspector.text")}
        value={clip.text}
        onCommit={(text) => patch({ text })}
      />
      <DraftSlider
        label={t("video.inspector.size")}
        value={clip.size}
        min={0.02}
        max={0.3}
        step={0.01}
        onCommit={(size) => patch({ size })}
      />
      <label className="fv-ve-inspector-field">
        <span className="fv-ve-inspector-label">{t("video.inspector.color")}</span>
        <input
          type="color"
          className="fv-ve-color"
          value={clip.color}
          onChange={(e) => patch({ color: e.target.value })}
        />
      </label>
      <Switch
        label={t("video.inspector.background")}
        checked={clip.background}
        onCheckedChange={(background) => patch({ background })}
      />
      <Position clip={clip} patch={patch} />
    </>
  );
}

export function Inspector(props: { session: EditorSession }): React.JSX.Element | null {
  const { session } = props;
  const t = useT(videoMessages);
  const subscribe = useCallback((l: () => void) => session.subscribe(l), [session]);
  const state = useSyncExternalStore(subscribe, () => session.state);
  const history = session.history;
  if (!history) return null;

  const [only, ...rest] = state.selection;
  const found =
    only !== undefined && rest.length === 0 ? findClip(history.project.tracks, only) : null;
  if (!found) return <p className="fv-ve-inspector-empty">{t("video.inspector.empty")}</p>;

  const { clip } = found;
  return (
    <div className="fv-ve-inspector-fields">
      {/* Keyed by clip so a half-dragged slider never carries over to another clip. */}
      <ClipFields
        key={clip.id}
        clip={clip}
        patch={(patch) => session.run(updateClip(history.project, clip.id, patch))}
      />
    </div>
  );
}
