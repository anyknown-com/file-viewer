import type { StreamTargetChunk } from "mediabunny";
import { ViewerError } from "../contract/errors";

export type SinkLayout = { headBytes: number; sealBytes: number; keepBytes: number };

export const DEFAULT_LAYOUT: SinkLayout = {
  headBytes: 1024 * 1024,
  sealBytes: 64 * 1024 * 1024,
  keepBytes: 64 * 1024,
};

export type BlobSink = {
  readonly writable: WritableStream<StreamTargetChunk>;
  readonly size: number;
  toBlob(mime: string): Blob;
};

export function createBlobSink(
  options: { maxBytes?: number } = {},
  layout: SinkLayout = DEFAULT_LAYOUT,
): BlobSink {
  const { headBytes, sealBytes, keepBytes } = layout;
  const head = new Uint8Array(headBytes);
  const sealed: Blob[] = [];
  let tailStart = headBytes;
  let tail = new Uint8Array(Math.max(1024, sealBytes));
  let tailLen = 0;
  let size = 0;
  let closed = false;

  function write({ data, position }: StreamTargetChunk): void {
    const end = position + data.byteLength;
    if (options.maxBytes !== undefined && end > options.maxBytes) {
      throw new ViewerError("output_too_large");
    }
    if (position > size) throw new Error("blob-sink: write past end");
    if (position < headBytes) {
      head.set(data.subarray(0, Math.min(end, headBytes) - position), position);
    }
    const restStart = Math.max(position, headBytes);
    if (restStart < end) {
      if (restStart < tailStart) throw new Error("blob-sink: write into sealed range");
      const offset = restStart - tailStart;
      const needed = offset + (end - restStart);
      if (needed > tail.length) {
        let capacity = tail.length;
        while (capacity < needed) capacity *= 2;
        const grown = new Uint8Array(capacity);
        grown.set(tail.subarray(0, tailLen));
        tail = grown;
      }
      tail.set(data.subarray(restStart - position), offset);
      tailLen = Math.max(tailLen, needed);
    }
    size = Math.max(size, end);
    while (tailLen >= sealBytes + keepBytes) {
      sealed.push(new Blob([tail.slice(0, sealBytes)]));
      tail.copyWithin(0, sealBytes, tailLen);
      tailStart += sealBytes;
      tailLen -= sealBytes;
    }
  }

  return {
    writable: new WritableStream<StreamTargetChunk>({
      write,
      close() {
        closed = true;
      },
    }),
    get size() {
      return size;
    },
    toBlob(mime) {
      if (!closed) throw new Error("blob-sink: not closed");
      return new Blob(
        [head.slice(0, Math.min(size, headBytes)), ...sealed, tail.slice(0, tailLen)],
        {
          type: mime,
        },
      );
    },
  };
}
