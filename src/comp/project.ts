import { ProjectError } from "./errors";
import { parseManifest, stringifyManifest } from "./manifest";
import type { Manifest } from "./manifest";
import { encodePng } from "./png-encode";
import { pngSize } from "./png-decode";
import { validateLikeCompositor } from "./validate";
import { readZip } from "./zip-read";
import { writeZip } from "./zip-write";

/** A .comp.zip project: its manifest, image assets and optional preview. */
export type Project = {
  /** The parsed manifest.json. */
  manifest: Manifest;
  /** PNG bytes by entry name: "images/<ID>.png" and "images/<ID>.mask.png". */
  assets: Map<string, Uint8Array>;
  /** The QuickLook/Preview.jpg bytes, when the archive has one. */
  preview?: Uint8Array;
};

const MANIFEST = "manifest.json";
const PREVIEW = "QuickLook/Preview.jpg";

// ProjectStore.swift `readPackage` / `save`: images live in `images/`, named by the layer's
// `imageFile` / `maskFile`. Returned in manifest layer order, image before mask.
function usedAssets(m: Manifest): string[] {
  const names: string[] = [];
  for (const layer of m.layers) {
    if (layer.imageFile !== undefined) names.push(`images/${layer.imageFile}`);
    if (layer.maskFile !== undefined) names.push(`images/${layer.maskFile}`);
  }
  return [...new Set(names)];
}

function assertValid(m: Manifest): void {
  const problems = validateLikeCompositor(m);
  if (problems.length > 0) throw new ProjectError("invalid", problems);
}

function assertAssets(m: Manifest, assets: { has(name: string): boolean }): string[] {
  const used = usedAssets(m);
  const missing = used.filter((name) => !assets.has(name));
  if (missing.length > 0) throw new ProjectError("missing_asset", missing);
  return used;
}

/** Reads and validates a .comp.zip project from its bytes. Throws ProjectError when it is not a valid project. */
export function readProject(bytes: Uint8Array): Project {
  const entries = readZip(bytes);
  const manifestBytes = entries.get(MANIFEST);
  if (!manifestBytes) throw new ProjectError("not_project");
  const manifest = parseManifest(manifestBytes);
  assertValid(manifest);
  const used = assertAssets(manifest, entries);
  const assets = new Map<string, Uint8Array>();
  for (const name of used) {
    const png = entries.get(name) as Uint8Array;
    try {
      pngSize(png);
    } catch (error) {
      if (error instanceof ProjectError && error.code === "bad_png") {
        throw new ProjectError("bad_png", [name, ...error.details]);
      }
      throw error;
    }
    assets.set(name, png);
  }
  const preview = entries.get(PREVIEW);
  return preview ? { manifest, assets, preview } : { manifest, assets };
}

/** Validates a project and writes it as a .comp.zip Blob. Throws ProjectError when the project is invalid. */
export function writeProject(p: Project): Blob {
  assertValid(p.manifest);
  const used = assertAssets(p.manifest, p.assets);
  const entries: { name: string; data: Uint8Array }[] = [
    { name: MANIFEST, data: new TextEncoder().encode(stringifyManifest(p.manifest)) },
  ];
  if (p.preview) entries.push({ name: PREVIEW, data: p.preview });
  for (const name of used) entries.push({ name, data: p.assets.get(name) as Uint8Array });
  return writeZip(entries);
}

/** Makes a one-layer project from RGBA pixels. */
export function fromImage(
  image: { width: number; height: number; rgba: Uint8Array },
  layerName: string,
): Project {
  const { width, height, rgba } = image;
  const id = crypto.randomUUID().toUpperCase();
  const imageFile = `${id}.png`;
  const manifest = parseManifest(
    new TextEncoder().encode(
      JSON.stringify({
        format: "com.compositor.project",
        version: 11,
        colorSpace: "sRGB",
        resolution: 72,
        documentID: crypto.randomUUID().toUpperCase(),
        width,
        height,
        activeLayerID: id,
        layers: [
          {
            id,
            name: layerName.trim() === "" ? "Background" : layerName,
            imageFile,
            isVisible: true,
            isGroup: false,
            opacity: 1,
            blendMode: "Normal",
            transform: {
              origin: [0, 0],
              size: [width, height],
              rotation: 0,
              flipX: false,
              flipY: false,
              sampling: "High quality",
            },
          },
        ],
      }),
    ),
  );
  const png = encodePng({ width, height, channels: 4, data: rgba });
  return { manifest, assets: new Map([[`images/${imageFile}`, png]]) };
}
