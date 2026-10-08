import { unzlibSync } from "fflate";
import { crc32 } from "./crc32";
import { ProjectError } from "./errors";

/** Decoded pixels of a PNG. */
export type PngImage = {
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** Values per pixel: 1 for a gray mask, 4 for RGBA. */
  channels: 1 | 4;
  /** Pixel values, row by row, top to bottom. */
  data: Uint8Array;
};

// Compositor Document/DocumentLimits.swift maxSide.
const MAX_SIDE = 30000;
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Compositor IO/ProjectStore.swift readPackage: depth <= 8, so 16-bit is not a valid combination.
const DEPTHS: Record<number, number[]> = {
  0: [1, 2, 4, 8],
  2: [8],
  3: [1, 2, 4, 8],
  4: [8],
  6: [8],
};
const SAMPLES: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
// Adam7 passes: [xStart, yStart, xStep, yStep].
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

type Header = { width: number; height: number; depth: number; color: number; interlace: number };

function bad(message: string): ProjectError {
  return new ProjectError("bad_png", [message]);
}

function u32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
  );
}

function checkSignature(bytes: Uint8Array): void {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw bad("not a PNG signature");
}

// Reads the chunk header at `pos` and verifies its CRC (type + data). Returns the chunk's
// type, data and the position after it.
function chunkAt(bytes: Uint8Array, pos: number): { type: string; data: Uint8Array; next: number } {
  if (pos + 12 > bytes.length) throw bad("truncated chunk");
  const length = u32(bytes, pos);
  const end = pos + 8 + length;
  if (end + 4 > bytes.length) throw bad("truncated chunk");
  const typeBytes = bytes.subarray(pos + 4, pos + 8);
  if (crc32(bytes.subarray(pos + 4, end)) !== u32(bytes, end)) throw bad("chunk CRC mismatch");
  return {
    type: String.fromCharCode(...typeBytes),
    data: bytes.subarray(pos + 8, end),
    next: end + 4,
  };
}

function parseHeader(data: Uint8Array): Header {
  if (data.length !== 13) throw bad("bad IHDR length");
  const header = {
    width: u32(data, 0),
    height: u32(data, 4),
    depth: data[8]!,
    color: data[9]!,
    interlace: data[12]!,
  };
  if (header.width < 1 || header.height < 1) throw bad("empty image");
  if (header.width > MAX_SIDE || header.height > MAX_SIDE) throw bad("image side exceeds 30000");
  if (!DEPTHS[header.color]?.includes(header.depth))
    throw bad("unsupported color type or bit depth");
  if (data[10] !== 0 || data[11] !== 0 || header.interlace > 1) throw bad("bad IHDR methods");
  return header;
}

/** Reads a PNG's width and height from its header, without decoding the pixels. Throws ProjectError "bad_png" when the header is invalid. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 33) throw bad("too short for IHDR");
  checkSignature(bytes);
  const chunk = chunkAt(bytes, 8);
  if (chunk.type !== "IHDR") throw bad("first chunk is not IHDR");
  const { width, height } = parseHeader(chunk.data);
  return { width, height };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Undoes the per-row filters of one (sub)image in place; returns nothing, rows end up raw.
function unfilter(
  buf: Uint8Array,
  offset: number,
  rowBytes: number,
  rows: number,
  bpp: number,
): void {
  for (let y = 0; y < rows; y++) {
    const start = offset + y * (rowBytes + 1);
    const filter = buf[start]!;
    if (filter > 4) throw bad("unknown filter type");
    const row = start + 1;
    const prev = y === 0 ? -1 : row - (rowBytes + 1);
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? buf[row + i - bpp]! : 0;
      const b = prev >= 0 ? buf[prev + i]! : 0;
      const c = prev >= 0 && i >= bpp ? buf[prev + i - bpp]! : 0;
      const x = buf[row + i]!;
      const add =
        filter === 0
          ? 0
          : filter === 1
            ? a
            : filter === 2
              ? b
              : filter === 3
                ? (a + b) >> 1
                : paeth(a, b, c);
      buf[row + i] = (x + add) & 0xff;
    }
  }
}

function sample(buf: Uint8Array, row: number, index: number, depth: number): number {
  if (depth === 8) return buf[row + index]!;
  const perByte = 8 / depth;
  const shift = 8 - depth * ((index % perByte) + 1);
  return (buf[row + Math.floor(index / perByte)]! >> shift) & ((1 << depth) - 1);
}

type Palette = { plte: Uint8Array | null; trns: Uint8Array | null };

// Writes the RGBA of pixel x of the raw row at `row` into out[o..o+3] (straight alpha).
function pixel(
  buf: Uint8Array,
  row: number,
  x: number,
  h: Header,
  pal: Palette,
  out: Uint8Array,
  o: number,
): void {
  const { color, depth } = h;
  const t = pal.trns;
  if (color === 0) {
    const v = sample(buf, row, x, depth);
    const g = depth === 8 ? v : Math.round((v * 255) / ((1 << depth) - 1));
    out[o] = out[o + 1] = out[o + 2] = g;
    out[o + 3] = t && t.length >= 2 && ((t[0]! << 8) | t[1]!) === v ? 0 : 255;
  } else if (color === 2) {
    const r = buf[row + x * 3]!;
    const g = buf[row + x * 3 + 1]!;
    const b = buf[row + x * 3 + 2]!;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    const key =
      t &&
      t.length >= 6 &&
      ((t[0]! << 8) | t[1]!) === r &&
      ((t[2]! << 8) | t[3]!) === g &&
      ((t[4]! << 8) | t[5]!) === b;
    out[o + 3] = key ? 0 : 255;
  } else if (color === 3) {
    const i = sample(buf, row, x, depth);
    if (!pal.plte || i * 3 + 2 >= pal.plte.length) throw bad("palette index out of range");
    out[o] = pal.plte[i * 3]!;
    out[o + 1] = pal.plte[i * 3 + 1]!;
    out[o + 2] = pal.plte[i * 3 + 2]!;
    out[o + 3] = t && i < t.length ? t[i]! : 255;
  } else if (color === 4) {
    out[o] = out[o + 1] = out[o + 2] = buf[row + x * 2]!;
    out[o + 3] = buf[row + x * 2 + 1]!;
  } else {
    out[o] = buf[row + x * 4]!;
    out[o + 1] = buf[row + x * 4 + 1]!;
    out[o + 2] = buf[row + x * 4 + 2]!;
    out[o + 3] = buf[row + x * 4 + 3]!;
  }
}

/** Decodes a PNG into pixels; "layer" gives RGBA, "mask" gives one gray channel. Throws ProjectError "bad_png" when the file is invalid. */
export function decodePng(bytes: Uint8Array, kind: "layer" | "mask"): PngImage {
  checkSignature(bytes);
  let pos = 8;
  let header: Header | null = null;
  const pal: Palette = { plte: null, trns: null };
  const idat: Uint8Array[] = [];
  for (let first = true; ; first = false) {
    const { type, data, next } = chunkAt(bytes, pos);
    pos = next;
    if (first && type !== "IHDR") throw bad("first chunk is not IHDR");
    if (type === "IHDR") {
      if (!first) throw bad("duplicate IHDR");
      header = parseHeader(data);
    } else if (type === "IEND") break;
    else if (type === "PLTE") pal.plte = data;
    else if (type === "tRNS") pal.trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "acTL") throw bad("APNG is not supported");
    else if (type.charCodeAt(0) < 0x61) throw bad(`unknown critical chunk ${type}`);
  }
  if (!header) throw bad("missing IHDR");
  if (kind === "mask" && !(header.color === 0 && header.depth === 8)) {
    throw bad("a mask must be an 8-bit grayscale PNG");
  }
  if (header.color === 3 && !pal.plte) throw bad("missing PLTE");
  if (idat.length === 0) throw bad("missing IDAT");

  const bitsPerPixel = SAMPLES[header.color]! * header.depth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const passes = header.interlace === 1 ? ADAM7 : ([[0, 0, 1, 1]] as const);
  const dims = passes.map(([x0, y0, dx, dy]) => {
    const w = Math.ceil((header!.width - x0) / dx);
    const h = Math.ceil((header!.height - y0) / dy);
    return w > 0 && h > 0 ? { w, h, rowBytes: Math.ceil((w * bitsPerPixel) / 8) } : null;
  });
  const expected = dims.reduce((sum, d) => sum + (d ? d.h * (d.rowBytes + 1) : 0), 0);
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  idat.reduce((at, c) => (joined.set(c, at), at + c.length), 0);
  let raw: Uint8Array;
  try {
    raw = unzlibSync(joined, { out: new Uint8Array(expected) });
  } catch {
    throw bad("corrupt IDAT stream");
  }
  if (raw.length !== expected) throw bad("IDAT size does not match the image");

  const channels = kind === "mask" ? 1 : 4;
  const out = new Uint8Array(header.width * header.height * channels);
  let offset = 0;
  passes.forEach(([x0, y0, dx, dy], p) => {
    const d = dims[p];
    if (!d) return;
    unfilter(raw, offset, d.rowBytes, d.h, bpp);
    for (let y = 0; y < d.h; y++) {
      const row = offset + y * (d.rowBytes + 1) + 1;
      const fy = y0 + y * dy;
      for (let x = 0; x < d.w; x++) {
        const o = (fy * header!.width + x0 + x * dx) * channels;
        if (kind === "mask") out[o] = raw[row + x]!;
        else pixel(raw, row, x, header!, pal, out, o);
      }
    }
    offset += d.h * (d.rowBytes + 1);
  });
  return { width: header.width, height: header.height, channels, data: out };
}
