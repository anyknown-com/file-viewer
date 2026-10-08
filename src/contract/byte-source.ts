import { isAbortError, toViewerError, ViewerError } from "./errors";

/** Random-access read of a file's bytes, so large files need not be loaded whole. */
export interface ByteSource {
  /** Total size in bytes. */
  readonly size: number;
  /** [start, end); integers with 0 <= start <= end <= size, else RangeError. Result length is end - start. */
  read(start: number, end: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>>;
  /** When present, whole-file reads use this (File / Blob without copying). */
  blob?(signal?: AbortSignal): Promise<Blob>;
}

/** A file to open: its name, optional MIME type and byte source. */
export type FileRef = {
  /** File name, used to pick the viewer and to name saved results. */
  name: string;
  /** MIME type when the host knows it; otherwise it is guessed from the name. */
  mime?: string;
  /** Where the bytes come from. */
  source: ByteSource;
};

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

/** Wraps a Blob or File as a ByteSource without copying it. */
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

/** Wraps an in-memory Uint8Array as a ByteSource. */
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
