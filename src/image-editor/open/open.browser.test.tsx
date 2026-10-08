import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { encodePng, writeProject } from "../../comp/index";
import { blobSource, bytesSource, type FileRef } from "../../contract/byte-source";
import type { ViewerError } from "../../contract/errors";
import { commonMessages } from "../../i18n/messages";
import type { EditorApi } from "../api";
import { patchLayer } from "../doc/commands/layers";
import { ImageEditor } from "../image-editor";
import { undo } from "../layer-ops";
import { en } from "../messages-en";
import { registerSetup } from "../registry";
import { makeDoc } from "../test/make-doc";
import { makeJpeg } from "../test/make-jpeg";
import "../../styles.css";

const common = commonMessages.en;
const setupCleanup = vi.fn<() => void>();
const setup = vi.fn<(api: EditorApi, root: HTMLElement) => () => void>(() => setupCleanup);
registerSetup(setup);

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  setup.mockClear();
  setupCleanup.mockClear();
  vi.restoreAllMocks();
});

function mount(file: FileRef, width = 800) {
  const onError = vi.fn<(e: ViewerError) => void>();
  const onClose = vi.fn<() => void>();
  const onDirtyChange = vi.fn<(dirty: boolean) => void>();
  const host = document.createElement("div");
  host.style.cssText = `width: ${width}px; height: 480px; display: flex;`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <ImageEditor
        file={file}
        locale="en"
        onSave={async () => {}}
        onClose={onClose}
        onError={onError}
        onDirtyChange={onDirtyChange}
      />,
    ),
  );
  let live = true;
  const unmount = () => {
    if (!live) return;
    live = false;
    root.unmount();
    host.remove();
  };
  mounted.push(unmount);
  return { onError, onClose, onDirtyChange, unmount };
}

async function opened(): Promise<EditorApi> {
  await vi.waitFor(() => expect(setup).toHaveBeenCalledTimes(1), { timeout: 5000 });
  return setup.mock.calls[0][0];
}

async function projectFile(): Promise<FileRef> {
  const doc = makeDoc({
    width: 4,
    height: 4,
    layers: [{ name: "Base" }, { name: "Mid", blendMode: "Multiply" }, { name: "Top" }],
  });
  const assets = new Map<string, Uint8Array>();
  for (const layer of doc.manifest.layers) {
    layer.imageFile = `${layer.id}.png`;
    const data = new Uint8Array(64).fill(200);
    assets.set(`images/${layer.imageFile}`, encodePng({ width: 4, height: 4, channels: 4, data }));
  }
  const blob = writeProject({ manifest: doc.manifest, assets });
  return { name: "p.comp.zip", source: bytesSource(new Uint8Array(await blob.arrayBuffer())) };
}

it("opens a JPEG upright from its EXIF orientation", async () => {
  mount({ name: "a.jpg", source: blobSource(await makeJpeg(4, 2, 6)) });
  const { width, height } = (await opened()).doc().manifest;
  expect([width, height]).toEqual([2, 4]);
});

it("opens a project with its layers, names, blend modes and PNG pixels", async () => {
  mount(await projectFile());
  const doc = (await opened()).doc();
  expect(doc.manifest.layers.map((l) => [l.name, l.blendMode])).toEqual([
    ["Base", "Normal"],
    ["Mid", "Multiply"],
    ["Top", "Normal"],
  ]);
  for (const l of doc.manifest.layers) expect(doc.pixels.get(l.id)?.image?.kind).toBe("png");
});

it("opens a project zipped by Finder", async () => {
  const url = Object.values(
    import.meta.glob<string>("../../comp/fixtures/ditto-project.comp.zip", {
      query: "?url",
      import: "default",
      eager: true,
    }),
  )[0];
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  mount({ name: "d.comp.zip", source: bytesSource(bytes) });
  expect((await opened()).doc().manifest.layers.length).toBeGreaterThan(0);
});

it("explains a broken zip and reports decode_failed", async () => {
  const { onError } = mount({ name: "x.comp.zip", source: bytesSource(new Uint8Array(32)) });
  await expect.element(page.getByText(en["image.open.notZip"])).toBeInTheDocument();
  expect(onError.mock.calls[0][0].code).toBe("decode_failed");
});

it("explains a missing WebGL2 and reports it", async () => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    type: string,
    ...rest: unknown[]
  ) {
    return type === "webgl2" ? null : Reflect.apply(getContext, this, [type, ...rest]);
  } as typeof getContext);
  const { onError } = mount({ name: "a.jpg", source: blobSource(await makeJpeg(4, 2)) });
  await expect.element(page.getByText(common["error.webgl_unavailable"])).toBeInTheDocument();
  expect(onError.mock.calls[0][0].code).toBe("webgl_unavailable");
});

it("asks for a wider window without making a GL context", async () => {
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
  const { onClose } = mount({ name: "a.jpg", source: blobSource(await makeJpeg(4, 2)) }, 600);
  await expect.element(page.getByText(en["image.narrow"])).toBeInTheDocument();
  expect(getContext).not.toHaveBeenCalled();
  await userEvent.click(page.getByRole("button", { name: en["image.back"] }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("asks before closing with unsaved changes and reports dirty changes", async () => {
  const { onClose, onDirtyChange } = mount(await projectFile());
  const api = await opened();
  const id = api.doc().manifest.layers[0].id;
  api.dispatch(patchLayer(id, { name: "Renamed" }), "image.layers.rename");
  const close = page.getByRole("button", { name: en["image.topbar.close"] });
  await userEvent.click(close);
  await userEvent.click(page.getByRole("button", { name: common["discard.keep"] }));
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.click(close);
  await userEvent.click(page.getByRole("button", { name: common["discard.confirm"] }));
  expect(onClose).toHaveBeenCalledTimes(1);
  undo(api);
  expect(onDirtyChange.mock.calls).toEqual([[true], [false]]);
});

it("gives each setup the api and .fv-root once, and cleans it up on unmount", async () => {
  const { unmount } = mount(await projectFile());
  const api = await opened();
  expect(setup).toHaveBeenCalledTimes(1);
  expect(setup.mock.calls[0][1].classList.contains("fv-root")).toBe(true);
  expect(api.doc().manifest.layers).toHaveLength(3);
  unmount();
  expect(setupCleanup).toHaveBeenCalledTimes(1);
});
