import { isAbortError, toViewerError, ViewerError } from "./errors";

export interface ByteSource {
  readonly size: number;
  /** [start, end); integers with 0 <= start <= end <= size, else RangeError. Result length is end - start. */
  read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>>;
  /** When present, whole-file reads use this (File / Blob without copying). */
  blob?(signal?: AbortSignal): Promise<Blob>;
}

export type FileRef = { name: string; mime?: string; source: ByteSource };

export const READ_CHUNK_BYTES = 4 * 1024 * 1024;

function checkRange(size: number, start: number, end: number): void {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > end ||
    end > size
  ) {
    throw new RangeError(`read(${start}, ${end}) outside [0, ${size}]`);
  }
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(start, end, signal) {
      signal?.throwIfAborted();
      checkRange(blob.size, start, end);
      const out = new Uint8Array(await blob.slice(start, end).arrayBuffer());
      signal?.throwIfAborted();
      return out;
    },
    async blob(signal) {
      signal?.throwIfAborted();
      return blob;
    },
  };
}

export function bytesSource(bytes: Uint8Array<ArrayBuffer>): ByteSource {
  return {
    size: bytes.byteLength,
    async read(start, end, signal) {
      signal?.throwIfAborted();
      checkRange(bytes.byteLength, start, end);
      return bytes.slice(start, end);
    },
    async blob() {
      return new Blob([bytes]);
    },
  };
}

export async function readBlob(
  source: ByteSource,
  opts: { type: string; signal?: AbortSignal },
): Promise<Blob> {
  try {
    if (source.blob) {
      const b = await source.blob(opts.signal);
      return b.type === opts.type ? b : b.slice(0, b.size, opts.type);
    }
    const parts: Uint8Array<ArrayBuffer>[] = [];
    for (let pos = 0; pos < source.size;) {
      const end = Math.min(pos + READ_CHUNK_BYTES, source.size);
      const part = await source.read(pos, end, opts.signal);
      if (part.byteLength !== end - pos) {
        throw new ViewerError("read_failed", { message: "short read" });
      }
      parts.push(part);
      pos = end;
    }
    return new Blob(parts, { type: opts.type });
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw toViewerError(e, "read_failed");
  }
}
