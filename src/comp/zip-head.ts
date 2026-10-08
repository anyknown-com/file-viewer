import { crc32 } from "./crc32";
import { ProjectError } from "./errors";

const MAX_HEAD_ENTRY = 4 * 1024 * 1024;
const MANIFEST = "manifest.json";
const PREVIEW = "QuickLook/Preview.jpg";
const decoder = new TextDecoder();

type Read = (start: number, end: number) => Promise<Uint8Array>;
type Entry = { name: string; crc: number; size: number; dataStart: number };

// Parses one local header at `pos`. null = not a plain STORE entry with sizes up front
// (or the source returned fewer bytes than asked), so the caller falls back to a full read.
async function localEntry(read: Read, pos: number): Promise<Entry | null> {
  const head = await read(pos, pos + 30);
  if (head.length < 30) return null;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) return null;
  const flags = view.getUint16(6, true);
  if (flags & 0b1001 || view.getUint16(8, true) !== 0) return null;
  const size = view.getUint32(22, true);
  if (view.getUint32(18, true) !== size) return null;
  const nameLen = view.getUint16(26, true);
  const extraLen = view.getUint16(28, true);
  const tail = await read(pos + 30, pos + 30 + nameLen + extraLen);
  if (tail.length < nameLen + extraLen) return null;
  return {
    name: decoder.decode(tail.subarray(0, nameLen)),
    crc: view.getUint32(14, true),
    size,
    dataStart: pos + 30 + nameLen + extraLen,
  };
}

async function entryData(read: Read, entry: Entry): Promise<Uint8Array | null> {
  const data = await read(entry.dataStart, entry.dataStart + entry.size);
  return data.length < entry.size ? null : data;
}

export async function readHeadEntries(
  read: Read,
): Promise<{ manifest: Uint8Array; preview?: Uint8Array } | null> {
  const first = await localEntry(read, 0);
  if (!first || first.name !== MANIFEST) return null;
  if (first.size > MAX_HEAD_ENTRY)
    throw new ProjectError("too_large", ["manifest.json is over 4 MiB"]);
  const manifest = await entryData(read, first);
  if (!manifest) return null;
  if (crc32(manifest) !== first.crc)
    throw new ProjectError("not_zip", ["manifest.json crc mismatch"]);

  const second = await localEntry(read, first.dataStart + first.size);
  if (!second || second.name !== PREVIEW || second.size > MAX_HEAD_ENTRY) return { manifest };
  const preview = await entryData(read, second);
  if (!preview || crc32(preview) !== second.crc) return { manifest };
  return { manifest, preview };
}
