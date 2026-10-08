import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodePng, readProject, validateLikeCompositor, writeProject } from "../../comp/index";
import type { AdjustmentSettings, EditorApi, Layer } from "../api";
import type { DocStore } from "../doc/store";
import { setEffects } from "../effects/commands";
import { defaultEffect, EFFECT_NAMES } from "../effects/defaults";
import { resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountEditor } from "../test/mount-editor";
import { addAdjustmentLayer, setAdjustment } from "./commands";
import { FIELDS, getPath, resolveAdjustment, setPath } from "./panels/fields";
import { registerAdjust } from "./install";
import { ADJUSTMENT_KINDS, defaultAdjustment, KIND_KEY } from "./settings";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BASE = uuid(1);
let m: { api: EditorApi; store: DocStore; unmount(): void };

beforeEach(() => {
  resetRegistry();
  registerAdjust();
});
afterEach(() => {
  m?.unmount();
  resetRegistry();
});

/** A non-default value for one field of the kind. */
function tweak(s: AdjustmentSettings): AdjustmentSettings {
  const key = KIND_KEY[s.kind];
  if (key === "levels") {
    const levels = s.levels;
    const ranges = levels.ranges.map((r, n) => (n === 0 ? { ...r, black: 20 } : r));
    return { ...s, levels: { ...levels, ranges } };
  }
  if (key === "curves") {
    const curves = s.curves;
    const channels = curves.channels.map((c, i) =>
      i === 0
        ? [
            { x: 0, y: 0 },
            { x: 100, y: 150 },
            { x: 255, y: 255 },
          ]
        : c,
    );
    return { ...s, curves: { ...curves, channels } };
  }
  if (key === "hueSaturation") return { ...s, hue: 30, saturation: 20, lightness: -10 };
  if (key === "gradientMap") {
    return setPath(resolveAdjustment(s), "gradientMapSettings.shadows", {
      red: 0.2,
      green: 0.4,
      blue: 0.6,
    });
  }
  const field = FIELDS[key].find((f) => f.type === "slider");
  if (!field || field.type !== "slider") return s;
  const base = resolveAdjustment(s);
  const cur = getPath(base, field.path) as number;
  const next =
    cur + (field.max - field.min) / 4 <= field.max
      ? cur + (field.max - field.min) / 4
      : cur - (field.max - field.min) / 4;
  return setPath(base, field.path, next);
}

describe("save and reload", () => {
  it("keeps all 12 adjustments and 6 effects, and undo/redo returns to the same manifest", async () => {
    m = await mountEditor(makeDoc({ width: 64, height: 64, layers: [{ id: BASE, name: "Base" }] }));
    const ids: string[] = [];
    for (const kind of ADJUSTMENT_KINDS) {
      const id = uuid(100 + ids.length);
      ids.push(id);
      m.api.dispatch(
        addAdjustmentLayer({
          id,
          kind,
          name: kind,
          width: 64,
          height: 64,
          active: m.api.session().active,
          settings: defaultAdjustment(kind, 7),
          withMask: false,
        }),
        "image.adjust.add",
      );
      const added = m.api.doc().manifest.layers.find((l) => l.id === id)!;
      m.api.dispatch(setAdjustment(id, tweak(added.adjustment!)), "image.adjust.change");
    }
    const effects: Record<string, unknown> = {};
    for (const name of EFFECT_NAMES) {
      effects[name] = { ...defaultEffect(name), opacity: 0.6, red: 0.2, green: 0.4, blue: 0.8 };
    }
    m.api.dispatch(setEffects(BASE, effects as Layer["effects"]), "image.effects.change");

    const manifest = m.api.doc().manifest;
    expect(manifest.layers.filter((l) => l.adjustment)).toHaveLength(12);
    for (const id of ids) {
      const l = manifest.layers.find((x) => x.id === id)!;
      // Invert has no settings to change.
      if (l.adjustment?.kind === "Invert") continue;
      expect(l.adjustment).not.toEqual(defaultAdjustment(l.adjustment!.kind, 7));
    }
    expect(validateLikeCompositor(manifest)).toEqual([]);

    const pixels = m.api.readRegion(BASE, "image", { x: 0, y: 0, width: 64, height: 64 });
    const png = encodePng({ width: 64, height: 64, channels: 4, data: pixels });
    const imageFile = manifest.layers.find((l) => l.id === BASE)?.imageFile;
    const assets = new Map<string, Uint8Array>(imageFile ? [[imageFile, png]] : []);
    const blob = writeProject({ manifest, assets });
    const back = readProject(new Uint8Array(await blob.arrayBuffer()));
    for (const l of manifest.layers) {
      const r = back.manifest.layers.find((x) => x.id === l.id);
      expect(r?.adjustment).toEqual(l.adjustment);
      expect(r?.effects).toEqual(l.effects);
    }

    const final = structuredClone(manifest);
    for (let i = 0; i < 100 && m.store.get().manifest.layers.length > 1; i++) m.store.undo();
    for (let i = 0; i < 100; i++) m.store.redo();
    expect(m.store.get().manifest).toEqual(final);
  });
});
