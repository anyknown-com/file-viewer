// Test helper (browser tests here and in 11–13): the whole editor frame with a working EditorApi.
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ViewerRoot } from "../../primitives/root";
import "../../styles.css";
import type { Doc, EditorApi, LayerId } from "../api";
import type { View } from "../canvas";
import { registerCore } from "../core";
import type { DocStore } from "../doc/store";
import { internalsOf } from "../editor-api";
import { setups } from "../registry";
import { EditorShell } from "../ui/editor-shell";
import { createUiSlot, type UiSlot } from "../ui-slot";
import { setupGl } from "./setup-gl";

type RGBA = [number, number, number, number];

/**
 * Registers the core items (idempotent; not installExtensions) and mounts an EditorShell of `size`
 * (1280 × 800 by default) in ViewerRoot (locale "en") with the GL from `setupGl`. Then calls every
 * `setups()` function with the api and `.fv-root`; `unmount` calls their cleanups first. Tests that
 * never look at the canvas pass a narrow size: on software GL each frame costs time per pixel.
 */
export async function mountEditor(
  doc: Doc,
  colors?: Record<LayerId, RGBA>,
  size: { width: number; height: number } = { width: 1280, height: 800 },
): Promise<{ api: EditorApi; store: DocStore; ui: UiSlot; unmount(): void }> {
  registerCore();
  const canvas = document.createElement("canvas");
  const ui = createUiSlot();
  const { api, store } = setupGl(canvas, doc, ui, colors);

  const { width, height } = doc.manifest;
  function Harness() {
    const [view, setView] = useState<View>({ zoom: 1, center: { x: width / 2, y: height / 2 } });
    return (
      <ViewerRoot locale="en">
        <div style={size}>
          <EditorShell
            api={api}
            store={store}
            ui={ui}
            name="test.comp.zip"
            view={view}
            onViewChange={setView}
            saveSlot={null}
            onClose={() => {}}
          />
        </div>
      </ViewerRoot>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Harness />));
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const fvRoot = canvas.closest<HTMLElement>(".fv-root");
  if (!fvRoot) throw new Error("EditorShell is not inside .fv-root.");
  const cleanups = setups().map((fn) => fn(api, fvRoot));
  return {
    api,
    store,
    ui,
    unmount() {
      for (const cleanup of cleanups) cleanup?.();
      root.unmount();
      host.remove();
      internalsOf(api).worker.terminate();
    },
  };
}
