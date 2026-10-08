import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerRoot } from "../../../primitives/root";
import { videoMessages } from "../../messages";
import type { Command } from "../../model/commands";
import { History } from "../../model/history";
import { createProject, type Project, findClip } from "../../model/project";
import { secondsToTicks } from "../../model/time";
import type { EditorSession, SessionState } from "../session";
import { Timeline } from "./timeline";

const v = videoMessages.en;
const s = secondsToTicks;

function project(): Project {
  const base = createProject({
    id: "source",
    name: "clip.mp4",
    kind: "video",
    duration: s(10),
    width: 1920,
    height: 1080,
    fps: 30,
    hasAudio: true,
  });
  const flags = { muted: false, locked: false };
  return {
    ...base,
    tracks: {
      overlay: [
        {
          id: "o1",
          ...flags,
          clips: [
            {
              id: "t1",
              kind: "text",
              start: s(6),
              duration: s(2),
              text: "Hello",
              size: 0.08,
              color: "#ffffff",
              background: false,
              x: 0.5,
              y: 0.8,
            },
          ],
        },
      ],
      main: {
        id: "m",
        ...flags,
        clips: [
          {
            id: "v1",
            kind: "video",
            assetId: "source",
            start: 0,
            in: 0,
            out: s(4),
            volume: 1,
            muted: false,
            fit: "fit",
          },
        ],
      },
      audio: [
        {
          id: "a1",
          ...flags,
          clips: [
            {
              id: "au1",
              kind: "audio",
              assetId: "music",
              start: s(8),
              in: 0,
              out: s(2),
              volume: 1,
              muted: false,
            },
          ],
        },
      ],
    },
  };
}

/** Just enough of `EditorSession` for the timeline, around a real `History`. */
class FakeSession {
  history: History;
  state: SessionState = {
    status: "ready",
    error: null,
    selection: new Set(),
    playhead: s(20),
    pixelsPerSecond: 50,
    snapLine: null,
  };
  player = { seek: vi.fn<(t: number) => void>() };
  assets = {
    status: (id: string) =>
      id === "source"
        ? { state: "ready" as const, info: { name: "clip.mp4", duration: s(10) } }
        : { state: "idle" as const },
  };
  #listeners = new Set<() => void>();

  constructor(p: Project) {
    this.history = new History(p);
    this.history.subscribe(() => this.#set({}));
  }
  subscribe(l: () => void) {
    this.#listeners.add(l);
    return () => void this.#listeners.delete(l);
  }
  run(c: Command | null) {
    if (c) this.history.run(c);
  }
  select(ids: string[], additive: boolean) {
    this.#set({ selection: new Set(additive ? [...this.state.selection, ...ids] : ids) });
  }
  setZoom(pps: number) {
    this.#set({ pixelsPerSecond: pps });
  }
  setSnapLine(t: number | null) {
    this.#set({ snapLine: t });
  }
  #set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.#listeners) l();
  }
}

function setup(p = project()) {
  const session = new FakeSession(p);
  render(
    <ViewerRoot>
      <Timeline session={session as unknown as EditorSession} />
    </ViewerRoot>,
  );
  return session;
}

const clipEl = (label: string) => screen.getByText(label).closest(".fv-ve-clip")!;
const row = (trackId: string) =>
  document.querySelector<HTMLElement>(`[data-track-id="${trackId}"]`)!;

function drag(el: Element, from: number, to: number) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: from });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: to });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: to });
}

beforeEach(() => {
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture = vi.fn<(id: number) => void>();
  Element.prototype.hasPointerCapture = vi.fn<(id: number) => boolean>(() => true);
});

afterEach(cleanup);

describe("Timeline", () => {
  it("orders overlay, main and audio tracks top to bottom", () => {
    setup();
    const lanes = [...document.querySelectorAll<HTMLElement>("[data-lane]")].map(
      (el) => el.dataset.lane,
    );
    expect(lanes).toEqual(["overlay", "main", "audio"]);
    expect(within(row("o1")).getByText("Hello")).toBeTruthy();
    expect(within(row("m")).getByText("clip.mp4")).toBeTruthy();
  });

  it("selects a clip on click and adds to the selection with Shift", () => {
    const session = setup();
    fireEvent.pointerDown(clipEl("clip.mp4"), { button: 0, pointerId: 1, clientX: 100 });
    fireEvent.pointerUp(clipEl("clip.mp4"), { pointerId: 1, clientX: 100 });
    expect([...session.state.selection]).toEqual(["v1"]);
    expect(clipEl("clip.mp4").hasAttribute("data-selected")).toBe(true);
    fireEvent.pointerDown(clipEl("Hello"), {
      button: 0,
      pointerId: 1,
      clientX: 40,
      shiftKey: true,
    });
    expect([...session.state.selection]).toEqual(["v1", "t1"]);
    expect(session.history.canUndo).toBe(false);
  });

  it("moves a clip dragged by 100 px as one undo step", () => {
    const session = setup();
    // 50 px/s: 100 px is 2 s.
    drag(clipEl("clip.mp4"), 100, 200);
    expect(session.history.canUndo).toBe(true);
    expect(findClip(session.history.project.tracks, "v1")?.clip.start).toBe(s(2));
    expect(session.state.snapLine).toBeNull();
  });

  it("does not drag clips on a locked track", () => {
    const p = project();
    const session = setup({
      ...p,
      tracks: { ...p.tracks, main: { ...p.tracks.main, locked: true } },
    });
    drag(clipEl("clip.mp4"), 100, 200);
    expect(session.history.canUndo).toBe(false);
    expect(findClip(session.history.project.tracks, "v1")?.clip.start).toBe(0);
  });

  it("toggles a track's lock from its header", () => {
    const session = setup();
    fireEvent.click(within(row("m")).getByRole("button", { name: v["video.track.lock"] }));
    expect(session.history.project.tracks.main.locked).toBe(true);
    fireEvent.click(within(row("m")).getByRole("button", { name: v["video.track.unlock"] }));
    expect(session.history.project.tracks.main.locked).toBe(false);
  });
});
