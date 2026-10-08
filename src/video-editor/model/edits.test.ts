import { describe, expect, it } from "vitest";
import {
  addAsset,
  addText,
  deleteClips,
  moveClip,
  setAspect,
  setTrackFlag,
  splitAt,
  trimClip,
  updateClip,
} from "./edits";
import { History } from "./history";
import { type AssetMeta, type Project, createProject } from "./project";
import { TICKS_PER_SECOND as S } from "./time";

const asset = (kind: AssetMeta["kind"], over: Partial<AssetMeta> = {}): AssetMeta => ({
  id: kind,
  name: kind,
  kind,
  duration: 10 * S,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true,
  ...over,
});

const fresh = (): Project => createProject(asset("video", { id: "source" }));
const apply = (p: Project, c: ReturnType<typeof setAspect>) => c!.apply(p);

describe("add", () => {
  it("puts each kind on the right track", () => {
    let p = fresh();
    p = apply(p, addAsset(p, asset("video"), 10 * S, null));
    expect(p.tracks.main.clips.map((c) => c.start)).toEqual([0, 10 * S]);
    p = apply(p, addAsset(p, asset("audio"), 0, null));
    expect(p.tracks.audio[0]!.clips[0]!.kind).toBe("audio");
    p = apply(p, addAsset(p, asset("image", { duration: null }), S, null));
    expect(p.tracks.overlay[0]!.clips[0]).toMatchObject({
      kind: "image",
      duration: 5 * S,
      start: S,
    });
    p = apply(p, addText(p, 8 * S, "hi"));
    expect(p.tracks.overlay.flatMap((t) => t.clips).some((c) => c.kind === "text")).toBe(true);
  });
});

describe("trim", () => {
  it("head trim never takes in below 0", () => {
    const p = fresh();
    const id = p.tracks.main.clips[0]!.id;
    expect(trimClip(p, id, "start", -5 * S, 10 * S)).toBeNull();
    const q = apply(p, trimClip(p, id, "start", 4 * S, 10 * S));
    expect(q.tracks.main.clips[0]).toMatchObject({ start: 4 * S, in: 4 * S });
  });
  it("tail trim stays within the source and the next clip", () => {
    let p = fresh();
    p = apply(p, trimClip(p, p.tracks.main.clips[0]!.id, "end", 5 * S, 10 * S));
    p = apply(p, addAsset(p, asset("video"), 8 * S, null));
    const first = p.tracks.main.clips[0]!;
    const q = apply(p, trimClip(p, first.id, "end", 20 * S, 10 * S));
    expect(q.tracks.main.clips[0]!.out).toBe(8 * S);
  });
  it("is never shorter than one frame", () => {
    const p = fresh();
    const q = apply(p, trimClip(p, p.tracks.main.clips[0]!.id, "end", 0, 10 * S));
    expect(q.tracks.main.clips[0]!.out).toBe(4000);
  });
});

describe("move, lock, update, delete", () => {
  it("a move on main never overlaps", () => {
    let p = fresh();
    p = apply(p, addAsset(p, asset("video"), 10 * S, null));
    const second = p.tracks.main.clips[1]!;
    const q = apply(p, moveClip(p, second.id, p.tracks.main.id, 12 * S));
    const [a, b] = q.tracks.main.clips;
    expect(b!.start).toBeGreaterThanOrEqual(a!.out);
  });
  it("locked tracks cannot move, edit or delete", () => {
    let p = fresh();
    const id = p.tracks.main.clips[0]!.id;
    p = apply(p, setTrackFlag(p, p.tracks.main.id, "locked", true));
    expect(moveClip(p, id, p.tracks.main.id, S)).toBeNull();
    expect(updateClip(p, id, { volume: 0.5 })).toBeNull();
    expect(deleteClips(p, new Set([id]), false)).toBeNull();
  });
  it("clamps out-of-range values", () => {
    let p = fresh();
    p = apply(p, addText(p, 0, "x"));
    const id = p.tracks.overlay[0]!.clips[0]!.id;
    const q = apply(p, updateClip(p, id, { size: 5, x: -1, y: 9 }));
    expect(q.tracks.overlay[0]!.clips[0]).toMatchObject({ size: 0.3, x: 0, y: 1 });
    const mainId = p.tracks.main.clips[0]!.id;
    const r = apply(p, updateClip(p, mainId, { volume: 9 }));
    expect(r.tracks.main.clips[0]).toMatchObject({ volume: 2 });
  });
  it("ripple delete on main leaves no gap", () => {
    let p = fresh();
    p = apply(p, addAsset(p, asset("video"), 10 * S, null));
    p = apply(p, addAsset(p, asset("video"), 20 * S, null));
    const mid = p.tracks.main.clips[1]!.id;
    const q = apply(p, deleteClips(p, new Set([mid]), true));
    expect(q.tracks.main.clips.map((c) => c.start)).toEqual([0, 10 * S]);
  });
  it("split cuts at the playhead", () => {
    const p = fresh();
    expect(apply(p, splitAt(p, 4 * S, new Set())).tracks.main.clips).toHaveLength(2);
  });
});

describe("aspect and no-ops", () => {
  it("undo of setAspect restores the size", () => {
    const h = new History(fresh());
    h.run(setAspect(h.project, "1:1")!);
    expect(h.project.width).toBe(1080);
    h.undo();
    expect([h.project.width, h.project.height, h.project.aspect]).toEqual([1920, 1080, "source"]);
  });
  it("returns null when nothing changes", () => {
    const p = fresh();
    expect(setAspect(p, "source")).toBeNull();
    expect(updateClip(p, p.tracks.main.clips[0]!.id, { volume: 1 })).toBeNull();
    expect(setTrackFlag(p, p.tracks.main.id, "muted", false)).toBeNull();
    expect(splitAt(p, 0, new Set())).toBeNull();
  });
});
