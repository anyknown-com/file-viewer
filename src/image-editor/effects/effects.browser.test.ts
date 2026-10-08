import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { encodePng, readProject } from "../../comp/index";
import type { Doc, LayerId, LayerPixels } from "../api";
import { resetRegistry } from "../registry";
import { mountCanvas } from "../test/mount-canvas";
import { registerLayerEffects } from "./register";

const mounted: (() => void)[] = [];
beforeEach(() => {
  resetRegistry();
  registerLayerEffects();
});
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

// A project saved by Compositor with all six layer effects; not in the repo yet.
const fixture = Object.values(
  import.meta.glob<string>("../__fixtures__/effects.comp.zip", {
    query: "?url",
    import: "default",
    eager: true,
  }),
)[0];

(fixture ? describe : describe.skip)("Compositor's effects.comp.zip", () => {
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
    // Browser commands write only under the project root, so this lands in node_modules/.vitest
    // rather than $TMPDIR.
    const png = encodePng({ width, height, channels: 4, data: rgba });
    let binary = "";
    for (const byte of png) binary += String.fromCharCode(byte);
    await commands.writeFile("node_modules/.vitest/effects-render.png", btoa(binary), "base64");
  });
});
