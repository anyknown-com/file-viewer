// oxlint-disable-next-line no-restricted-imports -- test only: hosts import tokens.css before styles.css
import "@anyknown/ui/tokens.css";
import "../styles.css";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { blobSource } from "../contract/byte-source";
import type { AssetProvider } from "../contract/props";
import type { SaveRequest } from "../contract/save";
import { fixtureFile, fixtureRef } from "./test-utils/fixtures";
import { VideoEditor } from "./index";

afterEach(cleanup);

/** Pixels per second the timeline starts at (`INITIAL_PPS` in `ui/session.ts`). */
const PPS = 50;

async function memoryAssets(names: string[]): Promise<AssetProvider> {
  const files = await Promise.all(names.map((n) => fixtureFile(n)));
  return {
    list: () =>
      Promise.resolve(
        files.map((f, i) => ({ id: String(i), name: f.name, mime: f.type, size: f.size })),
      ),
    open: (id) => Promise.resolve(blobSource(files[Number(id)]!)),
  };
}

const q = (root: Element, sel: string): HTMLElement => {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`no ${sel}`);
  return el;
};

const clips = (root: Element, kind: string): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(`.fv-ve-clip[data-kind="${kind}"]`)].toSorted(
    (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left,
  );

/** Where every clip sits, in order; equal snapshots mean the same timeline. */
const layout = (root: Element): string =>
  [...root.querySelectorAll<HTMLElement>(".fv-ve-clip")]
    .map((c) => `${c.dataset.kind}@${c.style.insetInlineStart}+${c.style.inlineSize}`)
    .toSorted()
    .join("|");

function seek(root: Element, seconds: number): void {
  const ruler = q(root, '[data-testid="fv-ve-ruler"]');
  const left = ruler.getBoundingClientRect().left;
  fireEvent.pointerDown(ruler, { clientX: left + seconds * PPS, pointerId: 1 });
  fireEvent.pointerUp(ruler, { clientX: left + seconds * PPS, pointerId: 1 });
}

function press(root: Element, init: KeyboardEventInit): void {
  fireEvent.keyDown(q(root, ".fv-ve-root"), init);
}

function select(clip: HTMLElement): void {
  const x = clip.getBoundingClientRect().left + 4;
  fireEvent.pointerDown(clip, { clientX: x, button: 0, pointerId: 1 });
  fireEvent.pointerUp(clip, { clientX: x, pointerId: 1 });
}

/** Drags the right edge of `clip` to `seconds` on the ruler. */
function trimEndTo(root: Element, clip: HTMLElement, seconds: number): void {
  const rect = clip.getBoundingClientRect();
  const left = q(root, '[data-testid="fv-ve-ruler"]').getBoundingClientRect().left;
  fireEvent.pointerDown(clip, { clientX: rect.right - 2, button: 0, pointerId: 1 });
  fireEvent.pointerMove(clip, { clientX: left + seconds * PPS, pointerId: 1 });
  fireEvent.pointerUp(clip, { clientX: left + seconds * PPS, pointerId: 1 });
}

describe("video editor end to end", () => {
  it("splits, ripple-deletes, adds text and music, exports an MP4", async () => {
    await page.viewport(1400, 900);
    // The browser has no pointer with this id, so real capture would throw.
    Element.prototype.setPointerCapture = vi.fn<(id: number) => void>();
    Element.prototype.hasPointerCapture = vi.fn<(id: number) => boolean>(() => true);
    const user = userEvent.setup();
    const saved: SaveRequest[] = [];
    const onSave = vi.fn<(r: SaveRequest) => Promise<void>>((r) => {
      saved.push(r);
      return Promise.resolve();
    });
    const onClose = vi.fn<() => void>();
    const { container } = render(
      <div style={{ inlineSize: 1400, blockSize: 880 }}>
        <VideoEditor
          file={await fixtureRef("green-3s.webm")}
          assets={await memoryAssets(["tone-2s.ogg", "blue-64.png"])}
          onSave={onSave}
          onClose={onClose}
        />
      </div>,
    );

    // 1. ready
    await waitFor(() => expect(clips(container, "video")).toHaveLength(1), { timeout: 15_000 });

    // 2-3. split at 1 s and 2 s
    seek(container, 1);
    press(container, { key: "s", code: "KeyS" });
    await waitFor(() => expect(clips(container, "video")).toHaveLength(2));
    seek(container, 2);
    press(container, { key: "s", code: "KeyS" });
    await waitFor(() => expect(clips(container, "video")).toHaveLength(3));

    // 4. ripple delete the middle piece: the last one moves up and the video is 2 s
    select(clips(container, "video")[1]!);
    press(container, { key: "Delete", code: "Delete", shiftKey: true });
    await waitFor(() => expect(clips(container, "video")).toHaveLength(2));
    const rects = clips(container, "video").map((c) => c.getBoundingClientRect());
    expect(rects[1]!.left).toBeCloseTo(rects[0]!.right, 0);
    expect(rects[1]!.right - rects[0]!.left).toBeCloseTo(2 * PPS, 0);

    // 5. text at 0 s, new words, trimmed back to 2 s (it starts out 3 s long)
    seek(container, 0);
    await user.click(screen.getByRole("button", { name: "Add text" }));
    await waitFor(() => expect(clips(container, "text")).toHaveLength(1));
    select(clips(container, "text")[0]!);
    const field = await screen.findByRole("textbox", { name: "Text" });
    await user.clear(field);
    await user.type(field, "Hello{Enter}");
    await waitFor(() => expect(clips(container, "text")[0]!.title).toBe("Hello"));
    trimEndTo(container, clips(container, "text")[0]!, 2);
    await waitFor(() =>
      expect(clips(container, "text")[0]!.getBoundingClientRect().width).toBeCloseTo(2 * PPS, 0),
    );

    // 6. music from the media panel, then its volume to 50 %
    const row = screen.getByText("tone-2s.ogg").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Add at playhead" }));
    await waitFor(() => expect(clips(container, "audio")).toHaveLength(1));
    select(clips(container, "audio")[0]!);
    const volume = await screen.findByRole("slider", { name: "Volume" });
    volume.focus();
    await user.keyboard("{PageDown}".repeat(5));
    await waitFor(() => expect(volume).toHaveValue("50"));

    // 7. each PageDown is one undo step: undo goes 50 -> 60, redo returns to the same state
    const before = layout(container);
    press(container, { key: "z", code: "KeyZ", metaKey: true });
    await waitFor(() => expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("60"));
    press(container, { key: "z", code: "KeyZ", metaKey: true, shiftKey: true });
    await waitFor(() => expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("50"));
    expect(layout(container)).toBe(before);

    // 8. export at the original size (320x180 has no 720p)
    await user.click(screen.getByRole("button", { name: "Export" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/720p/)).toBeNull();
    const start = within(dialog).getByRole("button", { name: "Export" });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce(), { timeout: 60_000 });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());

    const req = saved[0]!;
    expect(req.mode).toBe("export");
    expect(req.ext).toBe(".mp4");
    const input = new Input({ source: new BlobSource(req.blob), formats: ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    const frame = 1 / ((await video!.computePacketStats()).averagePacketRate || 30);
    // The video track, not the file: the audio track's AAC priming adds its own offset to the file's length.
    expect(Math.abs((await video!.computeDuration()) - 2)).toBeLessThanOrEqual(frame * 1.5);
    expect(await input.getPrimaryAudioTrack()).not.toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 120_000);
});
