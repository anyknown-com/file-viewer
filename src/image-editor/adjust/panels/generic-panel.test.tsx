import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ViewerRoot } from "../../../primitives/root";
import type { AdjustmentKind } from "../../api";
import { makeDoc } from "../../test/make-doc";
import { adjustmentRecord } from "../commands";
import { defaultAdjustment, KIND_KEY } from "../settings";
import { fakeApi } from "../test/fake-api";
import { AdjustPanel } from "./adjust-panel";
import { toHex } from "./color";
import { getPath } from "./fields";

afterEach(cleanup);

function setup(kind: AdjustmentKind) {
  const settings = defaultAdjustment(kind, 7);
  const doc = makeDoc({
    width: 4,
    height: 4,
    layers: [
      adjustmentRecord({
        id: "L",
        kind,
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
  return { api, labels, view, current };
}

const sliders: [AdjustmentKind, string, string][] = [
  ["Exposure", "Exposure", "exposureSettings.exposure"],
  ["Black & White", "Reds", "blackWhiteSettings.reds"],
  ["Color Balance", "Midtones: cyan / red", "colorBalanceSettings.midCyanRed"],
  ["Grain", "Amount", "grainSettings.amount"],
  ["Add Noise", "Amount", "noiseAmount"],
  ["Gaussian Blur", "Radius", "blurRadius"],
  ["Motion Blur", "Angle", "motionAngle"],
];

describe("generic panel", () => {
  it.each(sliders)("%s: a slider drag previews, release records one step", (kind, label, path) => {
    const { view, labels, current } = setup(kind);
    const before = getPath(current(), path);
    const thumb = view.getByRole("slider", { name: label });
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(getPath(current(), path)).not.toBe(before);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((l) => l !== undefined)).toEqual(["image.adjust.change"]);
  });

  it("titles the panel with the kind name", () => {
    const { view } = setup("Gradient Map");
    expect(view.getByRole("heading").textContent).toBe("Gradient Map");
    expect(KIND_KEY["Gradient Map"]).toBe("gradientMap");
  });

  it("a switch records a step", () => {
    const { view, labels, current } = setup("Gradient Map");
    fireEvent.click(view.getByRole("switch", { name: "Reverse" }));
    expect(labels).toEqual(["image.adjust.change"]);
    expect(current()?.gradientMapSettings?.reversed).toBe(true);
  });

  it("a color field previews on input and records on change", () => {
    const { view, labels, current } = setup("Gradient Map");
    const input = view.getByLabelText("Shadows") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "#ff0000" } });
    expect(labels).toEqual([undefined]);
    expect(toHex(current()?.gradientMapSettings?.shadows ?? { red: 0, green: 0, blue: 0 })).toBe(
      "#ff0000",
    );
    fireEvent.change(input, { target: { value: "#ff0000" } });
    expect(labels).toEqual([undefined, "image.adjust.change"]);
  });

  it("reset restores the defaults and keeps the noise seed", () => {
    const { view, labels, current } = setup("Add Noise");
    fireEvent.click(view.getByRole("switch", { name: "Monochromatic" }));
    expect(current()?.noiseMonochromatic).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "Reset" }));
    expect(labels.at(-1)).toBe("image.adjust.reset");
    expect(current()).toEqual(defaultAdjustment("Add Noise", 7));
    expect(current()?.noiseSeed).toBe(7);
  });
});
