// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProjectError } from "./errors";
import { fromImage, readProject, writeProject } from "./project";
import { readHead } from "./project-head";
import { writeZip } from "./zip-write";

const enc = new TextEncoder();

async function zipOf(entries: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  return new Uint8Array(await writeZip(entries).arrayBuffer());
}

function source(zip: Uint8Array, limit = zip.length) {
  return async (start: number, end: number) => zip.slice(start, Math.min(end, limit));
}

async function failure(promise: Promise<unknown>): Promise<ProjectError> {
  try {
    await promise;
  } catch (error) {
    return error as ProjectError;
  }
  throw new Error("expected a ProjectError");
}

const base = {
  format: "com.compositor.project",
  colorSpace: "sRGB",
  documentID: "0C5E7A91-3B2D-4F6A-8E1C-9D0B7A6F5E4D",
  width: 4,
  height: 4,
  layers: [] as unknown[],
};

describe("readHead", () => {
  it("reads the manifest and preview without the rest of the file", async () => {
    const preview = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const p = fromImage({ width: 4, height: 4, rgba: new Uint8Array(64).fill(9) }, "L");
    const zip = new Uint8Array(await writeProject({ ...p, preview }).arrayBuffer());
    const manifestLen = enc.encode(JSON.stringify(p.manifest, null, 2)).length;
    const previewEnd = zip.indexOf(0xd9, manifestLen) + 1; // inside the head; image data follows
    const head = await readHead(source(zip, previewEnd));
    expect(head?.manifest).toEqual(readProject(zip).manifest);
    expect(head?.preview).toEqual(preview);
  });

  it("returns null for a zip written by ditto", async () => {
    const zip = new Uint8Array(readFileSync("src/comp/fixtures/ditto-project.comp.zip"));
    expect(await readHead(source(zip))).toBeNull();
  });

  it("rejects a manifest Compositor would refuse", async () => {
    const bad = { ...base, version: 1, layers: [{ ...layer(), parentID: layer().id }] };
    const zip = await zipOf([{ name: "manifest.json", data: enc.encode(JSON.stringify(bad)) }]);
    expect((await failure(readHead(source(zip)))).code).toBe("invalid");
  });

  it("rejects a manifest from a newer Compositor", async () => {
    const zip = await zipOf([
      { name: "manifest.json", data: enc.encode(JSON.stringify({ ...base, version: 12 })) },
    ]);
    expect((await failure(readHead(source(zip)))).code).toBe("too_new");
  });
});

function layer() {
  const id = "6F1D3C2A-0B7E-4E8A-9C4D-2A1B3C4D5E6F";
  return {
    id,
    name: "L",
    imageFile: `${id}.png`,
    isVisible: true,
    isGroup: false,
    opacity: 1,
    blendMode: "Normal",
    transform: {
      origin: [0, 0],
      size: [4, 4],
      rotation: 0,
      flipX: false,
      flipY: false,
      sampling: "High quality",
    },
  };
}
