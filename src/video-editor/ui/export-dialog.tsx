import { useCallback, useRef, useState } from "react";
import { isAbortError, ViewerError } from "../../contract/errors";
import { type SaveHandler, suggestedName } from "../../contract/save";
import { commonMessages } from "../../i18n/messages";
import { useT } from "../../i18n/use-t";
import { Button } from "../../primitives/button";
import { Dialog } from "../../primitives/dialog";
import { Progress } from "../../primitives/progress";
import { RadioGroup } from "../../primitives/radio-group";
import { type ExportProgress, runExport } from "../export/export";
import {
  canEncodePreset,
  estimateBytes,
  type ExportPreset,
  exportPresets,
  pickAudioCodec,
  type PresetId,
} from "../export/settings";
import { videoMessages } from "../messages";
import { projectDuration } from "../model/project";
import type { EditorSession } from "./session";

type Phase = "settings" | "exporting" | "saving";

const formatMB = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "–";
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function checkEncoders(list: ExportPreset[]): Promise<ReadonlyMap<PresetId, boolean>> {
  const ok = await Promise.all(list.map((p) => canEncodePreset(p).catch(() => false)));
  return new Map(list.map((p, i) => [p.id, ok[i]!]));
}

function Footer(props: {
  phase: Phase;
  disabled: boolean;
  onCancel(): void;
  onStart(): void;
  onAbort(): void;
}): React.JSX.Element | null {
  const t = useT(videoMessages);
  const tc = useT(commonMessages);
  if (props.phase === "saving") return null;
  if (props.phase === "exporting")
    return (
      <Button variant="secondary" onClick={props.onAbort}>
        {tc("common.cancel")}
      </Button>
    );
  return (
    <>
      <Button variant="secondary" onClick={props.onCancel}>
        {tc("common.cancel")}
      </Button>
      <Button variant="primary" disabled={props.disabled} onClick={props.onStart}>
        {t("video.exportDialog.start")}
      </Button>
    </>
  );
}

/** Picks a quality, runs the export and hands the MP4 to `onSave`; the editor's history is marked saved after. */
export function ExportDialog(props: {
  session: EditorSession;
  fileName: string;
  open: boolean;
  maxOutputBytes: number;
  onSave: SaveHandler;
  onError?(e: ViewerError): void;
  onDone(): void;
  onOpenChange(open: boolean): void;
  onExportingChange(exporting: boolean, abort: (() => void) | null): void;
}): React.JSX.Element {
  const t = useT(videoMessages);
  const tc = useT(commonMessages);
  const { session } = props;
  const history = session.history!;
  const [phase, setPhase] = useState<Phase>("settings");
  const [picked, setPicked] = useState<PresetId | null>(null);
  const [encodable, setEncodable] = useState<ReadonlyMap<PresetId, boolean> | null>(null);
  const [progress, setProgress] = useState<ExportProgress>({ done: 0, etaSeconds: null });
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const presets = exportPresets(history.project);
  const duration = projectDuration(history.project);
  const fallback = presets.find((p) => p.id === "1080p") ?? presets[0]!;
  const preset = presets.find((p) => p.id === picked) ?? fallback;
  const tooLarge = estimateBytes(preset, duration) > props.maxOutputBytes;
  const noH264 = encodable?.get(preset.id) === false;
  const blocked = tooLarge
    ? "video.exportDialog.tooLarge"
    : noH264
      ? "video.exportDialog.noH264"
      : null;
  const notice = error ?? (blocked && t(blocked));

  // Mounts with the dialog's content, so the encoder check runs each time the dialog opens.
  const checkRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      let live = true;
      const list = exportPresets(history.project);
      void checkEncoders(list).then((map) => live && setEncodable(map));
      return () => {
        live = false;
      };
    },
    [history],
  );

  const fail = (message: string, e: ViewerError) => {
    setPhase("settings");
    setError(message);
    props.onError?.(e);
  };

  const start = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setProgress({ done: 0, etaSeconds: null });
    setPhase("exporting");
    props.onExportingChange(true, () => controller.abort());
    let blob: Blob;
    try {
      blob = await runExport({
        project: history.project,
        assets: session.assets,
        preset,
        audioCodec: await pickAudioCodec(),
        maxOutputBytes: props.maxOutputBytes,
        signal: controller.signal,
        onProgress: setProgress,
      });
    } catch (e) {
      if (isAbortError(e)) return setPhase("settings");
      const err = e instanceof ViewerError ? e : new ViewerError("decode_failed", { cause: e });
      if (err.code === "output_too_large") return fail(t("video.exportDialog.tooLarge"), err);
      return fail(tc(`error.${err.code}`), err);
    } finally {
      abort.current = null;
      props.onExportingChange(false, null);
    }
    setPhase("saving");
    try {
      await props.onSave({
        blob,
        mime: "video/mp4",
        ext: ".mp4",
        mode: "export",
        suggestedName: suggestedName(props.fileName, ".mp4", "export"),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return fail(
        t("video.exportDialog.saveFailed", { message }),
        new ViewerError("save_failed", { cause }),
      );
    }
    setPhase("settings");
    history.markSaved();
    props.onDone();
  };

  const onOpenChange = (open: boolean) => {
    if (!open && phase !== "settings") return;
    if (!open) setError(null);
    props.onOpenChange(open);
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={onOpenChange}
      title={t("video.exportDialog.title")}
      footer={
        <Footer
          phase={phase}
          disabled={tooLarge || encodable === null || noH264}
          onCancel={() => onOpenChange(false)}
          onStart={() => void start()}
          onAbort={() => abort.current?.abort()}
        />
      }
    >
      <div ref={checkRef}>
        {phase === "settings" && (
          <RadioGroup
            label={t("video.exportDialog.title")}
            value={preset.id}
            options={presets.map((p) => ({
              value: p.id,
              label:
                p.id === "original"
                  ? `${t("video.exportDialog.original")} (${p.width}×${p.height})`
                  : p.id,
              description: t("video.exportDialog.estimate", {
                size: formatMB(estimateBytes(p, duration)),
              }),
            }))}
            onChange={setPicked}
          />
        )}
        {phase === "exporting" && (
          <Progress
            label={t("video.exportDialog.progress", {
              percent: Math.round(progress.done * 100),
              time: formatEta(progress.etaSeconds),
            })}
            value={progress.done}
          />
        )}
        {phase === "saving" && <Progress label={t("video.exportDialog.saving")} value={null} />}
        {phase === "settings" && notice && (
          <p className="fv-editor-error" role="alert">
            {notice}
          </p>
        )}
      </div>
    </Dialog>
  );
}
