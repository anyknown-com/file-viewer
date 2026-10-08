import { afterEach, expect, it, vi } from "vitest";
import { en } from "../messages-en";
import { makeDoc } from "../test/make-doc";
import { mountEditor } from "../test/mount-editor";
import { guardContext } from "./context-loss";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

const noticeShown = () =>
  document.querySelector(".fv-ie-notice")?.textContent?.includes(en["image.notice.contextLost"]);

it("blocks input while the context is lost and rebuilds the same picture", async () => {
  const doc = makeDoc({
    width: 6,
    height: 4,
    layers: [{}, { opacity: 0.5, blendMode: "Multiply" }],
  });
  const [a, b] = doc.manifest.layers.map((l) => l.id);
  const { api, store, ui, unmount } = await mountEditor(doc, undefined, {
    width: 800,
    height: 300,
  });
  const stop = guardContext(api, store, ui);
  cleanups.push(unmount, stop);

  // One stroke on the top layer, so it lives only on the GPU until the cache encodes it.
  const rect = { x: 1, y: 1, width: 3, height: 2 };
  const tiles = api.snapshotTiles(b, "image", rect);
  api.writeRegion(b, "image", rect, new Uint8Array(3 * 2 * 4).fill(120));
  api.commit("image.notice.unsupported", api.doc(), tiles);
  await vi.waitFor(() => {
    for (const id of [a, b]) {
      const image = api.doc().pixels.get(id)?.image;
      expect(image?.kind === "gpu" && image.png).toBeTruthy();
    }
  });
  const full = { x: 0, y: 0, width: 6, height: 4 };
  const before = api.readComposite(full);

  const lose = api.gl.getExtension("WEBGL_lose_context")!;
  lose.loseContext();
  await vi.waitFor(() => expect(noticeShown()).toBe(true));
  const overlay = document.querySelector<HTMLCanvasElement>(".fv-ie-overlay")!;
  const box = overlay.getBoundingClientRect();
  const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
  expect(hit).not.toBe(overlay);
  expect(overlay.closest("[inert]")).not.toBeNull();

  lose.restoreContext();
  await vi.waitFor(() => expect(noticeShown()).toBe(false), { timeout: 5000 });
  expect(api.gl.isContextLost()).toBe(false);
  expect(overlay.closest("[inert]")).toBeNull();
  expect(api.readComposite(full)).toEqual(before);
});
