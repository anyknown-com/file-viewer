import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerRoot } from "../../primitives/root";
import { videoMessages } from "../messages";
import type { Command } from "../model/commands";
import { History } from "../model/history";
import { createProject } from "../model/project";
import { secondsToTicks } from "../model/time";
import { PreviewPanel } from "./preview-panel";
import type { EditorSession, SessionState } from "./session";

const v = videoMessages.en;

/** Just enough of `EditorSession` for the preview panel, around a real `History`. */
class FakeSession {
  history = new History(
    createProject({
      id: "source",
      name: "clip.mp4",
      kind: "video",
      duration: secondsToTicks(75.5),
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
    }),
  );
  state: SessionState = {
    status: "ready",
    error: null,
    selection: new Set(),
    playhead: secondsToTicks(3.5),
    pixelsPerSecond: 50,
    snapLine: null,
  };
  player = {
    playing: false,
    attach: vi.fn<(c: HTMLCanvasElement) => () => void>(() => () => undefined),
    toggle: vi.fn<() => void>(),
  };
  #listeners = new Set<() => void>();

  constructor() {
    this.history.subscribe(() => {
      this.state = { ...this.state };
      for (const l of this.#listeners) l();
    });
  }
  subscribe(l: () => void) {
    this.#listeners.add(l);
    return () => void this.#listeners.delete(l);
  }
  run(c: Command | null) {
    if (c) this.history.run(c);
  }
}

function setup() {
  const session = new FakeSession();
  render(
    <ViewerRoot>
      <PreviewPanel session={session as unknown as EditorSession} />
    </ViewerRoot>,
  );
  return { session, user: userEvent.setup() };
}

afterEach(cleanup);

describe("PreviewPanel", () => {
  it("attaches the player to a canvas of the project size", () => {
    const { session } = setup();
    const canvas = document.querySelector("canvas")!;
    expect(session.player.attach).toHaveBeenCalledWith(canvas);
    expect([canvas.width, canvas.height]).toEqual([1920, 1080]);
  });

  it("toggles playback from the play button", async () => {
    const { session, user } = setup();
    await user.click(screen.getByRole("button", { name: v["video.preview.play"] }));
    expect(session.player.toggle).toHaveBeenCalledTimes(1);
  });

  it("makes the project square when 1:1 is picked", async () => {
    const { session, user } = setup();
    await user.click(screen.getByRole("button", { name: v["video.preview.aspect"] }));
    await user.click(await screen.findByRole("menuitem", { name: "1:1" }));
    const p = session.history.project;
    expect(p.aspect).toBe("1:1");
    expect(p.width).toBe(p.height);
    expect(session.history.canUndo).toBe(true);
    await waitFor(() => {
      const canvas = document.querySelector("canvas")!;
      expect(canvas.width).toBe(canvas.height);
    });
  });

  it("shows the playhead and the duration as timecodes", () => {
    setup();
    expect(screen.getByText("00:03:15 / 01:15:15")).toBeTruthy();
  });
});
