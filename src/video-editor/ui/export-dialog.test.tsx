import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesSource } from "../../contract/byte-source";
import type { EditorProps } from "../../contract/editor";
import { ViewerError } from "../../contract/errors";
import type { SaveRequest } from "../../contract/save";
import { en } from "../../i18n/en";
import type { ExportProgress } from "../export/export";
import { runExport } from "../export/export";
import type * as Settings from "../export/settings";
import { canEncodePreset } from "../export/settings";
import { videoMessages } from "../messages";
import { mockEngines, renderEditor } from "../test-utils/editor-harness";

vi.mock("../../media/support");
vi.mock("../engine/assets");
vi.mock("../engine/frame-cache");
vi.mock("../engine/playback");
vi.mock("../engine/thumbnails");
vi.mock("../export/export");
vi.mock("../export/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  canEncodePreset: vi.fn<() => Promise<boolean>>(),
  pickAudioCodec: vi.fn<() => Promise<"aac" | "opus">>(async () => "aac"),
}));

const v = videoMessages.en;
const blob = new Blob(["mp4"], { type: "video/mp4" });

type Run = Parameters<typeof runExport>[0];

/** Holds `runExport` open until the test settles it; reports one progress step and honours abort. */
function pendingExport() {
  const control: { run: Run | null; resolve(b: Blob): void; reject(e: unknown): void } = {
    run: null,
    resolve: () => undefined,
    reject: () => undefined,
  };
  vi.mocked(runExport).mockImplementation(
    (o) =>
      new Promise<Blob>((resolve, reject) => {
        control.run = o;
        control.resolve = resolve;
        control.reject = reject;
        o.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        const p: ExportProgress = { done: 0.5, etaSeconds: 3 };
        o.onProgress(p);
      }),
  );
  return control;
}

beforeEach(() => {
  mockEngines({});
  vi.mocked(canEncodePreset).mockResolvedValue(true);
  vi.mocked(runExport).mockResolvedValue(blob);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openDialog(over: Partial<EditorProps> = {}) {
  const r = renderEditor({ onDirtyChange: vi.fn<(dirty: boolean) => void>(), ...over });
  await r.user.click(await screen.findByRole("button", { name: v["video.export"] }));
  await screen.findByRole("dialog");
  return r;
}

const startButton = () => screen.getByRole("button", { name: v["video.exportDialog.start"] });

async function start(user: Awaited<ReturnType<typeof openDialog>>["user"]) {
  await vi.waitFor(() => expect(startButton().hasAttribute("disabled")).toBe(false));
  await user.click(startButton());
}

describe("ExportDialog", () => {
  it("saves a new MP4 named after the file, then closes and clears dirty", async () => {
    const onSave = vi.fn<(r: SaveRequest) => Promise<void>>(async () => undefined);
    const { user, props } = renderEditor({
      file: { name: "trip.mov", mime: "video/quicktime", source: bytesSource(new Uint8Array(8)) },
      onSave,
      onDirtyChange: vi.fn<(dirty: boolean) => void>(),
    });
    await user.click(await screen.findByRole("button", { name: v["video.addText"] }));
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: v["video.export"] }));
    await start(user);
    await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    const req = onSave.mock.calls[0]![0];
    expect(req.suggestedName).toBe("trip (edited).mp4");
    expect(req.mode).toBe("export");
    expect(req.mime).toBe("video/mp4");
    expect(req.blob).toBe(blob);
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("disables the start button when the estimate is over the limit", async () => {
    await openDialog({ maxOutputBytes: 1000 });
    expect(screen.getByText(v["video.exportDialog.tooLarge"])).toBeTruthy();
    expect(startButton().hasAttribute("disabled")).toBe(true);
  });

  it("explains a missing H.264 encoder", async () => {
    vi.mocked(canEncodePreset).mockResolvedValue(false);
    await openDialog();
    expect(await screen.findByText(v["video.exportDialog.noH264"])).toBeTruthy();
    expect(startButton().hasAttribute("disabled")).toBe(true);
  });

  it("stays open and reports save_failed when onSave rejects", async () => {
    const onSave = vi.fn<(r: SaveRequest) => Promise<void>>(async () => {
      throw new Error("disk full");
    });
    const { user, props } = await openDialog({ onSave });
    await start(user);
    expect(
      await screen.findByText(v["video.exportDialog.saveFailed"].replace("{message}", "disk full")),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(vi.mocked(props.onError!).mock.calls.at(-1)?.[0]).toMatchObject({ code: "save_failed" });
  });

  it("aborts on cancel and never saves", async () => {
    const control = pendingExport();
    const { user, props } = await openDialog();
    await start(user);
    expect(await screen.findByRole("progressbar")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: en["common.cancel"] }));
    expect(control.run?.signal.aborted).toBe(true);
    await vi.waitFor(() => expect(startButton()).toBeTruthy());
    expect(props.onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks before closing the editor mid-export, then aborts and closes", async () => {
    const control = pendingExport();
    const { user, props } = await openDialog();
    await start(user);
    await screen.findByRole("progressbar");
    fireEvent.click(screen.getByRole("button", { name: en["common.close"], hidden: true }));
    expect(await screen.findByText(v["video.discardExport"])).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: v["video.discardExportConfirm"] }));
    expect(control.run?.signal.aborted).toBe(true);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("shows tooLarge and reports output_too_large without saving", async () => {
    const error = new ViewerError("output_too_large");
    vi.mocked(runExport).mockRejectedValue(error);
    const { user, props } = await openDialog();
    await start(user);
    expect(await screen.findByText(v["video.exportDialog.tooLarge"])).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onError).toHaveBeenCalledWith(error);
  });

  it("ignores Escape while exporting", async () => {
    const control = pendingExport();
    const { user } = await openDialog();
    await start(user);
    await screen.findByRole("progressbar");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(control.run?.signal.aborted).toBe(false);
    await act(async () => control.resolve(blob));
  });
});
