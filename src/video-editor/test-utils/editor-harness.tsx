import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { bytesSource } from "../../contract/byte-source";
import type { EditorProps } from "../../contract/editor";
import type { ViewerError } from "../../contract/errors";
import { hasVideoCodecs } from "../../media/support";
import { type AssetEntry, type AssetStatus, AssetStore } from "../engine/assets";
import { Thumbnails } from "../engine/thumbnails";
import type { AssetMeta } from "../model/project";
import { secondsToTicks } from "../model/time";
import { EditorSession } from "../ui/session";
import { VideoEditor } from "../ui/video-editor";

/**
 * Renders `VideoEditor` around mocked engines. The test file itself must call
 * `vi.mock` for `media/support` and `engine/{assets,frame-cache,playback,thumbnails}`.
 */

export const sourceMeta: AssetMeta = {
  id: "source",
  name: "clip.mp4",
  kind: "video",
  duration: secondsToTicks(10),
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: false,
};

const sourceEntry: AssetEntry = {
  id: "source",
  name: "clip.mp4",
  mime: "video/mp4",
  size: 8,
  kind: "video",
};

/** jsdom has no ResizeObserver; this one reports a 1280 px wide box once observed. */
class FakeResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    const entry = { target: el, contentRect: { width: 1280 } } as unknown as ResizeObserverEntry;
    this.cb([entry], this as unknown as ResizeObserver);
  }
  disconnect() {}
  unobserve() {}
}

/** Statuses must be stable objects: the UI reads them with `useSyncExternalStore`. */
export function mockEngines(o: {
  entries?: AssetEntry[];
  metas?: AssetMeta[];
  statuses?: Record<string, AssetStatus>;
}): void {
  const metas = new Map([sourceMeta, ...(o.metas ?? [])].map((m) => [m.id, m]));
  const ready = new Map(
    [...metas.values()].map((info) => [info.id, { state: "ready" as const, info }]),
  );
  const idle = { state: "idle" as const };
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.mocked(hasVideoCodecs).mockReturnValue(true);
  vi.mocked(AssetStore.prototype.list).mockResolvedValue([sourceEntry, ...(o.entries ?? [])]);
  vi.mocked(AssetStore.prototype.load).mockImplementation((id) => {
    const meta = metas.get(id);
    return meta ? Promise.resolve(meta) : Promise.reject(new Error(`no asset ${id}`));
  });
  vi.mocked(AssetStore.prototype.status).mockImplementation(
    (id) => o.statuses?.[id] ?? ready.get(id) ?? idle,
  );
  vi.mocked(AssetStore.prototype.subscribe).mockReturnValue(() => {});
  vi.mocked(Thumbnails.prototype.strip).mockResolvedValue([]);
  vi.mocked(Thumbnails.prototype.peaks).mockResolvedValue(new Float32Array(1));
  // jsdom draws nothing; without this it logs "not implemented" for every clip canvas.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture = vi.fn<(id: number) => void>();
  Element.prototype.hasPointerCapture = vi.fn<(id: number) => boolean>(() => true);
}

export function renderEditor(over: Partial<EditorProps> = {}) {
  const start = vi.spyOn(EditorSession.prototype, "start");
  const props: EditorProps = {
    file: { name: "clip.mp4", mime: "video/mp4", source: bytesSource(new Uint8Array(8)) },
    onSave: vi.fn<EditorProps["onSave"]>(),
    onClose: vi.fn<() => void>(),
    onError: vi.fn<(e: ViewerError) => void>(),
    ...over,
  };
  render(<VideoEditor {...props} />);
  const session = () => start.mock.contexts.at(-1) as EditorSession;
  return { props, user: userEvent.setup(), session };
}
