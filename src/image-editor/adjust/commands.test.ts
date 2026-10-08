import { describe, expect, it } from "vitest";
import { makeDoc } from "../test/make-doc";
import { addAdjustmentLayer } from "./commands";
import { defaultAdjustment } from "./settings";

const ids = { a: "A", f: "F", c: "C", d: "D" };
const doc = () =>
  makeDoc({
    width: 4,
    height: 4,
    layers: [
      { id: ids.a, name: "a" },
      { id: ids.f, name: "f", isGroup: true },
      { id: ids.c, name: "c", parentID: ids.f },
      { id: ids.d, name: "d", parentID: ids.f },
    ],
  });
const add = (active: string | null, withMask = false) =>
  addAdjustmentLayer({
    id: "N",
    kind: "Exposure",
    name: "Exposure",
    width: 4,
    height: 4,
    settings: defaultAdjustment("Exposure"),
    withMask,
    active,
  })(doc());
const order = (d: ReturnType<typeof doc>) => d.manifest.layers.map((l) => l.id);

describe("addAdjustmentLayer", () => {
  it("puts the layer above a middle layer, in the same folder", () => {
    const out = add(ids.c);
    expect(order(out)).toEqual(["A", "F", "C", "N", "D"]);
    expect(out.manifest.layers[3]?.parentID).toBe(ids.f);
  });

  it("puts the layer above a folder's last descendant", () => {
    expect(order(add(ids.f))).toEqual(["A", "F", "C", "D", "N"]);
  });

  it("puts the layer on top without an active layer", () => {
    expect(order(add(null))).toEqual(["A", "F", "C", "D", "N"]);
  });

  it("has no image file and covers the canvas", () => {
    const layer = add(ids.a).manifest.layers[1];
    expect(layer?.imageFile).toBeUndefined();
    expect(layer?.maskFile).toBeUndefined();
    expect(layer?.transform.size).toEqual([4, 4]);
    expect(layer?.adjustment?.kind).toBe("Exposure");
  });

  it("adds a mask file and GPU mask pixels with withMask", () => {
    const out = add(ids.a, true);
    expect(out.manifest.layers[1]?.maskFile).toBe("N.mask.png");
    expect(out.pixels.get("N")).toEqual({ mask: { kind: "gpu" } });
  });
});
