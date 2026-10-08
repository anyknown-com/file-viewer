import { afterEach, describe, expect, it } from "vitest";
import { BLEND_MODES, type AdjustmentSettings, type Doc, type EditorApi, type Layer } from "../api";
import { internalsOf } from "../editor-api";
import { registerAdjustment, resetRegistry } from "../registry";
import { makeDoc } from "../test/make-doc";
import { mountCanvas } from "../test/mount-canvas";
import { compositeRef, type RGBA } from "./blend-ref";
import { createTarget } from "./gl/target";
import { createTextureStore } from "./textures";
import { exportTiles } from "./tiles";

type Color = [number, number, number, number];
const mounted: (() => void)[] = [];

async function mount(doc: Doc, colors?: Record<string, Color>) {
  const m = await mountCanvas(doc, colors);
  mounted.push(m.unmount);
  return m;
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  resetRegistry();
});

const at = (data: Uint8Array, width: number, x: number, y: number) =>
  Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
const full = (doc: Doc) => ({ x: 0, y: 0, width: doc.manifest.width, height: doc.manifest.height });
const half = (w: number, h: number): Partial<Layer> => ({
  transform: {
    origin: [0, 0],
    size: [w / 2, h],
    rotation: 0,
    flipX: false,
    flipY: false,
    sampling: "High quality",
  },
});
const ADJ = (kind: string) => ({ kind }) as unknown as AdjustmentSettings;

const maxDiff = (actual: number[], expected: number[]) =>
  Math.max(...actual.map((v, i) => Math.abs(v - expected[i])));

describe("render", () => {
  const below: Color = [153, 77, 204, 200];
  const above: Color = [64, 140, 100, 160];

  it.each(BLEND_MODES)("%s matches compositeRef within 1/255", async (mode) => {
    const doc = makeDoc({ width: 4, height: 4, layers: [{}, { blendMode: mode }] });
    const [b, s] = doc.manifest.layers;
    const { api } = await mount(doc, { [b.id]: below, [s.id]: above });
    const expected = compositeRef(
      below.map((v) => v / 255) as RGBA,
      above.map((v) => v / 255) as RGBA,
      mode,
    ).map((v) => v * 255);
    const out = api.readComposite({ x: 1, y: 1, width: 1, height: 1 });
    expect(maxDiff(Array.from(out), expected)).toBeLessThanOrEqual(1.01);
  });

  it("folder opacity 0.5 halves each child", async () => {
    const folder = makeDoc({
      width: 4,
      height: 4,
      layers: [{ id: "F", isGroup: true, opacity: 0.5 }, { parentID: "F" }],
    });
    const plain = makeDoc({ width: 4, height: 4, layers: [{ opacity: 0.5 }] });
    const color: Color = [200, 100, 50, 255];
    const a = await mount(folder, { [folder.manifest.layers[1].id]: color });
    const b = await mount(plain, { [plain.manifest.layers[0].id]: color });
    expect(
      maxDiff(
        Array.from(a.api.readComposite(full(folder))),
        Array.from(b.api.readComposite(full(plain))),
      ),
    ).toBeLessThanOrEqual(1);
  });

  it("multiplies a folder mask into every child", async () => {
    const doc = makeDoc({
      width: 4,
      height: 2,
      layers: [
        { id: "F", isGroup: true, maskFile: "F.mask.png" },
        { parentID: "F" },
        { parentID: "F" },
      ],
    });
    const { api } = await mount(doc);
    api.writeRegion(
      "F",
      "mask",
      { x: 0, y: 0, width: 4, height: 2 },
      Uint8Array.from([0, 0, 255, 255, 0, 0, 255, 255]),
    );
    const out = api.readComposite(full(doc));
    expect(at(out, 4, 0, 0)[3]).toBe(0);
    expect(at(out, 4, 3, 1)[3]).toBe(255);
  });

  it.each([true, false])(
    "clips the upper layer to where the base is opaque (base visible: %s)",
    async (isVisible) => {
      const doc = makeDoc({
        width: 4,
        height: 2,
        layers: [{ id: "B", isVisible, ...half(4, 2) }, { maskSourceID: "B" }],
      });
      const green: Color = [0, 255, 0, 255];
      const { api } = await mount(doc, { [doc.manifest.layers[1].id]: green });
      const out = api.readComposite(full(doc));
      expect(at(out, 4, 0, 0)).toEqual(green);
      expect(at(out, 4, 3, 0)[3]).toBe(0);
    },
  );

  it("ignores a disabled mask", async () => {
    const doc = makeDoc({
      width: 2,
      height: 2,
      layers: [{ maskFile: "M.mask.png", maskEnabled: false }],
    });
    const { api } = await mount(doc);
    api.writeRegion(doc.manifest.layers[0].id, "mask", full(doc), new Uint8Array(4));
    expect(at(api.readComposite(full(doc)), 2, 1, 1)[3]).toBe(255);
  });

  it.each([255, 0])("shows the mask's edge majority (%s) outside maskPlacement", async (value) => {
    const doc = makeDoc({ width: 4, height: 2, layers: [{ maskFile: "M.mask.png" }] });
    const layer = doc.manifest.layers[0];
    layer.maskPlacement = half(4, 2).transform;
    const { api } = await mount(doc);
    api.resizePixels(
      layer.id,
      "mask",
      { width: 2, height: 2 },
      { pixels: new Uint8Array(4).fill(value) },
    );
    expect(at(api.readComposite(full(doc)), 4, 3, 0)[3]).toBe(value);
  });

  it.each([1, 3] as const)(
    "looks up a %sD LUT and frees the old texture when the settings change",
    async (dims) => {
      const made: WebGLTexture[] = [];
      registerAdjustment("Invert", {
        lut(gl) {
          const t = gl.createTexture();
          if (dims === 1) {
            const data = new Float32Array(256 * 4).map((_, i) => 1 - Math.floor(i / 4) / 255);
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 256, 1, 0, gl.RGBA, gl.FLOAT, data);
          } else {
            const data = new Float32Array(33 ** 3 * 4);
            for (let b = 0; b < 33; b++)
              for (let g = 0; g < 33; g++)
                for (let r = 0; r < 33; r++)
                  data.set([1 - r / 32, 1 - g / 32, 1 - b / 32, 1], ((b * 33 + g) * 33 + r) * 4);
            gl.bindTexture(gl.TEXTURE_3D, t);
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 33, 33, 33, 0, gl.RGBA, gl.FLOAT, data);
          }
          made.push(t);
          return { dims, texture: t };
        },
        reach: () => 0,
      });
      const doc = makeDoc({ width: 2, height: 2, layers: [{}, { adjustment: ADJ("Invert") }] });
      const color: Color = [40, 120, 220, 255];
      const { api, store } = await mount(doc, { [doc.manifest.layers[0].id]: color });
      expect(
        maxDiff(at(api.readComposite(full(doc)), 2, 0, 0), [215, 135, 35, 255]),
      ).toBeLessThanOrEqual(1);
      const adj = doc.manifest.layers[1];
      const next = {
        ...doc,
        manifest: {
          ...doc.manifest,
          layers: [doc.manifest.layers[0], { ...adj, adjustment: ADJ("Invert") }],
        },
      };
      store.dispatch(() => next);
      api.readComposite(full(doc));
      expect(made).toHaveLength(2);
      expect(api.gl.isTexture(made[0])).toBe(false);
    },
  );

  it("runs a pass adjustment", async () => {
    registerAdjustment("Invert", {
      pass(gl, _src, dst) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
        gl.clearColor(1, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
      reach: () => 0,
    });
    const doc = makeDoc({ width: 2, height: 2, layers: [{}, { adjustment: ADJ("Invert") }] });
    const { api } = await mount(doc);
    expect(at(api.readComposite(full(doc)), 2, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  it("leaves renderHidden layers off the screen but not out of an export", async () => {
    const doc = makeDoc({ width: 2, height: 2, layers: [{}] });
    const { api } = await mount(doc);
    api.setSession({ renderHidden: new Set([doc.manifest.layers[0].id]) });
    const { renderer } = internalsOf(api);
    const t = createTarget(api.gl, 2, 2, "rgba16f");
    const out = { framebuffer: t.framebuffer, width: 2, height: 2, docRect: full(doc) };
    renderer.render(api.doc(), api.session(), out, { forExport: false });
    expect(renderer.readStraight(t.texture, 2, 2)[3]).toBe(0);
    expect(api.readComposite(full(doc))[3]).toBe(255);
    t.dispose();
  });

  it("composites tile by tile exactly like the whole canvas", async () => {
    const rotated = {
      origin: [20, 10],
      size: [90, 60],
      rotation: 30,
      flipX: true,
      flipY: false,
      sampling: "High quality",
    };
    const doc = makeDoc({
      width: 150,
      height: 100,
      layers: [
        {},
        { blendMode: "Multiply", transform: rotated } as Partial<Layer>,
        { opacity: 0.4, blendMode: "Screen" },
      ],
    });
    const { api } = await mount(doc);
    const whole = api.readComposite(full(doc));
    const tiled = new Uint8Array(whole.length);
    for (const r of exportTiles(doc, 64, 0, 4096)) {
      const part = api.readComposite(r);
      for (let y = 0; y < r.height; y++) {
        tiled.set(
          part.subarray(y * r.width * 4, (y + 1) * r.width * 4),
          ((r.y + y) * 150 + r.x) * 4,
        );
      }
    }
    expect(tiled).toEqual(whole);
  });

  it("refuses a layer wider than maxTexture", async () => {
    const { api }: { api: EditorApi } = await mount(makeDoc({ width: 2, height: 2, layers: [{}] }));
    const textures = createTextureStore(api.gl, 2048);
    expect(() =>
      textures.upload("X", "image", { width: 3000, height: 1, data: new Uint8Array(12000) }),
    ).toThrow(expect.objectContaining({ code: "too_large" }));
  });
});
