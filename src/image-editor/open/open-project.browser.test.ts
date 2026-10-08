import { zipSync } from "fflate";
import { afterEach, expect, it, vi } from "vitest";
import { encodePng, writeProject } from "../../comp/index";
import { crc32 } from "../../comp/crc32";
import { bytesSource, type ByteSource } from "../../contract/byte-source";
import { resolveLimits, type Limits } from "../../contract/limits";
import { createGl, destroyGl } from "../engine/gl/context";
import { createTextureStore } from "../engine/textures";
import { makeDoc } from "../test/make-doc";
import { createWorkerRunner, type WorkerRunner } from "../worker/run-in-worker";
import { OpenFailure } from "./open-failure";
import { openProject } from "./open-project";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function deps(maxTexture: number) {
  const created = createGl(document.createElement("canvas"));
  if (!created) throw new Error("No WebGL2.");
  const real = createWorkerRunner();
  cleanups.push(() => {
    real.terminate();
    destroyGl(created.gl);
  });
  const run = vi.fn<WorkerRunner["run"]>(real.run);
  const runner: WorkerRunner = {
    run: run as WorkerRunner["run"],
    terminate: vi.fn<() => void>(),
  };
  return { textures: createTextureStore(created.gl), maxTexture, runner, run };
}

/** A PNG that is only a valid header claiming `width` × `height` (enough for `pngSize`). */
function pngHeader(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(17);
  const view = new DataView(ihdr.buffer);
  ihdr.set([0x49, 0x48, 0x44, 0x52]);
  view.setUint32(4, width);
  view.setUint32(8, height);
  ihdr.set([8, 6, 0, 0, 0], 12);
  const out = new Uint8Array(8 + 4 + 17 + 4);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(out.buffer).setUint32(8, 13);
  out.set(ihdr, 12);
  new DataView(out.buffer).setUint32(29, crc32(ihdr));
  return out;
}

/** A one-layer project named "Big" whose image is `png`. */
async function project(png: Uint8Array): Promise<ByteSource> {
  const { manifest } = makeDoc({ width: 4, height: 4, layers: [{ name: "Big" }] });
  const layer = manifest.layers[0];
  layer.imageFile = `${layer.id}.png`;
  const blob = writeProject({ manifest, assets: new Map([[`images/${layer.imageFile}`, png]]) });
  return bytesSource(new Uint8Array(await blob.arrayBuffer()));
}

async function failure(source: ByteSource, d = deps(16384), limits: Limits = resolveLimits()) {
  const file = { name: "a.comp.zip", source };
  const error = await openProject(file, limits, d, new AbortController().signal).catch((e) => e);
  expect(error).toBeInstanceOf(OpenFailure);
  return error as OpenFailure;
}

it("stops at a layer wider than the GPU allows, before decoding anything", async () => {
  const d = deps(8);
  const png = encodePng({ width: 16, height: 1, channels: 4, data: new Uint8Array(64) });
  const f = await failure(await project(png), d);
  expect(f.key).toBe("image.open.layerTooLarge");
  expect(f.vars?.name).toBe("Big");
  expect(f.error.code).toBe("too_large");
  expect(d.run).not.toHaveBeenCalled();
});

it("stops at a layer pixel total over the budget, before decoding anything", async () => {
  const d = deps(30_000);
  const f = await failure(await project(pngHeader(15_000, 15_000)), d);
  expect(f.key).toBe("image.open.budget");
  expect(d.run).not.toHaveBeenCalled();
});

it("maps a zip that is not a project to decode_failed", async () => {
  const f = await failure(bytesSource(zipSync({ "a.txt": new Uint8Array(1) })));
  expect(f.error.code).toBe("decode_failed");
  expect(f.key).toBe("image.open.notProject");
});

it("refuses a file over projectBytes without reading it", async () => {
  const source = bytesSource(new Uint8Array(64));
  const read = vi.spyOn(source, "read");
  const f = await failure(source, deps(16384), resolveLimits({ projectBytes: 10 }));
  expect(f.key).toBe("error.too_large");
  expect(f.error.code).toBe("too_large");
  expect(read).not.toHaveBeenCalled();
});
