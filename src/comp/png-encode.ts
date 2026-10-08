import { Zlib } from "fflate";
import { crc32 } from "./crc32";
import type { PngImage } from "./png-decode";

/** Pixel layout of an encoded PNG: gray, RGB or RGBA. */
export type PngColor = "gray" | "rgb" | "rgba";

const COLOR_TYPE = { gray: 0, rgb: 2, rgba: 6 } as const;
const CHANNELS = { gray: 1, rgb: 3, rgba: 4 } as const;
const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Applies filter `type` to `row` into out[1..]; `prev` is the previous raw row (zeros for the first).
function applyFilter(
  type: number,
  row: Uint8Array,
  prev: Uint8Array,
  bpp: number,
  out: Uint8Array,
): void {
  out[0] = type;
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp]! : 0;
    const b = prev[i]!;
    const c = i >= bpp ? prev[i - bpp]! : 0;
    const predict =
      type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : paeth(a, b, c);
    out[1 + i] = (row[i]! - predict) & 0xff;
  }
}

// Sum of absolute values of the filtered bytes read as signed (the usual min-sum heuristic).
function score(filtered: Uint8Array): number {
  let sum = 0;
  for (let i = 1; i < filtered.length; i++) {
    const v = filtered[i]!;
    sum += v < 128 ? v : 256 - v;
  }
  return sum;
}

/** Encodes a PNG row by row so large images need not be held in memory. push() takes whole rows; end() returns the file as chunks. */
export function createPngEncoder(header: { width: number; height: number; color: PngColor }): {
  push(rows: Uint8Array): void;
  end(): Uint8Array[];
} {
  const { width, height, color } = header;
  const bpp = CHANNELS[color];
  const rowBytes = width * bpp;
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = COLOR_TYPE[color];
  const chunks: Uint8Array[] = [SIGNATURE, chunk("IHDR", ihdr)];
  const zlib = new Zlib({ level: 6 }, (data) => {
    if (data.length > 0) chunks.push(chunk("IDAT", data));
  });
  let prev: Uint8Array = new Uint8Array(rowBytes);
  let rowsDone = 0;
  let ended = false;

  return {
    push(rows) {
      if (ended) throw new Error("push after end");
      if (rows.length % rowBytes !== 0) throw new Error("rows must be a whole number of rows");
      const count = rows.length / rowBytes;
      if (rowsDone + count > height) throw new Error("more rows than the image height");
      const out = new Uint8Array(count * (rowBytes + 1));
      const best = new Uint8Array(rowBytes + 1);
      const trial = new Uint8Array(rowBytes + 1);
      for (let y = 0; y < count; y++) {
        const row = rows.subarray(y * rowBytes, (y + 1) * rowBytes);
        let bestScore = Infinity;
        for (let type = 0; type < 5; type++) {
          applyFilter(type, row, prev, bpp, trial);
          const s = score(trial);
          if (s < bestScore) {
            bestScore = s;
            best.set(trial);
          }
        }
        out.set(best, y * (rowBytes + 1));
        prev = row;
      }
      // `prev` aliases the caller's buffer; copy so later mutation cannot change it.
      prev = prev.slice();
      rowsDone += count;
      zlib.push(out);
    },
    end() {
      if (rowsDone !== height) throw new Error("row count does not match the image height");
      ended = true;
      zlib.push(new Uint8Array(0), true);
      chunks.push(chunk("IEND", new Uint8Array(0)));
      return chunks;
    },
  };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Encodes pixels as a PNG, dropping the alpha channel when every pixel is opaque. */
export function encodePng(image: PngImage): Uint8Array {
  const { width, height, channels, data } = image;
  let color: PngColor = "gray";
  let rows = data;
  if (channels === 4) {
    let opaque = true;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 255) {
        opaque = false;
        break;
      }
    }
    if (opaque) {
      color = "rgb";
      rows = new Uint8Array(width * height * 3);
      for (let i = 0, o = 0; i < data.length; i += 4, o += 3) {
        rows[o] = data[i]!;
        rows[o + 1] = data[i + 1]!;
        rows[o + 2] = data[i + 2]!;
      }
    } else color = "rgba";
  }
  const encoder = createPngEncoder({ width, height, color });
  encoder.push(rows);
  return concat(encoder.end());
}

/** Encodes a one-channel mask as a PNG; a mask of a single value is stored as 1x1. */
export function encodeMask(mask: PngImage): Uint8Array {
  if (mask.channels !== 1) throw new Error("a mask must have one channel");
  const first = mask.data[0];
  // Compositor Document/LayerMask.swift `solid`: a uniform 1x1 mask is valid.
  if (mask.data.every((v) => v === first)) {
    return encodePng({ width: 1, height: 1, channels: 1, data: new Uint8Array([first ?? 0]) });
  }
  return encodePng(mask);
}
