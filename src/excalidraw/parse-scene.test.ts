import { describe, expect, it } from "vitest";
import { parseScene } from "./parse-scene";

const doc = (rest: Record<string, unknown>) => JSON.stringify({ type: "excalidraw", ...rest });
const text = (t: string, extra: Record<string, unknown> = {}) => ({
  type: "text",
  text: t,
  ...extra,
});

describe("parseScene", () => {
  it("returns the scene and its text as alt", () => {
    const result = parseScene(
      doc({ elements: [{ type: "rectangle" }, text("Hello"), text("world")], appState: { a: 1 } }),
    );
    expect(result).toEqual({
      ok: true,
      scene: {
        elements: [{ type: "rectangle" }, text("Hello"), text("world")],
        appState: { a: 1 },
        files: {},
      },
      alt: "Hello world",
    });
  });

  it("rejects broken json", () => {
    expect(parseScene("{not json")).toEqual({ ok: false });
  });

  it("rejects another type", () => {
    expect(parseScene(JSON.stringify({ type: "other", elements: [] }))).toEqual({ ok: false });
  });

  it("rejects a document without elements", () => {
    expect(parseScene(doc({}))).toEqual({ ok: false });
  });

  it("fills a missing appState with {}", () => {
    const result = parseScene(doc({ elements: [] }));
    expect(result.ok && result.scene.appState).toEqual({});
  });

  it("takes only the first 10 texts", () => {
    const elements = Array.from({ length: 12 }, (_, i) => text(`t${i}`));
    const result = parseScene(doc({ elements }));
    expect(result.ok && result.alt).toBe("t0 t1 t2 t3 t4 t5 t6 t7 t8 t9");
  });

  it("skips deleted text", () => {
    const result = parseScene(doc({ elements: [text("gone", { isDeleted: true }), text("kept")] }));
    expect(result.ok && result.alt).toBe("kept");
  });
});
