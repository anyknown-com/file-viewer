import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { blobSource } from "../contract/byte-source";
import type { EditorApi } from "./api";
import { ImageEditor } from "./image-editor";
import { registerSetup } from "./registry";
import { makeJpeg } from "./test/make-jpeg";
import "../styles.css";

const setup = vi.fn<(api: EditorApi, root: HTMLElement) => void>();
registerSetup(setup);

afterEach(() => {
  setup.mockClear();
  vi.restoreAllMocks();
});

it("frees the context, the worker and every blob url on unmount", async () => {
  const create = vi.spyOn(URL, "createObjectURL");
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  const terminate = vi.spyOn(Worker.prototype, "terminate");
  const host = document.createElement("div");
  host.style.cssText = "width: 800px; height: 300px; display: flex;";
  document.body.append(host);
  const root = createRoot(host);
  const file = { name: "a.jpg", source: blobSource(await makeJpeg(4, 2)) };
  flushSync(() =>
    root.render(<ImageEditor file={file} locale="en" onSave={async () => {}} onClose={() => {}} />),
  );
  await vi.waitFor(() => expect(setup).toHaveBeenCalledTimes(1), { timeout: 5000 });
  const api = setup.mock.calls[0][0];
  // The PNG cache encodes the opened layer in the worker, so the worker is running.
  await vi.waitFor(() => {
    const image = api.doc().pixels.get(api.doc().manifest.layers[0].id)?.image;
    expect(image?.kind === "gpu" && image.png).toBeTruthy();
  });

  root.unmount();
  host.remove();
  expect(api.gl.isContextLost()).toBe(true);
  expect(terminate).toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length);
});
