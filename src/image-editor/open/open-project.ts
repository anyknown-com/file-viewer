// Opens a .comp.zip project: sizes and the pixel budget are checked from the PNG headers before
// any layer is decoded (in the worker) and uploaded.
import { pngSize, ProjectError, readProject, type Project } from "../../comp/index";
import { readBlob, type FileRef } from "../../contract/byte-source";
import { ViewerError } from "../../contract/errors";
import type { Limits } from "../../contract/limits";
import type { Doc, LayerId, LayerPixels, PixelTarget } from "../api";
import type { TextureStore } from "../engine/textures";
import { MAX_LAYER_SIDE, pixelBudget } from "../limits";
import type { createWorkerRunner } from "../worker/run-in-worker";
import { fromProjectError, OpenFailure } from "./open-failure";

type Asset = { id: LayerId; target: PixelTarget; bytes: Uint8Array };

function read(bytes: Uint8Array): Project {
  try {
    return readProject(bytes);
  } catch (e) {
    throw e instanceof ProjectError ? fromProjectError(e) : e;
  }
}

/** Every layer's image and mask PNG, after the side and budget checks. */
function checkedAssets(project: Project, maxTexture: number): Asset[] {
  const side = Math.min(maxTexture, MAX_LAYER_SIDE);
  const out: Asset[] = [];
  const total = { image: 0, mask: 0 };
  for (const layer of project.manifest.layers) {
    const files = { image: layer.imageFile, mask: layer.maskFile } as const;
    for (const target of ["image", "mask"] as const) {
      const name = files[target];
      const bytes = name === undefined ? undefined : project.assets.get(`images/${name}`);
      if (!bytes) continue;
      const { width, height } = pngSize(bytes);
      if (width > side || height > side) {
        throw new OpenFailure(new ViewerError("too_large"), "image.open.layerTooLarge", {
          name: layer.name,
        });
      }
      total[target] += width * height;
      out.push({ id: layer.id, target, bytes });
    }
  }
  const budget = pixelBudget();
  if (total.image > budget || total.mask > budget) {
    throw new OpenFailure(new ViewerError("too_large"), "image.open.budget");
  }
  return out;
}

export async function openProject(
  file: FileRef,
  limits: Limits,
  deps: {
    textures: TextureStore;
    maxTexture: number;
    runner: ReturnType<typeof createWorkerRunner>;
  },
  signal: AbortSignal,
): Promise<Doc> {
  if (file.source.size > limits.projectBytes) {
    throw new OpenFailure(new ViewerError("too_large"), "error.too_large");
  }
  const blob = await readBlob(file.source, { type: "application/zip", signal });
  const project = read(new Uint8Array(await blob.arrayBuffer()));
  const assets = checkedAssets(project, deps.maxTexture);
  const sampling = new Map(project.manifest.layers.map((l) => [l.id, l.transform.sampling]));
  await Promise.all(
    assets.map(async ({ id, target, bytes }) => {
      const kind = target === "image" ? "layer" : "mask";
      const png = await deps.runner.run({ kind: "decodePng", input: { bytes, kind } }, [], signal);
      signal.throwIfAborted();
      deps.textures.upload(id, target, png, sampling.get(id));
    }),
  );
  const pixels = new Map<LayerId, { image?: LayerPixels; mask?: LayerPixels }>();
  for (const { id, target, bytes } of assets) {
    pixels.set(id, { ...pixels.get(id), [target]: { kind: "png", bytes } });
  }
  return { manifest: project.manifest, pixels };
}
