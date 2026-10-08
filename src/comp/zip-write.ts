import { crc32 } from "./crc32";
import { ProjectError } from "./errors";

const MAX32 = 0xffffffff;
const encoder = new TextEncoder();

// Compositor packages are written STORE-only, flag bit 11 (UTF-8 names) only, bit 3 never,
// sizes and CRC in the local header, fixed DOS time 1980-01-01 00:00 (reproducible output).
const FLAGS = 0x0800;
const DOS_DATE = 0x0021;

export function entryHeaders(
  name: string,
  crc: number,
  size: number,
  offset: number,
): { local: Uint8Array<ArrayBuffer>; central: Uint8Array<ArrayBuffer> } {
  if (size > MAX32 || offset > MAX32) {
    throw new ProjectError("too_large", [`${name} is over 4 GiB`]);
  }
  const nameBytes = encoder.encode(name);
  const local = new Uint8Array(30 + nameBytes.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint16(6, FLAGS, true);
  lv.setUint16(8, 0, true);
  lv.setUint16(10, 0, true);
  lv.setUint16(12, DOS_DATE, true);
  lv.setUint32(14, crc, true);
  lv.setUint32(18, size, true);
  lv.setUint32(22, size, true);
  lv.setUint16(26, nameBytes.length, true);
  lv.setUint16(28, 0, true);
  local.set(nameBytes, 30);

  const central = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(4, 20, true);
  cv.setUint16(6, 20, true);
  cv.setUint16(8, FLAGS, true);
  cv.setUint16(10, 0, true);
  cv.setUint16(12, 0, true);
  cv.setUint16(14, DOS_DATE, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, size, true);
  cv.setUint32(24, size, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint32(42, offset, true);
  central.set(nameBytes, 46);
  return { local, central };
}

export function writeZip(entries: { name: string; data: Uint8Array }[]): Blob {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const centrals: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const { local, central } = entryHeaders(name, crc32(data), data.length, offset);
    // Blob copies nothing it does not have to; any ArrayBufferLike view is a valid part at runtime.
    parts.push(local, data as Uint8Array<ArrayBuffer>);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  if (
    entries.length > 0xffff ||
    offset > MAX32 ||
    centralSize > MAX32 ||
    offset + centralSize > MAX32
  ) {
    throw new ProjectError("too_large", ["archive is over 4 GiB"]);
  }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...centrals, eocd]);
}
