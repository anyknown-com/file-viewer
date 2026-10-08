/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { encodePng, readProject } from "../../comp/index";
import type { AdjustmentKind, AdjustmentSettings, Doc, Layer, LayerId, LayerPixels } from "../api";
import { resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { registerAdjust } from "./install";
import { ADJUSTMENT_KINDS, defaultAdjustment } from "./settings";

const SIZE = 128;
const FULL = { x: 0, y: 0, width: SIZE, height: SIZE };
const mounted: (() => void)[] = [];

beforeEach(() => {
  resetRegistry();
  registerAdjust();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const diagonal = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];
const range = { black: 0, gamma: 1, white: 255, outputBlack: 0, outputWhite: 255 };

/** One setting per kind that moves the gradient away from where it started. */
const PATCH: Record<AdjustmentKind, Partial<AdjustmentSettings>> = {
  Levels: {
    levels: {
      channel: "RGB",
      ranges: [{ ...range, black: 20, white: 230, gamma: 1.4 }, range, range, range],
    },
  },
  Curves: {
    curves: {
      channel: "RGB",
      channels: [
        [
          { x: 0, y: 0 },
          { x: 64, y: 40 },
          { x: 192, y: 220 },
          { x: 255, y: 255 },
        ],
        diagonal,
        diagonal,
        diagonal,
      ],
    },
  },
  Exposure: { exposureSettings: { exposure: 0.7, offset: 0.02, gamma: 1.2 } },
  "Hue/Saturation": { hue: 30 },
  "Gradient Map": {
    gradientMapSettings: {
      shadows: { red: 0.1, green: 0.2, blue: 0.5 },
      highlights: { red: 1, green: 0.9, blue: 0.3 },
      reversed: false,
    },
  },
  "Black & White": {
    blackWhiteSettings: {
      reds: 40,
      yellows: 60,
      greens: 40,
      cyans: 60,
      blues: 20,
      magentas: 80,
      tint: false,
      tintHue: 0,
      tintSaturation: 0,
    },
  },
  "Color Balance": {
    colorBalanceSettings: {
      shadowCyanRed: 20,
      shadowMagentaGreen: -30,
      shadowYellowBlue: 40,
      midCyanRed: 30,
      midMagentaGreen: -20,
      midYellowBlue: -40,
      highlightCyanRed: -10,
      highlightMagentaGreen: 25,
      highlightYellowBlue: 0,
      preserveLuminosity: true,
    },
  },
  Invert: {},
  Grain: { grainSettings: { amount: 100, size: 3, roughness: 50, seed: 7 } },
  "Add Noise": { noiseAmount: 40, noiseSeed: 7 },
  "Gaussian Blur": { blurRadius: 4 },
  "Motion Blur": { motionAngle: 30, motionDistance: 12 },
};

/** Opaque, red across, green down, blue the other way: every channel varies everywhere. */
function gradient(): Uint8Array {
  const px = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      px.set([x * 2, y * 2, 255 - x - y, 255], (y * SIZE + x) * 4);
    }
  }
  return px;
}

/** The gradient under all 12 adjustment layers, only `shown` visible; the composite. */
async function render(shown: AdjustmentKind | null): Promise<Uint8Array> {
  const layers: Partial<Layer>[] = [
    {},
    ...ADJUSTMENT_KINDS.map((kind) => ({
      isVisible: kind === shown,
      adjustment: { ...defaultAdjustment(kind, 7), ...PATCH[kind] },
    })),
  ];
  const doc = makeDoc({ width: SIZE, height: SIZE, layers });
  const errors: unknown[] = [];
  const m = await mountCanvas(doc, undefined, { onError: (e) => errors.push(e) });
  mounted.push(m.unmount);
  m.api.writeRegion(doc.manifest.layers[0].id, "image", FULL, gradient());
  m.api.requestRender();
  const out = m.api.readComposite(FULL);
  expect(errors).toEqual([]);
  expect(m.api.gl.getError()).toBe(m.api.gl.NO_ERROR);
  return out;
}

describe("all 12 adjustment kinds", () => {
  it.each(ADJUSTMENT_KINDS)("%s changes the image below it", async (kind) => {
    const hidden = await render(null);
    expect(await render(kind)).not.toEqual(hidden);
  });
});

// A project saved by Compositor with all 12 adjustment layers; not in the repo yet.
const fixture = Object.values(
  import.meta.glob<string>("../__fixtures__/adjustments.comp.zip", {
    query: "?url",
    import: "default",
    eager: true,
  }),
)[0];

(fixture ? describe : describe.skip)("Compositor's adjustments.comp.zip", () => {
  it("renders without errors", async () => {
    const res = await fetch(fixture ?? "");
    const project = readProject(new Uint8Array(await res.arrayBuffer()));
    const pixels = new Map<LayerId, { image?: LayerPixels }>();
    for (const layer of project.manifest.layers) {
      if (!layer.isGroup && !layer.adjustment) pixels.set(layer.id, { image: { kind: "gpu" } });
    }
    const doc: Doc = { manifest: project.manifest, pixels };
    const { width, height } = doc.manifest;
    const errors: unknown[] = [];
    const m = await mountCanvas(doc, undefined, { onError: (e) => errors.push(e) });
    mounted.push(m.unmount);
    m.api.requestRender();
    const rgba = m.api.readComposite({ x: 0, y: 0, width, height });
    expect(errors).toEqual([]);
    // For a look next to QuickLook/Preview.jpg. Browser commands write only under the project
    // root, so this lands in node_modules/.vitest rather than $TMPDIR.
    const png = encodePng({ width, height, channels: 4, data: rgba });
    let binary = "";
    for (const byte of png) binary += String.fromCharCode(byte);
    await commands.writeFile("node_modules/.vitest/adjustments-render.png", btoa(binary), "base64");
  });
});
