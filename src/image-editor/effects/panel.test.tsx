import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ViewerRoot } from "../../primitives/root";
import { fakeApi } from "../adjust/test/fake-api";
import { makeDoc } from "../test/make-doc";
import { EffectsPanel } from "./panel";

afterEach(cleanup);

const GLOW = { enabled: true, size: 20, red: 1, green: 1, blue: 1, opacity: 0.75 };
const SHADOW = {
  enabled: true,
  angle: 90,
  distance: 20,
  blur: 7,
  red: 0,
  green: 0,
  blue: 0,
  opacity: 0.5,
};

function setup(effects?: Record<string, unknown>) {
  const doc = makeDoc({
    width: 8,
    height: 8,
    layers: [{ id: "A", name: "A", ...(effects ? { effects } : {}) }],
  });
  const { api, labels } = fakeApi(doc);
  const layer = doc.manifest.layers[0];
  if (!layer) throw new Error("no layer");
  const view = render(
    <ViewerRoot locale="en">
      <EffectsPanel api={api} layer={layer} />
    </ViewerRoot>,
  );
  const current = () =>
    api.doc().manifest.layers[0]?.effects as Record<string, unknown> | undefined;
  const row = (name: string) => {
    const el = [...view.container.querySelectorAll<HTMLElement>(".fv-ie-adj-effect")].find(
      (r) => r.querySelector(".fv-switch-label")?.textContent === name,
    );
    if (!el) throw new Error(`no row ${name}`);
    return el;
  };
  return { labels, view, current, row };
}

describe("EffectsPanel", () => {
  it("turning on outer glow fills in defaults and records one step", () => {
    const s = setup();
    const toggle = s.row("Outer Glow").querySelector<HTMLElement>("[role='switch']");
    if (!toggle) throw new Error("no switch");
    fireEvent.click(toggle);
    expect(s.current()?.outerGlow).toMatchObject({ enabled: true, size: 20 });
    expect(s.labels).toEqual(["image.effects.change"]);
  });

  it("a slider change previews unlabeled and commits one labeled step", () => {
    const s = setup({ outerGlow: GLOW });
    const expand = s.row("Outer Glow").querySelector<HTMLElement>("[aria-label='Show settings']");
    if (!expand) throw new Error("no expand");
    fireEvent.click(expand);
    const thumb = s.view.getByRole("slider", { name: "Size" });
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(s.current()?.outerGlow).toMatchObject({ size: 21 });
    expect(s.labels.filter((l) => l !== undefined)).toEqual(["image.effects.change"]);
    expect(s.labels).toContain(undefined);
  });

  it("turning shadow off keeps its parameters", () => {
    const s = setup({ shadow: SHADOW });
    const toggle = s.row("Drop Shadow").querySelector<HTMLElement>("[role='switch']");
    if (!toggle) throw new Error("no switch");
    fireEvent.click(toggle);
    expect(s.current()?.shadow).toEqual({ ...SHADOW, enabled: false });
  });
});
