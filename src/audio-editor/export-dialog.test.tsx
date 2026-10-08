import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AudioCodec, InputAudioTrack } from "mediabunny";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerError } from "../contract/errors";
import { type SaveHandler, type SaveRequest, suggestedName } from "../contract/save";
import { commonMessages } from "../i18n/messages";
import { ViewerRoot } from "../primitives/root";
import { initialEdit } from "./edit";
import type { exportAudio } from "./export";
import { ExportDialog } from "./export-dialog";
import { audioMessages } from "./messages";
import type { OpenedTrack } from "./open-track";

const en = audioMessages.en;
const ec = commonMessages.en;
const FILE = "talk.mp3";

afterEach(cleanup);

const opusOnly = (codec: AudioCodec) => Promise.resolve(codec === "opus");

function track(codec: AudioCodec | null): OpenedTrack {
  return {
    track: {} as InputAudioTrack,
    duration: 10,
    sampleRate: 48000,
    channels: 2,
    codec,
    dispose: () => undefined,
  };
}

/** An export that never finishes and rejects once its signal aborts. */
function pendingExport() {
  const signals: AbortSignal[] = [];
  const run = vi.fn<typeof exportAudio>(
    (o) =>
      new Promise((_, reject) => {
        signals.push(o.signal);
        o.signal.addEventListener("abort", () => reject(o.signal.reason));
      }),
  );
  return { run, signal: () => signals.at(-1)! };
}

function setup(
  o: {
    codec?: AudioCodec | null;
    maxOutputBytes?: number;
    runExport?: typeof exportAudio;
    onSave?: SaveHandler;
  } = {},
) {
  const onSave = vi.fn<SaveHandler>(o.onSave ?? (() => Promise.resolve()));
  const onDone = vi.fn<() => void>();
  const onError = vi.fn<(e: ViewerError) => void>();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const runExport =
    o.runExport ?? vi.fn<typeof exportAudio>(() => Promise.resolve(new Blob(["x"])));
  render(
    <ViewerRoot>
      <ExportDialog
        open
        onOpenChange={onOpenChange}
        opened={track(o.codec === undefined ? "mp3" : o.codec)}
        edit={initialEdit(10)}
        fileName={FILE}
        maxOutputBytes={o.maxOutputBytes}
        onSave={onSave}
        onDone={onDone}
        onError={onError}
        canEncode={opusOnly}
        runExport={runExport}
      />
    </ViewerRoot>,
  );
  return { onSave, onDone, onError, onOpenChange, runExport, user: userEvent.setup() };
}

const start = () => screen.getByRole<HTMLButtonElement>("button", { name: en["audio.start"] });

describe("ExportDialog", () => {
  it("lists only what the browser encodes and defaults to opus without aac", async () => {
    setup();
    const opus = await screen.findByRole("radio", { name: en["audio.formatOpus"] });
    const radios = screen.getAllByRole("radio");
    expect(screen.queryByRole("radio", { name: en["audio.formatAac"] })).toBeNull();
    expect(screen.getByRole("radio", { name: en["audio.formatWav"] })).toBeTruthy();
    expect(opus.getAttribute("aria-checked")).toBe("true");
    // opus, wav, then three opus bitrates
    expect(radios).toHaveLength(5);
  });

  it("blocks a start that would be too large", async () => {
    const { onError } = setup({ maxOutputBytes: 1000 });
    expect(await screen.findByText(en["audio.tooLarge"])).toBeTruthy();
    expect(start().disabled).toBe(true);
    expect(onError.mock.calls[0]?.[0].code).toBe("output_too_large");
  });

  it("saves the export as a new file and finishes", async () => {
    const { onSave, onDone, user } = setup();
    await screen.findByRole("radio", { name: en["audio.formatOpus"] });
    await user.click(start());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const req = onSave.mock.calls[0]![0] as SaveRequest;
    expect(req).toMatchObject({ mode: "export", ext: ".ogg", mime: "audio/ogg" });
    expect(req.suggestedName).toBe(suggestedName(FILE, ".ogg", "export"));
  });

  it("stays open with the host's message when saving fails", async () => {
    const { onDone, onError, user } = setup({
      onSave: () => Promise.reject(new Error("Disk is full")),
    });
    await screen.findByRole("radio", { name: en["audio.formatOpus"] });
    await user.click(start());
    expect(await screen.findByText("Disk is full")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: en["audio.exportTitle"] })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(onError.mock.calls[0]?.[0].code).toBe("save_failed");
  });

  it("cancel aborts the export and never saves", async () => {
    const p = pendingExport();
    const { onSave, user } = setup({ runExport: p.run });
    await screen.findByRole("radio", { name: en["audio.formatOpus"] });
    await user.click(start());
    await user.click(screen.getByRole("button", { name: ec["common.cancel"] }));
    expect(p.signal().aborted).toBe(true);
    expect(await screen.findByRole("radio", { name: en["audio.formatOpus"] })).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("asks before Esc stops an export in progress", async () => {
    const p = pendingExport();
    const { onOpenChange, user } = setup({ runExport: p.run });
    await screen.findByRole("radio", { name: en["audio.formatOpus"] });
    await user.click(start());
    await user.keyboard("{Escape}");
    expect(await screen.findByText(en["audio.exportClosing"])).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: en["audio.exportKeep"] }));
    await waitFor(() => expect(screen.queryByText(en["audio.exportClosing"])).toBeNull());
    expect(p.signal().aborted).toBe(false);
    expect(screen.getByRole("progressbar", { name: en["audio.exporting"] })).toBeTruthy();

    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: en["audio.exportClosingConfirm"] }));
    expect(p.signal().aborted).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("says mp3 cannot be exported as mp3", async () => {
    setup({ codec: "mp3" });
    expect(await screen.findByText(en["audio.noSameFormat"])).toBeTruthy();
  });

  it("shows the error when the export runs over the size limit", async () => {
    const { onError, user } = setup({
      runExport: () => Promise.reject(new ViewerError("output_too_large")),
    });
    await screen.findByRole("radio", { name: en["audio.formatOpus"] });
    await user.click(start());
    expect(await screen.findByText(ec["error.output_too_large"])).toBeTruthy();
    expect(onError.mock.calls[0]?.[0].code).toBe("output_too_large");
  });
});
