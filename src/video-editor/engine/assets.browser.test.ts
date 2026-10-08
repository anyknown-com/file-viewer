import { afterEach, describe, expect, it, vi } from "vitest";
import { blobSource, type ByteSource } from "../../contract/byte-source";
import { ViewerError } from "../../contract/errors";
import type { AssetInfo, AssetProvider } from "../../contract/props";
import { openMedia } from "../../media/open-media";
import { SOURCE_ASSET_ID } from "../model/project";
import { fixtureFile, fixtureRef } from "../test-utils/fixtures";
import { AssetStore, MAX_OPEN_INPUTS } from "./assets";

vi.mock("../../media/open-media", { spy: true });

const controllers: AbortController[] = [];
afterEach(() => {
  for (const c of controllers.splice(0)) c.abort();
  vi.mocked(openMedia).mockReset();
});

async function storeFor(name: string, provider?: AssetProvider): Promise<AssetStore> {
  const c = new AbortController();
  controllers.push(c);
  return new AssetStore({ file: await fixtureRef(name), provider, signal: c.signal });
}

function providerOf(entries: [AssetInfo, ByteSource][]): AssetProvider {
  return {
    list: async () => entries.map(([info]) => info),
    open: async (id) => entries.find(([info]) => info.id === id)![1],
  };
}

async function fixtureEntry(
  id: string,
  name: string,
  file: string,
): Promise<[AssetInfo, ByteSource]> {
  const f = await fixtureFile(file);
  return [{ id, name, mime: f.type, size: f.size }, blobSource(f)];
}

describe("AssetStore", () => {
  it("probes a video with audio", async () => {
    const store = await storeFor("red-2s.webm");
    const meta = await store.load(SOURCE_ASSET_ID);
    expect(Math.abs(meta.duration! - 240_000)).toBeLessThanOrEqual(4000);
    expect([meta.width, meta.height]).toEqual([320, 180]);
    expect(meta.hasAudio).toBe(true);
    expect(meta.fps).toBeCloseTo(30, 0);
    expect(store.status(SOURCE_ASSET_ID)).toEqual({ state: "ready", info: meta });
  });

  it("reports a silent video as having no audio", async () => {
    const store = await storeFor("silent-1s.webm");
    expect((await store.load(SOURCE_ASSET_ID)).hasAudio).toBe(false);
  });

  it("probes an image asset", async () => {
    const store = await storeFor(
      "red-2s.webm",
      providerOf([await fixtureEntry("img", "blue-64.png", "blue-64.png")]),
    );
    await store.list();
    const meta = await store.load("img");
    expect([meta.width, meta.height, meta.duration]).toEqual([64, 64, null]);
    expect((await store.image("img")).width).toBe(64);
  });

  it("lists the source first and drops kinds it cannot edit", async () => {
    const txt: [AssetInfo, ByteSource] = [
      { id: "t", name: "notes.txt", mime: "text/plain", size: 3 },
      blobSource(new Blob(["abc"])),
    ];
    const store = await storeFor(
      "red-2s.webm",
      providerOf([
        await fixtureEntry("v", "green.webm", "green-3s.webm"),
        await fixtureEntry("a", "tone.ogg", "tone-2s.ogg"),
        await fixtureEntry("i", "blue.png", "blue-64.png"),
        txt,
      ]),
    );
    const list = await store.list();
    expect(list.map((e) => [e.id, e.kind])).toEqual([
      [SOURCE_ASSET_ID, "video"],
      ["v", "video"],
      ["a", "audio"],
      ["i", "image"],
    ]);
    expect(list[0].name).toBe("red-2s.webm");
  });

  it("disposes the least recently used input past the pool limit", async () => {
    const entries = await Promise.all(
      Array.from({ length: MAX_OPEN_INPUTS + 1 }, (_, i) =>
        fixtureEntry(`a${i}`, `a${i}.webm`, "red-2s.webm"),
      ),
    );
    const store = await storeFor("red-2s.webm", providerOf(entries));
    await store.list();
    const evicted = vi.fn<(id: string) => void>();
    store.onEvict(evicted);
    const first = await store.media("a0");
    const dispose = vi.spyOn(first, "dispose");
    for (let i = 1; i < MAX_OPEN_INPUTS; i++) await store.media(`a${i}`);
    expect(dispose).not.toHaveBeenCalled();
    await store.media(`a${MAX_OPEN_INPUTS}`);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(evicted).toHaveBeenCalledWith("a0");
    expect(await store.media("a0")).not.toBe(first);
  });

  it("marks an asset unsupported with the code openMedia throws", async () => {
    vi.mocked(openMedia).mockRejectedValueOnce(new ViewerError("codec_unsupported"));
    const store = await storeFor("red-2s.webm");
    await expect(store.load(SOURCE_ASSET_ID)).rejects.toMatchObject({ code: "codec_unsupported" });
    expect(store.status(SOURCE_ASSET_ID)).toEqual({
      state: "unsupported",
      code: "codec_unsupported",
    });
  });

  it("refuses an image larger than the limit without reading it", async () => {
    const read = vi.fn<ByteSource["read"]>();
    const huge: ByteSource = { size: 65 * 1024 ** 2, read };
    const store = await storeFor(
      "red-2s.webm",
      providerOf([[{ id: "big", name: "big.png", mime: "image/png", size: huge.size }, huge]]),
    );
    await store.list();
    await expect(store.load("big")).rejects.toMatchObject({ code: "too_large" });
    expect(store.status("big")).toEqual({ state: "unsupported", code: "too_large" });
    expect(read).not.toHaveBeenCalled();
  });
});
