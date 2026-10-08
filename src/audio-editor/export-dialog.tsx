import { type AudioCodec, canEncodeAudio } from "mediabunny";
import { useCallback, useRef, useState } from "react";
import { isAbortError, ViewerError } from "../contract/errors";
import { type SaveHandler, suggestedName } from "../contract/save";
import { commonMessages } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { Button } from "../primitives/button";
import { ConfirmDialog, Dialog } from "../primitives/dialog";
import { Progress } from "../primitives/progress";
import { RadioGroup } from "../primitives/radio-group";
import { type AudioEdit, outputDuration } from "./edit";
import { exportAudio } from "./export";
import {
  availableFormats,
  defaultFormat,
  estimateBytes,
  FORMATS,
  type FormatId,
  isSameFormatLost,
  type OutputChoice,
} from "./formats";
import { audioMessages } from "./messages";
import type { OpenedTrack } from "./open-track";

type CanEncode = (
  codec: AudioCodec,
  o: { numberOfChannels: number; sampleRate: number },
) => Promise<boolean>;

type Phase = "settings" | "exporting" | "saving";

const FORMAT_LABEL = {
  aac: "audio.formatAac",
  opus: "audio.formatOpus",
  wav: "audio.formatWav",
} as const;

const formatMB = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

function formatTime(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const fallback = (f: FormatId): OutputChoice => ({ format: f, bitrate: FORMATS[f].defaultBitrate });

/** Format and bitrate choices, the estimated size and the notes about them. */
function Settings(props: {
  formats: FormatId[];
  choice: OutputChoice;
  sourceCodec: AudioCodec | null;
  size: number;
  tooLarge: boolean;
  onPick: (c: OutputChoice) => void;
}): React.JSX.Element {
  const t = useT(audioMessages);
  const { choice, onPick } = props;
  const bitrates = FORMATS[choice.format].bitrates;
  return (
    <>
      <RadioGroup
        label={t("audio.format")}
        value={choice.format}
        options={props.formats.map((f) => ({
          value: f,
          label: t(FORMAT_LABEL[f]),
          description: f === "opus" ? t("audio.opusNote") : undefined,
        }))}
        onChange={(f) => onPick(fallback(f))}
      />
      {isSameFormatLost(props.sourceCodec) && (
        <p className="fv-audio-panel-note">{t("audio.noSameFormat")}</p>
      )}
      {bitrates && (
        <RadioGroup
          label={t("audio.bitrate")}
          value={String(choice.bitrate)}
          options={bitrates.map((bps) => ({ value: String(bps), label: `${bps / 1000} kbps` }))}
          onChange={(v) => onPick({ format: choice.format, bitrate: Number(v) })}
        />
      )}
      <p className="fv-audio-panel-note">
        {t("audio.estimatedSize", { size: formatMB(props.size) })}
      </p>
      {props.tooLarge && (
        <p className="fv-editor-error" role="alert">
          {t("audio.tooLarge")}
        </p>
      )}
    </>
  );
}

/** Picks a format and bitrate, streams the edit into it and hands the file to `onSave`. */
export function ExportDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opened: OpenedTrack;
  edit: AudioEdit;
  fileName: string;
  maxOutputBytes?: number;
  onSave: SaveHandler;
  onDone: () => void;
  onError?: (e: ViewerError) => void;
  canEncode?: CanEncode;
  runExport?: typeof exportAudio;
}): React.JSX.Element {
  const t = useT(audioMessages);
  const tc = useT(commonMessages);
  const { opened, edit } = props;
  const canEncode = props.canEncode ?? canEncodeAudio;
  const [formats, setFormats] = useState<FormatId[] | null>(null);
  const [picked, setPicked] = useState<OutputChoice | null>(null);
  const [phase, setPhase] = useState<Phase>("settings");
  // `left` is the remaining-time line, empty until the estimate settles.
  const [progress, setProgress] = useState({ p: 0, left: "" });
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const channels = Math.min(opened.channels, 2) as 1 | 2;
  const frames = Math.round(outputDuration(edit) * opened.sampleRate);
  const estimate = (c: OutputChoice) => estimateBytes(c, frames, channels, opened.sampleRate);
  const tooBig = (c: OutputChoice) =>
    props.maxOutputBytes !== undefined && estimate(c) > props.maxOutputBytes;
  const choice = picked ?? (formats && fallback(defaultFormat(opened.codec, formats)));
  const tooLarge = choice !== null && tooBig(choice);

  const pick = (c: OutputChoice) => {
    setPicked(c);
    setError(null);
    if (tooBig(c)) props.onError?.(new ViewerError("output_too_large"));
  };

  // Mounts with the dialog's content, so the encoder check runs each time the dialog opens.
  const checkRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      let live = true;
      const check = async () => {
        const list = await availableFormats(canEncode, channels, opened.sampleRate);
        if (!live) return;
        setFormats(list);
        const c = fallback(defaultFormat(opened.codec, list));
        if (!picked && tooBig(c)) props.onError?.(new ViewerError("output_too_large"));
      };
      void check();
      return () => {
        live = false;
      };
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs once per open, for this track.
    [opened],
  );

  const fail = (message: string, e: ViewerError) => {
    setPhase("settings");
    setError(message);
    props.onError?.(e);
  };

  const start = async (c: OutputChoice) => {
    const controller = new AbortController();
    abort.current = controller;
    const started = performance.now();
    setError(null);
    setProgress({ p: 0, left: "" });
    setPhase("exporting");
    let blob: Blob;
    try {
      blob = await (props.runExport ?? exportAudio)({
        opened,
        edit,
        choice: c,
        maxOutputBytes: props.maxOutputBytes,
        signal: controller.signal,
        onProgress: (p) => {
          const elapsed = (performance.now() - started) / 1000;
          const left = (elapsed * (1 - p)) / p;
          setProgress({
            p,
            left: p < 0.02 ? "" : t("audio.remaining", { time: formatTime(left) }),
          });
        },
      });
    } catch (e) {
      if (controller.signal.aborted || isAbortError(e)) return;
      const err = e instanceof ViewerError ? e : new ViewerError("decode_failed", { cause: e });
      return fail(tc(`error.${err.code}`), err);
    } finally {
      if (abort.current === controller) abort.current = null;
    }
    if (controller.signal.aborted) return;
    setPhase("saving");
    const { ext, mime } = FORMATS[c.format];
    try {
      await props.onSave({
        blob,
        mime,
        ext,
        mode: "export",
        suggestedName: suggestedName(props.fileName, ext, "export"),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      return fail(message || tc("error.save_failed"), new ViewerError("save_failed", { cause }));
    }
    setPhase("settings");
    props.onDone();
  };

  const stop = () => {
    abort.current?.abort();
    abort.current = null;
    setPhase("settings");
  };

  const onOpenChange = (open: boolean) => {
    if (!open && phase !== "settings") return setConfirmOpen(true);
    if (!open) setError(null);
    props.onOpenChange(open);
  };

  const footer =
    phase === "settings" ? (
      <>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {tc("common.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!choice || tooLarge}
          onClick={() => choice && void start(choice)}
        >
          {t("audio.start")}
        </Button>
      </>
    ) : phase === "exporting" ? (
      <Button variant="secondary" onClick={stop}>
        {tc("common.cancel")}
      </Button>
    ) : null;

  return (
    <Dialog
      open={props.open}
      onOpenChange={onOpenChange}
      title={t("audio.exportTitle")}
      footer={footer}
    >
      <div ref={checkRef} className="fv-audio-export">
        {phase === "settings" && formats && choice && (
          <Settings
            formats={formats}
            choice={choice}
            sourceCodec={opened.codec}
            size={estimate(choice)}
            tooLarge={tooLarge}
            onPick={pick}
          />
        )}
        {phase === "exporting" && (
          <div className="fv-audio-progress">
            <Progress label={t("audio.exporting")} value={progress.p} />
            <span>{progress.left}</span>
          </div>
        )}
        {phase === "saving" && (
          <div className="fv-audio-progress">
            <Progress label={t("audio.exporting")} value={null} />
          </div>
        )}
        {phase === "settings" && error && (
          <p className="fv-editor-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {/* Inside the dialog so Base UI treats it as nested: clicks in it are not outside presses. */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("audio.exportClosing")}
        description={t("audio.exportClosingBody")}
        confirmLabel={t("audio.exportClosingConfirm")}
        cancelLabel={t("audio.exportKeep")}
        danger
        onConfirm={() => {
          stop();
          props.onOpenChange(false);
        }}
      />
    </Dialog>
  );
}
