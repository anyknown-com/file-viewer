// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/IO/ProjectStore.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
import { z } from "zod";
import { ProjectError } from "./errors";
import { optional, record, toJsonValue } from "./extra";
import { canvasGuideSchema, uuidSchema } from "./manifest-guides";
import { layerRecordSchema } from "./manifest-layer";
import { sortTreeOrder } from "./tree";

// ProjectStore.swift `ProjectManifest.format` and `.current`.
const FORMAT = "com.compositor.project";
const CURRENT_VERSION = 11;

// ProjectStore.swift `ProjectManifest`: `format`, `version` and `colorSpace` have default values
// but are still required keys.
export const manifestSchema = record({
  format: z.string(),
  version: z.number().int(),
  colorSpace: z.string(),
  resolution: optional(z.number()),
  documentID: uuidSchema,
  width: z.number().int(),
  height: z.number().int(),
  activeLayerID: optional(uuidSchema),
  layers: z.array(layerRecordSchema),
  guides: optional(z.array(canvasGuideSchema)),
});
/** The parsed manifest.json of a project: canvas, layers and guides. */
export type Manifest = z.output<typeof manifestSchema>;

/** Reads manifest.json. Layers come back in tree order (LayerGroups.swift `LayerHierarchy.entries`). */
export function parseManifest(bytes: Uint8Array): Manifest {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ProjectError("invalid", ["manifest.json is not UTF-8 JSON"]);
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new ProjectError("invalid", ["manifest.json is not a JSON object"]);
  }
  // ProjectStore.readPackage decodes `Header` (format and version) before the whole manifest.
  const header = json as { format?: unknown; version?: unknown };
  if (header.format !== FORMAT) throw new ProjectError("not_project");
  const version = header.version;
  if (typeof version === "number" && Number.isInteger(version) && version > CURRENT_VERSION) {
    throw new ProjectError("too_new", [`saved by a newer Compositor (version ${version})`]);
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProjectError(
      "invalid",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  return { ...parsed.data, layers: sortTreeOrder(parsed.data.layers) };
}

/**
 * manifest.json text: version 11, every layer with `isGroup`, `opacity` and `blendMode` (as
 * ProjectStore.save writes them), unknown keys merged back, keys sorted, two-space indent.
 */
export function stringifyManifest(m: Manifest): string {
  const layers = m.layers.map((layer) => ({
    ...layer,
    isGroup: layer.isGroup ?? false,
    opacity: layer.opacity ?? 1,
    blendMode: layer.blendMode ?? "Normal",
  }));
  return JSON.stringify(toJsonValue({ ...m, version: CURRENT_VERSION, layers }), null, 2);
}
