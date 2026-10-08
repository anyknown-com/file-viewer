import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerError } from "../contract/errors";
import type { Selection, SetupFn, ToolSpec } from "./api";
import { registerSelection, registerSetup, registerTool, resetRegistry } from "./registry";
import { makeDoc } from "./test/make-doc";
import { mountCanvas } from "./test/mount-canvas";

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  resetRegistry();
});

async function mount(opts?: Parameters<typeof mountCanvas>[2]) {
  const m = await mountCanvas(makeDoc({ width: 4, height: 4, layers: [{}] }), undefined, opts);
  mounted.push(m.unmount);
  return m;
}

const tool = (id: string, key: string, extra: Partial<ToolSpec> = {}): ToolSpec => ({
  id,
  key,
  label: "image.notice.unsupported",
  icon: () => null,
  cursor: "default",
  ...extra,
});

describe("EditorApi", () => {
  it("returns the registered selection until the registry is reset", async () => {
    const { api } = await mount();
    const selection = { version: 1 } as Selection;
    registerSelection({ get: () => selection });
    expect(api.selection()).toBe(selection);
    resetRegistry();
    expect(api.selection()).toBeNull();
  });

  it("deactivates the current tool when the tool changes", async () => {
    const onDeactivate = vi.fn<() => void>();
    registerTool(tool("a", "A", { onDeactivate }));
    registerTool(tool("b", "B"));
    const { api } = await mount();
    api.setSession({ tool: "a" });
    api.setSession({ tool: "a" });
    expect(onDeactivate).not.toHaveBeenCalled();
    api.setSession({ tool: "b" });
    expect(onDeactivate).toHaveBeenCalledOnce();
    expect(api.session().tool).toBe("b");
  });

  it("opens a dialog inside .fv-ie-ui", async () => {
    const { api } = await mount();
    const close = api.openDialog(() => createElement("p", { "data-testid": "dialog" }, "hi"));
    await vi.waitFor(() =>
      expect(document.querySelector(".fv-ie-ui [data-testid=dialog]")).not.toBeNull(),
    );
    close();
    await vi.waitFor(() => expect(document.querySelector("[data-testid=dialog]")).toBeNull());
  });

  it("reports showError to onError and clears the notice on the next labeled dispatch", async () => {
    const onError = vi.fn<(e: ViewerError) => void>();
    const { api, ui } = await mount({ onError });
    api.showError(new ViewerError("too_large"));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "too_large" }));
    expect(ui.notice()?.key).toBe("error.too_large");
    api.dispatch((doc) => doc, "image.notice.unsupported");
    expect(ui.notice()).toBeNull();
  });

  it("translates through the merged table", async () => {
    const { api } = await mount();
    expect(api.t("image.notice.unsupported")).toMatch(/adjustment or effect/);
  });

  it("calls setups with the api and .fv-root, and their cleanups on unmount", async () => {
    const cleanup = vi.fn<() => void>();
    const setup = vi.fn<SetupFn>(() => cleanup);
    registerSetup(setup);
    const { api, canvas, unmount } = await mountCanvas(
      makeDoc({ width: 2, height: 2, layers: [{}] }),
    );
    expect(setup).toHaveBeenCalledWith(api, canvas.closest(".fv-root"));
    expect(cleanup).not.toHaveBeenCalled();
    unmount();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
