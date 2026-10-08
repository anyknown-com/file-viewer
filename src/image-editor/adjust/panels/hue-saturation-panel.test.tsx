import { cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ViewerRoot } from "../../../primitives/root";
import { makeDoc } from "../../test/make-doc";
import { adjustmentRecord } from "../commands";
import { defaultAdjustment } from "../settings";
import { fakeApi } from "../test/fake-api";
import { AdjustPanel } from "./adjust-panel";

afterEach(cleanup);

const entry = (items: readonly unknown[] | undefined, i: number) =>
  (items?.[i] ?? {}) as { hue?: number; saturation?: number };

const CHANGE = "image.adjust.change";

function setup() {
  const settings = {
    ...defaultAdjustment("Hue/Saturation", 7),
    hsvSettings: {
      range: "Master" as const,
      colorize: false,
      invertRange: false,
      adjustments: [
        "Master",
        { hue: 0, saturation: 0, lightness: 0 },
        "Reds",
        { hue: 5, saturation: 0, lightness: 0, extra: 1 },
        "Blues",
        { hue: 0, saturation: 9, lightness: 0 },
      ],
      bands: [],
    },
  };
  const doc = makeDoc({
    width: 4,
    height: 4,
    layers: [
      adjustmentRecord({
        id: "L",
        kind: "Hue/Saturation",
        name: "x",
        width: 4,
        height: 4,
        settings,
        withMask: false,
      }),
    ],
  });
  const { api, labels } = fakeApi(doc);
  const layer = doc.manifest.layers[0];
  if (!layer) throw new Error("no layer");
  const view = render(
    <ViewerRoot locale="en">
      <AdjustPanel api={api} layer={layer} />
    </ViewerRoot>,
  );
  const current = () => api.doc().manifest.layers[0]?.adjustment;
  return { view, labels, current };
}

async function pick(view: ReturnType<typeof setup>["view"], name: string) {
  const user = userEvent.setup();
  await user.click(view.getByRole("combobox", { name: "Color range" }));
  await user.click(await view.findByRole("option", { name }));
}

describe("hue/saturation panel", () => {
  it("editing Reds changes only that entry and keeps order and unknown fields", async () => {
    const { view, labels, current } = setup();
    await pick(view, "Reds");
    const hue = view.getByRole("slider", { name: "Hue" });
    fireEvent.keyDown(hue, { key: "ArrowRight" });
    const adj = current()?.hsvSettings?.adjustments;
    expect(adj?.filter((_, i) => i % 2 === 0)).toEqual(["Master", "Reds", "Blues"]);
    expect(adj?.[3]).toMatchObject({ extra: 1 });
    expect(adj?.[1]).toEqual({ hue: 0, saturation: 0, lightness: 0 });
    expect(adj?.[5]).toEqual({ hue: 0, saturation: 9, lightness: 0 });
    expect(entry(adj, 3).hue).toBe(6);
    expect(labels.length).toBeGreaterThan(0);
  });

  it("Master edits the Master entry and the top-level field", () => {
    const { view, current } = setup();
    fireEvent.keyDown(view.getByRole("slider", { name: "Saturation" }), { key: "ArrowRight" });
    expect(current()?.saturation).toBe(1);
    expect(entry(current()?.hsvSettings?.adjustments, 1).saturation).toBe(1);
  });

  it("a slider key press is a preview then one recorded step", () => {
    const { view, labels } = setup();
    fireEvent.keyDown(view.getByRole("slider", { name: "Lightness" }), { key: "ArrowRight" });
    expect(labels.filter((l) => l !== undefined)).toEqual([CHANGE]);
  });

  it("colorize records one step", () => {
    const { view, labels, current } = setup();
    fireEvent.click(view.getByRole("switch", { name: "Colorize" }));
    expect(labels).toEqual([CHANGE]);
    expect(current()?.hsvSettings?.colorize).toBe(true);
    expect(current()?.colorize).toBe(true);
  });
});
