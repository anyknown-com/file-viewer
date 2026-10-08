// @vitest-environment node
// Fixture ditto-project.comp.zip was made on macOS (2026-10-08) with the minimal manifest from
// Compositor docs/writing-comp-files.md @11d8d7a (width, height and transform.size set to 4x4):
//   d=$(mktemp -d) && mkdir -p "$d/ditto.comp/images" \
//     && cp manifest.json "$d/ditto.comp/manifest.json" \
//     && node -e 'const {PNG}=require("pngjs");const p=new PNG({width:4,height:4});
//        for(let y=0;y<4;y++)for(let x=0;x<4;x++){const i=(y*4+x)*4;
//        p.data[i]=x*60;p.data[i+1]=y*60;p.data[i+2]=128;p.data[i+3]=200}
//        require("fs").writeFileSync(process.argv[1],PNG.sync.write(p))' \
//        "$d/ditto.comp/images/6F1D3C2A-0B7E-4E8A-9C4D-2A1B3C4D5E6F.png" \
//     && touch "$d/ditto.comp/.DS_Store" \
//     && (cd "$d" && ditto -c -k --sequesterRsrc --keepParent ditto.comp ditto-project.comp.zip) \
//     && cp "$d/ditto-project.comp.zip" src/comp/fixtures/ditto-project.comp.zip
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProjectError } from "./errors";
import { parseManifest } from "./manifest";
import { decodePng } from "./png-decode";
import { fromImage, readProject, writeProject } from "./project";
import type { Project } from "./project";
import { validateLikeCompositor } from "./validate";
import { readHeadEntries } from "./zip-head";
import { writeZip } from "./zip-write";

const ID = "6F1D3C2A-0B7E-4E8A-9C4D-2A1B3C4D5E6F";

function pixels(w = 4, h = 4): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set([x * 60, y * 60, 128, 200], (y * w + x) * 4);
  }
  return data;
}

async function bytesOf(p: Project): Promise<Uint8Array> {
  return new Uint8Array(await writeProject(p).arrayBuffer());
}

function failure(fn: () => unknown): ProjectError {
  try {
    fn();
  } catch (error) {
    return error as ProjectError;
  }
  throw new Error("expected a ProjectError");
}

describe("fromImage / writeProject / readProject", () => {
  it("round-trips a one-layer project", async () => {
    const p = fromImage({ width: 4, height: 4, rgba: pixels() }, "  ");
    expect(p.manifest.layers[0]?.name).toBe("Background");
    expect(p.manifest.layers[0]?.id).toBe(p.manifest.activeLayerID);
    expect(validateLikeCompositor(p.manifest)).toEqual([]);
    const back = readProject(await bytesOf(p));
    expect(back.manifest).toEqual(p.manifest);
    expect([...back.assets.keys()]).toEqual([...p.assets.keys()]);
    for (const [name, png] of p.assets) expect(back.assets.get(name)).toEqual(png);
    expect(back.preview).toBeUndefined();
    expect(validateLikeCompositor(back.manifest)).toEqual([]);
  });

  it("read, write, read keeps the manifest and every PNG byte", async () => {
    const first = readProject(
      await bytesOf(fromImage({ width: 4, height: 4, rgba: pixels() }, "L")),
    );
    const second = readProject(await bytesOf(first));
    expect(second.manifest).toEqual(first.manifest);
    for (const [name, png] of first.assets) expect(second.assets.get(name)).toEqual(png);
  });

  it("writes manifest.json first, then the preview", async () => {
    const p = fromImage({ width: 4, height: 4, rgba: pixels() }, "L");
    const preview = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const zip = await bytesOf({ ...p, preview });
    const head = await readHeadEntries(async (s, e) => zip.slice(s, e));
    expect(head?.manifest).toBeDefined();
    expect(head?.preview).toEqual(preview);
    expect(readProject(zip).preview).toEqual(preview);
  });

  it("reads a project made by ditto", () => {
    const p = readProject(new Uint8Array(readFileSync("src/comp/fixtures/ditto-project.comp.zip")));
    expect(p.manifest.layers).toHaveLength(1);
    expect(p.manifest.width).toBe(4);
    const png = p.assets.get(`images/${ID}.png`);
    expect(png).toBeDefined();
    const image = decodePng(png as Uint8Array, "layer");
    expect(image.data).toEqual(pixels());
  });

  it("rejects a manifest that names a missing image", async () => {
    const p = fromImage({ width: 4, height: 4, rgba: pixels() }, "L");
    const layer = p.manifest.layers[0];
    if (!layer) throw new Error("no layer");
    const err = failure(() => writeProject({ manifest: p.manifest, assets: new Map() }));
    expect(err.code).toBe("missing_asset");
    expect(err.details).toEqual([`images/${layer.imageFile}`]);
    const zipBytes = await writeZip([
      { name: "manifest.json", data: new TextEncoder().encode(JSON.stringify(p.manifest)) },
    ]).arrayBuffer();
    const read = failure(() => readProject(new Uint8Array(zipBytes)));
    expect(read.code).toBe("missing_asset");
    expect(read.details).toEqual([`images/${layer.imageFile}`]);
  });

  it("rejects a version 3 manifest that has a mask", () => {
    const p = fromImage({ width: 4, height: 4, rgba: pixels() }, "L");
    const layer = p.manifest.layers[0];
    if (!layer) throw new Error("no layer");
    const manifest = parseManifest(
      new TextEncoder().encode(
        JSON.stringify({
          ...p.manifest,
          version: 3,
          layers: [{ ...layer, maskFile: `${layer.id}.mask.png` }],
        }),
      ),
    );
    const assets = new Map(p.assets);
    assets.set(`images/${layer.id}.mask.png`, new Uint8Array(8));
    const err = failure(() => writeProject({ manifest, assets }));
    expect(err.code).toBe("invalid");
    expect(err.details.length).toBeGreaterThan(0);
  });

  it("rejects an asset that is not a PNG", async () => {
    const p = fromImage({ width: 4, height: 4, rgba: pixels() }, "L");
    const name = [...p.assets.keys()][0] as string;
    const zip = await bytesOf({ ...p, assets: new Map([[name, new Uint8Array(100)]]) });
    expect(failure(() => readProject(zip)).code).toBe("bad_png");
  });

  it("writes nothing for an invalid manifest", () => {
    const p = fromImage({ width: 4, height: 4, rgba: pixels() }, "L");
    const bad = { ...p.manifest, width: 0 };
    const err = failure(() => writeProject({ ...p, manifest: bad }));
    expect(err.code).toBe("invalid");
  });

  it("does not write assets the manifest does not use", async () => {
    const p = fromImage({ width: 4, height: 4, rgba: pixels() }, "L");
    const assets = new Map(p.assets);
    assets.set("images/UNUSED.png", new Uint8Array([1, 2, 3]));
    const back = readProject(await bytesOf({ ...p, assets }));
    expect(back.assets.has("images/UNUSED.png")).toBe(false);
    expect(back.assets.size).toBe(1);
  });

  it("reports a zip without manifest.json as not_project", async () => {
    const zip = new Uint8Array(
      await writeZip([{ name: "a.txt", data: new Uint8Array(1) }]).arrayBuffer(),
    );
    expect(failure(() => readProject(zip)).code).toBe("not_project");
  });
});
