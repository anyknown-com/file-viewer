import { describe, expect, it, vi } from "vitest";
import { type Command, batch, tracksCommand } from "./commands";
import { History, MAX_HISTORY } from "./history";
import { type AssetMeta, type Project, createProject } from "./project";

const meta: AssetMeta = {
  id: "source",
  name: "a.mp4",
  kind: "video",
  duration: 1000,
  width: 640,
  height: 360,
  fps: 30,
  hasAudio: true,
};

// Each command moves the main clip's start by +1, so every step is a distinct project.
function bump(p: Project, label = "bump"): Command {
  const clip = p.tracks.main.clips[0]!;
  const after = {
    ...p.tracks,
    main: { ...p.tracks.main, clips: [{ ...clip, start: clip.start + 1 }] },
  };
  return tracksCommand(label, p.tracks, after);
}

describe("History", () => {
  it("keeps at most 200 undo steps", () => {
    const h = new History(createProject(meta));
    for (let i = 0; i < 250; i++) h.run(bump(h.project));
    let n = 0;
    while (h.canUndo) {
      h.undo();
      n++;
    }
    expect(n).toBe(MAX_HISTORY);
  });

  it("undo x200 then redo x200 returns to the same project", () => {
    const h = new History(createProject(meta));
    for (let i = 0; i < 250; i++) h.run(bump(h.project));
    const end = h.project;
    for (let i = 0; i < 200; i++) h.undo();
    for (let i = 0; i < 200; i++) h.redo();
    expect(h.project).toEqual(end);
  });

  it("dirty is false after undoing back to the saved state", () => {
    const h = new History(createProject(meta));
    h.run(bump(h.project));
    expect(h.dirty).toBe(true);
    h.undo();
    expect(h.dirty).toBe(false);
    h.redo();
    h.markSaved();
    expect(h.dirty).toBe(false);
  });

  it("run clears the redo stack", () => {
    const h = new History(createProject(meta));
    h.run(bump(h.project));
    h.undo();
    expect(h.canRedo).toBe(true);
    h.run(bump(h.project));
    expect(h.canRedo).toBe(false);
  });

  it("batch reverts in reverse order", () => {
    const log: string[] = [];
    const rec = (name: string): Command => ({
      label: name,
      apply: (p) => {
        log.push(`apply ${name}`);
        return p;
      },
      revert: (p) => {
        log.push(`revert ${name}`);
        return p;
      },
    });
    const b = batch("both", [rec("a"), rec("b")]);
    const p = createProject(meta);
    b.apply(p);
    b.revert(p);
    expect(log).toEqual(["apply a", "apply b", "revert b", "revert a"]);
  });

  it("calls the listener once per change", () => {
    const h = new History(createProject(meta));
    const fn = vi.fn<() => void>();
    const off = h.subscribe(fn);
    h.run(bump(h.project));
    expect(fn).toHaveBeenCalledTimes(1);
    h.undo();
    h.redo();
    h.markSaved();
    expect(fn).toHaveBeenCalledTimes(4);
    off();
    h.undo();
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
