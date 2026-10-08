// Ported from Compositor (github.com/robbietilton/Compositor @11d8d7a, Compositor/IO/ProjectStore.swift), MIT, Copyright (c) 2026 Wonder Assembly LLC
//
// `ProjectStore.validate` and `validateGuides`, plus Compositor/Document/LayerGroups.swift
// `LayerHierarchy.validate` and Compositor/Document/LiveLayerMask.swift `LiveMaskGraph.validate`.
// Compositor throws on the first failure; here every failure becomes one message, so a reader (or
// an AI writing a .comp) sees all of them at once.
import type { Manifest } from "./manifest";
import type { LayerRecord } from "./manifest-layer";
import {
  MAX_SIDE,
  adjustmentProblems,
  checkRange,
  textProblems,
  transformProblems,
  within,
} from "./validate-records";

// ProjectStore.swift `ProjectManifest.format` and `.supported` (1...current).
const FORMAT = "com.compositor.project";
const CURRENT_VERSION = 11;

const utf8 = new TextEncoder();

function label(layer: LayerRecord): string {
  return `layer ${layer.id.slice(0, 8)} ${JSON.stringify(layer.name)}`;
}

// ProjectStore.validate: the manifest-wide checks and validateGuides.
function manifestProblems(m: Manifest, ids: Set<string>): string[] {
  const out: string[] = [];
  if (m.format !== FORMAT) out.push(`format must be ${FORMAT}`);
  if (!within(m.version, 1, CURRENT_VERSION)) out.push(`version must be in 1…${CURRENT_VERSION}`);
  if (m.colorSpace !== "sRGB") out.push("colorSpace must be sRGB");
  if (m.resolution !== undefined) checkRange(out, "resolution", m.resolution, 1, 9600);
  // DocumentLimits.swift `maxSide`.
  checkRange(out, "width", m.width, 1, MAX_SIDE);
  checkRange(out, "height", m.height, 1, MAX_SIDE);
  if (m.layers.length > 10_000) out.push("layers must have at most 10000 entries");
  if (m.activeLayerID !== undefined && !ids.has(m.activeLayerID)) {
    out.push("activeLayerID names no layer");
  }
  // validateGuides: guides arrived in version 8.
  const guides = m.guides ?? [];
  if (m.version < 8) {
    if (guides.length > 0) out.push("guides need version 8");
  } else {
    if (guides.length > 1_000) out.push("guides must have at most 1000 entries");
    const seen = new Set<string>();
    guides.forEach((guide, i) => {
      if (seen.has(guide.id)) out.push(`guides[${i}].id is a duplicate`);
      seen.add(guide.id);
      checkRange(out, `guides[${i}].position`, guide.position, -1_000_000, 1_000_000);
    });
  }
  return out.map((problem) => `manifest: ${problem}`);
}

// ProjectStore.validate: a text layer, with its version gates.
function textLayerProblems(v: number, layer: LayerRecord): string[] {
  const out: string[] = [];
  const isGroup = layer.isGroup === true;
  if (layer.text) {
    out.push(...textProblems(layer.text));
    // Per-letter colors arrived in version 10, per-letter faces in version 11.
    if (layer.text.colorRuns !== undefined && v < 10) out.push("text.colorRuns need version 10");
    if (layer.text.fontRuns !== undefined && v < 11) out.push("text.fontRuns need version 11");
    if (layer.imageFile === undefined) out.push("text needs imageFile");
    if (isGroup) out.push("text is not allowed on a folder");
    if (layer.adjustment) out.push("text is not allowed with adjustment");
  }
  return out;
}

// ProjectStore.validate: an adjustment layer, with its version gates.
function adjustmentLayerProblems(v: number, layer: LayerRecord): string[] {
  const out: string[] = [];
  const isGroup = layer.isGroup === true;
  if (layer.adjustment) {
    if (v < 7) out.push("adjustment needs version 7");
    if (isGroup) out.push("adjustment is not allowed on a folder");
    if (layer.imageFile !== undefined) out.push("adjustment is not allowed with imageFile");
    out.push(...adjustmentProblems(layer.adjustment));
    const kind = layer.adjustment.kind;
    if ((kind === "Gaussian Blur" || kind === "Motion Blur" || kind === "Add Noise") && v < 9) {
      out.push(`adjustment kind ${kind} needs version 9`);
    }
  }
  return out;
}

// ProjectStore.validate: layer masks arrived in version 4, folder masks in version 6.
function maskProblems(v: number, layer: LayerRecord): string[] {
  const out: string[] = [];
  if (layer.maskFile !== undefined) {
    const since = layer.isGroup === true ? 6 : 4;
    if (layer.maskFile !== `${layer.id}.mask.png`)
      out.push(`maskFile must be ${layer.id}.mask.png`);
    if (v < since) out.push(`maskFile needs version ${since}`);
  }
  if (layer.maskEnabled !== undefined && layer.maskFile === undefined) {
    out.push("maskEnabled needs maskFile");
  }
  if (layer.maskPlacement) {
    if (layer.maskFile === undefined) out.push("maskPlacement needs maskFile");
    out.push(...transformProblems(layer.maskPlacement, "maskPlacement"));
  }
  return out;
}

// ProjectStore.validate: opacity and blend mode.
function appearanceProblems(v: number, layer: LayerRecord): string[] {
  const out: string[] = [];
  const isGroup = layer.isGroup === true;
  const opacity = layer.opacity ?? 1;
  const blend = layer.blendMode ?? "Normal";
  checkRange(out, "opacity", opacity, 0, 1);
  if (v < 3 && (opacity !== 1 || blend !== "Normal")) {
    out.push("opacity and blendMode need version 3");
  }
  // Folders are pass-through: their blend mode stays Normal; their own opacity arrived in version 8.
  if (isGroup && blend !== "Normal") out.push("blendMode of a folder must be Normal");
  if (isGroup && v < 8 && opacity !== 1) out.push("opacity of a folder needs version 8");
  return out;
}

// ProjectStore.validate: clipping arrived in version 5, folders in version 2.
function versionGateProblems(v: number, layer: LayerRecord): string[] {
  const out: string[] = [];
  if (layer.maskSourceID !== undefined && v < 5) out.push("maskSourceID needs version 5");
  if (v === 1 && layer.parentID !== undefined) out.push("parentID needs version 2");
  if (v === 1 && layer.isGroup === true) out.push("isGroup needs version 2");
  return out;
}

// ProjectStore.validate: transform, name and imageFile, then the checks above.
function layerProblems(m: Manifest, layer: LayerRecord): string[] {
  const out = transformProblems(layer.transform, "transform");
  if (layer.name.trim() === "") out.push("name must not be blank");
  if (utf8.encode(layer.name).length > 16_384) out.push("name must be at most 16384 UTF-8 bytes");
  // Compositor compares against `id.uuidString`, which is uppercase.
  if (layer.imageFile !== undefined && layer.imageFile !== `${layer.id}.png`) {
    out.push(`imageFile must be ${layer.id}.png`);
  }
  out.push(...textLayerProblems(m.version, layer));
  out.push(...adjustmentLayerProblems(m.version, layer));
  out.push(...maskProblems(m.version, layer));
  out.push(...appearanceProblems(m.version, layer));
  out.push(...versionGateProblems(m.version, layer));
  return out;
}

// LayerGroups.swift `LayerHierarchy.validate`: a folder has no image; every parentID names a
// folder, without a cycle, at most 64 ancestors deep. A broken link is reported by the layer
// that holds it, a cycle by each layer on it, so one fault gives one message per layer at fault.
function hierarchyProblems(layer: LayerRecord, byID: Map<string, LayerRecord>): string[] {
  const out: string[] = [];
  if (layer.isGroup === true && layer.imageFile !== undefined) {
    out.push("imageFile is not allowed on a folder");
  }
  const seen = new Set([layer.id]);
  let holder = layer;
  let parent = layer.parentID;
  while (parent !== undefined) {
    if (seen.size > 64) {
      out.push("parentID chain must have at most 64 folders");
      return out;
    }
    if (seen.has(parent)) {
      if (parent === layer.id) out.push("parentID forms a cycle");
      return out;
    }
    seen.add(parent);
    const node = byID.get(parent);
    if (!node || node.isGroup !== true) {
      if (holder === layer)
        out.push(node ? "parentID names a layer that is not a folder" : "parentID names no layer");
      return out;
    }
    holder = node;
    parent = node.parentID;
  }
  if (layer.isGroup === true && seen.size > 64)
    out.push("parentID chain of a folder must have at most 63 folders");
  return out;
}

// LiveLayerMask.swift `LiveMaskGraph.validate`: walking maskSourceID from any layer reaches
// fewer than 256 layers without a cycle; a clipped layer is not a folder; its source exists and
// is neither a folder nor an adjustment layer.
function clippingProblems(layer: LayerRecord, byID: Map<string, LayerRecord>): string[] {
  const path = new Set<string>();
  let record = layer;
  for (;;) {
    if (path.size >= 256) return ["maskSourceID chain reaches 256 layers"];
    if (path.has(record.id)) return record.id === layer.id ? ["maskSourceID forms a cycle"] : [];
    path.add(record.id);
    const sourceID = record.maskSourceID;
    if (sourceID === undefined) return [];
    const source = byID.get(sourceID);
    const own = record === layer;
    if (record.isGroup === true) return own ? ["maskSourceID is not allowed on a folder"] : [];
    if (!source) return own ? ["maskSourceID names no layer"] : [];
    if (source.isGroup === true) return own ? ["maskSourceID names a folder"] : [];
    if (source.adjustment) return own ? ["maskSourceID names an adjustment layer"] : [];
    record = source;
  }
}

/**
 * Checks a manifest with the rules Compositor applies when it opens a project, and says why each
 * one fails. An empty array means Compositor opens it (asset files aside: `readProject` checks those).
 */
export function validateLikeCompositor(m: Manifest): string[] {
  const byID = new Map<string, LayerRecord>();
  const out: string[] = [];
  const layerOut: string[] = [];
  for (const layer of m.layers) {
    const problems: string[] = [];
    if (byID.has(layer.id)) problems.push("id is a duplicate");
    else byID.set(layer.id, layer);
    problems.push(...layerProblems(m, layer));
    for (const problem of problems) layerOut.push(`${label(layer)}: ${problem}`);
  }
  out.push(...manifestProblems(m, new Set(byID.keys())));
  out.push(...layerOut);
  for (const layer of m.layers) {
    const problems = [...hierarchyProblems(layer, byID), ...clippingProblems(layer, byID)];
    for (const problem of problems) out.push(`${label(layer)}: ${problem}`);
  }
  return out;
}
