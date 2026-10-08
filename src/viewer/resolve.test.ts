import { describe, expect, it } from "vitest";
import type { ByteSource } from "../contract/byte-source";
import { kindOf } from "../contract/kinds";
import type { Limits } from "../contract/limits";
import { resolve } from "./resolve";

const MiB = 1024 * 1024;
const src = (size: number): ByteSource => ({
  size,
  read: () => {
    throw new Error("read called");
  },
});
const run = (name: string, size: number, limits?: Partial<Limits>) =>
  resolve({ name, source: src(size) }, limits);

describe("resolve", () => {
  it("views a small image", () => {
    expect(run("a.png", 10)).toMatchObject({ status: "view", view: "image" });
  });
  it("marks a 65 MiB image too large", () => {
    expect(run("a.png", 65 * MiB).status).toBe("too_large");
  });
  it("marks a 2 MiB text file too large", () => {
    expect(run("notes.txt", 2 * MiB).status).toBe("too_large");
  });
  it("honours a raised textBytes limit", () => {
    expect(run("notes.txt", 2 * MiB, { textBytes: 4 * MiB })).toMatchObject({
      status: "view",
      view: "text",
    });
  });
  it("marks a zip unsupported", () => {
    expect(run("a.zip", 1024).status).toBe("unsupported");
  });
  it("keeps edit for a too-large video", () => {
    const r = run("clip.mp4", 100 * MiB);
    expect(r.status).toBe("too_large");
    expect(r.edit).toBe(kindOf({ name: "clip.mp4", size: 100 * MiB }).edit);
  });
});
