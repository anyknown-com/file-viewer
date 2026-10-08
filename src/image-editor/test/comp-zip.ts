import { vi } from "vitest";
import { fromImage, writeProject } from "../../comp/index";
import { bytesSource, type ByteSource } from "../../contract/byte-source";

/** A 64 × 64 one-layer .comp.zip with a tiny JPEG preview ahead of the layer PNG. */
export async function compZipWithPreview(): Promise<Uint8Array<ArrayBuffer>> {
  const rgba = new Uint8Array(64 * 64 * 4).fill(200);
  const preview = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const blob = writeProject({ ...fromImage({ width: 64, height: 64, rgba }, "a"), preview });
  return new Uint8Array(await blob.arrayBuffer());
}

/** A byte source whose `read` is a spy, so tests can see every range asked for. */
export function recordingSource(bytes: Uint8Array<ArrayBuffer>): ByteSource & {
  read: ReturnType<typeof vi.fn<ByteSource["read"]>>;
} {
  const inner = bytesSource(bytes);
  return {
    size: inner.size,
    read: vi.fn<ByteSource["read"]>((s, e, sig) => inner.read(s, e, sig)),
  };
}

/** The largest `end` any read asked for. */
export const maxEnd = (source: { read: ReturnType<typeof vi.fn<ByteSource["read"]>> }): number =>
  Math.max(...source.read.mock.calls.map((c) => c[1]));
