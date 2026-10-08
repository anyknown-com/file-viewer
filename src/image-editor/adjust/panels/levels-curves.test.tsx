import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ViewerRoot } from "../../../primitives/root";
import type { AdjustmentKind } from "../../api";
import { makeDoc } from "../../test/make-doc";
import { adjustmentRecord } from "../commands";
import { defaultAdjustment } from "../settings";
import { fakeApi } from "../test/fake-api";
import { AdjustPanel } from "./adjust-panel";
import { readBelow } from "./below";

afterEach(cleanup);

function setup(kind: AdjustmentKind) {
  const doc = makeDoc({
    width: 8,
    height: 8,
    layers: [
      adjustmentRecord({
        id: "L",
        kind,
        name: "x",
        width: 8,
        height: 8,
        settings: defaultAdjustment(kind, 7),
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
  // The real editor re-renders with the new layer after each dispatch; do the same here.
  const refresh = () => {
    const next = api.doc().manifest.layers[0];
    if (!next) return;
    view.rerender(
      <ViewerRoot locale="en">
        <AdjustPanel api={api} layer={next} />
      </ViewerRoot>,
    );
  };
  return { api, labels, view, current, refresh };
}

const CHANGE = "image.adjust.change";

describe("levels panel", () => {
  it("input white records one step", () => {
    const { view, labels, current } = setup("Levels");
    fireEvent.keyDown(view.getByRole("slider", { name: "Input white" }), { key: "ArrowLeft" });
    expect(current()?.levels.ranges[0]?.white).toBe(254);
    expect(labels.filter((l) => l !== undefined)).toEqual([CHANGE]);
  });

  it("keyboard only: five presses move the input black by 5", () => {
    const { view, current, refresh } = setup("Levels");
    const thumb = view.getByRole("slider", { name: "Input black" });
    thumb.focus();
    expect(document.activeElement).toBe(thumb);
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(thumb, { key: "ArrowRight" });
      refresh();
    }
    expect(current()?.levels.ranges[0]?.black).toBe(5);
  });

  it("auto sets a non-default black and white point from the image below", () => {
    const { api, view, labels, current } = setup("Levels");
    // A flat image has nothing to stretch, so feed a dark-to-light ramp instead of the fake's flat 128.
    (api as { readComposite: unknown }).readComposite = (r: { width: number; height: number }) =>
      Uint8Array.from({ length: r.width * r.height * 4 }, (_, i) =>
        i % 4 === 3 ? 255 : 40 + ((i >> 2) % 100),
      );
    view.unmount();
    const again = render(
      <ViewerRoot locale="en">
        <AdjustPanel api={api} layer={api.doc().manifest.layers[0]!} />
      </ViewerRoot>,
    );
    fireEvent.click(again.getByRole("button", { name: "Auto" }));
    expect(labels.at(-1)).toBe(CHANGE);
    expect(current()?.levels).not.toEqual(defaultAdjustment("Levels", 7).levels);
  });

  it("readBelow dispatches without labels and leaves the document untouched", () => {
    const { api, labels } = setup("Levels");
    const before = api.doc();
    labels.length = 0;
    const px = readBelow(api, "L");
    expect(labels).toEqual([undefined, undefined]);
    expect(api.doc()).toBe(before);
    expect(px.length).toBe(8 * 8 * 4);
  });
});

function grid(view: ReturnType<typeof setup>["view"]) {
  const svg = view.getByLabelText("Curve");
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 255, bottom: 255, width: 255, height: 255 }) as DOMRect;
  return svg;
}
const points = (c: ReturnType<typeof setup>["current"]) => c()?.curves.channels[0] ?? [];

describe("curves panel", () => {
  it("a click inside adds a point, one step", () => {
    const { view, labels, current } = setup("Curves");
    fireEvent.pointerDown(grid(view), { clientX: 100, clientY: 155 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 155 });
    expect(points(current)).toHaveLength(3);
    expect(points(current)[1]).toEqual({ x: 100, y: 100 });
    expect(labels.filter((l) => l !== undefined)).toEqual([CHANGE]);
  });

  it("dragging a point outside removes it, but never below two points", () => {
    const { view, labels, current } = setup("Curves");
    const svg = grid(view);
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 155 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 155 });
    const added = view.getAllByRole("slider", { name: "Point" })[1];
    if (!added) throw new Error("no point");
    fireEvent.pointerDown(added, { clientX: 100, clientY: 155 });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 155 });
    expect(points(current)).toHaveLength(2);
    expect(labels.filter((l) => l !== undefined)).toEqual([CHANGE, CHANGE]);
    const last = view.getAllByRole("slider", { name: "Point" })[0];
    if (!last) throw new Error("no point");
    fireEvent.pointerDown(last, { clientX: 0, clientY: 255 });
    fireEvent.pointerUp(window, { clientX: -50, clientY: 255 });
    expect(points(current)).toHaveLength(2);
  });

  it("number inputs and arrow keys each record one step", () => {
    const { view, labels, current } = setup("Curves");
    const first = view.getAllByRole("slider", { name: "Point" })[0];
    if (!first) throw new Error("no point");
    first.focus();
    fireEvent.change(view.getByLabelText("Output"), { target: { value: "200" } });
    expect(points(current)[0]).toEqual({ x: 0, y: 200 });
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(points(current)[0]).toEqual({ x: 0, y: 201 });
    fireEvent.change(view.getByLabelText("Input"), { target: { value: "128" } });
    expect(points(current)[0]).toEqual({ x: 128, y: 201 });
    expect(labels).toEqual([CHANGE, CHANGE, CHANGE]);
  });
});
